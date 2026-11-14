import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { createRazorpayWebhookHandler, type RazorpayWebhookStore, type WebhookClaim } from '../src/razorpayWebhook.js'

const secret = 'test_only_webhook_secret_0123456789'
const orderId = 'order_test_123456'
const paymentId = 'pay_test_123456'
const amountPaise = 249900

type EventRow = { id: string; state: 'processing' | 'processed' | 'ignored' | 'error'; token?: string }

class FakeStore implements RazorpayWebhookStore {
  readonly events = new Map<string, EventRow>()
  readonly failedPayments = new Set<string>()
  readonly capturedOrders = new Map<string, { paymentId: string; amount: number; currency: string }>()
  readonly reviewOrders = new Set<string>()
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
    event.token = input.leaseToken
    this.events.set(input.eventId, event)
    return { state: 'claimed', eventRowId: event.id, leaseToken: input.leaseToken }
  }

  async processEvent(input: Parameters<RazorpayWebhookStore['processEvent']>[0]): Promise<void> {
    const event = [...this.events.values()].find(row => row.id === input.eventRowId)
    if (!event || event.state !== 'processing' || event.token !== input.leaseToken) throw new Error('lease_lost')
    if (input.action === 'captured') {
      if (this.failureNextCapture) {
        this.failureNextCapture = false
        throw new Error('simulated confirm RPC failure')
      }
      if (input.orderId !== orderId) throw new Error('order_mismatch')
      if (input.amountPaise !== amountPaise || input.currency !== 'INR') {
        this.reviewOrders.add(input.orderId!)
      } else {
        const prior = this.capturedOrders.get(input.orderId!)
        if (!prior) {
          this.captureRpcCalls += 1
          this.capturedOrders.set(input.orderId!, { paymentId: input.paymentId!, amount: input.amountPaise!, currency: input.currency! })
        } else if (prior.paymentId !== input.paymentId) throw new Error('payment_mismatch')
      }
    } else if (input.action === 'failed') {
      if (!this.capturedOrders.has(input.orderId!)) this.failedPayments.add(input.paymentId!)
    }
    event.state = input.action === 'ignored' ? 'ignored' : 'processed'
    event.token = undefined
  }

  async releaseEvent(input: Parameters<RazorpayWebhookStore['releaseEvent']>[0]): Promise<void> {
    const event = [...this.events.values()].find(row => row.id === input.eventRowId)
    if (!event || event.state !== 'processing' || event.token !== input.leaseToken) throw new Error('lease_lost')
    event.state = 'error'
    event.token = undefined
  }
}

function signedRequest(event: string, eventId: string, payload: unknown) {
  const rawBody = Buffer.from(JSON.stringify({ event, payload }))
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex')
  return { rawBody, signature, eventId }
}

function capturedPayment(capturedPaymentId = paymentId) {
  return { payment: { entity: { id: capturedPaymentId, order_id: orderId, status: 'captured', amount: amountPaise, currency: 'INR' } } }
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

test('routes captured amount and currency mismatches to server-side review instead of confirmation', async () => {
  const store = new FakeStore()
  const handle = createRazorpayWebhookHandler(secret, store)
  const wrongAmount = { payment: { entity: { id: paymentId, order_id: orderId, status: 'captured', amount: amountPaise + 100, currency: 'INR' } } }
  const wrongCurrency = { payment: { entity: { id: paymentId, order_id: orderId, status: 'captured', amount: amountPaise, currency: 'USD' } } }
  assert.equal((await handle(signedRequest('payment.captured', 'evt-wrong-amount', wrongAmount))).status, 200)
  assert.equal((await handle(signedRequest('payment.captured', 'evt-wrong-currency', wrongCurrency))).status, 200)
  assert.equal(store.reviewOrders.has(orderId), true)
  assert.equal(store.capturedOrders.has(orderId), false)
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

test('allows a delayed captured event to resolve an earlier failed notification', async () => {
  const store = new FakeStore()
  const handle = createRazorpayWebhookHandler(secret, store)
  const failedPayload = { payment: { entity: { id: paymentId, order_id: orderId, status: 'failed' } } }
  assert.equal((await handle(signedRequest('payment.failed', 'evt-failed-first', failedPayload))).status, 200)
  assert.equal(store.failedPayments.has(paymentId), true)
  assert.equal((await handle(signedRequest('payment.captured', 'evt-captured-late', capturedPayment()))).status, 200)
  assert.equal(store.capturedOrders.has(orderId), true)
  assert.equal(store.captureRpcCalls, 1)
})

test('allows a successful retry on the same Razorpay order after an earlier payment attempt failed', async () => {
  const store = new FakeStore()
  const handle = createRazorpayWebhookHandler(secret, store)
  const failedPaymentId = 'pay_test_failed_123'
  const successfulPaymentId = 'pay_test_success_123'
  const failedPayload = { payment: { entity: { id: failedPaymentId, order_id: orderId, status: 'failed' } } }
  assert.equal((await handle(signedRequest('payment.failed', 'evt-same-order-failed', failedPayload))).status, 200)
  assert.equal((await handle(signedRequest('payment.captured', 'evt-same-order-captured', capturedPayment(successfulPaymentId)))).status, 200)
  assert.equal(store.capturedOrders.get(orderId)?.paymentId, successfulPaymentId)
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

test('a webhook worker that lost its claim cannot overwrite a newer claim', async () => {
  const store = new FakeStore()
  const first = await store.claimEvent({ eventId: 'evt-fence', eventType: 'payment.captured', orderId, paymentId, redactedPayload: { amount: amountPaise, currency: 'INR', order_id: orderId, payment_id: paymentId }, leaseToken: 'worker-a' })
  assert.equal(first.state, 'claimed')
  // Simulate the database lease expiry/reclaim by advancing ownership to B.
  const row = store.events.get('evt-fence')!
  row.state = 'error'
  const second = await store.claimEvent({ eventId: 'evt-fence', eventType: 'payment.captured', orderId, paymentId, redactedPayload: { amount: amountPaise, currency: 'INR', order_id: orderId, payment_id: paymentId }, leaseToken: 'worker-b' })
  assert.equal(second.state, 'claimed')
  await assert.rejects(() => store.processEvent({ eventRowId: first.state === 'claimed' ? first.eventRowId : '', leaseToken: 'worker-a', action: 'captured', orderId, paymentId, amountPaise, currency: 'INR' }), /lease_lost/)
  await store.processEvent({ eventRowId: second.state === 'claimed' ? second.eventRowId : '', leaseToken: 'worker-b', action: 'captured', orderId, paymentId, amountPaise, currency: 'INR' })
  assert.equal(row.state, 'processed')
  assert.equal(store.captureRpcCalls, 1)
})

test('rejects a captured event linked to a different provider order', async () => {
  const store = new FakeStore()
  const handle = createRazorpayWebhookHandler(secret, store)
  const mismatched = { payment: { entity: { id: paymentId, order_id: 'order_test_other_123', status: 'captured', amount: amountPaise, currency: 'INR' } } }
  assert.equal((await handle(signedRequest('payment.captured', 'evt-order-mismatch', mismatched))).status, 503)
  assert.equal(store.capturedOrders.size, 0)
})
