import assert from 'node:assert/strict'
import test from 'node:test'
import { isPaymentIdempotencyConflict } from '../src/paymentClaimError.js'

test('the explicit idempotency conflict marker is handled as a controlled conflict', () => {
  assert.equal(isPaymentIdempotencyConflict({ message: 'IDEMPOTENCY_KEY_CONFLICT' }), true)
})

test('an unrelated PostgreSQL unique violation is not classified as an idempotency conflict', () => {
  assert.equal(isPaymentIdempotencyConflict({
    code: '23505',
    message: 'duplicate key value violates unique constraint "payments_provider_order_id_key"',
  }), false)
})

test('other database failures are not swallowed as idempotency conflicts', () => {
  assert.equal(isPaymentIdempotencyConflict({ code: '23503', message: 'foreign key violation' }), false)
})
