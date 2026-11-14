-- Distinguish a provider rejection from an ambiguous order-creation outcome.
-- Existing attempts default to unknown and therefore remain non-retryable.
alter table public.payments
  add column if not exists order_creation_outcome text not null default 'unknown'
    check (order_creation_outcome in ('unknown','in_flight','definitive_failure','ambiguous','order_observed','provider_order_persisted'));
alter table public.payments
  add column if not exists order_creation_retryable boolean not null default false;

create index if not exists payments_safe_order_retry_idx
  on public.payments(enrolment_id,attempt_number desc)
  where status='order_failed' and order_creation_retryable=true;

create or replace function public.claim_payment_attempt_v3(
  p_enrolment_id uuid,
  p_idempotency_key uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 120
)
returns table(
  payment_id uuid,
  attempt_number integer,
  status text,
  provider_order_id text,
  provider_payment_id text,
  amount_paise bigint,
  currency text,
  lease_acquired boolean,
  lease_token uuid,
  retry_allowed boolean
)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_payment public.payments%rowtype;
  v_blocker public.payments%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_attempt integer;
  v_now timestamptz;
  v_constraint_name text;
begin
  if p_enrolment_id is null or p_idempotency_key is null or p_lease_token is null
     or p_lease_seconds is null or p_lease_seconds<1 or p_lease_seconds>120 then
    raise exception 'INVALID_PAYMENT_ORDER_LEASE';
  end if;

  -- A global idempotency-key lock serializes key reuse; the enrolment row lock
  -- serializes distinct keys for the same registration.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,754231));
  select p.* into v_payment
    from public.payments as p
    where p.request_idempotency_key=p_idempotency_key
    for update;
  if found then
    if v_payment.enrolment_id<>p_enrolment_id then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    if v_payment.status='creating' and v_payment.provider_order_id is null then
      v_now:=clock_timestamp();
      if v_payment.order_creation_expires_at is not null and v_payment.order_creation_expires_at>v_now then
        return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,
          v_payment.provider_payment_id,v_payment.amount_paise,v_payment.currency::text,false,
          v_payment.order_creation_token,false;
        return;
      end if;
      -- An expired request might have reached Razorpay before its worker died.
      -- Never reclaim it automatically: reconciliation is required.
      update public.payments as p
        set status='order_failed',order_creation_outcome='ambiguous',order_creation_retryable=false,
            order_creation_token=null,order_creation_expires_at=null,updated_at=v_now
        where p.id=v_payment.id and p.status='creating' and p.provider_order_id is null
        returning p.* into v_payment;
      return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,
        v_payment.provider_payment_id,v_payment.amount_paise,v_payment.currency::text,false,null::uuid,false;
      return;
    end if;
    if v_payment.status='order_failed'
       and v_payment.order_creation_outcome='definitive_failure'
       and v_payment.order_creation_retryable
       and v_payment.provider_order_id is null and v_payment.provider_payment_id is null then
      select p.* into v_blocker
        from public.payments as p
        where p.enrolment_id=p_enrolment_id and p.id<>v_payment.id
          and (p.status<>'order_failed'
            or p.order_creation_outcome<>'definitive_failure'
            or p.order_creation_retryable is not true
            or p.provider_order_id is not null
            or p.provider_payment_id is not null)
        order by p.attempt_number desc
        limit 1
        for update;
      if found then
        return query select v_blocker.id,v_blocker.attempt_number,v_blocker.status,v_blocker.provider_order_id,
          v_blocker.provider_payment_id,v_blocker.amount_paise,v_blocker.currency::text,false,
          v_blocker.order_creation_token,false;
        return;
      end if;
      return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,
        v_payment.provider_payment_id,v_payment.amount_paise,v_payment.currency::text,false,null::uuid,true;
      return;
    end if;
    return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,
      v_payment.provider_payment_id,v_payment.amount_paise,v_payment.currency::text,false,
      v_payment.order_creation_token,false;
    return;
  end if;

  select e.* into v_enrolment
    from public.enrolments as e
    where e.id=p_enrolment_id
    for update;
  if not found then raise exception 'ENROLMENT_NOT_FOUND'; end if;
  v_now:=clock_timestamp();

  select p.* into v_payment
    from public.payments as p
    where p.enrolment_id=p_enrolment_id and p.status='creating' and p.provider_order_id is null
    order by p.attempt_number desc
    limit 1
    for update;
  if found then
    if v_payment.order_creation_expires_at is not null and v_payment.order_creation_expires_at>v_now then
      return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,
        v_payment.provider_payment_id,v_payment.amount_paise,v_payment.currency::text,false,
        v_payment.order_creation_token,false;
      return;
    end if;
    update public.payments as p
      set status='order_failed',order_creation_outcome='ambiguous',order_creation_retryable=false,
          order_creation_token=null,order_creation_expires_at=null,updated_at=v_now
      where p.id=v_payment.id and p.status='creating' and p.provider_order_id is null
      returning p.* into v_payment;
    return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,
      v_payment.provider_payment_id,v_payment.amount_paise,v_payment.currency::text,false,null::uuid,false;
    return;
  end if;

  -- Any known provider payment or protected payment state wins over reuse of
  -- an older order, including inconsistent historical rows.
  select p.* into v_payment
    from public.payments as p
    where p.enrolment_id=p_enrolment_id
      and (p.provider_payment_id is not null or p.status in ('captured','failed','cancelled','needs_review'))
    order by p.attempt_number desc
    limit 1
    for update;
  if found then
    return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,
      v_payment.provider_payment_id,v_payment.amount_paise,v_payment.currency::text,false,
      v_payment.order_creation_token,false;
    return;
  end if;

  -- Reuse only an order known to be persisted and not yet associated with a
  -- provider payment. A provider payment ID is a hard lock against a new try.
  select p.* into v_payment
    from public.payments as p
    where p.enrolment_id=p_enrolment_id
      and p.status in ('created','authorized')
      and p.provider_order_id is not null
      and p.provider_payment_id is null
    order by p.attempt_number desc
    limit 1
    for update;
  if found then
    return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,
      v_payment.provider_payment_id,v_payment.amount_paise,v_payment.currency::text,false,null::uuid,false;
    return;
  end if;

  -- Only a complete history of definitive, provider-rejected, orderless
  -- attempts may proceed to a fresh payment attempt. Legacy/unknown outcomes,
  -- provider payment IDs, captured/authorized/review states and observed
  -- provider orders all block a competing order.
  select p.* into v_payment
    from public.payments as p
    where p.enrolment_id=p_enrolment_id
      and (p.status<>'order_failed'
        or p.order_creation_outcome<>'definitive_failure'
        or p.order_creation_retryable is not true
        or p.provider_order_id is not null
        or p.provider_payment_id is not null)
    order by p.attempt_number desc
    limit 1
    for update;
  if found then
    return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,
      v_payment.provider_payment_id,v_payment.amount_paise,v_payment.currency::text,false,
      v_payment.order_creation_token,false;
    return;
  end if;

  select coalesce(max(p.attempt_number),0)+1 into v_attempt
    from public.payments as p
    where p.enrolment_id=p_enrolment_id;
  insert into public.payments(
    enrolment_id,attempt_number,request_idempotency_key,amount_paise,currency,status,
    order_creation_token,order_creation_expires_at,order_creation_outcome,order_creation_retryable
  ) values (
    p_enrolment_id,v_attempt,p_idempotency_key,(v_enrolment.pricing_snapshot->>'payable_paise')::bigint,
    'INR','creating',p_lease_token,v_now+make_interval(secs=>p_lease_seconds),'in_flight',false
  ) returning * into v_payment;
  return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,
    v_payment.provider_payment_id,v_payment.amount_paise,v_payment.currency::text,true,
    v_payment.order_creation_token,false;
exception when unique_violation then
  get stacked diagnostics v_constraint_name = constraint_name;
  if v_constraint_name='payments_request_idempotency_key_key' then
    raise exception 'IDEMPOTENCY_KEY_CONFLICT';
  end if;
  raise;
end;
$$;

create or replace function public.persist_payment_order_v3(p_payment_id uuid,p_enrolment_id uuid,p_lease_token uuid,p_provider_order_id text)
returns table(id uuid,status text,provider_order_id text,amount_paise bigint,currency char(3))
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_provider_order_id is null or length(p_provider_order_id)<8 or length(p_provider_order_id)>128 then
    raise exception 'INVALID_PROVIDER_ORDER_ID';
  end if;
  return query update public.payments as p
    set provider_order_id=p_provider_order_id,status='created',order_creation_outcome='provider_order_persisted',
        order_creation_retryable=false,order_creation_token=null,order_creation_expires_at=null,updated_at=clock_timestamp()
    where p.id=p_payment_id and p.enrolment_id=p_enrolment_id and p.status='creating'
      and p.provider_order_id is null and p.provider_payment_id is null
      and p.order_creation_token=p_lease_token and p.order_creation_expires_at>clock_timestamp()
    returning p.id,p.status,p.provider_order_id,p.amount_paise,p.currency;
end;
$$;

create or replace function public.release_payment_order_lease_v3(
  p_payment_id uuid,p_enrolment_id uuid,p_lease_token uuid,p_outcome text,p_provider_order_id text default null
)
returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rows integer;
begin
  if p_outcome is null or p_outcome not in ('definitive_failure','ambiguous','order_observed') then
    raise exception 'INVALID_PAYMENT_ORDER_OUTCOME';
  end if;
  if (p_outcome='order_observed' and (p_provider_order_id is null or length(p_provider_order_id)<8 or length(p_provider_order_id)>128))
     or (p_outcome<>'order_observed' and p_provider_order_id is not null) then
    raise exception 'INVALID_PAYMENT_ORDER_OUTCOME';
  end if;
  update public.payments as p
    set status=case when p_outcome='order_observed' then 'needs_review' else 'order_failed' end,
        provider_order_id=case when p_outcome='order_observed' then p_provider_order_id else null end,
        order_creation_outcome=p_outcome,
        order_creation_retryable=(p_outcome='definitive_failure'),
        order_creation_token=null,order_creation_expires_at=null,updated_at=clock_timestamp()
    where p.id=p_payment_id and p.enrolment_id=p_enrolment_id and p.status='creating'
      and p.provider_order_id is null and p.provider_payment_id is null and p.order_creation_token=p_lease_token;
  get diagnostics v_rows=row_count;
  return v_rows=1;
end;
$$;

-- Keep the old RPC signatures for an in-place application rollout, but make
-- their behavior fail closed. Legacy releases are ambiguous and cannot unlock
-- a new order. Legacy persistence records the provider order as usual.
create or replace function public.claim_payment_attempt_v2(p_enrolment_id uuid,p_idempotency_key uuid,p_lease_token uuid,p_lease_seconds integer default 120)
returns table(payment_id uuid,attempt_number integer,status text,provider_order_id text,amount_paise bigint,currency text,lease_acquired boolean,lease_token uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return query select c.payment_id,c.attempt_number,c.status,c.provider_order_id,c.amount_paise,c.currency,c.lease_acquired,c.lease_token
    from public.claim_payment_attempt_v3(p_enrolment_id,p_idempotency_key,p_lease_token,p_lease_seconds) as c;
end;
$$;

create or replace function public.persist_payment_order_v2(p_payment_id uuid,p_enrolment_id uuid,p_lease_token uuid,p_provider_order_id text)
returns table(id uuid,status text,provider_order_id text,amount_paise bigint,currency char(3))
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return query select saved.id,saved.status,saved.provider_order_id,saved.amount_paise,saved.currency
    from public.persist_payment_order_v3(p_payment_id,p_enrolment_id,p_lease_token,p_provider_order_id) as saved;
end;
$$;

create or replace function public.release_payment_order_lease_v2(p_payment_id uuid,p_enrolment_id uuid,p_lease_token uuid)
returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return public.release_payment_order_lease_v3(p_payment_id,p_enrolment_id,p_lease_token,'ambiguous',null);
end;
$$;

revoke all on function public.claim_payment_attempt_v3(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.persist_payment_order_v3(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.release_payment_order_lease_v3(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_payment_attempt_v3(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.persist_payment_order_v3(uuid,uuid,uuid,text) to service_role;
grant execute on function public.release_payment_order_lease_v3(uuid,uuid,uuid,text,text) to service_role;
