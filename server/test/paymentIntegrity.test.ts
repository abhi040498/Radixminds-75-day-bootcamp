import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { paymentIdentityMismatch, type PaymentAttemptIdentity, type ProviderPaymentIdentity } from '../src/paymentIntegrity.js'
import { verifyHmac } from '../src/security.js'

const attempt: PaymentAttemptIdentity = { providerOrderId: 'order_test_123456', providerPaymentId: null, amountPaise: 249900, currency: 'INR', status: 'created' }
const provider: ProviderPaymentIdentity = { orderId: 'order_test_123456', paymentId: 'pay_test_123456', amountPaise: 249900, currency: 'INR' }

test('accepts provider data only when it matches the saved order, amount and currency', () => {
  assert.equal(paymentIdentityMismatch(attempt, provider), null)
  assert.equal(paymentIdentityMismatch(attempt, { ...provider, amountPaise: 349900 }), 'amount')
  assert.equal(paymentIdentityMismatch(attempt, { ...provider, currency: 'USD' }), 'amount')
  assert.equal(paymentIdentityMismatch(attempt, { ...provider, orderId: 'order_test_other' }), 'order')
})

test('requires the same provider payment identity when a payment attempt is already captured', () => {
  const captured = { ...attempt, status: 'captured', providerPaymentId: provider.paymentId }
  assert.equal(paymentIdentityMismatch(captured, provider), null)
  assert.equal(paymentIdentityMismatch(captured, { ...provider, paymentId: 'pay_test_other' }), 'captured_payment')
})

test('an incomplete order attempt cannot be mistaken for a valid provider order', () => {
  assert.equal(paymentIdentityMismatch({ ...attempt, providerOrderId: null }, provider), 'order')
})

test('verifies checkout HMAC over the trusted saved order ID and provider payment ID', () => {
  const secret = 'unit_test_only_razorpay_key_secret'
  const message = `${attempt.providerOrderId}|${provider.paymentId}`
  const signature = createHmac('sha256', secret).update(message).digest('hex')
  assert.equal(verifyHmac(message, signature, secret), true)
  assert.equal(verifyHmac(`${attempt.providerOrderId}|pay_test_other`, signature, secret), false)
  assert.equal(verifyHmac(message, 'not-a-signature', secret), false)
})
