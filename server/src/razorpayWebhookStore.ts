import { getDatabase } from './supabase.js'
import type { RazorpayWebhookStore } from './razorpayWebhook.js'

type ClaimRow = { claimed: boolean; event_row_id: string | null; processing_status: string | null; lease_token: string | null }

function first<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : data as T | null
}

export const razorpayWebhookStore: RazorpayWebhookStore = {
  async claimEvent(input) {
    const { data, error } = await getDatabase().rpc('claim_razorpay_webhook_event_v2', {
      p_provider_event_id: input.eventId,
      p_event_type: input.eventType,
      p_provider_order_id: input.orderId,
      p_provider_payment_id: input.paymentId,
      p_payload_redacted: input.redactedPayload,
      p_lease_token: input.leaseToken,
      p_lease_seconds: 300,
    })
    if (error) throw new Error('webhook_claim_failed')
    const result = first(data as ClaimRow | ClaimRow[] | null)
    if (result?.claimed && result.event_row_id && result.lease_token) return { state: 'claimed', eventRowId: result.event_row_id, leaseToken: result.lease_token }
    if (result?.processing_status === 'processed' || result?.processing_status === 'ignored') return { state: 'done' }
    return { state: 'busy' }
  },

  async processEvent(input) {
    const { error } = await getDatabase().rpc('process_razorpay_webhook_event_v2', {
      p_event_row_id: input.eventRowId,
      p_lease_token: input.leaseToken,
      p_action: input.action,
      p_provider_order_id: input.orderId ?? null,
      p_provider_payment_id: input.paymentId ?? null,
      p_amount_paise: input.amountPaise ?? null,
      p_currency: input.currency ?? null,
    })
    if (error) throw new Error('webhook_processing_failed')
  },

  async releaseEvent(input) {
    const { data, error } = await getDatabase().rpc('release_razorpay_webhook_event_v2', {
      p_event_row_id: input.eventRowId,
      p_lease_token: input.leaseToken,
      p_diagnostic: input.diagnostic,
    })
    if (error) throw new Error('webhook_release_failed')
    if (data !== true) throw new Error('webhook_lease_lost')
  },
}
