import { getDatabase } from './supabase.js'
import type { RazorpayWebhookStore } from './razorpayWebhook.js'

type ClaimRow = { claimed: boolean; event_row_id: string | null; processing_status: string | null }

export const razorpayWebhookStore: RazorpayWebhookStore = {
  async claimEvent(input) {
    const { data, error } = await getDatabase().rpc('claim_razorpay_webhook_event', {
      p_provider_event_id: input.eventId,
      p_event_type: input.eventType,
      p_provider_order_id: input.orderId,
      p_provider_payment_id: input.paymentId,
      p_payload_redacted: input.redactedPayload,
    })
    if (error) throw new Error('webhook_claim_failed')
    const result = (Array.isArray(data) ? data[0] : data) as ClaimRow | null
    if (result?.claimed && result.event_row_id) return { state: 'claimed', eventRowId: result.event_row_id }
    if (result?.processing_status === 'processed' || result?.processing_status === 'ignored') return { state: 'done' }
    return { state: 'busy' }
  },

  async markEvent(eventRowId, status, diagnostic) {
    const now = new Date().toISOString()
    const { data, error } = await getDatabase()
      .from('razorpay_webhook_events')
      .update({
        processing_status: status,
        processing_error: diagnostic ?? null,
        processing_started_at: null,
        processed_at: status === 'processed' || status === 'ignored' ? now : null,
      })
      .eq('id', eventRowId)
      .eq('processing_status', 'processing')
      .select('id')
      .maybeSingle()
    if (error || !data) throw new Error('webhook_status_update_failed')
  },

  async confirmCaptured({ orderId, paymentId, amountPaise, currency }) {
    const db = getDatabase()
    const { data: payment, error: lookupError } = await db.from('payments')
      .select('status,provider_payment_id,amount_paise,currency')
      .eq('provider_order_id', orderId)
      .maybeSingle()
    if (lookupError || !payment) throw new Error('capture_order_not_found')
    if (payment.status === 'captured') {
      if (payment.provider_payment_id !== paymentId || Number(payment.amount_paise) !== amountPaise || payment.currency !== currency) {
        throw new Error('captured_payment_identity_mismatch')
      }
      return
    }
    if (payment.provider_payment_id && payment.provider_payment_id !== paymentId) throw new Error('capture_payment_id_mismatch')

    const { error } = await db.rpc('confirm_captured_payment', {
      p_provider_order_id: orderId,
      p_provider_payment_id: paymentId,
      p_amount_paise: amountPaise,
      p_currency: currency,
      p_signature_verified: true,
    })
    if (error) throw new Error('capture_confirmation_failed')
  },

  async markFailed({ orderId, paymentId }) {
    const db = getDatabase()
    const { data: payment, error: lookupError } = await db.from('payments')
      .select('id,status,provider_payment_id')
      .eq('provider_order_id', orderId)
      .maybeSingle()
    if (lookupError || !payment) throw new Error('failed_payment_order_not_found')
    if (payment.status === 'captured' || payment.status === 'failed') return
    if (payment.status !== 'created' && payment.status !== 'authorized') return
    if (payment.provider_payment_id && payment.provider_payment_id !== paymentId) throw new Error('failed_payment_id_mismatch')

    const { data: updated, error: updateError } = await db.from('payments')
      .update({ provider_payment_id: paymentId, updated_at: new Date().toISOString() })
      .eq('id', payment.id)
      .in('status', ['created', 'authorized'])
      .select('id')
      .maybeSingle()
    if (updateError) throw new Error('failed_payment_link_update_failed')
    if (!updated) {
      const { data: latest, error } = await db.from('payments').select('status').eq('id', payment.id).maybeSingle()
      if (error || (latest?.status !== 'captured' && latest?.status !== 'failed')) throw new Error('failed_payment_state_conflict')
      return
    }

    const { error } = await db.rpc('mark_provider_payment_failed', { p_provider_payment_id: paymentId })
    if (error) throw new Error('failed_payment_mark_failed')
  },
}
