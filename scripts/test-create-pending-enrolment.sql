-- PostgreSQL integration checks for RadixMinds Bootcamp Test only.
-- Run the entire file only against project oohcwibhjmzrrpuxonck.
-- Synthetic student/enrolment rows are scoped by STEP28 markers and rolled back.
begin;
set local role service_role;

do $test$
declare
  v_case record;
  v_result record;
  v_retry record;
  v_saved public.enrolments%rowtype;
  v_payload jsonb;
  v_first_payload jsonb;
  v_first_id uuid;
  v_first_student_id uuid;
  v_first_reference text;
  v_first_email text;
  v_program_id uuid;
  v_email text;
  v_mobile text;
  v_whatsapp_mobile text;
  v_key uuid;
  v_reference text;
  v_student_count integer;
  v_available_count integer;
  v_success_count integer := 0;
  v_test_name text;
  v_results text := '';
begin
  if exists (select 1 from public.students as s where s.email like 'step28-dbtest-%@example.invalid')
     or exists (select 1 from public.enrolments as e where e.public_reference like 'STEP28-%') then
    raise exception 'STEP28 synthetic marker already exists; stop and inspect before running this test.';
  end if;

  select count(*) into v_available_count
    from public.programs as p
    join public.program_learning_modes as m on m.program_id = p.id
   where p.code in ('class-10', 'class-12')
     and m.mode in ('online', 'hybrid', 'offline')
     and m.is_available;

  if v_available_count <> 6 then
    v_results := v_results || E'\nFAIL: expected six available programme/mode rows, found ' || v_available_count;
  else
    v_results := v_results || E'\nPASS: all six programme/mode rows are configured available';
  end if;

  -- Exercise the actual enrolment RPC for all six database-enabled combinations.
  for v_case in
    select p.id as program_id, p.code as program_code, p.name as program_name,
           p.program_fee_paise, p.standard_fee_paise, p.discount_percent,
           p.duration_days, p.subjects, p.currency, m.mode, m.label
      from public.programs as p
      join public.program_learning_modes as m on m.program_id = p.id
     where p.code in ('class-10', 'class-12')
       and m.mode in ('online', 'hybrid', 'offline')
       and m.is_available
     order by p.code, m.mode
  loop
    v_test_name := v_case.program_code || ' / ' || v_case.mode || ' pending enrolment, fee snapshot and student link';
    begin
      v_key := gen_random_uuid();
      v_reference := 'STEP28-' || replace(v_key::text, '-', '');
      v_email := 'step28-dbtest-' || replace(v_case.program_code, 'class-', '') || '-' || v_case.mode || '@example.invalid';
      v_mobile := '+919' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 9);
      v_whatsapp_mobile := '+918' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 9);
      if exists (select 1 from public.students as s where s.mobile_e164 in (v_mobile, v_whatsapp_mobile))
         or exists (select 1 from public.enrolments as e where e.whatsapp_mobile_e164 = v_whatsapp_mobile) then
        raise exception 'Generated STEP28 mobile collision; stop and inspect before running this test.';
      end if;
      v_payload := jsonb_build_object(
        'idempotency_key', v_key,
        'public_reference', v_reference,
        'full_name', 'Synthetic Step 28 Student',
        'mobile_e164', v_mobile,
        'email', v_email,
        'date_of_birth', '',
        'program_id', v_case.program_id,
        'board', 'CBSE',
        'school_name', 'Synthetic Test School',
        'preferred_language', 'English',
        'subject_choice', case when v_case.program_code = 'class-12' then 'Mathematics' else '' end,
        'learning_mode', v_case.mode,
        'terms_accepted', true,
        'privacy_consent', true,
        'refund_policy_accepted', true,
        'terms_policy_version', '2026-11-10',
        'privacy_policy_version', '2026-11-10',
        'refund_policy_version', '2026-11-10',
        'whatsapp_updates_consent', v_case.mode = 'online',
        'whatsapp_mobile_e164', v_whatsapp_mobile,
        'program_snapshot', jsonb_build_object('code', v_case.program_code, 'name', v_case.program_name, 'duration_days', v_case.duration_days, 'learning_mode', v_case.mode, 'learning_mode_label', v_case.label),
        'subjects_snapshot', v_case.subjects,
        'pricing_snapshot', jsonb_build_object('currency', v_case.currency, 'payable_paise', v_case.program_fee_paise, 'standard_paise', v_case.standard_fee_paise, 'discount_percent', v_case.discount_percent),
        'status_token_hash', repeat('e', 64)
      );

      select * into strict v_result from public.create_pending_enrolment(v_payload);
      select e.* into strict v_saved from public.enrolments as e where e.id = v_result.enrolment_id;
      if v_result.existing
         or v_saved.program_id <> v_case.program_id
         or v_saved.learning_mode <> v_case.mode
         or v_saved.status <> 'pending_payment'
         or v_saved.student_id <> v_result.student_id
         or v_saved.terms_policy_version <> '2026-11-10'
         or v_saved.privacy_policy_version <> '2026-11-10'
         or v_saved.refund_policy_version <> '2026-11-10'
         or (v_case.mode = 'online' and (v_saved.whatsapp_updates_consent_at is null or v_saved.whatsapp_mobile_e164 <> v_whatsapp_mobile))
         or (v_case.mode <> 'online' and v_saved.whatsapp_updates_consent_at is not null)
         or v_saved.terms_accepted_at is null
         or v_saved.privacy_consent_at is null
         or v_saved.refund_policy_accepted_at is null
         or (v_saved.pricing_snapshot->>'payable_paise')::bigint <> v_case.program_fee_paise then
        raise exception 'Pending enrolment, relationship, policy or fee snapshot assertion failed';
      end if;
      if v_case.program_fee_paise <> (case when v_case.program_code = 'class-10' then 249900 else 349900 end) then
        raise exception 'Configured fee does not match the approved programme fee';
      end if;
      if not exists (select 1 from public.students as s where s.id = v_saved.student_id and s.email = v_email) then
        raise exception 'Student/enrolment relationship assertion failed';
      end if;

      v_success_count := v_success_count + 1;
      v_results := v_results || E'\nPASS: ' || v_test_name;
      if v_first_id is null then
        v_first_payload := v_payload;
        v_first_id := v_result.enrolment_id;
        v_first_student_id := v_result.student_id;
        v_first_reference := v_result.public_reference;
        v_first_email := v_email;
      end if;
    exception when others then
      v_results := v_results || E'\nFAIL: ' || v_test_name || ' (' || sqlerrm || ')';
    end;
  end loop;

  if v_success_count <> 6 then
    v_results := v_results || E'\nFAIL: expected six successful mode enrolments, got ' || v_success_count;
  end if;

  -- Retry the exact first successful request key; it must return the original row.
  v_test_name := 'same idempotency key returns original enrolment without duplicate student';
  if v_first_payload is null then
    v_results := v_results || E'\nBLOCKED: ' || v_test_name || ' (no successful initial enrolment)';
  else
    begin
      v_payload := v_first_payload || jsonb_build_object(
        'public_reference', 'STEP28-RETRY-' || replace((v_first_payload->>'idempotency_key'), '-', ''),
        'full_name', 'Synthetic Retry Must Not Replace'
      );
      select * into strict v_retry from public.create_pending_enrolment(v_payload);
      select count(*) into v_student_count from public.students as s where s.email = v_first_email;
      if not v_retry.existing or v_retry.enrolment_id <> v_first_id
         or v_retry.student_id <> v_first_student_id
         or v_retry.public_reference <> v_first_reference
         or v_student_count <> 1 then
        raise exception 'Idempotent retry returned a different or duplicate record';
      end if;
      v_results := v_results || E'\nPASS: ' || v_test_name;
    exception when others then
      v_results := v_results || E'\nFAIL: ' || v_test_name || ' (' || sqlerrm || ')';
    end;
  end if;

  -- A nonexistent program fails its FK and the failed RPC statement leaves no student.
  v_test_name := 'invalid programme is rejected';
  begin
    v_key := gen_random_uuid();
    v_email := 'step28-dbtest-invalid-program@example.invalid';
    v_mobile := '+919' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 9);
    if exists (select 1 from public.students as s where s.mobile_e164 = v_mobile) then
      raise exception 'Generated invalid-program mobile collision';
    end if;
    v_payload := jsonb_build_object(
      'idempotency_key', v_key, 'public_reference', 'STEP28-' || replace(v_key::text, '-', ''),
      'full_name', 'Synthetic Invalid Programme', 'mobile_e164', v_mobile, 'email', v_email,
      'program_id', gen_random_uuid(), 'board', 'CBSE', 'school_name', 'Synthetic Test School',
      'learning_mode', 'online', 'terms_accepted', true, 'privacy_consent', true, 'refund_policy_accepted', true,
      'terms_policy_version', '2026-11-10', 'privacy_policy_version', '2026-11-10', 'refund_policy_version', '2026-11-10',
      'program_snapshot', '{}'::jsonb, 'subjects_snapshot', '[]'::jsonb, 'pricing_snapshot', '{}'::jsonb,
      'status_token_hash', repeat('f', 64)
    );
    begin
      perform * from public.create_pending_enrolment(v_payload);
      raise exception 'Invalid programme unexpectedly succeeded';
    exception when foreign_key_violation then
      if exists (select 1 from public.students as s where s.email = v_email) then
        raise exception 'Student row survived invalid programme rejection';
      end if;
      v_results := v_results || E'\nPASS: ' || v_test_name;
    end;
  exception when others then
    v_results := v_results || E'\nFAIL: ' || v_test_name || ' (' || sqlerrm || ')';
  end;

  -- The table CHECK rejects unknown values. Availability itself is enforced by the API selector.
  v_test_name := 'unsupported learning-mode value is rejected by PostgreSQL';
  begin
    select p.id into strict v_program_id from public.programs as p where p.code = 'class-10';
    v_key := gen_random_uuid();
    v_email := 'step28-dbtest-invalid-mode@example.invalid';
    v_mobile := '+919' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 9);
    if exists (select 1 from public.students as s where s.mobile_e164 = v_mobile) then
      raise exception 'Generated invalid-mode mobile collision';
    end if;
    v_payload := jsonb_build_object(
      'idempotency_key', v_key, 'public_reference', 'STEP28-' || replace(v_key::text, '-', ''),
      'full_name', 'Synthetic Invalid Mode', 'mobile_e164', v_mobile, 'email', v_email,
      'program_id', v_program_id, 'board', 'CBSE', 'school_name', 'Synthetic Test School',
      'learning_mode', 'unsupported-mode', 'terms_accepted', true, 'privacy_consent', true, 'refund_policy_accepted', true,
      'terms_policy_version', '2026-11-10', 'privacy_policy_version', '2026-11-10', 'refund_policy_version', '2026-11-10',
      'program_snapshot', '{}'::jsonb, 'subjects_snapshot', '[]'::jsonb, 'pricing_snapshot', '{}'::jsonb,
      'status_token_hash', repeat('g', 64)
    );
    begin
      perform * from public.create_pending_enrolment(v_payload);
      raise exception 'Unsupported learning mode unexpectedly succeeded';
    exception when check_violation then
      if exists (select 1 from public.students as s where s.email = v_email) then
        raise exception 'Student row survived invalid mode rejection';
      end if;
      v_results := v_results || E'\nPASS: ' || v_test_name;
    end;
  exception when others then
    v_results := v_results || E'\nFAIL: ' || v_test_name || ' (' || sqlerrm || ')';
  end;

  -- Missing required terms acknowledgement must fail before a student is inserted.
  v_test_name := 'missing policy acceptance is rejected';
  begin
    v_key := gen_random_uuid();
    v_payload := jsonb_build_object(
      'idempotency_key', v_key, 'public_reference', 'STEP28-' || replace(v_key::text, '-', ''),
      'privacy_consent', true, 'refund_policy_accepted', true,
      'terms_policy_version', '2026-11-10', 'privacy_policy_version', '2026-11-10', 'refund_policy_version', '2026-11-10'
    );
    begin
      perform * from public.create_pending_enrolment(v_payload);
      raise exception 'Missing policy acceptance unexpectedly succeeded';
    exception when raise_exception then
      if sqlerrm <> 'POLICY_ACKNOWLEDGEMENT_INVALID' then raise; end if;
      v_results := v_results || E'\nPASS: ' || v_test_name;
    end;
  exception when others then
    v_results := v_results || E'\nFAIL: ' || v_test_name || ' (' || sqlerrm || ')';
  end;

  if v_success_count <> 6 or v_results like '%FAIL:%' or v_results like '%BLOCKED:%' then
    raise exception using message = 'STEP28_INTEGRATION_ASSERTIONS_FAILED', detail = v_results;
  end if;
  perform set_config('step28.test_results', v_results, true);
end;
$test$;

select current_setting('step28.test_results', true) as integration_test_results;

rollback;
