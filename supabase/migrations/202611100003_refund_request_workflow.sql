-- Refund requests are reviewed manually; this migration never initiates a refund.
create table public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null unique references public.enrolments(id),
  payment_id uuid not null references public.payments(id),
  request_reference text not null unique,
  idempotency_key uuid not null unique,
  requested_at timestamptz not null default now(),
  cutoff_at timestamptz not null,
  reason text not null check (length(btrim(reason)) between 4 and 2000),
  late_exception_by uuid null references public.admin_users(id),
  late_exception_note text null check (late_exception_note is null or length(late_exception_note) between 4 and 2000),
  status text not null default 'requested'
    check (status in ('requested','under_review','approved','rejected','refund_processing','refunded','refund_failed')),
  decision text null check (decision is null or decision in ('approved','rejected')),
  decided_by uuid null references public.admin_users(id),
  decided_at timestamptz null,
  approved_amount_paise bigint null check (approved_amount_paise is null or approved_amount_paise > 0),
  internal_note text null check (internal_note is null or length(internal_note) <= 4000),
  provider_refund_id text null unique,
  provider_idempotency_key text not null unique default gen_random_uuid()::text,
  provider_status text null check (provider_status is null or provider_status in ('processed','pending','failed')),
  processing_started_at timestamptz null,
  processed_at timestamptz null,
  failure_reason text null check (failure_reason is null or length(failure_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index refund_requests_status_idx on public.refund_requests(status, requested_at desc);
create index refund_requests_payment_idx on public.refund_requests(payment_id);

create table public.refund_request_audit (
  id uuid primary key default gen_random_uuid(),
  refund_request_id uuid not null references public.refund_requests(id),
  actor_admin_id uuid null references public.admin_users(id),
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index refund_request_audit_request_idx on public.refund_request_audit(refund_request_id, created_at);

-- Preserve the dashboard RPC contract while reporting net verified receipts.
create or replace function public.get_admin_dashboard_metrics()
returns jsonb language sql security definer set search_path = pg_catalog, public, pg_temp as $$
  select jsonb_build_object(
    'totalRegistrations',(select count(*) from public.enrolments),
    'class10Enrolments',(select count(*) from public.enrolments where program_snapshot->>'code'='class-10'),
    'class12Enrolments',(select count(*) from public.enrolments where program_snapshot->>'code'='class-12'),
    'manualEnrolments',(select count(*) from public.enrolments where source='manual'),
    'successfulPayments',(select count(distinct enrolment_id) from public.payments where status='captured'),
    'pendingPayments',(select count(distinct enrolment_id) from public.payments where status in ('creating','created','authorized')),
    'failedPayments',(select count(*) from public.payments where status='failed'),
    'verifiedRevenuePaise',greatest(0,
      (select coalesce(sum(p.amount_paise),0) from public.payments p where p.status='captured')
      - (select coalesce(sum(r.approved_amount_paise),0) from public.refund_requests r where r.provider_status='processed')
    )
  );
$$;

alter table public.refund_requests enable row level security;
alter table public.refund_request_audit enable row level security;
revoke all on public.refund_requests, public.refund_request_audit from public, anon, authenticated;
grant select, insert, update on public.refund_requests, public.refund_request_audit to service_role;

create or replace function public.request_refund_internal(
  p_public_reference text, p_idempotency_key uuid, p_reason text,
  p_exception_admin_id uuid, p_exception_note text
)
returns table(refund_request_id uuid, request_reference text, requested_at timestamptz,
              cutoff_at timestamptz, status text, existing boolean)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_enrolment public.enrolments%rowtype;
  v_payment public.payments%rowtype;
  v_request public.refund_requests%rowtype;
  v_exception_admin public.admin_users%rowtype;
  v_cutoff timestamptz;
begin
  if p_public_reference is null or p_idempotency_key is null or p_reason is null
     or length(btrim(p_reason)) < 4 or length(p_reason) > 2000 then
    raise exception 'REFUND_REQUEST_INVALID';
  end if;
  select e.* into v_enrolment from public.enrolments e
   where e.public_reference = p_public_reference for update;
  if not found then raise exception 'ENROLMENT_NOT_FOUND'; end if;
  if p_exception_admin_id is not null then
    select a.* into v_exception_admin from public.admin_users a
     where a.id=p_exception_admin_id and a.is_active and a.role in ('owner','operations') for share;
    if not found or p_exception_note is null or length(btrim(p_exception_note))<4
       or length(p_exception_note)>2000 then raise exception 'REFUND_EXCEPTION_FORBIDDEN'; end if;
  elsif p_exception_note is not null then
    raise exception 'REFUND_EXCEPTION_FORBIDDEN';
  end if;
  select r.* into v_request from public.refund_requests r where r.idempotency_key=p_idempotency_key;
  if found then
    if v_request.enrolment_id=v_enrolment.id then
      return query select v_request.id,v_request.request_reference,v_request.requested_at,
        v_request.cutoff_at,v_request.status,true;
      return;
    end if;
    raise exception 'IDEMPOTENCY_KEY_CONFLICT';
  end if;
  select p.* into v_payment from public.payments p
   where p.enrolment_id = v_enrolment.id and p.status = 'captured'
     and p.captured_at is not null and p.provider_payment_id is not null
   order by p.captured_at desc, p.attempt_number desc limit 1 for update;
  if not found or v_enrolment.status <> 'confirmed' then
    raise exception 'REFUND_PAYMENT_NOT_CAPTURED';
  end if;
  v_cutoff := (((v_payment.captured_at at time zone 'Asia/Kolkata')::date + 7)::timestamp
               at time zone 'Asia/Kolkata');
  if now() >= v_cutoff and p_exception_admin_id is null then raise exception 'REFUND_REQUEST_WINDOW_CLOSED'; end if;
  select r.* into v_request from public.refund_requests r where r.enrolment_id = v_enrolment.id;
  if found then
    if v_request.idempotency_key = p_idempotency_key then
      return query select v_request.id, v_request.request_reference, v_request.requested_at,
        v_request.cutoff_at, v_request.status, true;
      return;
    end if;
    raise exception 'REFUND_REQUEST_EXISTS';
  end if;
  begin
    insert into public.refund_requests(enrolment_id,payment_id,request_reference,idempotency_key,
      requested_at,cutoff_at,reason,late_exception_by,late_exception_note)
    values (v_enrolment.id,v_payment.id,
      'RMR-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),
      p_idempotency_key,now(),v_cutoff,btrim(p_reason),p_exception_admin_id,
      nullif(btrim(p_exception_note),'')) returning * into v_request;
  exception when unique_violation then
    select r.* into v_request from public.refund_requests r where r.idempotency_key=p_idempotency_key;
    if found and v_request.enrolment_id=v_enrolment.id then
      return query select v_request.id,v_request.request_reference,v_request.requested_at,
        v_request.cutoff_at,v_request.status,true;
      return;
    elsif found then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    raise exception 'REFUND_REQUEST_CONFLICT';
  end;
  insert into public.refund_request_audit(refund_request_id,actor_admin_id,event_type,details)
  values (v_request.id,p_exception_admin_id,case when p_exception_admin_id is null then 'requested' else 'authorized_exception_requested' end,
    jsonb_build_object('payment_id',v_payment.id,'cutoff_at',v_cutoff,'exception_note',p_exception_note));
  return query select v_request.id,v_request.request_reference,v_request.requested_at,
    v_request.cutoff_at,v_request.status,false;
end $$;

create or replace function public.request_refund(p_public_reference text,p_idempotency_key uuid,p_reason text)
returns table(refund_request_id uuid,request_reference text,requested_at timestamptz,
              cutoff_at timestamptz,status text,existing boolean)
language sql security definer set search_path = pg_catalog, public, pg_temp as $$
  select * from public.request_refund_internal(p_public_reference,p_idempotency_key,p_reason,null,null)
$$;

create or replace function public.request_refund_exception(
  p_public_reference text,p_idempotency_key uuid,p_reason text,p_admin_user_id uuid,p_exception_note text
)
returns table(refund_request_id uuid,request_reference text,requested_at timestamptz,
              cutoff_at timestamptz,status text,existing boolean)
language sql security definer set search_path = pg_catalog, public, pg_temp as $$
  select * from public.request_refund_internal(p_public_reference,p_idempotency_key,p_reason,p_admin_user_id,p_exception_note)
$$;

create or replace function public.decide_refund_request(
  p_refund_request_id uuid,p_admin_user_id uuid,p_decision text,
  p_approved_amount_paise bigint,p_internal_note text
)
returns table(refund_request_id uuid,status text,approved_amount_paise bigint,decided_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_admin public.admin_users%rowtype;
  v_request public.refund_requests%rowtype;
  v_payment public.payments%rowtype;
begin
  select a.* into v_admin from public.admin_users a
   where a.id=p_admin_user_id and a.is_active and a.role in ('owner','operations') for share;
  if not found then raise exception 'REFUND_ADMIN_FORBIDDEN'; end if;
  select r.* into v_request from public.refund_requests r
   where r.id=p_refund_request_id for update;
  if not found then raise exception 'REFUND_REQUEST_NOT_FOUND'; end if;
  if v_request.status not in ('requested','under_review') then raise exception 'REFUND_DECISION_CONFLICT'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'REFUND_DECISION_INVALID'; end if;
  if p_internal_note is not null and length(p_internal_note)>4000 then raise exception 'REFUND_DECISION_INVALID'; end if;
  select p.* into v_payment from public.payments p where p.id=v_request.payment_id for share;
  if p_decision='approved' then
    if p_approved_amount_paise is null or p_approved_amount_paise <= 0
       or p_approved_amount_paise > v_payment.amount_paise then
      raise exception 'REFUND_AMOUNT_INVALID';
    end if;
  elsif p_approved_amount_paise is not null then
    raise exception 'REFUND_AMOUNT_INVALID';
  end if;
  update public.refund_requests r set status=p_decision,decision=p_decision,
    decided_by=p_admin_user_id,decided_at=now(),approved_amount_paise=p_approved_amount_paise,
    internal_note=nullif(btrim(p_internal_note),''),updated_at=now()
   where r.id=v_request.id returning r.* into v_request;
  insert into public.refund_request_audit(refund_request_id,actor_admin_id,event_type,details)
  values (v_request.id,p_admin_user_id,'decision',jsonb_build_object(
    'decision',p_decision,'approved_amount_paise',p_approved_amount_paise,
    'internal_note',p_internal_note));
  return query select v_request.id,v_request.status,v_request.approved_amount_paise,v_request.decided_at;
end $$;

create or replace function public.claim_refund_processing(p_refund_request_id uuid,p_admin_user_id uuid)
returns table(refund_request_id uuid,provider_payment_id text,amount_paise bigint,
              currency char(3),provider_idempotency_key text,status text)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_admin public.admin_users%rowtype;
  v_request public.refund_requests%rowtype;
  v_payment public.payments%rowtype;
begin
  select a.* into v_admin from public.admin_users a
   where a.id=p_admin_user_id and a.is_active and a.role in ('owner','operations') for share;
  if not found then raise exception 'REFUND_ADMIN_FORBIDDEN'; end if;
  select r.* into v_request from public.refund_requests r where r.id=p_refund_request_id for update;
  if not found then raise exception 'REFUND_REQUEST_NOT_FOUND'; end if;
  if v_request.status not in ('approved','refund_failed','refund_processing')
     or v_request.approved_amount_paise is null then raise exception 'REFUND_NOT_APPROVED'; end if;
  select p.* into v_payment from public.payments p where p.id=v_request.payment_id for share;
  if v_payment.status <> 'captured' or v_payment.provider_payment_id is null
     or v_request.approved_amount_paise > v_payment.amount_paise then
    raise exception 'REFUND_PAYMENT_NOT_CAPTURED';
  end if;
  update public.refund_requests r set status='refund_processing',processing_started_at=coalesce(r.processing_started_at,now()),
    provider_status=null,failure_reason=null,updated_at=now()
   where r.id=v_request.id returning r.* into v_request;
  insert into public.refund_request_audit(refund_request_id,actor_admin_id,event_type,details)
  values (v_request.id,p_admin_user_id,'processing_claimed',jsonb_build_object('provider_idempotency_key',v_request.provider_idempotency_key));
  return query select v_request.id,v_payment.provider_payment_id,v_request.approved_amount_paise,
    v_payment.currency,v_request.provider_idempotency_key,v_request.status;
end $$;

create or replace function public.record_refund_provider_result(
  p_refund_request_id uuid,p_admin_user_id uuid,p_provider_status text,
  p_provider_refund_id text,p_failure_reason text
)
returns table(refund_request_id uuid,status text,provider_refund_id text,provider_status text)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_admin public.admin_users%rowtype;
  v_request public.refund_requests%rowtype;
begin
  select a.* into v_admin from public.admin_users a
   where a.id=p_admin_user_id and a.is_active and a.role in ('owner','operations') for share;
  if not found then raise exception 'REFUND_ADMIN_FORBIDDEN'; end if;
  select r.* into v_request from public.refund_requests r where r.id=p_refund_request_id for update;
  if not found then raise exception 'REFUND_REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'refund_processing' then raise exception 'REFUND_PROCESSING_CONFLICT'; end if;
  if p_provider_status is null or p_provider_status not in ('processed','pending','failed') then raise exception 'REFUND_PROVIDER_STATUS_INVALID'; end if;
  if p_provider_status <> 'failed' and nullif(p_provider_refund_id,'') is null then raise exception 'REFUND_PROVIDER_RESULT_INVALID'; end if;
  update public.refund_requests r set
    status=case p_provider_status when 'processed' then 'refunded' when 'failed' then 'refund_failed' else 'refund_processing' end,
    provider_status=p_provider_status,provider_refund_id=coalesce(nullif(p_provider_refund_id,''),r.provider_refund_id),
    failure_reason=case when p_provider_status='failed' then left(coalesce(p_failure_reason,'Provider reported refund failure.'),1000) else null end,
    processed_at=case when p_provider_status='processed' then coalesce(r.processed_at,now()) else r.processed_at end,
    updated_at=now()
   where r.id=v_request.id returning r.* into v_request;
  if p_provider_status='processed' then
    update public.enrolments e set status='refunded',updated_at=now()
     where e.id=v_request.enrolment_id and e.status='confirmed';
  end if;
  insert into public.refund_request_audit(refund_request_id,actor_admin_id,event_type,details)
  values (v_request.id,p_admin_user_id,'provider_result',jsonb_build_object(
    'provider_status',p_provider_status,'provider_refund_id',p_provider_refund_id,
    'failure_reason',p_failure_reason));
  return query select v_request.id,v_request.status,v_request.provider_refund_id,v_request.provider_status;
end $$;

revoke all on function public.request_refund_internal(text,uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.request_refund(text,uuid,text) from public,anon,authenticated;
revoke all on function public.request_refund_exception(text,uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.decide_refund_request(uuid,uuid,text,bigint,text) from public,anon,authenticated;
revoke all on function public.claim_refund_processing(uuid,uuid) from public,anon,authenticated;
revoke all on function public.record_refund_provider_result(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.request_refund_internal(text,uuid,text,uuid,text) to service_role;
grant execute on function public.request_refund(text,uuid,text) to service_role;
grant execute on function public.request_refund_exception(text,uuid,text,uuid,text) to service_role;
grant execute on function public.decide_refund_request(uuid,uuid,text,bigint,text) to service_role;
grant execute on function public.claim_refund_processing(uuid,uuid) to service_role;
grant execute on function public.record_refund_provider_result(uuid,uuid,text,text,text) to service_role;
