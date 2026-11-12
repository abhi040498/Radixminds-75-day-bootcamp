export type PaymentOutcome = 'confirmed' | 'pending' | 'failed' | 'needs_review'
export type CheckoutEvent = 'handler' | 'payment.failed' | 'dismissed'

export type PaymentAttemptSnapshot = { reference: string | null; status: string; retryableOrderFailure?: boolean }
export type CheckoutStatusResult = { status: PaymentOutcome; payment?: PaymentAttemptSnapshot | null }

/**
 * Checkout callbacks are hints only. A handler result is accepted only after
 * the server verifies it; failures and dismissals are reconciled from the
 * authenticated enrolment status endpoint.
 */
export async function resolveCheckoutOutcome(
  event: CheckoutEvent,
  verify: () => Promise<CheckoutStatusResult>,
  refreshStatus: () => Promise<CheckoutStatusResult>,
): Promise<CheckoutStatusResult> {
  if (event === 'handler') {
    const verification = await verify()
    if (verification.status === 'confirmed' || verification.status === 'failed' || verification.status === 'needs_review') {
      return verification
    }
  }
  return refreshStatus()
}

export function canStartPayment(status: PaymentOutcome, payment: PaymentAttemptSnapshot | null | undefined) {
  if (payment?.reference) return false
  return payment?.retryableOrderFailure === true
    || (status === 'pending' && (!payment || payment.status === 'created' && payment.reference === null))
}
