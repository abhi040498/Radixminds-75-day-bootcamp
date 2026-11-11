import assert from 'node:assert/strict'
import test from 'node:test'
import { ENROLMENT_DRAFT_KEY, loadEnrolmentDraft, loadEnrolmentRecovery, restoreEnrolmentStep, saveEnrolmentDraft, type StorageLike } from '../../src/lib/enrolmentRecovery.js'

function memoryStorage(): StorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => { values.delete(key) } }
}

const makeIds = () => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }

test('refresh restores program step, student-details step and review step without restoring personal data', () => {
  const storage = memoryStorage()
  const makeId = makeIds()
  const first = loadEnrolmentDraft(storage, makeId).draft
  first.step = 0
  first.programCode = 'class-10'
  saveEnrolmentDraft(storage, first)
  assert.equal(restoreEnrolmentStep(loadEnrolmentDraft(storage, makeId).draft), 0)
  first.step = 1
  saveEnrolmentDraft(storage, first)
  assert.equal(restoreEnrolmentStep(loadEnrolmentDraft(storage, makeId).draft), 1)
  first.step = 2
  saveEnrolmentDraft(storage, first)
  const reviewRecovery = loadEnrolmentDraft(storage, makeId).draft
  assert.equal(restoreEnrolmentStep(reviewRecovery), 1, 'review returns to details because personal fields are not stored')
})

test('refresh restores Class 12 pathway and learning mode selections', () => {
  const storage = memoryStorage()
  const draft = loadEnrolmentDraft(storage, makeIds()).draft
  draft.programCode = 'class-12'
  draft.subjectChoice = 'Biology'
  draft.learningMode = 'hybrid'
  saveEnrolmentDraft(storage, draft)
  const restored = loadEnrolmentDraft(storage, makeIds()).draft
  assert.equal(restored.programCode, 'class-12')
  assert.equal(restored.subjectChoice, 'Biology')
  assert.equal(restored.learningMode, 'hybrid')
})

test('storage allowlist excludes personal data, consent, tokens and secrets while preserving idempotency keys', () => {
  const storage = memoryStorage()
  const draft = loadEnrolmentDraft(storage, makeIds()).draft
  saveEnrolmentDraft(storage, { ...draft, fullName: 'Private Student', mobile: '9876543210', email: 'private@example.invalid', statusToken: 'sensitive-token', policyAcknowledged: true })
  const serialized = storage.values.get(ENROLMENT_DRAFT_KEY) ?? ''
  assert.equal(serialized.includes('Private Student'), false)
  assert.equal(serialized.includes('9876543210'), false)
  assert.equal(serialized.includes('private@example.invalid'), false)
  assert.equal(serialized.includes('sensitive-token'), false)
  const restored = loadEnrolmentDraft(storage, makeIds()).draft
  assert.equal(restored.registrationIdempotencyKey, draft.registrationIdempotencyKey)
  assert.equal(restored.paymentIdempotencyKey, draft.paymentIdempotencyKey)
})

test('registration retry after an API timeout keeps the same idempotency key', () => {
  const storage = memoryStorage()
  const first = loadEnrolmentDraft(storage, makeIds()).draft
  saveEnrolmentDraft(storage, first)
  const retry = loadEnrolmentDraft(storage, makeIds()).draft
  assert.equal(retry.registrationIdempotencyKey, first.registrationIdempotencyKey)
})

test('submitted reference survives refresh without retaining a browser bearer token', () => {
  const storage = memoryStorage()
  const draft = loadEnrolmentDraft(storage, makeIds()).draft
  draft.enrolmentReference = 'RM-0123456789ABCDEF0123'
  saveEnrolmentDraft(storage, { ...draft, statusToken: 'must-not-persist' })
  const serialized = storage.values.get(ENROLMENT_DRAFT_KEY) ?? ''
  assert.equal(serialized.includes('must-not-persist'), false)
  assert.equal(loadEnrolmentDraft(storage, makeIds()).draft.enrolmentReference, draft.enrolmentReference)
})

test('legacy session recovery does not trust a stored reference or migrate its bearer token', () => {
  const local = memoryStorage()
  const session = memoryStorage()
  session.setItem('radixminds:enrolment-session', JSON.stringify({ reference: 'RM-0123456789ABCDEF0123', programCode: 'class-12', token: 'private-token' }))
  session.setItem('radixminds:registration-idempotency-key', '00000000-0000-4000-8000-000000000123')
  const recovered = loadEnrolmentRecovery(local, session, makeIds())
  assert.equal(recovered.draft.programCode, 'class-12')
  assert.equal(recovered.draft.enrolmentReference, null)
  assert.equal(recovered.draft.step, 1)
  assert.equal(local.values.get(ENROLMENT_DRAFT_KEY)?.includes('private-token'), false)
  assert.equal(session.values.size, 0)
})
