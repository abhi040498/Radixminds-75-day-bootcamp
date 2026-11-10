-- Add an optional separate WhatsApp contact number and publish the approved
-- 10 November policy version. Existing enrolment data is preserved.
alter table public.enrolments
  add column if not exists whatsapp_mobile_e164 text;

create or replace function public.create_pending_enrolment(p_input jsonb)
returns table(enrolment_id uuid, student_id uuid, public_reference text, existing boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_enrolment_id uuid;
  v_student_id uuid;
  v_reference text;
  v_inserted_id uuid;
begin
  if coalesce(p_input->>'terms_accepted','') <> 'true'
     or coalesce(p_input->>'privacy_consent','') <> 'true'
     or coalesce(p_input->>'refund_policy_accepted','') <> 'true'
     or coalesce(p_input->>'terms_policy_version','') <> '2026-11-10'
     or coalesce(p_input->>'privacy_policy_version','') <> '2026-11-10'
     or coalesce(p_input->>'refund_policy_version','') <> '2026-11-10' then
    raise exception 'POLICY_ACKNOWLEDGEMENT_INVALID';
  end if;

  select e.id, e.student_id, e.public_reference
    into v_enrolment_id, v_student_id, v_reference
    from public.enrolments as e
   where e.idempotency_key = (p_input->>'idempotency_key')::uuid;
  if found then
    return query select v_enrolment_id, v_student_id, v_reference, true;
    return;
  end if;

  insert into public.students as inserted_student (
    full_name, mobile_e164, email, date_of_birth, guardian_name, guardian_mobile_e164, guardian_email
  ) values (
    p_input->>'full_name', p_input->>'mobile_e164', lower(p_input->>'email'),
    nullif(p_input->>'date_of_birth','')::date,
    nullif(p_input->>'guardian_name',''), nullif(p_input->>'guardian_mobile_e164',''),
    nullif(lower(p_input->>'guardian_email'),'')
  ) returning inserted_student.id into v_student_id;

  insert into public.enrolments as inserted_enrolment (
    public_reference, idempotency_key, status, student_id, program_id, board, school_name,
    preferred_language, subject_choice, learning_mode, program_snapshot, subjects_snapshot,
    pricing_snapshot, status_token_hash, terms_accepted_at, terms_policy_version,
    privacy_consent_at, privacy_policy_version, refund_policy_accepted_at, refund_policy_version,
    guardian_consent_at, enrolment_communications_consent_at,
    whatsapp_updates_consent_at, whatsapp_mobile_e164
  ) values (
    p_input->>'public_reference', (p_input->>'idempotency_key')::uuid, 'pending_payment',
    v_student_id, (p_input->>'program_id')::uuid, p_input->>'board', p_input->>'school_name',
    nullif(p_input->>'preferred_language',''), nullif(p_input->>'subject_choice',''),
    p_input->>'learning_mode', p_input->'program_snapshot', p_input->'subjects_snapshot',
    p_input->'pricing_snapshot', p_input->>'status_token_hash', now(),
    p_input->>'terms_policy_version', now(), p_input->>'privacy_policy_version', now(),
    p_input->>'refund_policy_version', null, now(),
    case when coalesce(p_input->>'whatsapp_updates_consent','false') = 'true' then now() else null end,
    nullif(p_input->>'whatsapp_mobile_e164','')
  ) on conflict (idempotency_key) do nothing
    returning inserted_enrolment.id, inserted_enrolment.public_reference
      into v_inserted_id, v_reference;

  if v_inserted_id is null then
    delete from public.students as inserted_student where inserted_student.id = v_student_id;
    select e.id, e.student_id, e.public_reference
      into v_enrolment_id, v_student_id, v_reference
      from public.enrolments as e
     where e.idempotency_key = (p_input->>'idempotency_key')::uuid;
    return query select v_enrolment_id, v_student_id, v_reference, true;
    return;
  end if;

  return query select v_inserted_id, v_student_id, v_reference, false;
end;
$$;

create or replace function public.create_admin_manual_enrolment(p_input jsonb)
returns table(enrolment_id uuid, public_reference text)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_student_id uuid;
  v_enrolment_id uuid;
  v_reference text;
begin
  if coalesce(p_input->>'consents_recorded','') <> 'true'
     or coalesce(p_input->>'terms_policy_version','') <> '2026-11-10'
     or coalesce(p_input->>'privacy_policy_version','') <> '2026-11-10'
     or coalesce(p_input->>'refund_policy_version','') <> '2026-11-10' then
    raise exception 'POLICY_ACKNOWLEDGEMENT_INVALID';
  end if;

  insert into public.students(full_name,mobile_e164,email,date_of_birth,guardian_name,guardian_mobile_e164,guardian_email)
  values (p_input->>'full_name',p_input->>'mobile_e164',lower(p_input->>'email'),
    nullif(p_input->>'date_of_birth','')::date,null,null,null)
  returning id into v_student_id;

  v_reference := p_input->>'public_reference';
  insert into public.enrolments(
    public_reference,idempotency_key,status,student_id,program_id,board,school_name,preferred_language,
    subject_choice,learning_mode,program_snapshot,subjects_snapshot,pricing_snapshot,status_token_hash,
    terms_accepted_at,terms_policy_version,privacy_consent_at,privacy_policy_version,
    refund_policy_accepted_at,refund_policy_version,guardian_consent_at,enrolment_communications_consent_at,
    source,internal_remarks,remarks_updated_by,manual_payment_status,manual_payment_reference,
    manual_payment_recorded_at,manual_payment_recorded_by
  ) values (
    v_reference,(p_input->>'idempotency_key')::uuid,'confirmed',v_student_id,(p_input->>'program_id')::uuid,
    p_input->>'board',p_input->>'school_name',nullif(p_input->>'preferred_language',''),
    nullif(p_input->>'subject_choice',''),nullif(p_input->>'learning_mode',''),
    p_input->'program_snapshot',p_input->'subjects_snapshot',p_input->'pricing_snapshot',p_input->>'status_token_hash',
    now(),p_input->>'terms_policy_version',now(),p_input->>'privacy_policy_version',now(),
    p_input->>'refund_policy_version',null,now(),'manual',nullif(p_input->>'internal_remarks',''),
    (p_input->>'admin_user_id')::uuid,p_input->>'manual_payment_status',nullif(p_input->>'manual_payment_reference',''),
    case when p_input->>'manual_payment_status'='recorded_paid' then now() else null end,
    case when p_input->>'manual_payment_status'='recorded_paid' then (p_input->>'admin_user_id')::uuid else null end
  ) returning id into v_enrolment_id;
  return query select v_enrolment_id,v_reference;
end;
$$;

revoke all on function public.create_pending_enrolment(jsonb) from public, anon, authenticated;
revoke all on function public.create_admin_manual_enrolment(jsonb) from public, anon, authenticated;
grant execute on function public.create_pending_enrolment(jsonb) to service_role;
grant execute on function public.create_admin_manual_enrolment(jsonb) to service_role;
