import test from 'node:test'
import assert from 'node:assert/strict'
import { policyAcknowledgementSchema } from '../src/policyAcknowledgement.js'
import { policyVersions } from '../src/policyVersions.js'

const validAcknowledgement = {
  termsAccepted: true,
  privacyConsent: true,
  refundPolicyAccepted: true,
  communicationConsent: true,
  policyVersions,
}

test('accepts all current policy acknowledgements and versions', () => {
  assert.equal(policyAcknowledgementSchema.safeParse(validAcknowledgement).success, true)
})

test('rejects a missing Terms acknowledgement', () => {
  const incomplete: Record<string, unknown> = { ...validAcknowledgement }
  delete incomplete.termsAccepted
  assert.equal(policyAcknowledgementSchema.safeParse(incomplete).success, false)
})

test('rejects a missing Privacy acknowledgement', () => {
  const incomplete: Record<string, unknown> = { ...validAcknowledgement }
  delete incomplete.privacyConsent
  assert.equal(policyAcknowledgementSchema.safeParse(incomplete).success, false)
})

test('rejects a missing Refund acknowledgement', () => {
  const incomplete: Record<string, unknown> = { ...validAcknowledgement }
  delete incomplete.refundPolicyAccepted
  assert.equal(policyAcknowledgementSchema.safeParse(incomplete).success, false)
})

test('rejects stale or client-invented policy versions', () => {
  const payload = { ...validAcknowledgement, policyVersions: { ...policyVersions, refund: 'v0' } }
  assert.equal(policyAcknowledgementSchema.safeParse(payload).success, false)
})
