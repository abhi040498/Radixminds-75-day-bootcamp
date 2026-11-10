-- Isolated TEST-only refund request integration checks.
-- Run only with: supabase db query --remote=oohcwibhjmzrrpuxonck --file scripts/test-refund-workflow.sql --yes
-- Synthetic students, enrolments and fake payment rows exist only inside this transaction.
-- No Razorpay API is called. The final ROLLBACK preserves all pre-existing records.
begin;
set local role service_role;

do $refund_test$
declare
  v_run uuid := gen_random_uuid();
  v_run_text text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_program record;
  v_case record;
  v_payload jsonb;
  v_enrol record;
  v_request record;
  v_retry record;
  v_key uuid;
  v_payment_key uuid;
  v_request_key uuid;
  v_reference text;
  v_email text;
  v_mobile text;
  v_order_id text;
  v_payment_id text;
  v_payment_row_id uuid;
  v_capture_time timestamptz;
  v_day_enrolment_id uuid;
  v_day_request_id uuid;
  v_day_request_ref text;
  v_day7_enrolment_id uuid;
  v_day7_request_id uuid;
  v_outside_enrolment_id uuid;
  v_pending_enrolment_id uuid;
  v_failed_enrolment_id uuid;
  v_admin_id uuid := gen_random_uuid();
  v_audit_count integer;
  v_fixtures integer;
  v_student_count integer;
  v_payment_count integer;
  v_refund_count integer;
  v_passed integer := 0;
  v_results text := '';
begin
  v_run_text := replace(v_run::text, '-', '');

  select p.id, p.code, p.name, p.program_fee_paise, p.standard_fee_paise,
         p.discount_percent, p.duration_days, p.subjects, p.currency
    into strict v_program
    from public.programs as p where p.code = 'class-10';
  if v_program.program_fee_paise <> 249900 or v_program.currency <> 'INR'
     or v_program.duration_days <> 75 then
    raise exception 'REFUND_TEST_PROGRAM_CONFIGURATION_MISMATCH';
  end if;

  if exists (select 1 from public.students as s where s.email like 'rfd-it-' || v_run_text || '-%@example.invalid')
     or exists (select 1 from public.enrolments as e where e.public_reference like 'RFD-IT-' || v_run_text || '-%') then
    raise exception 'REFUND_TEST_FIXTURE_COLLISION';
  end if;

  for v_case in
    select * from (values
      ('payment-day'::text, 'captured'::text, 0::integer),
      ('calendar-day-seven'::text, 'captured'::text, 6::integer),
      ('outside-window'::text, 'captured'::text, 7::integer),
      ('pending-payment'::text, 'created'::text, 0::integer),
      ('failed-payment'::text, 'failed'::text, 0::integer)
    ) as cases(case_name, payment_status, days_ago)
  loop
    v_key := gen_random_uuid();
    v_payment_key := gen_random_uuid();
    v_reference := 'RFD-IT-' || v_run_text || '-' || v_case.case_name;
    v_email := 'rfd-it-' || v_run_text || '-' || v_case.case_name || '@example.invalid';
    v_mobile := '+919' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 9);
    v_order_id := 'order_RFDTEST_' || v_run_text || '_' || v_case.case_name;
    v_payment_id := case when v_case.payment_status = 'captured'
      then 'pay_RFDTEST_' || v_run_text || '_' || v_case.case_name else null end;

    if exists (select 1 from public.students as s where s.email = v_email or s.mobile_e164 = v_mobile)
       or exists (select 1 from public.enrolments as e where e.public_reference = v_reference or e.idempotency_key = v_key)
       or exists (select 1 from public.payments as p where p.request_idempotency_key = v_payment_key
                     or p.provider_order_id = v_order_id
                     or (v_payment_id is not null and p.provider_payment_id = v_payment_id)) then
      raise exception 'REFUND_TEST_GENERATED_IDENTIFIER_COLLISION:%', v_case.case_name;
    end if;

    v_payload := jsonb_build_object(
      'idempotency_key', v_key,
      'public_reference', v_reference,
      'full_name', 'Synthetic refund test ' || v_case.case_name,
      'mobile_e164', v_mobile,
      'email', v_email,
      'program_id', v_program.id,
      'board', 'CBSE',
      'school_name', 'Synthetic Refund Test School',
      'subject_choice', '',
      'learning_mode', 'online',
      'terms_accepted', true,
      'privacy_consent', true,
      'refund_policy_accepted', true,
      'terms_policy_version', '2026-11-10',
      'privacy_policy_version', '2026-11-10',
      'refund_policy_version', '2026-11-10',
      'program_snapshot', jsonb_build_object('code', v_program.code, 'name', v_program.name, 'test_run', v_run_text),
      'subjects_snapshot', v_program.subjects,
      'pricing_snapshot', jsonb_build_object('currency', v_program.currency, 'payable_paise', v_program.program_fee_paise),
      'status_token_hash', repeat('f', 64)
    );
    select * into strict v_enrol from public.create_pending_enrolment(v_payload);
    if v_enrol.existing then raise exception 'REFUND_TEST_ENROLMENT_UNEXPECTEDLY_EXISTED:%', v_case.case_name; end if;

    v_capture_time := case when v_case.payment_status <> 'captured' then null
      when v_case.days_ago = 0 then now()
      else (((v_today - v_case.days_ago)::timestamp + time '23:30') at time zone 'Asia/Kolkata') end;

    insert into public.payments(enrolment_id, attempt_number, request_idempotency_key,
      provider_order_id, provider_payment_id, amount_paise, currency, status, captured_at)
    values (v_enrol.enrolment_id, 1, v_payment_key, v_order_id, v_payment_id,
      v_program.program_fee_paise, 'INR', v_case.payment_status, v_capture_time)
    returning id into v_payment_row_id;

    if v_case.payment_status = 'captured' then
      update public.enrolments as e set status = 'confirmed'
       where e.id = v_enrol.enrolment_id;
      if not found then raise exception 'REFUND_TEST_ENROLMENT_CONFIRMATION_FIXTURE_FAILED:%', v_case.case_name; end if;
    end if;

    case v_case.case_name
      when 'payment-day' then v_day_enrolment_id := v_enrol.enrolment_id;
      when 'calendar-day-seven' then v_day7_enrolment_id := v_enrol.enrolment_id;
      when 'outside-window' then v_outside_enrolment_id := v_enrol.enrolment_id;
      when 'pending-payment' then v_pending_enrolment_id := v_enrol.enrolment_id;
      when 'failed-payment' then v_failed_enrolment_id := v_enrol.enrolment_id;
    end case;
  end loop;

  -- Request on the payment date.
  v_request_key := gen_random_uuid();
  if exists (select 1 from public.refund_requests as r where r.idempotency_key = v_request_key) then
    raise exception 'REFUND_TEST_REQUEST_KEY_COLLISION';
  end if;
  select e.public_reference into strict v_reference from public.enrolments as e where e.id = v_day_enrolment_id;
  select * into strict v_request from public.request_refund(
    v_reference, v_request_key, 'Synthetic payment-day refund request for database integration test');
  if v_request.status <> 'requested' or v_request.existing then
    raise exception 'REFUND_TEST_PAYMENT_DAY_ASSERTION_FAILED';
  end if;
  v_day_request_id := v_request.refund_request_id;
  v_day_request_ref := v_request.request_reference;
  v_passed := v_passed + 1; v_results := v_results || E'\nPASS: request accepted on payment day';

  -- Same key returns the same request; a different key does not create a second request.
  select * into strict v_retry from public.request_refund(
    (select e.public_reference from public.enrolments as e where e.id = v_day_enrolment_id),
    v_request_key, 'Synthetic retry with same idempotency key');
  if not v_retry.existing or v_retry.refund_request_id <> v_day_request_id
     or v_retry.request_reference <> v_day_request_ref then
    raise exception 'REFUND_TEST_SAME_KEY_RETRY_FAILED';
  end if;
  v_passed := v_passed + 1; v_results := v_results || E'\nPASS: same-key retry returns original refund request';

  begin
    perform * from public.request_refund(
      (select e.public_reference from public.enrolments as e where e.id = v_day_enrolment_id),
      gen_random_uuid(), 'Synthetic duplicate request with a different key');
    raise exception 'REFUND_TEST_DUPLICATE_REQUEST_UNEXPECTEDLY_SUCCEEDED';
  exception when raise_exception then
    if sqlerrm <> 'REFUND_REQUEST_EXISTS' then raise; end if;
  end;
  v_passed := v_passed + 1; v_results := v_results || E'\nPASS: duplicate refund request is rejected';

  -- The date six days before today is calendar day seven, including late on that date.
  v_request_key := gen_random_uuid();
  if exists (select 1 from public.refund_requests as r where r.idempotency_key = v_request_key) then
    raise exception 'REFUND_TEST_DAY_SEVEN_REQUEST_KEY_COLLISION';
  end if;
  select * into strict v_request from public.request_refund(
    (select e.public_reference from public.enrolments as e where e.id = v_day7_enrolment_id),
    v_request_key, 'Synthetic calendar-day-seven refund request');
  if v_request.status <> 'requested' or v_request.existing then
    raise exception 'REFUND_TEST_DAY_SEVEN_ASSERTION_FAILED';
  end if;
  v_day7_request_id := v_request.refund_request_id;
  v_passed := v_passed + 1; v_results := v_results || E'\nPASS: request accepted on calendar day seven';

  -- Payment date seven days earlier makes today calendar day eight, after the midnight IST cutoff.
  begin
    perform * from public.request_refund(
      (select e.public_reference from public.enrolments as e where e.id = v_outside_enrolment_id),
      gen_random_uuid(), 'Synthetic request outside refund window');
    raise exception 'REFUND_TEST_OUTSIDE_WINDOW_UNEXPECTEDLY_SUCCEEDED';
  exception when raise_exception then
    if sqlerrm <> 'REFUND_REQUEST_WINDOW_CLOSED' then raise; end if;
  end;
  v_passed := v_passed + 1; v_results := v_results || E'\nPASS: request after calendar-day-seven cutoff is rejected';

  -- Pending and failed payments cannot create a refund request.
  foreach v_reference in array array[
    (select e.public_reference from public.enrolments as e where e.id = v_pending_enrolment_id),
    (select e.public_reference from public.enrolments as e where e.id = v_failed_enrolment_id)
  ] loop
    begin
      perform * from public.request_refund(v_reference, gen_random_uuid(), 'Synthetic uncaptured payment test');
      raise exception 'REFUND_TEST_UNCAPTURED_PAYMENT_UNEXPECTEDLY_SUCCEEDED';
    exception when raise_exception then
      if sqlerrm <> 'REFUND_PAYMENT_NOT_CAPTURED' then raise; end if;
    end;
  end loop;
  v_passed := v_passed + 1; v_results := v_results || E'\nPASS: pending and failed payment refund requests are rejected';

  -- A fabricated admin ID is not authorized to approve a request or record an exception.
  begin
    perform * from public.decide_refund_request(v_day_request_id, v_admin_id, 'approved', 10000, 'Synthetic unauthorized attempt');
    raise exception 'REFUND_TEST_UNAUTHORIZED_ADMIN_UNEXPECTEDLY_SUCCEEDED';
  exception when raise_exception then
    if sqlerrm <> 'REFUND_ADMIN_FORBIDDEN' then raise; end if;
  end;
  v_passed := v_passed + 1; v_results := v_results || E'\nPASS: unauthorized admin decision is rejected';

  begin
    perform * from public.request_refund_exception(
      (select e.public_reference from public.enrolments as e where e.id = v_outside_enrolment_id),
      gen_random_uuid(), 'Synthetic late exception test', v_admin_id, 'Synthetic unauthorized exception');
    raise exception 'REFUND_TEST_UNAUTHORIZED_EXCEPTION_UNEXPECTEDLY_SUCCEEDED';
  exception when raise_exception then
    if sqlerrm <> 'REFUND_EXCEPTION_FORBIDDEN' then raise; end if;
  end;
  v_passed := v_passed + 1; v_results := v_results || E'\nPASS: unauthorized late-window exception is rejected';

  select count(*) into v_audit_count from public.refund_request_audit as a
   where a.refund_request_id in (v_day_request_id, v_day7_request_id)
     and a.event_type = 'requested';
  if v_audit_count <> 2 then raise exception 'REFUND_TEST_AUDIT_COUNT_FAILED:%', v_audit_count; end if;
  v_passed := v_passed + 1; v_results := v_results || E'\nPASS: accepted requests have exactly two request audit events';

  select count(*) into v_fixtures from public.enrolments as e
   where e.id in (v_day_enrolment_id, v_day7_enrolment_id, v_outside_enrolment_id,
                  v_pending_enrolment_id, v_failed_enrolment_id)
     and e.public_reference like 'RFD-IT-' || v_run_text || '-%';
  select count(*) into v_student_count from public.students as s
   where s.email like 'rfd-it-' || v_run_text || '-%@example.invalid';
  select count(*) into v_payment_count from public.payments as p
   where p.enrolment_id in (v_day_enrolment_id, v_day7_enrolment_id, v_outside_enrolment_id,
                            v_pending_enrolment_id, v_failed_enrolment_id);
  select count(*) into v_refund_count from public.refund_requests as r
   where r.id in (v_day_request_id, v_day7_request_id);
  if v_fixtures <> 5 or v_student_count <> 5 or v_payment_count <> 5 or v_refund_count <> 2 then
    raise exception 'REFUND_TEST_FIXTURE_RELATIONSHIP_FAILED: enrolments %, students %, payments %, requests %',
      v_fixtures, v_student_count, v_payment_count, v_refund_count;
  end if;
  if v_passed <> 9 then raise exception 'REFUND_TEST_ASSERTION_COUNT_FAILED:%', v_passed; end if;
  perform set_config('refund_workflow.test_results', v_results, true);
end;
$refund_test$;

select current_setting('refund_workflow.test_results', true) as refund_workflow_test_results;

rollback;
