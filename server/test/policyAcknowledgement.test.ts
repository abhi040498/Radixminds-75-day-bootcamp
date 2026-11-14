import test from 'node:test'
import assert from 'node:assert/strict'
import { policyAcknowledgementSchema } from '../src/policyAcknowledgement.js'
import { policyVersions } from '../src/policyVersions.js'

const validAcknowledgement = {
  policyAcknowledged: true,
  policyVersions,
}

test('accepts one current policy acknowledgement with all three versions', () => {
  assert.equal(policyAcknowledgementSchema.safeParse(validAcknowledgement).success, true)
})

test('rejects a missing, false or legacy multi-checkbox acknowledgement', () => {
  assert.equal(policyAcknowledgementSchema.safeParse({ ...validAcknowledgement, policyAcknowledged: false }).success, false)
  const missing: Record<string, unknown> = { ...validAcknowledgement }
  delete missing.policyAcknowledged
  assert.equal(policyAcknowledgementSchema.safeParse(missing).success, false)
  assert.equal(policyAcknowledgementSchema.safeParse({ ...validAcknowledgement, communicationConsent: true }).success, false)
})

test('rejects stale or client-invented policy versions', () => {
  const payload = { ...validAcknowledgement, policyVersions: { ...policyVersions, refund: 'v0' } }
  assert.equal(policyAcknowledgementSchema.safeParse(payload).success, false)
})
