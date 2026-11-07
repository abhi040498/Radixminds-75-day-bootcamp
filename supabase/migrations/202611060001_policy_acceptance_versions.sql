-- Add policy acceptance auditing without rewriting existing enrolment records.
-- New policy versions are validated in the API and again in the RPC functions.
alter table public.enrolments
  add column if not exists terms_policy_version text,
  add column if not exists privacy_policy_version text,
  add column if not exists refund_policy_accepted_at timestamptz,
  add column if not exists refund_policy_version text;

-- Guardian consent is no longer collected as a standard enrolment requirement.
-- Preserve existing historical values; new standard/manual rows record NULL.
alter table public.enrolments alter column guardian_consent_at drop not null;

create or replace function public.create_pending_enrolment(p_input jsonb)
returns table(enrolment_id uuid, student_id uuid, public_reference text, existing boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_enrolment_id uuid;
  v_student_id uuid;
  v_reference text;
  v_inserted_id uuid;
begin
  if coalesce(p_input->>'terms_accepted','') <> 'true'
     or coalesce(p_input->>'privacy_consent','') <> 'true'
     or coalesce(p_input->>'refund_policy_accepted','') <> 'true'
     or coalesce(p_input->>'terms_policy_version','') <> '2026-11-06'
     or coalesce(p_input->>'privacy_policy_version','') <> '2026-11-06'
     or coalesce(p_input->>'refund_policy_version','') <> '2026-11-06' then
    raise exception 'POLICY_ACKNOWLEDGEMENT_INVALID';
  end if;

  select e.id, e.student_id, e.public_reference into v_enrolment_id, v_student_id, v_reference
  from public.enrolments e where e.idempotency_key = (p_input->>'idempotency_key')::uuid;
  if found then
    return query select v_enrolment_id, v_student_id, v_reference, true;
    return;
  end if;

  insert into public.students (full_name,mobile_e164,email,date_of_birth,guardian_name,guardian_mobile_e164,guardian_email)
  values (
    p_input->>'full_name',p_input->>'mobile_e164',lower(p_input->>'email'),nullif(p_input->>'date_of_birth','')::date,
    null,null,null
  ) returning id into v_student_id;

  insert into public.enrolments (
    public_reference,idempotency_key,status,student_id,program_id,board,school_name,preferred_language,subject_choice,learning_mode,
    program_snapshot,subjects_snapshot,pricing_snapshot,status_token_hash,terms_accepted_at,terms_policy_version,
    privacy_consent_at,privacy_policy_version,refund_policy_accepted_at,refund_policy_version,
    guardian_consent_at,enrolment_communications_consent_at
  ) values (
    p_input->>'public_reference',(p_input->>'idempotency_key')::uuid,'pending_payment',v_student_id,(p_input->>'program_id')::uuid,
    p_input->>'board',p_input->>'school_name',nullif(p_input->>'preferred_language',''),nullif(p_input->>'subject_choice',''),p_input->>'learning_mode',
    p_input->'program_snapshot',p_input->'subjects_snapshot',p_input->'pricing_snapshot',p_input->>'status_token_hash',
    now(),p_input->>'terms_policy_version',now(),p_input->>'privacy_policy_version',now(),p_input->>'refund_policy_version',
    null,now()
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

create or replace function public.create_admin_manual_enrolment(p_input jsonb)
returns table(enrolment_id uuid,public_reference text)
language plpgsql security definer set search_path = public as $$
declare
  v_student_id uuid;
  v_enrolment_id uuid;
  v_reference text;
begin
  if coalesce(p_input->>'consents_recorded','') <> 'true'
     or coalesce(p_input->>'terms_policy_version','') <> '2026-11-06'
     or coalesce(p_input->>'privacy_policy_version','') <> '2026-11-06'
     or coalesce(p_input->>'refund_policy_version','') <> '2026-11-06' then
    raise exception 'POLICY_ACKNOWLEDGEMENT_INVALID';
  end if;

  insert into public.students(full_name,mobile_e164,email,date_of_birth,guardian_name,guardian_mobile_e164,guardian_email)
  values (
    p_input->>'full_name',p_input->>'mobile_e164',lower(p_input->>'email'),nullif(p_input->>'date_of_birth','')::date,
    null,null,null
  ) returning id into v_student_id;

  v_reference := p_input->>'public_reference';
  insert into public.enrolments(
    public_reference,idempotency_key,status,student_id,program_id,board,school_name,preferred_language,subject_choice,learning_mode,
    program_snapshot,subjects_snapshot,pricing_snapshot,status_token_hash,terms_accepted_at,terms_policy_version,
    privacy_consent_at,privacy_policy_version,refund_policy_accepted_at,refund_policy_version,
    guardian_consent_at,enrolment_communications_consent_at,source,internal_remarks,remarks_updated_by,
    manual_payment_status,manual_payment_reference,manual_payment_recorded_at,manual_payment_recorded_by
  ) values (
    v_reference,(p_input->>'idempotency_key')::uuid,'confirmed',v_student_id,(p_input->>'program_id')::uuid,
    p_input->>'board',p_input->>'school_name',nullif(p_input->>'preferred_language',''),nullif(p_input->>'subject_choice',''),nullif(p_input->>'learning_mode',''),
    p_input->'program_snapshot',p_input->'subjects_snapshot',p_input->'pricing_snapshot',p_input->>'status_token_hash',
    now(),p_input->>'terms_policy_version',now(),p_input->>'privacy_policy_version',now(),p_input->>'refund_policy_version',
    null,now(),'manual',nullif(p_input->>'internal_remarks',''),(p_input->>'admin_user_id')::uuid,
    p_input->>'manual_payment_status',nullif(p_input->>'manual_payment_reference',''),
    case when p_input->>'manual_payment_status'='recorded_paid' then now() else null end,
    case when p_input->>'manual_payment_status'='recorded_paid' then (p_input->>'admin_user_id')::uuid else null end
  ) returning id into v_enrolment_id;

  return query select v_enrolment_id,v_reference;
end;
$$;

