-- Add a mode-aware admin listing RPC while leaving the existing RPC contract intact.
-- Apply only after review in the target Supabase project.
create or replace function public.admin_enrolment_page_by_mode(
  p_search text default null,
  p_program text default null,
  p_enrolment_status text default null,
  p_payment_status text default null,
  p_learning_mode text default null,
  p_page integer default 1,
  p_page_size integer default 30
) returns jsonb
language sql security definer set search_path = public as $$
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
      and (p_learning_mode is null or e.learning_mode=p_learning_mode)
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

revoke all on function public.admin_enrolment_page_by_mode(text,text,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_enrolment_page_by_mode(text,text,text,text,text,integer,integer) to service_role;
