export type PaymentOrderClaim = {
  paymentId: string
  attemptNumber: number
  status: string
  providerOrderId: string | null
  amountPaise: number
  currency: string
  leaseAcquired: boolean
  leaseToken: string | null
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
  release(input: { paymentId: string; enrolmentId: string; leaseToken: string }): Promise<void>
}

export interface PaymentOrderProvider {
  createOrder(input: { amount: number; currency: string; receipt: string; notes: Record<string, string>; partial_payment: false }): Promise<{ id: string; amount: number | string; currency: string }>
}

export class PaymentOrderError extends Error {
  constructor(readonly code: 'idempotency_conflict' | 'in_progress' | 'retry' | 'lease_lost' | 'provider_unavailable' | 'provider_mismatch' | 'persistence_failed') {
    super(code)
    this.name = 'PaymentOrderError'
  }
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
    return { id: claim.paymentId, status: claim.status, provider_order_id: claim.providerOrderId, amount_paise: claim.amountPaise, currency: claim.currency }
  }
  if (claim.status !== 'creating') throw new PaymentOrderError('retry')
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
  } catch {
    await store.release({ paymentId: claim.paymentId, enrolmentId: input.enrolmentId, leaseToken: input.leaseToken }).catch(() => undefined)
    throw new PaymentOrderError('provider_unavailable')
  }

  if (Number(providerOrder.amount) !== claim.amountPaise || providerOrder.currency !== claim.currency || claim.currency !== 'INR' || !Number.isSafeInteger(claim.amountPaise) || claim.amountPaise < 1) {
    await store.release({ paymentId: claim.paymentId, enrolmentId: input.enrolmentId, leaseToken: input.leaseToken }).catch(() => undefined)
    throw new PaymentOrderError('provider_mismatch')
  }

  let saved: SavedPaymentOrder | null
  try {
    saved = await store.persist({ paymentId: claim.paymentId, enrolmentId: input.enrolmentId, leaseToken: input.leaseToken, providerOrderId: providerOrder.id })
  } catch {
    throw new PaymentOrderError('persistence_failed')
  }
  if (!saved) throw new PaymentOrderError('lease_lost')
  return saved
}
