export type PaymentOutcome = 'confirmed' | 'pending' | 'failed' | 'needs_review'
export type CheckoutEvent = 'handler' | 'payment.failed' | 'dismissed'

type StatusResult = { status: PaymentOutcome }

/**
 * Checkout callbacks are hints only. A handler result is accepted only after
 * the server verifies it; failures and dismissals are reconciled from the
 * authenticated enrolment status endpoint.
 */
export async function resolveCheckoutOutcome(
  event: CheckoutEvent,
  verify: () => Promise<StatusResult>,
  refreshStatus: () => Promise<StatusResult>,
): Promise<PaymentOutcome> {
  if (event === 'handler') {
    const verification = await verify()
    if (verification.status === 'confirmed' || verification.status === 'failed' || verification.status === 'needs_review') {
      return verification.status
    }
  }
  return (await refreshStatus()).status
}

export function canStartPayment(status: PaymentOutcome, hasPaymentAttempt: boolean) {
  return status === 'failed' || (status === 'pending' && !hasPaymentAttempt)
}
