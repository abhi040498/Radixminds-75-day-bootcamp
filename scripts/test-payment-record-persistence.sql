-- Isolated TEST-only payment record RPC integration check.
-- Run only with: supabase db query --remote=oohcwibhjmzrrpuxonck --file scripts/test-payment-record-persistence.sql --yes
-- Uses one synthetic enrolment and a fake provider order identifier. No provider is contacted.
-- Everything is inside one transaction and the final ROLLBACK preserves existing records.
begin;
set local role service_role;

do $payment_test$
declare
  v_run uuid := gen_random_uuid();
  v_run_text text;
  v_program record;
  v_payload jsonb;
  v_enrol record;
  v_claim record;
  v_persisted record;
  v_retry record;
  v_reference text;
  v_email text;
  v_mobile text;
  v_enrol_key uuid := gen_random_uuid();
  v_payment_key uuid := gen_random_uuid();
  v_lease_token uuid := gen_random_uuid();
  v_retry_token uuid := gen_random_uuid();
  v_fake_order_id text;
  v_rows integer;
  v_results text := '';
begin
  v_run_text := replace(v_run::text, '-', '');
  v_reference := 'PMT-IT-' || v_run_text;
  v_email := 'pmt-it-' || v_run_text || '@example.invalid';
  v_mobile := '+919' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 9);
  v_fake_order_id := 'order_TEST_ONLY_' || v_run_text;

  if exists (select 1 from public.students as s where s.email = v_email or s.mobile_e164 = v_mobile)
     or exists (select 1 from public.enrolments as e where e.public_reference = v_reference or e.idempotency_key = v_enrol_key)
     or exists (select 1 from public.payments as p where p.request_idempotency_key = v_payment_key
                  or p.provider_order_id = v_fake_order_id) then
    raise exception 'PAYMENT_TEST_FIXTURE_COLLISION';
  end if;

  select p.id, p.code, p.name, p.program_fee_paise, p.standard_fee_paise,
         p.discount_percent, p.duration_days, p.subjects, p.currency
    into strict v_program from public.programs as p where p.code = 'class-10';
  if v_program.program_fee_paise <> 249900 or v_program.currency <> 'INR'
     or v_program.duration_days <> 75 then
    raise exception 'PAYMENT_TEST_PROGRAM_CONFIGURATION_MISMATCH';
  end if;

  v_payload := jsonb_build_object(
    'idempotency_key', v_enrol_key,
    'public_reference', v_reference,
    'full_name', 'Synthetic payment persistence test',
    'mobile_e164', v_mobile,
    'email', v_email,
    'program_id', v_program.id,
    'board', 'CBSE',
    'school_name', 'Synthetic Payment Test School',
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
    'status_token_hash', repeat('a', 64)
  );
  select * into strict v_enrol from public.create_pending_enrolment(v_payload);
  if v_enrol.existing then raise exception 'PAYMENT_TEST_ENROLMENT_UNEXPECTEDLY_EXISTED'; end if;
  v_results := v_results || E'\nPASS: synthetic pending enrolment created';

  select * into strict v_claim from public.claim_payment_attempt_v2(
    v_enrol.enrolment_id, v_payment_key, v_lease_token, 120);
  if v_claim.payment_id is null or v_claim.status <> 'creating'
     or v_claim.attempt_number <> 1 or v_claim.amount_paise <> 249900
     or v_claim.currency <> 'INR' or not v_claim.lease_acquired
     or v_claim.lease_token <> v_lease_token or v_claim.provider_order_id is not null then
    raise exception 'PAYMENT_TEST_CLAIM_ASSERTION_FAILED';
  end if;
  v_results := v_results || E'\nPASS: server fee snapshot is claimed with one creating attempt and matching lease';

  select * into strict v_persisted from public.persist_payment_order_v2(
    v_claim.payment_id, v_enrol.enrolment_id, v_lease_token, v_fake_order_id);
  if v_persisted.id <> v_claim.payment_id or v_persisted.status <> 'created'
     or v_persisted.provider_order_id <> v_fake_order_id
     or v_persisted.amount_paise <> 249900 or v_persisted.currency <> 'INR' then
    raise exception 'PAYMENT_TEST_ORDER_PERSISTENCE_ASSERTION_FAILED';
  end if;
  v_results := v_results || E'\nPASS: fake provider order persisted through compare-and-set RPC';

  select count(*) into v_rows from public.persist_payment_order_v2(
    v_claim.payment_id, v_enrol.enrolment_id, v_lease_token, v_fake_order_id);
  if v_rows <> 0 then raise exception 'PAYMENT_TEST_DUPLICATE_PERSISTENCE_ASSERTION_FAILED:%', v_rows; end if;
  v_results := v_results || E'\nPASS: repeated persistence returns zero rows';

  select * into strict v_retry from public.claim_payment_attempt_v2(
    v_enrol.enrolment_id, v_payment_key, v_retry_token, 120);
  if v_retry.payment_id <> v_claim.payment_id or v_retry.status <> 'created'
     or v_retry.lease_acquired or v_retry.lease_token is not null
     or v_retry.provider_order_id <> v_fake_order_id then
    raise exception 'PAYMENT_TEST_IDEMPOTENT_RETRY_ASSERTION_FAILED';
  end if;
  v_results := v_results || E'\nPASS: same-key retry returns the existing persisted order without acquiring a lease';

  select count(*) into v_rows from public.payments as p
   where p.enrolment_id = v_enrol.enrolment_id;
  if v_rows <> 1 then raise exception 'PAYMENT_TEST_PAYMENT_CARDINALITY_FAILED:%', v_rows; end if;
  perform set_config('payment_record.test_results', v_results, true);
end;
$payment_test$;

select current_setting('payment_record.test_results', true) as payment_record_test_results;

rollback;
