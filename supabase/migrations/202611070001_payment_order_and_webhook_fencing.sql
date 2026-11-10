-- Additive order/webhook lease fencing. Existing records are preserved.
-- Deploy new app code and drain old payment/webhook requests before applying.
alter table public.payments add column if not exists order_creation_token uuid null;
alter table public.payments add column if not exists order_creation_expires_at timestamptz null;
alter table public.razorpay_webhook_events add column if not exists processing_token uuid null;
alter table public.razorpay_webhook_events add column if not exists processing_lease_expires_at timestamptz null;
create index if not exists payments_order_creation_lease_idx
  on public.payments(enrolment_id,order_creation_expires_at)
  where status='creating' and provider_order_id is null;

create or replace function public.claim_payment_attempt_v2(p_enrolment_id uuid,p_idempotency_key uuid,p_lease_token uuid,p_lease_seconds integer default 120)
returns table(payment_id uuid,attempt_number integer,status text,provider_order_id text,amount_paise bigint,currency text,lease_acquired boolean,lease_token uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_payment public.payments%rowtype; v_enrolment public.enrolments%rowtype; v_attempt integer; v_now timestamptz; v_constraint_name text;
begin
  if p_lease_token is null or p_lease_seconds<1 or p_lease_seconds>120 then raise exception 'INVALID_PAYMENT_ORDER_LEASE'; end if;
  -- Serialize global key reuse before taking the enrolment row lock.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,754231));
  select p.* into v_payment from public.payments p where p.request_idempotency_key=p_idempotency_key for update;
  if found then
    if v_payment.enrolment_id<>p_enrolment_id then raise exception 'IDEMPOTENCY_KEY_CONFLICT'; end if;
    if v_payment.status='creating' and v_payment.provider_order_id is null then
      v_now:=clock_timestamp();
      if v_payment.order_creation_expires_at is null or v_payment.order_creation_expires_at<=v_now then
        update public.payments set order_creation_token=p_lease_token,order_creation_expires_at=v_now+make_interval(secs=>p_lease_seconds),updated_at=v_now where id=v_payment.id returning * into v_payment;
        return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,v_payment.amount_paise,v_payment.currency::text,true,v_payment.order_creation_token; return;
      end if;
    end if;
    return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,v_payment.amount_paise,v_payment.currency::text,false,v_payment.order_creation_token; return;
  end if;
  select e.* into v_enrolment from public.enrolments e where e.id=p_enrolment_id for update;
  if not found then raise exception 'ENROLMENT_NOT_FOUND'; end if;
  v_now:=clock_timestamp();
  select p.* into v_payment from public.payments p where p.enrolment_id=p_enrolment_id and p.status='creating' and p.provider_order_id is null order by p.attempt_number desc limit 1 for update;
  if found then
    if v_payment.order_creation_expires_at is not null and v_payment.order_creation_expires_at>v_now then
      return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,v_payment.amount_paise,v_payment.currency::text,false,v_payment.order_creation_token; return;
    end if;
    update public.payments p set status='order_failed',order_creation_token=null,order_creation_expires_at=null,updated_at=v_now where p.id=v_payment.id and p.status='creating' and p.provider_order_id is null;
  end if;
  select p.* into v_payment from public.payments p where p.enrolment_id=p_enrolment_id and p.status in ('created','authorized') and p.provider_order_id is not null order by p.attempt_number desc limit 1;
  if found then return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,v_payment.amount_paise,v_payment.currency::text,false,null::uuid; return; end if;
  select coalesce(max(p.attempt_number),0)+1 into v_attempt
    from public.payments as p
    where p.enrolment_id=p_enrolment_id;
  insert into public.payments(enrolment_id,attempt_number,request_idempotency_key,amount_paise,currency,status,order_creation_token,order_creation_expires_at)
    values(p_enrolment_id,v_attempt,p_idempotency_key,(v_enrolment.pricing_snapshot->>'payable_paise')::bigint,'INR','creating',p_lease_token,v_now+make_interval(secs=>p_lease_seconds)) returning * into v_payment;
  return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,v_payment.amount_paise,v_payment.currency::text,true,v_payment.order_creation_token;
exception when unique_violation then
  get stacked diagnostics v_constraint_name = constraint_name;
  if v_constraint_name = 'payments_request_idempotency_key_key' then
    raise exception 'IDEMPOTENCY_KEY_CONFLICT';
  end if;
  raise;
end; $$;

create or replace function public.persist_payment_order_v2(p_payment_id uuid,p_enrolment_id uuid,p_lease_token uuid,p_provider_order_id text)
returns table(id uuid,status text,provider_order_id text,amount_paise bigint,currency char(3))
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_provider_order_id is null or length(p_provider_order_id)<8 or length(p_provider_order_id)>128 then raise exception 'INVALID_PROVIDER_ORDER_ID'; end if;
  return query update public.payments p set provider_order_id=p_provider_order_id,status='created',order_creation_token=null,order_creation_expires_at=null,updated_at=clock_timestamp()
    where p.id=p_payment_id and p.enrolment_id=p_enrolment_id and p.status='creating' and p.provider_order_id is null
      and p.order_creation_token=p_lease_token and p.order_creation_expires_at>clock_timestamp()
    returning p.id,p.status,p.provider_order_id,p.amount_paise,p.currency;
end; $$;

create or replace function public.release_payment_order_lease_v2(p_payment_id uuid,p_enrolment_id uuid,p_lease_token uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rows integer;
begin
  update public.payments set status='order_failed',order_creation_token=null,order_creation_expires_at=null,updated_at=clock_timestamp()
    where id=p_payment_id and enrolment_id=p_enrolment_id and status='creating' and provider_order_id is null and order_creation_token=p_lease_token;
  get diagnostics v_rows=row_count; return v_rows=1;
end; $$;

create or replace function public.claim_razorpay_webhook_event_v2(p_provider_event_id text,p_event_type text,p_provider_order_id text,p_provider_payment_id text,p_payload_redacted jsonb,p_lease_token uuid,p_lease_seconds integer default 300)
returns table(claimed boolean,event_row_id uuid,processing_status text,lease_token uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_status text; v_token uuid; v_now timestamptz;
begin
  if p_lease_token is null or p_lease_seconds<1 or p_lease_seconds>600 then raise exception 'INVALID_WEBHOOK_LEASE'; end if;
  v_now:=clock_timestamp();
  insert into public.razorpay_webhook_events as e(provider_event_id,event_type,provider_order_id,provider_payment_id,payload_redacted,signature_valid,processing_status,processing_started_at,processing_token,processing_lease_expires_at)
    values(p_provider_event_id,p_event_type,p_provider_order_id,p_provider_payment_id,coalesce(p_payload_redacted,'{}'::jsonb),true,'processing',v_now,p_lease_token,v_now+make_interval(secs=>p_lease_seconds))
  on conflict(provider_event_id) do update set event_type=excluded.event_type,provider_order_id=excluded.provider_order_id,provider_payment_id=excluded.provider_payment_id,
    payload_redacted=excluded.payload_redacted,signature_valid=true,processing_status='processing',processing_error=null,processed_at=null,
    processing_started_at=v_now,processing_token=p_lease_token,processing_lease_expires_at=v_now+make_interval(secs=>p_lease_seconds)
  where e.processing_status in ('received','error') or (e.processing_status='processing' and (e.processing_lease_expires_at is null or e.processing_lease_expires_at<=v_now))
  returning e.id,e.processing_status,e.processing_token into v_id,v_status,v_token;
  if v_id is not null then return query select true,v_id,v_status,v_token; return; end if;
  select e.id,e.processing_status into v_id,v_status from public.razorpay_webhook_events e where e.provider_event_id=p_provider_event_id;
  return query select false,v_id,v_status,null::uuid;
end; $$;

-- Lease validation, payment transition and event completion commit atomically.
create or replace function public.process_razorpay_webhook_event_v2(p_event_row_id uuid,p_lease_token uuid,p_action text,p_provider_order_id text default null,p_provider_payment_id text default null,p_amount_paise bigint default null,p_currency text default null)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event public.razorpay_webhook_events%rowtype; v_payment public.payments%rowtype; v_result text:='processed';
begin
  select * into v_event from public.razorpay_webhook_events where id=p_event_row_id and processing_status='processing' and processing_token=p_lease_token and processing_lease_expires_at>clock_timestamp() for update;
  if not found then raise exception 'WEBHOOK_LEASE_LOST'; end if;
  if p_action='ignored' then v_result:='ignored';
  elsif p_action='captured' then
    if p_provider_order_id is null or p_provider_payment_id is null or p_amount_paise is null or p_currency is null then raise exception 'CAPTURE_PAYLOAD_INCOMPLETE'; end if;
    select * into v_payment from public.payments where provider_order_id=p_provider_order_id for update;
    if not found then raise exception 'PAYMENT_ORDER_NOT_FOUND'; end if;
    if v_payment.status='captured' and v_payment.provider_payment_id is distinct from p_provider_payment_id then raise exception 'CAPTURE_PAYMENT_ID_CONFLICT'; end if;
    if exists(select 1 from public.payments p where p.provider_payment_id=p_provider_payment_id and p.id<>v_payment.id) then raise exception 'CAPTURE_PAYMENT_ID_CONFLICT'; end if;
    perform public.confirm_captured_payment(p_provider_order_id,p_provider_payment_id,p_amount_paise,p_currency,true);
  elsif p_action='failed' then
    if p_provider_order_id is null or p_provider_payment_id is null then raise exception 'FAILED_PAYLOAD_INCOMPLETE'; end if;
    select * into v_payment from public.payments where provider_order_id=p_provider_order_id for update;
    if not found then raise exception 'PAYMENT_ORDER_NOT_FOUND'; end if;
    if v_payment.status in ('captured','failed') then null;
    elsif v_payment.status in ('created','authorized') then
      if v_payment.provider_payment_id is not null and v_payment.provider_payment_id<>p_provider_payment_id then raise exception 'FAILED_PAYMENT_ID_CONFLICT'; end if;
      update public.payments set provider_payment_id=p_provider_payment_id,updated_at=clock_timestamp() where id=v_payment.id and status in ('created','authorized');
      perform public.mark_provider_payment_failed(p_provider_payment_id);
    else raise exception 'FAILED_PAYMENT_STATE_CONFLICT'; end if;
  else raise exception 'INVALID_WEBHOOK_ACTION'; end if;
  update public.razorpay_webhook_events set processing_status=v_result,processing_error=null,processing_started_at=null,processed_at=clock_timestamp(),processing_token=null,processing_lease_expires_at=null
    where id=v_event.id and processing_status='processing' and processing_token=p_lease_token;
  return v_result;
end; $$;

create or replace function public.release_razorpay_webhook_event_v2(p_event_row_id uuid,p_lease_token uuid,p_diagnostic text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rows integer;
begin
  update public.razorpay_webhook_events set processing_status='error',processing_error=left(coalesce(p_diagnostic,'webhook_processing_failed'),120),processing_started_at=null,processing_token=null,processing_lease_expires_at=null,processed_at=null
    where id=p_event_row_id and processing_status='processing' and processing_token=p_lease_token;
  get diagnostics v_rows=row_count; return v_rows=1;
end; $$;

revoke all on function public.claim_payment_attempt_v2(uuid,uuid,uuid,integer) from public,anon,authenticated;
-- Keep the legacy function definition/history, but remove the unsafe claim
-- entry point from service_role so new deployments cannot call it accidentally.
revoke all on function public.claim_payment_attempt(uuid,uuid) from public,anon,authenticated,service_role;
-- The v1 webhook claim is age-based and has no fencing token. All current
-- application workers use v2; revoke v1 so stale workers cannot reclaim an
-- event outside the token-fenced processing path.
revoke all on function public.claim_razorpay_webhook_event(text,text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.persist_payment_order_v2(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.release_payment_order_lease_v2(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.claim_razorpay_webhook_event_v2(text,text,text,text,jsonb,uuid,integer) from public,anon,authenticated;
revoke all on function public.process_razorpay_webhook_event_v2(uuid,uuid,text,text,text,bigint,text) from public,anon,authenticated;
revoke all on function public.release_razorpay_webhook_event_v2(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_payment_attempt_v2(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.persist_payment_order_v2(uuid,uuid,uuid,text) to service_role;
grant execute on function public.release_payment_order_lease_v2(uuid,uuid,uuid) to service_role;
grant execute on function public.claim_razorpay_webhook_event_v2(text,text,text,text,jsonb,uuid,integer) to service_role;
grant execute on function public.process_razorpay_webhook_event_v2(uuid,uuid,text,text,text,bigint,text) to service_role;
grant execute on function public.release_razorpay_webhook_event_v2(uuid,uuid,text) to service_role;
