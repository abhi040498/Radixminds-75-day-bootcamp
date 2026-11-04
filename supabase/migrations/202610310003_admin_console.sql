alter table public.enrolments
  add column if not exists source text not null default 'online' check (source in ('online','manual')),
  add column if not exists internal_remarks text null,
  add column if not exists remarks_updated_by uuid null references public.admin_users(id),
  add column if not exists manual_payment_status text not null default 'not_applicable' check (manual_payment_status in ('not_applicable','unpaid','recorded_paid')),
  add column if not exists manual_payment_reference text null,
  add column if not exists manual_payment_recorded_at timestamptz null,
  add column if not exists manual_payment_recorded_by uuid null references public.admin_users(id);

alter table public.enquiry_submissions
  add column if not exists status text not null default 'new' check (status in ('new','in_progress','resolved','closed')),
  add column if not exists internal_remarks text null,
  add column if not exists handled_by uuid null references public.admin_users(id),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists enrolments_source_idx on public.enrolments(source, created_at desc);
create index if not exists enquiries_status_idx on public.enquiry_submissions(status, created_at desc);

create or replace function public.get_admin_dashboard_metrics()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'totalRegistrations',(select count(*) from public.enrolments),
    'class10Enrolments',(select count(*) from public.enrolments where program_snapshot->>'code'='class-10'),
    'class12Enrolments',(select count(*) from public.enrolments where program_snapshot->>'code'='class-12'),
    'manualEnrolments',(select count(*) from public.enrolments where source='manual'),
    'successfulPayments',(select count(distinct enrolment_id) from public.payments where status='captured'),
    'pendingPayments',(select count(distinct enrolment_id) from public.payments where status in ('creating','created','authorized')),
    'failedPayments',(select count(*) from public.payments where status='failed'),
    'verifiedRevenuePaise',(select coalesce(sum(amount_paise),0) from public.payments where status='captured')
  );
$$;

create or replace function public.admin_enrolment_page(
  p_search text default null,
  p_program text default null,
  p_enrolment_status text default null,
  p_payment_status text default null,
  p_page integer default 1,
  p_page_size integer default 30
) returns jsonb language sql security definer set search_path = public as $$
  with latest_payment as (
    select distinct on (enrolment_id)
      enrolment_id,status,provider_order_id,provider_payment_id,amount_paise,currency,captured_at
    from public.payments order by enrolment_id,attempt_number desc
  ), base as (
    select e.id,e.public_reference,e.status,e.created_at,e.source,e.internal_remarks,e.manual_payment_status,
      e.manual_payment_reference,e.manual_payment_recorded_at,e.program_snapshot,e.subjects_snapshot,
      e.pricing_snapshot,e.learning_mode,e.board,e.school_name,e.student_id,
      s.full_name as student_name,s.mobile_e164 as student_mobile,s.email as student_email,
      case when e.source='manual' then e.manual_payment_status else coalesce(lp.status,'not_started') end as payment_status,
      lp.provider_order_id,lp.provider_payment_id,lp.amount_paise as payment_amount_paise,
      lp.currency as payment_currency,lp.captured_at as payment_captured_at
    from public.enrolments e
    join public.students s on s.id=e.student_id
    left join latest_payment lp on lp.enrolment_id=e.id
    where (p_program is null or e.program_snapshot->>'code'=p_program)
      and (p_enrolment_status is null or e.status=p_enrolment_status)
      and (p_payment_status is null or (case when e.source='manual' then e.manual_payment_status else coalesce(lp.status,'not_started') end)=p_payment_status)
      and (p_search is null or concat_ws(' ',e.public_reference,s.full_name,s.mobile_e164,s.email) ilike ('%'||p_search||'%'))
  ), page as (
    select * from base order by created_at desc
    limit greatest(1,least(coalesce(p_page_size,30),100))
    offset greatest(coalesce(p_page,1)-1,0)*greatest(1,least(coalesce(p_page_size,30),100))
  )
  select jsonb_build_object(
    'enrolments',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
    'total',(select count(*) from base),
    'page',greatest(coalesce(p_page,1),1),
    'pageSize',greatest(1,least(coalesce(p_page_size,30),100))
  );
$$;

create or replace function public.create_admin_manual_enrolment(p_input jsonb)
returns table(enrolment_id uuid,public_reference text)
language plpgsql security definer set search_path = public as $$
declare
  v_student_id uuid;
  v_enrolment_id uuid;
  v_reference text;
begin
  insert into public.students(full_name,mobile_e164,email,date_of_birth,guardian_name,guardian_mobile_e164,guardian_email)
  values (
    p_input->>'full_name',p_input->>'mobile_e164',lower(p_input->>'email'),nullif(p_input->>'date_of_birth','')::date,
    nullif(p_input->>'guardian_name',''),nullif(p_input->>'guardian_mobile_e164',''),nullif(lower(p_input->>'guardian_email'),'')
  ) returning id into v_student_id;

  v_reference := p_input->>'public_reference';
  insert into public.enrolments(
    public_reference,idempotency_key,status,student_id,program_id,board,school_name,preferred_language,subject_choice,learning_mode,
    program_snapshot,subjects_snapshot,pricing_snapshot,status_token_hash,terms_accepted_at,privacy_consent_at,
    guardian_consent_at,enrolment_communications_consent_at,source,internal_remarks,remarks_updated_by,
    manual_payment_status,manual_payment_reference,manual_payment_recorded_at,manual_payment_recorded_by
  ) values (
    v_reference,(p_input->>'idempotency_key')::uuid,'confirmed',v_student_id,(p_input->>'program_id')::uuid,
    p_input->>'board',p_input->>'school_name',nullif(p_input->>'preferred_language',''),nullif(p_input->>'subject_choice',''),nullif(p_input->>'learning_mode',''),
    p_input->'program_snapshot',p_input->'subjects_snapshot',p_input->'pricing_snapshot',p_input->>'status_token_hash',
    now(),now(),now(),now(),'manual',nullif(p_input->>'internal_remarks',''),(p_input->>'admin_user_id')::uuid,
    p_input->>'manual_payment_status',nullif(p_input->>'manual_payment_reference',''),
    case when p_input->>'manual_payment_status'='recorded_paid' then now() else null end,
    case when p_input->>'manual_payment_status'='recorded_paid' then (p_input->>'admin_user_id')::uuid else null end
  ) returning id into v_enrolment_id;

  return query select v_enrolment_id,v_reference;
end;
$$;

revoke all on function public.get_admin_dashboard_metrics() from public,anon,authenticated;
revoke all on function public.admin_enrolment_page(text,text,text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.create_admin_manual_enrolment(jsonb) from public,anon,authenticated;
grant execute on function public.get_admin_dashboard_metrics() to service_role;
grant execute on function public.admin_enrolment_page(text,text,text,text,integer,integer) to service_role;
grant execute on function public.create_admin_manual_enrolment(jsonb) to service_role;
