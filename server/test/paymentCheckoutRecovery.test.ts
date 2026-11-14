import assert from 'node:assert/strict'
import test from 'node:test'
import { canStartPayment, resolveCheckoutOutcome } from '../../src/lib/paymentCheckoutRecovery.js'

test('verified captured payment resolves to confirmed without treating pending as success', async () => {
  let statusRefreshes = 0
  const outcome = await resolveCheckoutOutcome('handler', async () => ({ status: 'confirmed' }), async () => {
    statusRefreshes++
    return { status: 'pending' }
  })
  assert.equal(outcome.status, 'confirmed')
  assert.equal(statusRefreshes, 0)
  assert.equal(canStartPayment(outcome.status, null), false)
})

test('server-verified failed provider payment remains unconfirmed but its provider reference locks retries', async () => {
  const outcome = await resolveCheckoutOutcome('handler', async () => ({ status: 'failed' }), async () => ({ status: 'pending' }))
  assert.equal(outcome.status, 'failed')
  assert.equal(canStartPayment(outcome.status, { status: 'failed', reference: 'pay_test_existing' }), false)
})

test('pending handler verification refreshes server status and never enables a competing attempt', async () => {
  let statusRefreshes = 0
  const outcome = await resolveCheckoutOutcome('handler', async () => ({ status: 'pending' }), async () => {
    statusRefreshes++
    return { status: 'pending' }
  })
  assert.equal(statusRefreshes, 1)
  assert.equal(outcome.status, 'pending')
  assert.equal(canStartPayment(outcome.status, null), true)
})

test('payment.failed event uses backend status and does not create a competing attempt', async () => {
  let statusRefreshes = 0
  let verificationCalls = 0
  const outcome = await resolveCheckoutOutcome('payment.failed', async () => {
    verificationCalls++
    return { status: 'confirmed' }
  }, async () => {
    statusRefreshes++
    return { status: 'failed' }
  })
  assert.equal(verificationCalls, 0, 'a browser failure event is reconciled from the server, not treated as proof')
  assert.equal(statusRefreshes, 1)
  assert.equal(outcome.status, 'failed')
  assert.equal(canStartPayment(outcome.status, null), false)
})

test('dismissed checkout refreshes status and does not replay payment after refresh', async () => {
  let statusRefreshes = 0
  let verificationCalls = 0
  const outcome = await resolveCheckoutOutcome('dismissed', async () => {
    verificationCalls++
    return { status: 'confirmed' }
  }, async () => {
    statusRefreshes++
    return { status: 'pending' }
  })
  assert.equal(verificationCalls, 0)
  assert.equal(statusRefreshes, 1)
  assert.equal(outcome.status, 'pending')
  assert.equal(canStartPayment(outcome.status, null), true)
})

test('refresh permits retry only with no payment attempt, a reusable created order or a server-certified order rejection', () => {
  assert.equal(canStartPayment('failed', null), false)
  assert.equal(canStartPayment('failed', { status: 'failed', reference: 'pay_test' }), false)
  assert.equal(canStartPayment('pending', null), true)
  assert.equal(canStartPayment('pending', { status: 'authorized', reference: 'pay_test' }), false)
  assert.equal(canStartPayment('needs_review', null), false)
  assert.equal(canStartPayment('confirmed', null), false)
})

test('a definitively rejected order can be retried only when the server marks that exact order failure safe', () => {
  assert.equal(canStartPayment('pending', { status: 'order_failed', reference: null, retryableOrderFailure: true }), true)
  assert.equal(canStartPayment('pending', { status: 'order_failed', reference: null, retryableOrderFailure: false }), false)
})

test('an ambiguous order-creation result remains locked after refresh', () => {
  assert.equal(canStartPayment('pending', { status: 'order_failed', reference: null, retryableOrderFailure: false }), false)
  assert.equal(canStartPayment('pending', { status: 'order_creation_unresolved', reference: null }), false)
})

test('created order with no provider payment id remains reusable after checkout dismissal', async () => {
  const existingOrderSnapshot = { status: 'created', reference: null }
  const result = await resolveCheckoutOutcome(
    'dismissed',
    async () => ({ status: 'pending' }),
    async () => ({ status: 'pending', payment: existingOrderSnapshot }),
  )

  assert.equal(result.status, 'pending')
  assert.deepEqual(result.payment, existingOrderSnapshot)
  assert.equal(canStartPayment(result.status, result.payment), true,
    'the retry must reopen Checkout using the existing server-side order and same idempotency key')
})

test('refresh recovery keeps an existing pending payment available for explicit retry', async () => {
  const result = await resolveCheckoutOutcome(
    'dismissed',
    async () => ({ status: 'pending' }),
    async () => ({ status: 'pending', payment: { status: 'created', reference: null } }),
  )
  assert.equal(result.status, 'pending')
  assert.equal(canStartPayment(result.status, result.payment), true)
})

test('an unresolved provider payment remains locked after reconciliation', async () => {
  const result = await resolveCheckoutOutcome(
    'payment.failed',
    async () => ({ status: 'pending' }),
    async () => ({ status: 'pending', payment: { status: 'authorized', reference: 'pay_test_unresolved' } }),
  )

  assert.equal(canStartPayment(result.status, result.payment), false,
    'a provider payment identity must be reconciled before another checkout can start')
})
