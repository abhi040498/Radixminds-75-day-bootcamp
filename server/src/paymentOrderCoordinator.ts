export type PaymentOrderClaim = {
  paymentId: string
  attemptNumber: number
  status: string
  providerOrderId: string | null
  providerPaymentId: string | null
  amountPaise: number
  currency: string
  leaseAcquired: boolean
  leaseToken: string | null
  retryAllowed: boolean
}

export type SavedPaymentOrder = {
  id: string
  status: string
  provider_order_id: string
  amount_paise: number
  currency: string
}

export interface PaymentOrderStore {
  claim(input: { enrolmentId: string; idempotencyKey: string; leaseToken: string }): Promise<PaymentOrderClaim>
  persist(input: { paymentId: string; enrolmentId: string; leaseToken: string; providerOrderId: string }): Promise<SavedPaymentOrder | null>
  release(input: { paymentId: string; enrolmentId: string; leaseToken: string; outcome: 'definitive_failure' | 'ambiguous' | 'order_observed'; providerOrderId?: string }): Promise<boolean>
}

export interface PaymentOrderProvider {
  createOrder(input: { amount: number; currency: string; receipt: string; notes: Record<string, string>; partial_payment: false }): Promise<{ id: string; amount: number | string; currency: string }>
}

export class PaymentOrderError extends Error {
  constructor(readonly code: 'idempotency_conflict' | 'in_progress' | 'retry' | 'retry_safe' | 'reconciliation_required' | 'payment_protected' | 'lease_lost' | 'provider_unavailable' | 'provider_mismatch' | 'persistence_failed') {
    super(code)
    this.name = 'PaymentOrderError'
  }
}

/** Only explicit provider rejection responses prove that no order was created.
 * Timeouts, transport failures, 5xx, and conflict-like responses remain ambiguous.
 */
export function isDefinitiveOrderRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { statusCode?: unknown; response?: { status?: unknown } }
  const status = Number.isInteger(candidate.statusCode)
    ? Number(candidate.statusCode)
    : Number.isInteger(candidate.response?.status) ? Number(candidate.response?.status) : null
  return status !== null && [400, 401, 403, 404, 405, 413, 415, 422].includes(status)
}

/** Runs the external order call only while this request owns the database lease. */
export async function createPaymentOrder(
  store: PaymentOrderStore,
  provider: PaymentOrderProvider,
  input: { enrolmentId: string; enrolmentReference: string; idempotencyKey: string; leaseToken: string },
): Promise<SavedPaymentOrder> {
  let claim: PaymentOrderClaim
  try {
    claim = await store.claim(input)
  } catch (error) {
    if (error instanceof PaymentOrderError) throw error
    throw new PaymentOrderError('persistence_failed')
  }

  if (claim.providerOrderId && (claim.status === 'created' || claim.status === 'authorized')) {
    if (claim.providerPaymentId) throw new PaymentOrderError('payment_protected')
    return { id: claim.paymentId, status: claim.status, provider_order_id: claim.providerOrderId, amount_paise: claim.amountPaise, currency: claim.currency }
  }
  if (claim.retryAllowed) throw new PaymentOrderError('retry_safe')
  if (claim.providerPaymentId || ['captured', 'failed', 'cancelled', 'needs_review'].includes(claim.status)) throw new PaymentOrderError('payment_protected')
  if (claim.status !== 'creating') throw new PaymentOrderError('reconciliation_required')
  if (!claim.leaseAcquired || claim.leaseToken !== input.leaseToken) throw new PaymentOrderError('in_progress')

  let providerOrder: { id: string; amount: number | string; currency: string }
  try {
    providerOrder = await provider.createOrder({
      amount: claim.amountPaise,
      currency: claim.currency,
      receipt: claim.paymentId,
      notes: { enrolment_reference: input.enrolmentReference, payment_attempt: String(claim.attemptNumber) },
      partial_payment: false,
    })
  } catch (error) {
    const definitive = isDefinitiveOrderRejection(error)
    try {
      const released = await store.release({
        paymentId: claim.paymentId,
        enrolmentId: input.enrolmentId,
        leaseToken: input.leaseToken,
        outcome: definitive ? 'definitive_failure' : 'ambiguous',
      })
      if (!released) throw new Error('payment_order_lease_not_released')
    } catch {
      throw new PaymentOrderError('reconciliation_required')
    }
    throw new PaymentOrderError(definitive ? 'retry_safe' : 'reconciliation_required')
  }

  if (Number(providerOrder.amount) !== claim.amountPaise || providerOrder.currency !== claim.currency || claim.currency !== 'INR' || !Number.isSafeInteger(claim.amountPaise) || claim.amountPaise < 1) {
    await store.release({ paymentId: claim.paymentId, enrolmentId: input.enrolmentId, leaseToken: input.leaseToken, outcome: 'order_observed', providerOrderId: providerOrder.id }).catch(() => false)
    throw new PaymentOrderError('provider_mismatch')
  }

  let saved: SavedPaymentOrder | null
  try {
    saved = await store.persist({ paymentId: claim.paymentId, enrolmentId: input.enrolmentId, leaseToken: input.leaseToken, providerOrderId: providerOrder.id })
  } catch {
    await store.release({ paymentId: claim.paymentId, enrolmentId: input.enrolmentId, leaseToken: input.leaseToken, outcome: 'order_observed', providerOrderId: providerOrder.id }).catch(() => false)
    throw new PaymentOrderError('persistence_failed')
  }
  if (!saved) {
    await store.release({ paymentId: claim.paymentId, enrolmentId: input.enrolmentId, leaseToken: input.leaseToken, outcome: 'order_observed', providerOrderId: providerOrder.id }).catch(() => false)
    throw new PaymentOrderError('lease_lost')
  }
  return saved
}
