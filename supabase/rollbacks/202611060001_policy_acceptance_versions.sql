-- Rollback for 202611060001_policy_acceptance_versions.sql.
-- This restores the pre-migration RPCs and refuses to discard any newly recorded data.
do $$
begin
  if exists (
    select 1 from public.enrolments
    where terms_policy_version is not null
       or privacy_policy_version is not null
       or refund_policy_version is not null
       or refund_policy_accepted_at is not null
  ) then
    raise exception 'Rollback blocked: policy acceptance data exists and must be retained.';
  end if;
  if exists (select 1 from public.enrolments where guardian_consent_at is null) then
    raise exception 'Rollback blocked: enrolments without guardian consent timestamps exist.';
  end if;
end $$;

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
  if found then return query select v_enrolment_id, v_student_id, v_reference, true; return; end if;
  insert into public.students (full_name,mobile_e164,email,date_of_birth,guardian_name,guardian_mobile_e164,guardian_email)
  values (p_input->>'full_name',p_input->>'mobile_e164',lower(p_input->>'email'),nullif(p_input->>'date_of_birth','')::date,
    nullif(p_input->>'guardian_name',''),nullif(p_input->>'guardian_mobile_e164',''),nullif(lower(p_input->>'guardian_email'),'')
  ) returning id into v_student_id;
  insert into public.enrolments (
    public_reference,idempotency_key,status,student_id,program_id,board,school_name,preferred_language,subject_choice,learning_mode,
    program_snapshot,subjects_snapshot,pricing_snapshot,status_token_hash,terms_accepted_at,privacy_consent_at,guardian_consent_at,enrolment_communications_consent_at
  ) values (
    p_input->>'public_reference',(p_input->>'idempotency_key')::uuid,'pending_payment',v_student_id,(p_input->>'program_id')::uuid,
    p_input->>'board',p_input->>'school_name',nullif(p_input->>'preferred_language',''),nullif(p_input->>'subject_choice',''),p_input->>'learning_mode',
    p_input->'program_snapshot',p_input->'subjects_snapshot',p_input->'pricing_snapshot',p_input->>'status_token_hash',now(),now(),now(),now()
  ) on conflict (idempotency_key) do nothing returning id, public_reference into v_inserted_id, v_reference;
  if v_inserted_id is null then
    delete from public.students where id = v_student_id;
    select e.id,e.student_id,e.public_reference into v_enrolment_id,v_student_id,v_reference from public.enrolments e where e.idempotency_key = (p_input->>'idempotency_key')::uuid;
    return query select v_enrolment_id,v_student_id,v_reference,true; return;
  end if;
  return query select v_inserted_id,v_student_id,v_reference,false;
end;
$$;

create or replace function public.create_admin_manual_enrolment(p_input jsonb)
returns table(enrolment_id uuid,public_reference text)
language plpgsql security definer set search_path = public as $$
declare v_student_id uuid; v_enrolment_id uuid; v_reference text;
begin
  insert into public.students(full_name,mobile_e164,email,date_of_birth,guardian_name,guardian_mobile_e164,guardian_email)
  values (p_input->>'full_name',p_input->>'mobile_e164',lower(p_input->>'email'),nullif(p_input->>'date_of_birth','')::date,
    nullif(p_input->>'guardian_name',''),nullif(p_input->>'guardian_mobile_e164',''),nullif(lower(p_input->>'guardian_email'),'')) returning id into v_student_id;
  v_reference := p_input->>'public_reference';
  insert into public.enrolments(
    public_reference,idempotency_key,status,student_id,program_id,board,school_name,preferred_language,subject_choice,learning_mode,
    program_snapshot,subjects_snapshot,pricing_snapshot,status_token_hash,terms_accepted_at,privacy_consent_at,guardian_consent_at,
    enrolment_communications_consent_at,source,internal_remarks,remarks_updated_by,manual_payment_status,manual_payment_reference,
    manual_payment_recorded_at,manual_payment_recorded_by
  ) values (
    v_reference,(p_input->>'idempotency_key')::uuid,'confirmed',v_student_id,(p_input->>'program_id')::uuid,
    p_input->>'board',p_input->>'school_name',nullif(p_input->>'preferred_language',''),nullif(p_input->>'subject_choice',''),nullif(p_input->>'learning_mode',''),
    p_input->'program_snapshot',p_input->'subjects_snapshot',p_input->'pricing_snapshot',p_input->>'status_token_hash',now(),now(),now(),now(),
    'manual',nullif(p_input->>'internal_remarks',''),(p_input->>'admin_user_id')::uuid,p_input->>'manual_payment_status',nullif(p_input->>'manual_payment_reference',''),
    case when p_input->>'manual_payment_status'='recorded_paid' then now() else null end,
    case when p_input->>'manual_payment_status'='recorded_paid' then (p_input->>'admin_user_id')::uuid else null end
  ) returning id into v_enrolment_id;
  return query select v_enrolment_id,v_reference;
end;
$$;

alter table public.enrolments
  drop column refund_policy_version,
  drop column refund_policy_accepted_at,
  drop column privacy_policy_version,
  drop column terms_policy_version;
alter table public.enrolments alter column guardian_consent_at set not null;
