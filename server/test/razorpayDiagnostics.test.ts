import assert from 'node:assert/strict'
import test from 'node:test'
import { maskRazorpayKeyId, razorpayDiagnostic } from '../src/razorpayDiagnostics.js'

test('masked key diagnostics retain mode and a short suffix without returning the key', () => {
  const rawKey = 'rzp_test_synthetic_key_id_1234'
  const masked = maskRazorpayKeyId(rawKey)
  assert.equal(masked, 'rzp_test_…1234')
  assert.equal(masked.includes(rawKey), false)
})

test('Razorpay 401 diagnostics preserve only safe status, allowlisted code and normalized description', () => {
  const diagnostic = razorpayDiagnostic({
    statusCode: 401,
    error: {
      code: 'BAD_REQUEST_ERROR',
      description: 'Authentication failed',
      metadata: { key_secret: 'SECRET_CANARY', customer_email: 'student@example.invalid' },
    },
    message: 'SECRET_CANARY student@example.invalid',
  })
  assert.deepEqual(diagnostic, {
    httpStatus: 401,
    errorCode: 'BAD_REQUEST_ERROR',
    description: 'authentication_failed',
  })
  assert.equal(JSON.stringify(diagnostic).includes('SECRET_CANARY'), false)
  assert.equal(JSON.stringify(diagnostic).includes('student@example.invalid'), false)
})

test('unrecognized provider descriptions and error codes are not copied into logs', () => {
  const diagnostic = razorpayDiagnostic({
    statusCode: 401,
    error: { code: 'UNSAFE_CANARY', description: 'SECRET_CANARY and student@example.invalid' },
  })
  assert.deepEqual(diagnostic, {
    httpStatus: 401,
    errorCode: 'UNKNOWN_PROVIDER_ERROR',
    description: 'unrecognized_provider_error',
  })
})
