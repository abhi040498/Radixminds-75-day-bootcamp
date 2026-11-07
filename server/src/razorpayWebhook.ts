import { verifyHmac } from './security.js'

type WebhookEntity = Record<string, unknown>
type WebhookPayload = {
  event?: unknown
  payload?: {
    payment?: { entity?: WebhookEntity }
    order?: { entity?: WebhookEntity }
  }
}

export type WebhookClaim =
  | { state: 'claimed'; eventRowId: string }
  | { state: 'done' }
  | { state: 'busy' }

export interface RazorpayWebhookStore {
  claimEvent(input: {
    eventId: string
    eventType: string
    orderId: string | null
    paymentId: string | null
    redactedPayload: { amount: number | null; currency: string | null; order_id: string | null; payment_id: string | null }
  }): Promise<WebhookClaim>
  markEvent(eventRowId: string, status: 'processed' | 'ignored' | 'error', diagnostic?: string): Promise<void>
  confirmCaptured(input: { orderId: string; paymentId: string; amountPaise: number; currency: string }): Promise<void>
  markFailed(input: { orderId: string; paymentId: string }): Promise<void>
}

export type WebhookRequest = { rawBody: unknown; signature?: string; eventId?: string }
export type WebhookResponse = { status: number; body: Record<string, unknown> }

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function paymentEntities(payload: WebhookPayload) {
  const payment = payload.payload?.payment?.entity
  const order = payload.payload?.order?.entity
  const orderId = stringValue(payment?.order_id) ?? stringValue(order?.id)
  const paymentId = stringValue(payment?.id)
  const amount = typeof payment?.amount === 'number' && Number.isSafeInteger(payment.amount) && payment.amount >= 0 ? payment.amount : null
  const currency = stringValue(payment?.currency)
  return { payment, order, orderId, paymentId, amount, currency }
}

export function createRazorpayWebhookHandler(secret: string | undefined, store: RazorpayWebhookStore) {
  return async ({ rawBody, signature, eventId }: WebhookRequest): Promise<WebhookResponse> => {
    if (!secret || !Buffer.isBuffer(rawBody) || !signature || !eventId || eventId.length > 255 || /[\r\n\0]/.test(eventId)) {
      return { status: 400, body: { error: 'Invalid webhook signature or event id.' } }
    }
    if (!verifyHmac(rawBody, signature, secret)) return { status: 400, body: { error: 'Invalid webhook signature or event id.' } }

    let payload: WebhookPayload
    try {
      const parsed: unknown = JSON.parse(rawBody.toString('utf8'))
      if (!isRecord(parsed)) return { status: 400, body: { error: 'Invalid webhook JSON.' } }
      payload = parsed as WebhookPayload
    } catch {
      return { status: 400, body: { error: 'Invalid webhook JSON.' } }
    }
    if (typeof payload.event !== 'string' || payload.event.length === 0 || payload.event.length > 120) {
      return { status: 400, body: { error: 'Missing event name.' } }
    }

    const { payment, order, orderId, paymentId, amount, currency } = paymentEntities(payload)
    const redactedPayload = {
      amount,
      currency,
      order_id: orderId,
      payment_id: paymentId,
    }

    let claim: WebhookClaim
    try {
      claim = await store.claimEvent({ eventId, eventType: payload.event, orderId, paymentId, redactedPayload })
    } catch {
      return { status: 503, body: { error: 'Webhook event could not be recorded. Please retry.' } }
    }
    if (claim.state === 'done') return { status: 200, body: { received: true, duplicate: true } }
    if (claim.state === 'busy') return { status: 503, body: { error: 'Webhook event is already being processed. Please retry.' } }

    try {
      const captured = payment?.status === 'captured' && orderId && paymentId && amount !== null && currency === 'INR'
      const paidOrder = payload.event === 'order.paid' && order?.status === 'paid' && order.id === orderId && captured

      if (((payload.event === 'payment.captured' && captured) || paidOrder) && orderId && paymentId && amount !== null && currency) {
        await store.confirmCaptured({ orderId, paymentId, amountPaise: amount, currency })
      } else if (payload.event === 'payment.failed' && payment?.status === 'failed' && orderId && paymentId) {
        await store.markFailed({ orderId, paymentId })
      } else {
        await store.markEvent(claim.eventRowId, 'ignored')
        return { status: 200, body: { received: true, ignored: true } }
      }

      await store.markEvent(claim.eventRowId, 'processed')
      return { status: 200, body: { received: true } }
    } catch {
      const diagnostic = payload.event === 'payment.captured' || payload.event === 'order.paid'
        ? 'capture_confirmation_failed'
        : payload.event === 'payment.failed' ? 'failed_payment_update_failed' : 'webhook_processing_failed'
      try { await store.markEvent(claim.eventRowId, 'error', diagnostic) } catch { /* Keep a retryable processing lease if status persistence also fails. */ }
      return { status: 503, body: { error: 'Webhook payment update failed. Please retry.' } }
    }
  }
}
