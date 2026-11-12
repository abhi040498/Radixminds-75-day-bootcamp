import assert from 'node:assert/strict'
import test from 'node:test'
import { createPaymentOrder, isDefinitiveOrderRejection, PaymentOrderError, type PaymentOrderClaim, type PaymentOrderStore, type SavedPaymentOrder } from '../src/paymentOrderCoordinator.js'

type Attempt = PaymentOrderClaim & { enrolmentId: string; key: string; expiresAt: number; outcome: string }
class FakeOrderStore implements PaymentOrderStore {
  now = 1_000
  attempts: Attempt[] = []
  failPersistence = false
  failRelease = false
  private sequence = 0

  private snapshot(attempt: Attempt, leaseAcquired = attempt.leaseAcquired, retryAllowed = attempt.retryAllowed): PaymentOrderClaim {
    return { ...attempt, leaseAcquired, retryAllowed }
  }

  async claim(input: { enrolmentId: string; idempotencyKey: string; leaseToken: string }): Promise<PaymentOrderClaim> {
    const keyed = this.attempts.find(attempt => attempt.key === input.idempotencyKey)
    if (keyed && keyed.enrolmentId !== input.enrolmentId) throw new PaymentOrderError('idempotency_conflict')
    if (keyed) {
      if (keyed.status === 'creating' && keyed.expiresAt <= this.now) {
        keyed.status = 'order_failed'; keyed.outcome = 'ambiguous'; keyed.retryAllowed = false; keyed.leaseToken = null
        return this.snapshot(keyed, false, false)
      }
      return this.snapshot(keyed, false, keyed.retryAllowed)
    }

    const active = this.attempts.find(attempt => attempt.enrolmentId === input.enrolmentId && attempt.status === 'creating')
    if (active) {
      if (active.expiresAt > this.now) return this.snapshot(active, false, false)
      active.status = 'order_failed'; active.outcome = 'ambiguous'; active.retryAllowed = false; active.leaseToken = null
      return this.snapshot(active, false, false)
    }

    const protectedPayment = this.attempts.find(attempt => attempt.enrolmentId === input.enrolmentId
      && (Boolean(attempt.providerPaymentId) || ['captured', 'failed', 'cancelled', 'needs_review'].includes(attempt.status)))
    if (protectedPayment) return this.snapshot(protectedPayment, false, false)

    const reusable = this.attempts.find(attempt => attempt.enrolmentId === input.enrolmentId
      && ['created', 'authorized'].includes(attempt.status) && Boolean(attempt.providerOrderId) && !attempt.providerPaymentId)
    if (reusable) return this.snapshot(reusable, false, false)

    const blocker = this.attempts.find(attempt => attempt.enrolmentId === input.enrolmentId && !(
      attempt.status === 'order_failed' && attempt.outcome === 'definitive_failure' && attempt.retryAllowed
      && !attempt.providerOrderId && !attempt.providerPaymentId
    ))
    if (blocker) return this.snapshot(blocker, false, false)

    const attempt: Attempt = {
      paymentId: `payment-${++this.sequence}`, attemptNumber: this.sequence, status: 'creating', providerOrderId: null,
      providerPaymentId: null, amountPaise: 249900, currency: 'INR', leaseAcquired: true, leaseToken: input.leaseToken,
      retryAllowed: false, enrolmentId: input.enrolmentId, key: input.idempotencyKey,
      expiresAt: this.now + 120_000, outcome: 'in_flight',
    }
    this.attempts.push(attempt)
    return this.snapshot(attempt)
  }

  async persist(input: { paymentId: string; enrolmentId: string; leaseToken: string; providerOrderId: string }): Promise<SavedPaymentOrder | null> {
    if (this.failPersistence) throw new Error('db unavailable')
    const attempt = this.attempts.find(row => row.paymentId === input.paymentId)
    if (!attempt || attempt.enrolmentId !== input.enrolmentId || attempt.status !== 'creating' || attempt.providerOrderId || attempt.providerPaymentId || attempt.leaseToken !== input.leaseToken || attempt.expiresAt <= this.now) return null
    attempt.providerOrderId = input.providerOrderId
    attempt.status = 'created'
    attempt.outcome = 'provider_order_persisted'
    attempt.leaseToken = null
    return { id: attempt.paymentId, status: 'created', provider_order_id: input.providerOrderId, amount_paise: attempt.amountPaise, currency: attempt.currency }
  }

  async release(input: { paymentId: string; enrolmentId: string; leaseToken: string; outcome: 'definitive_failure' | 'ambiguous' | 'order_observed'; providerOrderId?: string }): Promise<boolean> {
    if (this.failRelease) return false
    const attempt = this.attempts.find(row => row.paymentId === input.paymentId && row.enrolmentId === input.enrolmentId && row.status === 'creating' && row.leaseToken === input.leaseToken)
    if (!attempt) return false
    attempt.outcome = input.outcome
    attempt.retryAllowed = input.outcome === 'definitive_failure'
    attempt.status = input.outcome === 'order_observed' ? 'needs_review' : 'order_failed'
    attempt.providerOrderId = input.providerOrderId ?? null
    attempt.leaseToken = null
    return true
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const input = (enrolmentId: string, idempotencyKey: string, leaseToken: string) => ({ enrolmentId, enrolmentReference: `RM-${enrolmentId}`, idempotencyKey, leaseToken })
const providerOrder = (id: string, amount: number | string = 249900, currency = 'INR') => ({ id, amount, currency })
const rejection401 = () => ({ statusCode: 401, error: { code: 'AUTHENTICATION_ERROR', description: 'Authentication failed' } })

test('different simultaneous keys cannot create two orders for one enrolment', async () => {
  const store = new FakeOrderStore()
  const pending = deferred<{ id: string; amount: number; currency: string }>()
  const first = createPaymentOrder(store, { createOrder: () => pending.promise }, input('enrol-1', 'key-a', 'lease-a'))
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => providerOrder('order-second-123') }, input('enrol-1', 'key-b', 'lease-b')), (error: unknown) => error instanceof PaymentOrderError && error.code === 'in_progress')
  pending.resolve(providerOrder('order-first-123'))
  assert.equal((await first).provider_order_id, 'order-first-123')
  assert.equal(store.attempts.length, 1)
})

test('same idempotency key simultaneous retry is in progress and only one provider call runs', async () => {
  const store = new FakeOrderStore()
  const pending = deferred<{ id: string; amount: number; currency: string }>()
  const first = createPaymentOrder(store, { createOrder: () => pending.promise }, input('enrol-1', 'same-key', 'lease-a'))
  let calls = 0
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => { calls++; return providerOrder('order-second-123') } }, input('enrol-1', 'same-key', 'lease-b')), (error: unknown) => error instanceof PaymentOrderError && error.code === 'in_progress')
  pending.resolve(providerOrder('order-first-123'))
  await first
  assert.equal(calls, 0)
  assert.equal(store.attempts.length, 1)
})

test('definitive Razorpay authentication rejection permits a fresh-key attempt on the same enrolment', async () => {
  const store = new FakeOrderStore()
  const reference = input('enrol-existing', 'first-key', 'lease-first').enrolmentReference
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => { throw rejection401() } }, input('enrol-existing', 'first-key', 'lease-first')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'retry_safe')
  assert.equal(store.attempts[0]?.status, 'order_failed')
  assert.equal(store.attempts[0]?.retryAllowed, true)
  let retryReference = ''
  const retried = await createPaymentOrder(store, { createOrder: async request => { retryReference = request.notes.enrolment_reference; return providerOrder('order-retry-123') } }, input('enrol-existing', 'second-key', 'lease-second'))
  assert.equal(retried.provider_order_id, 'order-retry-123')
  assert.equal(store.attempts.length, 2, 'both payment attempts remain as audit history')
  assert.equal(store.attempts[1]?.attemptNumber, 2)
  assert.equal(store.attempts[0]?.enrolmentId, store.attempts[1]?.enrolmentId)
  assert.equal(retryReference, reference, 'fresh attempt retains the original enrolment reference')
})

test('same-key retry after a definitive failure remains idempotent and never calls provider again', async () => {
  const store = new FakeOrderStore()
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => { throw rejection401() } }, input('enrol-1', 'same-key', 'lease-a')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'retry_safe')
  let calls = 0
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => { calls++; return providerOrder('order-second-123') } }, input('enrol-1', 'same-key', 'lease-b')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'retry_safe')
  assert.equal(calls, 0)
  assert.equal(store.attempts.length, 1)
})

test('network timeout or 5xx is ambiguous and cannot create a competing attempt', async () => {
  const store = new FakeOrderStore()
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => { throw new Error('socket timeout') } }, input('enrol-1', 'key-a', 'lease-a')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'reconciliation_required')
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => providerOrder('order-second-123') }, input('enrol-1', 'key-b', 'lease-b')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'reconciliation_required')
  assert.equal(store.attempts.length, 1)
  assert.equal(store.attempts[0]?.outcome, 'ambiguous')
  assert.equal(store.attempts[0]?.retryAllowed, false)
})

test('a definitive provider rejection is not advertised as retryable unless the fenced database release succeeds', async () => {
  const store = new FakeOrderStore()
  store.failRelease = true
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => { throw rejection401() } }, input('enrol-1', 'key-a', 'lease-a')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'reconciliation_required')
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => providerOrder('order-second-123') }, input('enrol-1', 'key-b', 'lease-b')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'in_progress')
  assert.equal(store.attempts.length, 1)
})

test('provider 4xx rejection is definitive while timeout, conflict, and 5xx are ambiguous', () => {
  assert.equal(isDefinitiveOrderRejection(rejection401()), true)
  assert.equal(isDefinitiveOrderRejection({ statusCode: 400 }), true)
  assert.equal(isDefinitiveOrderRejection({ statusCode: 403 }), true)
  assert.equal(isDefinitiveOrderRejection({ statusCode: 404 }), true)
  assert.equal(isDefinitiveOrderRejection({ statusCode: 402 }), false)
  assert.equal(isDefinitiveOrderRejection({ statusCode: 408 }), false)
  assert.equal(isDefinitiveOrderRejection({ statusCode: 409 }), false)
  assert.equal(isDefinitiveOrderRejection({ statusCode: 429 }), false)
  assert.equal(isDefinitiveOrderRejection({ statusCode: 500 }), false)
  assert.equal(isDefinitiveOrderRejection(new Error('timeout')), false)
})

test('an expired in-flight attempt is marked ambiguous and is never automatically reclaimed', async () => {
  const store = new FakeOrderStore()
  const oldResponse = deferred<{ id: string; amount: number; currency: string }>()
  const oldRequest = createPaymentOrder(store, { createOrder: () => oldResponse.promise }, input('enrol-1', 'same-key', 'lease-old'))
  store.now += 121_000
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => providerOrder('order-new-123') }, input('enrol-1', 'same-key', 'lease-new')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'reconciliation_required')
  oldResponse.resolve(providerOrder('order-old-123'))
  await assert.rejects(oldRequest, (error: unknown) => error instanceof PaymentOrderError && error.code === 'lease_lost')
  assert.equal(store.attempts.length, 1)
})

test('a different-key request cannot create an attempt while an earlier provider request is unresolved', async () => {
  const store = new FakeOrderStore()
  const oldResponse = deferred<{ id: string; amount: number; currency: string }>()
  const oldRequest = createPaymentOrder(store, { createOrder: () => oldResponse.promise }, input('enrol-1', 'old-key', 'lease-old'))
  store.now += 121_000
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => providerOrder('order-fresh-123') }, input('enrol-1', 'new-key', 'lease-new')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'reconciliation_required')
  oldResponse.resolve(providerOrder('order-orphan-123'))
  await assert.rejects(oldRequest, (error: unknown) => error instanceof PaymentOrderError && error.code === 'lease_lost')
  assert.equal(store.attempts.length, 1)
  assert.equal(store.attempts[0]?.status, 'order_failed')
})

test('an existing provider order is reused without another provider call', async () => {
  const store = new FakeOrderStore()
  const initial = await createPaymentOrder(store, { createOrder: async () => providerOrder('order-existing-123') }, input('enrol-1', 'key-a', 'lease-a'))
  let calls = 0
  const reused = await createPaymentOrder(store, { createOrder: async () => { calls++; return providerOrder('order-second-123') } }, input('enrol-1', 'key-b', 'lease-b'))
  assert.equal(reused.id, initial.id)
  assert.equal(reused.provider_order_id, 'order-existing-123')
  assert.equal(calls, 0)
  assert.equal(store.attempts.length, 1)
})

test('an existing provider payment ID locks all competing retries', async () => {
  const store = new FakeOrderStore()
  const initial = await createPaymentOrder(store, { createOrder: async () => providerOrder('order-existing-123') }, input('enrol-1', 'key-a', 'lease-a'))
  const row = store.attempts.find(attempt => attempt.paymentId === initial.id)!
  row.status = 'authorized'
  row.providerPaymentId = 'pay_existing_123'
  let calls = 0
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => { calls++; return providerOrder('order-second-123') } }, input('enrol-1', 'key-b', 'lease-b')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'payment_protected')
  assert.equal(calls, 0)
  assert.equal(store.attempts.length, 1)
})

test('a later provider payment ID blocks reuse of an older otherwise reusable order', async () => {
  const store = new FakeOrderStore()
  const initial = await createPaymentOrder(store, { createOrder: async () => providerOrder('order-old-12345') }, input('enrol-1', 'key-a', 'lease-a'))
  const oldOrder = store.attempts.find(attempt => attempt.paymentId === initial.id)!
  const newerPayment = { ...oldOrder, paymentId: 'payment-2', attemptNumber: 2, key: 'key-used-payment', status: 'failed', providerPaymentId: 'pay_existing_123', providerOrderId: 'order-other-12345', leaseToken: null, retryAllowed: false }
  store.attempts.push(newerPayment)
  let calls = 0
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => { calls++; return providerOrder('order-competing-123') } }, input('enrol-1', 'key-b', 'lease-b')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'payment_protected')
  assert.equal(calls, 0)
  assert.equal(store.attempts.length, 2)
})

test('captured payment cannot be downgraded or competed with', async () => {
  const store = new FakeOrderStore()
  const initial = await createPaymentOrder(store, { createOrder: async () => providerOrder('order-captured-123') }, input('enrol-1', 'key-a', 'lease-a'))
  const row = store.attempts.find(attempt => attempt.paymentId === initial.id)!
  row.status = 'captured'
  row.providerPaymentId = 'pay_captured_123'
  let calls = 0
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => { calls++; return providerOrder('order-second-123') } }, input('enrol-1', 'key-b', 'lease-b')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'payment_protected')
  assert.equal(row.status, 'captured')
  assert.equal(calls, 0)
})

test('concurrent fresh-key retries after a definitive rejection create one attempt and one provider order', async () => {
  const store = new FakeOrderStore()
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => { throw rejection401() } }, input('enrol-1', 'failed-key', 'lease-failed')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'retry_safe')
  const pending = deferred<{ id: string; amount: number; currency: string }>()
  let calls = 0
  const first = createPaymentOrder(store, { createOrder: () => { calls++; return pending.promise } }, input('enrol-1', 'retry-key-a', 'lease-a'))
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => { calls++; return providerOrder('order-competing-123') } }, input('enrol-1', 'retry-key-b', 'lease-b')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'in_progress')
  pending.resolve(providerOrder('order-retry-123'))
  assert.equal((await first).provider_order_id, 'order-retry-123')
  assert.equal(calls, 1)
  assert.equal(store.attempts.length, 2)
})

test('cross-enrolment reuse of an idempotency key is a controlled conflict', async () => {
  const store = new FakeOrderStore()
  await store.claim({ enrolmentId: 'enrol-a', idempotencyKey: 'same-key', leaseToken: 'lease-a' })
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => providerOrder('order-123456') }, input('enrol-b', 'same-key', 'lease-b')), (error: unknown) => error instanceof PaymentOrderError && error.code === 'idempotency_conflict')
})

test('provider order created but persistence failure records it for reconciliation and never returns it', async () => {
  const store = new FakeOrderStore()
  store.failPersistence = true
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => providerOrder('order-orphan-123') }, input('enrol-1', 'key-a', 'lease-a')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'persistence_failed')
  assert.equal(store.attempts[0]?.providerOrderId, 'order-orphan-123')
  assert.equal(store.attempts[0]?.status, 'needs_review')
  assert.equal(store.attempts[0]?.retryAllowed, false)
})

test('provider order amount or currency mismatch is recorded for review and is never retried', async () => {
  const store = new FakeOrderStore()
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => providerOrder('order-bad-123', 349900, 'USD') }, input('enrol-1', 'key-a', 'lease-a')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'provider_mismatch')
  assert.equal(store.attempts[0]?.providerOrderId, 'order-bad-123')
  assert.equal(store.attempts[0]?.status, 'needs_review')
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => providerOrder('order-second-123') }, input('enrol-1', 'key-b', 'lease-b')),
    (error: unknown) => error instanceof PaymentOrderError && error.code === 'payment_protected')
  assert.equal(store.attempts.length, 1)
})
