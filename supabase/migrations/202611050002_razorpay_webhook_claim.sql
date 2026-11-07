alter table public.razorpay_webhook_events
  drop constraint if exists razorpay_webhook_events_processing_status_check;

alter table public.razorpay_webhook_events
  add constraint razorpay_webhook_events_processing_status_check
  check (processing_status in ('received', 'processing', 'processed', 'ignored', 'error'));

alter table public.razorpay_webhook_events
  add column if not exists processing_started_at timestamptz null;

create or replace function public.claim_razorpay_webhook_event(
  p_provider_event_id text,
  p_event_type text,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_payload_redacted jsonb
)
returns table(claimed boolean, event_row_id uuid, processing_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_status text;
begin
  insert into public.razorpay_webhook_events as webhook_event (
    provider_event_id, event_type, provider_order_id, provider_payment_id,
    payload_redacted, signature_valid, processing_status, processing_started_at
  ) values (
    p_provider_event_id, p_event_type, p_provider_order_id, p_provider_payment_id,
    coalesce(p_payload_redacted, '{}'::jsonb), true, 'processing', now()
  )
  on conflict (provider_event_id) do update
    set event_type = excluded.event_type,
        provider_order_id = excluded.provider_order_id,
        provider_payment_id = excluded.provider_payment_id,
        payload_redacted = excluded.payload_redacted,
        signature_valid = true,
        processing_status = 'processing',
        processing_error = null,
        processed_at = null,
        processing_started_at = now()
    where webhook_event.processing_status in ('received', 'error')
       or (
         webhook_event.processing_status = 'processing'
         and webhook_event.processing_started_at < now() - interval '2 minutes'
       )
  returning id into v_event_id;

  if v_event_id is not null then
    return query select true, v_event_id, 'processing'::text;
    return;
  end if;

  select id, public.razorpay_webhook_events.processing_status
    into v_event_id, v_status
    from public.razorpay_webhook_events
    where provider_event_id = p_provider_event_id;

  return query select false, v_event_id, v_status;
end;
$$;

revoke all on function public.claim_razorpay_webhook_event(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_razorpay_webhook_event(text, text, text, text, jsonb) to service_role;
