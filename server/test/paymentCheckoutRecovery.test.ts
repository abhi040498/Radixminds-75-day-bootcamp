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

test('server-verified failed payment remains unconfirmed and enables a safe retry', async () => {
  const outcome = await resolveCheckoutOutcome('handler', async () => ({ status: 'failed' }), async () => ({ status: 'pending' }))
  assert.equal(outcome.status, 'failed')
  assert.equal(canStartPayment(outcome.status, null), true)
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

test('payment.failed event uses backend status before allowing retry', async () => {
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
  assert.equal(canStartPayment(outcome.status, null), true)
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

test('refresh permits retry only for a server-failed payment or an enrolment with no payment attempt', () => {
  assert.equal(canStartPayment('failed', { status: 'captured', reference: 'pay_test' }), true)
  assert.equal(canStartPayment('pending', null), true)
  assert.equal(canStartPayment('pending', { status: 'authorized', reference: 'pay_test' }), false)
  assert.equal(canStartPayment('needs_review', null), false)
  assert.equal(canStartPayment('confirmed', null), false)
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
