import assert from 'node:assert/strict'
import test from 'node:test'
import { canStartPayment, resolveCheckoutOutcome } from '../../src/lib/paymentCheckoutRecovery.js'

test('verified captured payment resolves to confirmed without treating pending as success', async () => {
  let statusRefreshes = 0
  const outcome = await resolveCheckoutOutcome('handler', async () => ({ status: 'confirmed' }), async () => {
    statusRefreshes++
    return { status: 'pending' }
  })
  assert.equal(outcome, 'confirmed')
  assert.equal(statusRefreshes, 0)
  assert.equal(canStartPayment(outcome, true), false)
})

test('server-verified failed payment remains unconfirmed and enables a safe retry', async () => {
  const outcome = await resolveCheckoutOutcome('handler', async () => ({ status: 'failed' }), async () => ({ status: 'pending' }))
  assert.equal(outcome, 'failed')
  assert.equal(canStartPayment(outcome, true), true)
})

test('pending handler verification refreshes server status and never enables a competing attempt', async () => {
  let statusRefreshes = 0
  const outcome = await resolveCheckoutOutcome('handler', async () => ({ status: 'pending' }), async () => {
    statusRefreshes++
    return { status: 'pending' }
  })
  assert.equal(statusRefreshes, 1)
  assert.equal(outcome, 'pending')
  assert.equal(canStartPayment(outcome, true), false)
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
  assert.equal(outcome, 'failed')
  assert.equal(canStartPayment(outcome, true), true)
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
  assert.equal(outcome, 'pending')
  assert.equal(canStartPayment(outcome, true), false)
})

test('refresh permits retry only for a server-failed payment or an enrolment with no payment attempt', () => {
  assert.equal(canStartPayment('failed', true), true)
  assert.equal(canStartPayment('pending', false), true)
  assert.equal(canStartPayment('pending', true), false)
  assert.equal(canStartPayment('needs_review', true), false)
  assert.equal(canStartPayment('confirmed', true), false)
})
