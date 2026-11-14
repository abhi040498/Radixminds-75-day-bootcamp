import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isRefundRequestWithinWindow, normalizeRefundProviderStatus, refundRequestCutoff, validateApprovedRefundAmount } from '../src/refunds.js'

describe('refund request window uses Kolkata calendar days', () => {
  const captured = '2026-11-10T18:45:00.000Z' // 11 Nov 00:15 IST: calendar day 1
  const cutoff = refundRequestCutoff(captured)
  it('accepts a request on payment day', () => assert.equal(isRefundRequestWithinWindow(captured, '2026-11-10T19:00:00.000Z'), true))
  it('accepts a request late on calendar day seven', () => assert.equal(isRefundRequestWithinWindow(captured, '2026-11-17T18:29:59.999Z'), true))
  it('closes at midnight after calendar day seven, not after 168 hours', () => {
    assert.equal(cutoff.toISOString(), '2026-11-17T18:30:00.000Z')
    assert.equal(isRefundRequestWithinWindow(captured, cutoff), false)
    assert.equal(isRefundRequestWithinWindow(captured, '2026-11-17T18:30:00.001Z'), false)
  })
  it('rejects invalid timestamps', () => assert.equal(isRefundRequestWithinWindow('not-a-date', '2026-11-11T00:00:00Z'), false))
})

describe('admin refund amount validation', () => {
  it('accepts a positive amount at or below captured value', () => {
    assert.equal(validateApprovedRefundAmount(1, 10000), true)
    assert.equal(validateApprovedRefundAmount(10000, 10000), true)
  })
  it('rejects zero, over-capture and unsafe integer amounts', () => {
    assert.equal(validateApprovedRefundAmount(0, 10000), false)
    assert.equal(validateApprovedRefundAmount(10001, 10000), false)
    assert.equal(validateApprovedRefundAmount(Number.MAX_SAFE_INTEGER + 1, 10000), false)
  })
})

describe('Razorpay refund status normalization', () => {
  it('accepts supported provider statuses and rejects unknown values', () => {
    assert.equal(normalizeRefundProviderStatus('processed'), 'processed')
    assert.equal(normalizeRefundProviderStatus('pending'), 'pending')
    assert.equal(normalizeRefundProviderStatus('failed'), 'failed')
    assert.throws(() => normalizeRefundProviderStatus('created'), /UNSUPPORTED_REFUND_PROVIDER_STATUS/)
  })
})
