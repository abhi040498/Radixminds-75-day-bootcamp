import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { createRazorpayWebhookHandler, type RazorpayWebhookStore, type WebhookClaim } from '../src/razorpayWebhook.js'

const secret = 'test_only_webhook_secret_0123456789'
const orderId = 'order_test_123456'
const paymentId = 'pay_test_123456'
const amountPaise = 249900

type EventRow = { id: string; state: 'processing' | 'processed' | 'ignored' | 'error' }

class FakeStore implements RazorpayWebhookStore {
  readonly events = new Map<string, EventRow>()
  readonly failedPayments = new Set<string>()
  readonly capturedOrders = new Map<string, { paymentId: string; amount: number; currency: string }>()
  captureRpcCalls = 0
  failureNextCapture = false
  failNextClaim = false

  async claimEvent(input: Parameters<RazorpayWebhookStore['claimEvent']>[0]): Promise<WebhookClaim> {
    if (this.failNextClaim) {
      this.failNextClaim = false
      throw new Error('simulated database outage')
    }
    const existing = this.events.get(input.eventId)
    if (existing?.state === 'processed' || existing?.state === 'ignored') return { state: 'done' }
    if (existing?.state === 'processing') return { state: 'busy' }
    const event = existing ?? { id: `evt-row-${this.events.size + 1}`, state: 'processing' as const }
    event.state = 'processing'
    this.events.set(input.eventId, event)
    return { state: 'claimed', eventRowId: event.id }
  }

  async markEvent(eventRowId: string, status: 'processed' | 'ignored' | 'error'): Promise<void> {
    const event = [...this.events.values()].find(row => row.id === eventRowId)
    assert.ok(event)
    event.state = status
  }

  async confirmCaptured(input: { orderId: string; paymentId: string; amountPaise: number; currency: string }): Promise<void> {
    if (this.failureNextCapture) {
      this.failureNextCapture = false
      throw new Error('simulated confirm RPC failure')
    }
    const prior = this.capturedOrders.get(input.orderId)
    if (prior) {
      assert.deepEqual(prior, { paymentId: input.paymentId, amount: input.amountPaise, currency: input.currency })
      return
    }
    this.captureRpcCalls += 1
    this.capturedOrders.set(input.orderId, { paymentId: input.paymentId, amount: input.amountPaise, currency: input.currency })
  }

  async markFailed(input: { orderId: string; paymentId: string }): Promise<void> {
    if (!this.capturedOrders.has(input.orderId)) this.failedPayments.add(input.paymentId)
  }
}

function signedRequest(event: string, eventId: string, payload: unknown) {
  const rawBody = Buffer.from(JSON.stringify({ event, payload }))
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex')
  return { rawBody, signature, eventId }
}

function capturedPayment() {
  return { payment: { entity: { id: paymentId, order_id: orderId, status: 'captured', amount: amountPaise, currency: 'INR' } } }
}

test('accepts a valid HMAC over the exact raw request bytes', async () => {
  const store = new FakeStore()
  const handle = createRazorpayWebhookHandler(secret, store)
  const request = signedRequest('payment.captured', 'evt-valid', capturedPayment())
  const modifiedBytes = Buffer.from(`${request.rawBody.toString('utf8')} `)
  assert.equal((await handle({ ...request, rawBody: modifiedBytes })).status, 400)
  assert.equal((await handle(request)).status, 200)
  assert.equal(store.captureRpcCalls, 1)
})

test('rejects invalid and missing signatures before database work', async () => {
  const store = new FakeStore()
  const handle = createRazorpayWebhookHandler(secret, store)
  const request = signedRequest('payment.captured', 'evt-invalid', capturedPayment())
  assert.equal((await handle({ ...request, signature: '0'.repeat(64) })).status, 400)
  assert.equal((await handle({ ...request, signature: undefined })).status, 400)
  assert.equal(store.events.size, 0)
})

test('acknowledges a processed event ID without applying it twice', async () => {
  const store = new FakeStore()
  const handle = createRazorpayWebhookHandler(secret, store)
  const request = signedRequest('payment.captured', 'evt-duplicate', capturedPayment())
  assert.equal((await handle(request)).status, 200)
  const duplicate = await handle(request)
  assert.equal(duplicate.status, 200)
  assert.equal(duplicate.body.duplicate, true)
  assert.equal(store.captureRpcCalls, 1)
})

test('processes payment.captured and order.paid idempotently', async () => {
  const store = new FakeStore()
  const handle = createRazorpayWebhookHandler(secret, store)
  const captured = await handle(signedRequest('payment.captured', 'evt-captured', capturedPayment()))
  assert.equal(captured.status, 200)
  const orderPaid = await handle(signedRequest('order.paid', 'evt-order-paid', {
    ...capturedPayment(),
    order: { entity: { id: orderId, status: 'paid' } },
  }))
  assert.equal(orderPaid.status, 200)
  assert.equal(store.captureRpcCalls, 1)
})

test('processes payment.failed without downgrading a captured payment', async () => {
  const store = new FakeStore()
  const handle = createRazorpayWebhookHandler(secret, store)
  const failedPayload = { payment: { entity: { id: paymentId, order_id: orderId, status: 'failed' } } }
  assert.equal((await handle(signedRequest('payment.failed', 'evt-failed', failedPayload))).status, 200)
  assert.equal(store.failedPayments.has(paymentId), true)

  const capturedStore = new FakeStore()
  const capturedHandle = createRazorpayWebhookHandler(secret, capturedStore)
  await capturedHandle(signedRequest('payment.captured', 'evt-success-first', capturedPayment()))
  await capturedHandle(signedRequest('payment.failed', 'evt-failure-late', failedPayload))
  assert.equal(capturedStore.failedPayments.has(paymentId), false)
  assert.equal(capturedStore.capturedOrders.has(orderId), true)
})

test('returns retryable errors after database failures and safely retries', async () => {
  const store = new FakeStore()
  const handle = createRazorpayWebhookHandler(secret, store)
  const request = signedRequest('payment.captured', 'evt-db-retry', capturedPayment())
  store.failNextClaim = true
  assert.equal((await handle(request)).status, 503)

  store.failureNextCapture = true
  assert.equal((await handle(request)).status, 503)
  assert.equal(store.events.get(request.eventId)?.state, 'error')

  assert.equal((await handle(request)).status, 200)
  assert.equal(store.captureRpcCalls, 1)
  assert.equal(store.events.get(request.eventId)?.state, 'processed')
})

test('does not acknowledge an event already claimed by a concurrent delivery', async () => {
  const store = new FakeStore()
  const eventId = 'evt-busy'
  store.events.set(eventId, { id: 'evt-row-busy', state: 'processing' })
  const handle = createRazorpayWebhookHandler(secret, store)
  assert.equal((await handle(signedRequest('payment.captured', eventId, capturedPayment()))).status, 503)
})
