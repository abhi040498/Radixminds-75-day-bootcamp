import { getDatabase } from './supabase.js'
import { PaymentOrderError, type PaymentOrderClaim, type PaymentOrderStore, type SavedPaymentOrder } from './paymentOrderCoordinator.js'
import { isPaymentIdempotencyConflict } from './paymentClaimError.js'

type ClaimRow = {
  payment_id: string
  attempt_number: number
  status: string
  provider_order_id: string | null
  provider_payment_id: string | null
  amount_paise: number | string
  currency: string
  lease_acquired: boolean
  lease_token: string | null
  retry_allowed: boolean
}

function first<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : data as T | null
}

export const paymentOrderStore: PaymentOrderStore = {
  async claim(input): Promise<PaymentOrderClaim> {
    const { data, error } = await getDatabase().rpc('claim_payment_attempt_v3', {
      p_enrolment_id: input.enrolmentId,
      p_idempotency_key: input.idempotencyKey,
      p_lease_token: input.leaseToken,
      p_lease_seconds: 120,
    })
    if (error) {
      if (isPaymentIdempotencyConflict(error)) throw new PaymentOrderError('idempotency_conflict')
      if (isPaymentOrderReconciliationRequired(error)) throw new PaymentOrderError('reconciliation_required')
      throw error
    }
    const row = first(data as ClaimRow | ClaimRow[] | null)
    if (!row) throw new Error('payment_claim_empty')
    return {
      paymentId: row.payment_id,
      attemptNumber: row.attempt_number,
      status: row.status,
      providerOrderId: row.provider_order_id,
      providerPaymentId: row.provider_payment_id,
      amountPaise: Number(row.amount_paise),
      currency: row.currency,
      leaseAcquired: row.lease_acquired,
      leaseToken: row.lease_token,
      retryAllowed: row.retry_allowed,
    }
  },

  async persist(input): Promise<SavedPaymentOrder | null> {
    const { data, error } = await getDatabase().rpc('persist_payment_order_v3', {
      p_payment_id: input.paymentId,
      p_enrolment_id: input.enrolmentId,
      p_lease_token: input.leaseToken,
      p_provider_order_id: input.providerOrderId,
    })
    if (error) throw error
    return first(data as SavedPaymentOrder | SavedPaymentOrder[] | null)
  },

  async release(input): Promise<boolean> {
    const { data, error } = await getDatabase().rpc('release_payment_order_lease_v3', {
      p_payment_id: input.paymentId,
      p_enrolment_id: input.enrolmentId,
      p_lease_token: input.leaseToken,
      p_outcome: input.outcome,
      p_provider_order_id: input.providerOrderId ?? null,
    })
    if (error) throw error
    return data === true
  },
}

function isPaymentOrderReconciliationRequired(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('message' in error)) return false
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' && message.includes('PAYMENT_ORDER_RECONCILIATION_REQUIRED')
}
