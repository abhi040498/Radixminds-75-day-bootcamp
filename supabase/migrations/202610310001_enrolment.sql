create extension if not exists pgcrypto;

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('class-10', 'class-12')),
  name text not null,
  duration_days integer not null default 75 check (duration_days > 0),
  subjects jsonb not null,
  features jsonb not null default '[]'::jsonb,
  program_fee_paise bigint not null check (program_fee_paise >= 0),
  standard_fee_paise bigint null check (standard_fee_paise is null or standard_fee_paise >= program_fee_paise),
  discount_percent numeric(5,2) null check (discount_percent between 0 and 100),
  offer_valid_until date null,
  currency char(3) not null default 'INR' check (currency = 'INR'),
  is_active boolean not null default true,
  enrolment_open boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.program_learning_modes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  mode text not null check (mode in ('online', 'offline', 'hybrid')),
  label text not null,
  is_available boolean not null default false,
  batch_label text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, mode)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  mobile_e164 text not null,
  email text not null,
  date_of_birth date null,
  guardian_name text null,
  guardian_mobile_e164 text null,
  guardian_email text null,
  created_at timestamptz not null default now()
);
create index if not exists students_mobile_idx on public.students (mobile_e164);
create index if not exists students_email_idx on public.students (lower(email));

create table if not exists public.enrolments (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  idempotency_key uuid not null unique,
  status text not null default 'pending_payment' check (status in ('pending_payment','confirmed','cancelled','refunded','needs_review')),
  student_id uuid not null references public.students(id),
  program_id uuid not null references public.programs(id),
  board text not null,
  school_name text not null,
  preferred_language text null,
  subject_choice text null check (subject_choice is null or subject_choice in ('Mathematics','Biology')),
  learning_mode text null check (learning_mode is null or learning_mode in ('online','offline','hybrid')),
  program_snapshot jsonb not null,
  subjects_snapshot jsonb not null,
  pricing_snapshot jsonb not null,
  status_token_hash char(64) not null,
  status_token_expires_at timestamptz not null default (now() + interval '60 days'),
  terms_accepted_at timestamptz not null,
  privacy_consent_at timestamptz not null,
  guardian_consent_at timestamptz not null,
  enrolment_communications_consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists enrolments_created_idx on public.enrolments (created_at desc);
create index if not exists enrolments_program_status_idx on public.enrolments (program_id, status, created_at desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references public.enrolments(id),
  attempt_number integer not null check (attempt_number > 0),
  request_idempotency_key uuid not null unique,
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  provider_order_id text unique,
  provider_payment_id text unique,
  amount_paise bigint not null check (amount_paise >= 0),
  currency char(3) not null default 'INR' check (currency = 'INR'),
  status text not null default 'creating' check (status in ('creating','order_failed','created','authorized','captured','failed','cancelled','needs_review')),
  provider_signature_verified_at timestamptz null,
  captured_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrolment_id, attempt_number)
);
create index if not exists payments_enrolment_idx on public.payments (enrolment_id, created_at desc);
create index if not exists payments_status_idx on public.payments (status, created_at desc);

create table if not exists public.razorpay_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  event_type text not null,
  provider_order_id text null,
  provider_payment_id text null,
  payload_redacted jsonb not null default '{}'::jsonb,
  signature_valid boolean not null,
  processing_status text not null default 'received' check (processing_status in ('received','processed','ignored','error')),
  processing_error text null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null
);

create table if not exists public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','operations','finance')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enquiry_submissions (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  mobile_e164 text not null,
  email text null,
  program_code text null check (program_code is null or program_code in ('class-10','class-12')),
  message text not null,
  contact_consent_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists enquiries_created_idx on public.enquiry_submissions (created_at desc);

insert into public.programs (code,name,duration_days,subjects,features,program_fee_paise,standard_fee_paise,discount_percent,enrolment_open)
values
('class-10','Class 10 Board Bootcamp',75,'["Mathematics","Science","Social Science","English"]'::jsonb,'["Structured lectures","Study notes","Topic-wise tests","Subject mock tests","Online/offline testing options"]'::jsonb,249900,null,80,true),
('class-12','Class 12 Board Bootcamp',75,'{"shared":["Physics","Chemistry"],"choice":["Mathematics","Biology"]}'::jsonb,'["Structured lectures","Study notes","Topic-wise tests","Subject mock tests","Online/offline testing options"]'::jsonb,349900,null,80,true)
on conflict (code) do update set
  name = excluded.name,
  duration_days = excluded.duration_days,
  subjects = excluded.subjects,
  features = excluded.features,
  program_fee_paise = excluded.program_fee_paise,
  discount_percent = excluded.discount_percent,
  updated_at = now();

create or replace function public.create_pending_enrolment(p_input jsonb)
returns table(enrolment_id uuid, student_id uuid, public_reference text, existing boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_enrolment_id uuid;
  v_student_id uuid;
  v_reference text;
  v_inserted_id uuid;
begin
  select e.id, e.student_id, e.public_reference into v_enrolment_id, v_student_id, v_reference
  from public.enrolments e where e.idempotency_key = (p_input->>'idempotency_key')::uuid;
  if found then
    return query select v_enrolment_id, v_student_id, v_reference, true;
    return;
  end if;

  insert into public.students (full_name,mobile_e164,email,date_of_birth,guardian_name,guardian_mobile_e164,guardian_email)
  values (
    p_input->>'full_name',p_input->>'mobile_e164',lower(p_input->>'email'),nullif(p_input->>'date_of_birth','')::date,
    nullif(p_input->>'guardian_name',''),nullif(p_input->>'guardian_mobile_e164',''),nullif(lower(p_input->>'guardian_email'),'')
  ) returning id into v_student_id;

  insert into public.enrolments (
    public_reference,idempotency_key,status,student_id,program_id,board,school_name,preferred_language,subject_choice,learning_mode,
    program_snapshot,subjects_snapshot,pricing_snapshot,status_token_hash,terms_accepted_at,privacy_consent_at,
    guardian_consent_at,enrolment_communications_consent_at
  ) values (
    p_input->>'public_reference',(p_input->>'idempotency_key')::uuid,'pending_payment',v_student_id,(p_input->>'program_id')::uuid,
    p_input->>'board',p_input->>'school_name',nullif(p_input->>'preferred_language',''),nullif(p_input->>'subject_choice',''),p_input->>'learning_mode',
    p_input->'program_snapshot',p_input->'subjects_snapshot',p_input->'pricing_snapshot',p_input->>'status_token_hash',
    now(),now(),now(),now()
  ) on conflict (idempotency_key) do nothing returning id, public_reference into v_inserted_id, v_reference;

  if v_inserted_id is null then
    delete from public.students where id = v_student_id;
    select e.id,e.student_id,e.public_reference into v_enrolment_id,v_student_id,v_reference
      from public.enrolments e where e.idempotency_key = (p_input->>'idempotency_key')::uuid;
    return query select v_enrolment_id,v_student_id,v_reference,true;
    return;
  end if;

  return query select v_inserted_id,v_student_id,v_reference,false;
end;
$$;

create or replace function public.claim_payment_attempt(p_enrolment_id uuid, p_idempotency_key uuid)
returns table(payment_id uuid, attempt_number integer, status text, provider_order_id text, amount_paise bigint, currency char(3), reused boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments%rowtype;
  v_enrolment public.enrolments%rowtype;
  v_attempt integer;
begin
  select * into v_enrolment from public.enrolments where id = p_enrolment_id for update;
  if not found then raise exception 'ENROLMENT_NOT_FOUND'; end if;
  select * into v_payment from public.payments where request_idempotency_key = p_idempotency_key;
  if found then
    if v_payment.enrolment_id <> p_enrolment_id then raise exception 'IDEMPOTENCY_KEY_CONFLICT'; end if;
    return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,v_payment.amount_paise,v_payment.currency,true;
    return;
  end if;
  select * into v_payment from public.payments where enrolment_id = p_enrolment_id and status in ('created','authorized') and provider_order_id is not null order by attempt_number desc limit 1;
  if found then
    return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,v_payment.amount_paise,v_payment.currency,true;
    return;
  end if;
  select coalesce(max(p.attempt_number),0)+1 into v_attempt from public.payments p where p.enrolment_id = p_enrolment_id;
  insert into public.payments(enrolment_id,attempt_number,request_idempotency_key,amount_paise,currency,status)
  values (p_enrolment_id,v_attempt,p_idempotency_key,(v_enrolment.pricing_snapshot->>'payable_paise')::bigint,'INR','creating')
  returning * into v_payment;
  return query select v_payment.id,v_payment.attempt_number,v_payment.status,v_payment.provider_order_id,v_payment.amount_paise,v_payment.currency,false;
end;
$$;

create or replace function public.confirm_captured_payment(p_provider_order_id text,p_provider_payment_id text,p_amount_paise bigint,p_currency text,p_signature_verified boolean)
returns table(payment_id uuid,enrolment_id uuid,enrolment_reference text,result text)
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments%rowtype;
  v_enrolment public.enrolments%rowtype;
begin
  select * into v_payment from public.payments where provider_order_id = p_provider_order_id for update;
  if not found then raise exception 'PAYMENT_ORDER_NOT_FOUND'; end if;
  select * into v_enrolment from public.enrolments where id = v_payment.enrolment_id for update;
  if v_payment.amount_paise <> p_amount_paise or v_payment.currency <> p_currency then
    update public.payments set status='needs_review',updated_at=now() where id=v_payment.id and status <> 'captured';
    update public.enrolments set status='needs_review',updated_at=now() where id=v_enrolment.id and status <> 'confirmed';
    return query select v_payment.id,v_enrolment.id,v_enrolment.public_reference,'needs_review'::text;
    return;
  end if;
  if v_payment.status = 'captured' then
    return query select v_payment.id,v_enrolment.id,v_enrolment.public_reference,'confirmed'::text;
    return;
  end if;
  if not p_signature_verified then raise exception 'SIGNATURE_NOT_VERIFIED'; end if;
  update public.payments set provider_payment_id=p_provider_payment_id,status='captured',provider_signature_verified_at=coalesce(provider_signature_verified_at,now()),captured_at=coalesce(captured_at,now()),updated_at=now() where id=v_payment.id;
  update public.enrolments set status='confirmed',updated_at=now() where id=v_enrolment.id and status='pending_payment';
  return query select v_payment.id,v_enrolment.id,v_enrolment.public_reference,'confirmed'::text;
end;
$$;

create or replace function public.mark_provider_payment_failed(p_provider_payment_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.payments set status='failed',updated_at=now()
  where provider_payment_id=p_provider_payment_id and status in ('created','authorized');
end;
$$;

alter table public.programs enable row level security;
alter table public.program_learning_modes enable row level security;
alter table public.students enable row level security;
alter table public.enrolments enable row level security;
alter table public.payments enable row level security;
alter table public.razorpay_webhook_events enable row level security;
alter table public.admin_users enable row level security;
alter table public.enquiry_submissions enable row level security;

revoke all on public.programs, public.program_learning_modes, public.students, public.enrolments, public.payments, public.razorpay_webhook_events, public.admin_users, public.enquiry_submissions from anon, authenticated;
revoke all on function public.create_pending_enrolment(jsonb) from public, anon, authenticated;
revoke all on function public.claim_payment_attempt(uuid,uuid) from public, anon, authenticated;
revoke all on function public.confirm_captured_payment(text,text,bigint,text,boolean) from public, anon, authenticated;
revoke all on function public.mark_provider_payment_failed(text) from public, anon, authenticated;
grant execute on function public.create_pending_enrolment(jsonb) to service_role;
grant execute on function public.claim_payment_attempt(uuid,uuid) to service_role;
grant execute on function public.confirm_captured_payment(text,text,bigint,text,boolean) to service_role;
grant execute on function public.mark_provider_payment_failed(text) to service_role;
