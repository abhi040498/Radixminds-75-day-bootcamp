import assert from 'node:assert/strict'
import test from 'node:test'
import { createPaymentOrder, PaymentOrderError, type PaymentOrderClaim, type PaymentOrderStore, type SavedPaymentOrder } from '../src/paymentOrderCoordinator.js'

type Attempt = PaymentOrderClaim & { enrolmentId: string; key: string; expiresAt: number }
class FakeOrderStore implements PaymentOrderStore {
  now = 1_000
  attempts: Attempt[] = []
  failPersistence = false
  private sequence = 0

  async claim(input: { enrolmentId: string; idempotencyKey: string; leaseToken: string }): Promise<PaymentOrderClaim> {
    const keyAttempt = this.attempts.find(attempt => attempt.key === input.idempotencyKey)
    if (keyAttempt && keyAttempt.enrolmentId !== input.enrolmentId) throw new PaymentOrderError('idempotency_conflict')
    if (keyAttempt) {
      if (keyAttempt.status === 'creating' && !keyAttempt.providerOrderId && keyAttempt.expiresAt <= this.now) {
        keyAttempt.leaseToken = input.leaseToken
        keyAttempt.expiresAt = this.now + 120_000
        keyAttempt.leaseAcquired = true
      } else keyAttempt.leaseAcquired = false
      return { ...keyAttempt }
    }
    const active = this.attempts.find(attempt => attempt.enrolmentId === input.enrolmentId && attempt.status === 'creating' && !attempt.providerOrderId)
    if (active && active.expiresAt > this.now) return { ...active, leaseAcquired: false }
    if (active) active.status = 'order_failed'
    const attempt: Attempt = {
      paymentId: `payment-${++this.sequence}`, attemptNumber: this.sequence, status: 'creating', providerOrderId: null,
      amountPaise: 249900, currency: 'INR', leaseAcquired: true, leaseToken: input.leaseToken,
      enrolmentId: input.enrolmentId, key: input.idempotencyKey, expiresAt: this.now + 120_000,
    }
    this.attempts.push(attempt)
    return { ...attempt }
  }

  async persist(input: { paymentId: string; enrolmentId: string; leaseToken: string; providerOrderId: string }): Promise<SavedPaymentOrder | null> {
    if (this.failPersistence) throw new Error('db unavailable')
    const attempt = this.attempts.find(row => row.paymentId === input.paymentId)
    if (!attempt || attempt.enrolmentId !== input.enrolmentId || attempt.status !== 'creating' || attempt.providerOrderId || attempt.leaseToken !== input.leaseToken || attempt.expiresAt <= this.now) return null
    attempt.providerOrderId = input.providerOrderId
    attempt.status = 'created'
    attempt.leaseToken = null
    return { id: attempt.paymentId, status: 'created', provider_order_id: input.providerOrderId, amount_paise: attempt.amountPaise, currency: attempt.currency }
  }

  async release(input: { paymentId: string; enrolmentId: string; leaseToken: string }): Promise<void> {
    const attempt = this.attempts.find(row => row.paymentId === input.paymentId && row.enrolmentId === input.enrolmentId && row.status === 'creating' && row.leaseToken === input.leaseToken)
    if (attempt) attempt.status = 'order_failed'
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

test('a new request acquires an expired lease and delayed old response cannot persist', async () => {
  const store = new FakeOrderStore()
  const oldResponse = deferred<{ id: string; amount: number; currency: string }>()
  const oldRequest = createPaymentOrder(store, { createOrder: () => oldResponse.promise }, input('enrol-1', 'same-key', 'lease-old'))
  store.now += 121_000
  const newRequest = createPaymentOrder(store, { createOrder: async () => providerOrder('order-new-123') }, input('enrol-1', 'same-key', 'lease-new'))
  assert.equal((await newRequest).provider_order_id, 'order-new-123')
  oldResponse.resolve(providerOrder('order-old-123'))
  await assert.rejects(oldRequest, (error: unknown) => error instanceof PaymentOrderError && error.code === 'lease_lost')
  assert.equal(store.attempts[0]?.providerOrderId, 'order-new-123')
})

test('an expired request cannot persist after a different key acquires a replacement attempt', async () => {
  const store = new FakeOrderStore()
  const oldResponse = deferred<{ id: string; amount: number; currency: string }>()
  const oldRequest = createPaymentOrder(store, { createOrder: () => oldResponse.promise }, input('enrol-1', 'old-key', 'lease-old'))
  store.now += 121_000
  const replacement = await createPaymentOrder(store, { createOrder: async () => providerOrder('order-fresh-123') }, input('enrol-1', 'new-key', 'lease-new'))
  oldResponse.resolve(providerOrder('order-orphan-123'))
  await assert.rejects(oldRequest, (error: unknown) => error instanceof PaymentOrderError && error.code === 'lease_lost')
  assert.equal(replacement.provider_order_id, 'order-fresh-123')
  assert.equal(store.attempts[0]?.status, 'order_failed')
  assert.equal(store.attempts[0]?.providerOrderId, null)
})

test('cross-enrolment reuse of an idempotency key is a controlled conflict', async () => {
  const store = new FakeOrderStore()
  await store.claim({ enrolmentId: 'enrol-a', idempotencyKey: 'same-key', leaseToken: 'lease-a' })
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => providerOrder('order-123456') }, input('enrol-b', 'same-key', 'lease-b')), (error: unknown) => error instanceof PaymentOrderError && error.code === 'idempotency_conflict')
})

test('provider order created but persistence failure never returns the order to the caller', async () => {
  const store = new FakeOrderStore()
  store.failPersistence = true
  let providerCreated: string | undefined
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => { providerCreated = 'order-orphan-123'; return providerOrder(providerCreated) } }, input('enrol-1', 'key-a', 'lease-a')), (error: unknown) => error instanceof PaymentOrderError && error.code === 'persistence_failed')
  assert.equal(providerCreated, 'order-orphan-123')
  assert.equal(store.attempts[0]?.providerOrderId, null)
})

test('provider order amount or currency mismatch is rejected and never persisted', async () => {
  const store = new FakeOrderStore()
  await assert.rejects(() => createPaymentOrder(store, { createOrder: async () => providerOrder('order-bad-123', 349900, 'USD') }, input('enrol-1', 'key-a', 'lease-a')), (error: unknown) => error instanceof PaymentOrderError && error.code === 'provider_mismatch')
  assert.equal(store.attempts[0]?.providerOrderId, null)
  assert.equal(store.attempts[0]?.status, 'order_failed')
})

test('same idempotency key after lease expiry reuses the attempt with a new fence', async () => {
  const store = new FakeOrderStore()
  const initial = await store.claim({ enrolmentId: 'enrol-1', idempotencyKey: 'key-a', leaseToken: 'old' })
  store.now += 121_000
  const renewed = await store.claim({ enrolmentId: 'enrol-1', idempotencyKey: 'key-a', leaseToken: 'new' })
  assert.equal(renewed.paymentId, initial.paymentId)
  assert.equal(renewed.leaseToken, 'new')
  assert.equal(renewed.leaseAcquired, true)
})
