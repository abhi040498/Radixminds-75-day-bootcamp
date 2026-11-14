const safeCodes = new Set([
  'BAD_REQUEST_ERROR',
  'AUTHENTICATION_ERROR',
  'GATEWAY_ERROR',
  'SERVER_ERROR',
  'RATE_LIMIT_ERROR',
])

export function maskRazorpayKeyId(value: string | undefined) {
  if (!value) return 'unavailable'
  const modePrefix = value.startsWith('rzp_test_') ? 'rzp_test_' : value.startsWith('rzp_live_') ? 'rzp_live_' : ''
  const suffix = value.slice(-4)
  return modePrefix ? `${modePrefix}…${suffix}` : `…${suffix}`
}

export function razorpayDiagnostic(error: unknown) {
  const candidate = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const providerError = candidate.error && typeof candidate.error === 'object'
    ? candidate.error as Record<string, unknown>
    : {}
  const rawCode = typeof providerError.code === 'string' ? providerError.code : ''
  const rawDescription = typeof providerError.description === 'string' ? providerError.description.trim().toLowerCase() : ''

  let description = 'unrecognized_provider_error'
  if (/^authentication failed\.?$/.test(rawDescription)) description = 'authentication_failed'
  else if (/^(invalid api key|invalid key_id or key_secret)\.?$/.test(rawDescription)) description = 'invalid_api_credentials'
  else if (/^(bad request|invalid request)\.?$/.test(rawDescription)) description = 'invalid_provider_request'
  else if (/^(too many requests|rate limit exceeded)\.?$/.test(rawDescription)) description = 'rate_limited'
  else if (/^(internal server error|something went wrong)\.?$/.test(rawDescription)) description = 'provider_internal_error'

  return {
    httpStatus: Number.isInteger(candidate.statusCode) && Number(candidate.statusCode) >= 100 && Number(candidate.statusCode) <= 599
      ? Number(candidate.statusCode)
      : null,
    errorCode: safeCodes.has(rawCode) ? rawCode : 'UNKNOWN_PROVIDER_ERROR',
    description,
  }
}
