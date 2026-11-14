export type PaymentAttemptIdentity = {
  providerOrderId: string | null
  providerPaymentId?: string | null
  amountPaise: number
  currency: string
  status: string
}

export type ProviderPaymentIdentity = {
  orderId: string | null
  paymentId: string
  amountPaise: number
  currency: string
}

/** Checks independently retrieved provider data against the saved payment attempt. */
export function paymentIdentityMismatch(attempt: PaymentAttemptIdentity, provider: ProviderPaymentIdentity) {
  if (!attempt.providerOrderId || provider.orderId !== attempt.providerOrderId) return 'order'
  if (!Number.isSafeInteger(attempt.amountPaise) || !Number.isSafeInteger(provider.amountPaise) || provider.amountPaise !== attempt.amountPaise || provider.currency !== attempt.currency) return 'amount'
  if (attempt.status === 'captured' && attempt.providerPaymentId !== provider.paymentId) return 'captured_payment'
  return null
}
