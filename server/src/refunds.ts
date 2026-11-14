export const REFUND_TIME_ZONE = 'Asia/Kolkata'

function localDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REFUND_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value)
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

/**
 * The payment's IST calendar date is day 1. The request window closes at
 * 00:00 IST after the seventh calendar date, and is open strictly before
 * that instant. This is a calendar-date rule, not 168 elapsed hours.
 */
export function refundRequestCutoff(paymentCapturedAt: Date | string) {
  const captured = paymentCapturedAt instanceof Date ? paymentCapturedAt : new Date(paymentCapturedAt)
  if (!Number.isFinite(captured.getTime())) throw new Error('INVALID_PAYMENT_CAPTURE_TIME')
  const { year, month, day } = localDateParts(captured)
  const localMidnightAfterDaySevenUtc = Date.UTC(year, month - 1, day + 7) - (5 * 60 + 30) * 60_000
  return new Date(localMidnightAfterDaySevenUtc)
}

export function isRefundRequestWithinWindow(paymentCapturedAt: Date | string, requestAt: Date | string) {
  const requested = requestAt instanceof Date ? requestAt : new Date(requestAt)
  if (!Number.isFinite(requested.getTime())) return false
  try { return requested.getTime() < refundRequestCutoff(paymentCapturedAt).getTime() }
  catch { return false }
}

export function validateApprovedRefundAmount(amountPaise: number, capturedAmountPaise: number) {
  return Number.isSafeInteger(amountPaise)
    && Number.isSafeInteger(capturedAmountPaise)
    && amountPaise > 0
    && amountPaise <= capturedAmountPaise
}

export function normalizeRefundProviderStatus(value: unknown): 'processed' | 'pending' | 'failed' {
  if (value === 'processed' || value === 'pending' || value === 'failed') return value
  throw new Error('UNSUPPORTED_REFUND_PROVIDER_STATUS')
}
