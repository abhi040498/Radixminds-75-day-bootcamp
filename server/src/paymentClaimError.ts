/** Only the database's explicit conflict marker is a controlled idempotency conflict. */
export function isPaymentIdempotencyConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('message' in error)) return false
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' && message.includes('IDEMPOTENCY_KEY_CONFLICT')
}
