import assert from 'node:assert/strict'
import test from 'node:test'
import { ENROLMENT_RECOVERY_KEY, loadEnrolmentRecovery, resolveConfirmationReference, resolveEnrolmentEntry, restoreEnrolmentStep, saveEnrolmentRecovery, startFreshEnrolmentRecovery, type StorageLike } from '../../src/lib/enrolmentRecovery.js'

function memoryStorage(): StorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => { values.delete(key) } }
}

const makeIds = () => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }
const existingReference = 'RM-AAAAAAAAAAAAAAAAAAAA'

for (const programCode of ['class-10', 'class-12'] as const) {
  test(`a fresh ${programCode} Enrol Now intent overrides a stale submitted enrolment`, () => {
    const storage = memoryStorage()
    const ids = makeIds()
    const oldRecovery = { ...loadEnrolmentRecovery(storage, null, ids).recovery, programCode, enrolmentReference: existingReference }
    saveEnrolmentRecovery(storage, oldRecovery)
    const loaded = loadEnrolmentRecovery(storage, null, ids).recovery
    const entry = resolveEnrolmentEntry('/enrol', programCode, loaded.enrolmentReference)
    assert.deepEqual(entry, { kind: 'new', programCode })

    const fresh = startFreshEnrolmentRecovery(storage, programCode, ids)
    assert.equal(fresh.programCode, programCode)
    assert.equal(fresh.enrolmentReference, null)
    assert.notEqual(fresh.registrationIdempotencyKey, oldRecovery.registrationIdempotencyKey)
    assert.notEqual(fresh.paymentIdempotencyKey, oldRecovery.paymentIdempotencyKey)
    assert.equal(loadEnrolmentRecovery(storage, null, ids).recovery.enrolmentReference, null)
    assert.equal(resolveEnrolmentEntry('/enrol', programCode, existingReference).kind, 'new')
  })
}

test('an explicit resume intent and the confirmation URL retain the existing submitted enrolment', () => {
  assert.deepEqual(resolveEnrolmentEntry('/enrol', null, existingReference, true), { kind: 'resume', reference: existingReference })
  assert.deepEqual(resolveEnrolmentEntry('/enrol', null, existingReference), { kind: 'new', programCode: '' })
  assert.deepEqual(resolveEnrolmentEntry('/enrol/confirmation', 'class-10', existingReference), { kind: 'confirmation' })
})

test('refreshing the confirmation route keeps the saved reference available for status recovery', () => {
  const storage = memoryStorage()
  const submitted = { ...loadEnrolmentRecovery(storage, null, makeIds()).recovery, programCode: 'class-10' as const, enrolmentReference: existingReference }
  saveEnrolmentRecovery(storage, submitted)
  const restored = loadEnrolmentRecovery(storage, null, makeIds()).recovery
  assert.equal(resolveEnrolmentEntry('/enrol/confirmation', null, restored.enrolmentReference).kind, 'confirmation')
  assert.equal(restored.enrolmentReference, existingReference)
  assert.equal(restoreEnrolmentStep(restored), 2)
})

test('an existing enrolment can be explicitly recovered by its reference after starting a fresh journey', () => {
  assert.equal(resolveConfirmationReference(existingReference, null), existingReference)
  assert.equal(resolveConfirmationReference('invalid-reference', null), null)
})

test('refresh starts an unsubmitted enrolment at program selection without restoring form progress', () => {
  const storage = memoryStorage()
  const first = loadEnrolmentRecovery(storage, null, makeIds()).recovery
  saveEnrolmentRecovery(storage, { ...first, programCode: 'class-10', subjectChoice: 'Biology', learningMode: 'hybrid', step: 2 })
  const restored = loadEnrolmentRecovery(storage, null, makeIds()).recovery
  assert.equal(restored.programCode, '')
  assert.equal(restored.subjectChoice, '')
  assert.equal(restored.learningMode, '')
  assert.equal(restored.step, 0)
  assert.equal(restoreEnrolmentStep(restored), 0)
})

test('student details and consent are never persisted or restored', () => {
  const storage = memoryStorage()
  const recovery = loadEnrolmentRecovery(storage, null, makeIds()).recovery
  saveEnrolmentRecovery(storage, {
    ...recovery,
    fullName: 'Private Student', mobile: '9876543210', email: 'private@example.invalid',
    policyAcknowledged: true, whatsappUpdatesConsent: true, statusToken: 'sensitive-token',
  } as typeof recovery & Record<string, unknown>)
  const serialized = storage.values.get(ENROLMENT_RECOVERY_KEY) ?? ''
  for (const value of ['Private Student', '9876543210', 'private@example.invalid', 'sensitive-token', 'policyAcknowledged', 'whatsappUpdatesConsent']) {
    assert.equal(serialized.includes(value), false)
  }
  const restored = loadEnrolmentRecovery(storage, null, makeIds()).recovery
  assert.equal(restored.programCode, '')
  assert.equal(restored.registrationIdempotencyKey, recovery.registrationIdempotencyKey)
  assert.equal(restored.paymentIdempotencyKey, recovery.paymentIdempotencyKey)
})

test('submission idempotency key survives refresh after an explicit pre-submit checkpoint', () => {
  const storage = memoryStorage()
  const first = loadEnrolmentRecovery(storage, null, makeIds()).recovery
  saveEnrolmentRecovery(storage, first)
  const retry = loadEnrolmentRecovery(storage, null, makeIds()).recovery
  assert.equal(retry.registrationIdempotencyKey, first.registrationIdempotencyKey)
})

test('submitted reference survives refresh without retaining a browser bearer token', () => {
  const storage = memoryStorage()
  const recovery = loadEnrolmentRecovery(storage, null, makeIds()).recovery
  const submitted = { ...recovery, programCode: 'class-12' as const, enrolmentReference: 'RM-0123456789ABCDEF0123' }
  saveEnrolmentRecovery(storage, { ...submitted, statusToken: 'must-not-persist' } as typeof submitted & Record<string, unknown>)
  const serialized = storage.values.get(ENROLMENT_RECOVERY_KEY) ?? ''
  assert.equal(serialized.includes('must-not-persist'), false)
  assert.equal(loadEnrolmentRecovery(storage, null, makeIds()).recovery.enrolmentReference, submitted.enrolmentReference)
})

test('legacy session recovery keeps only a valid idempotency key and clears bearer-token storage', () => {
  const local = memoryStorage()
  const session = memoryStorage()
  session.setItem('radixminds:enrolment-session', JSON.stringify({ reference: 'RM-0123456789ABCDEF0123', programCode: 'class-12', token: 'private-token' }))
  session.setItem('radixminds:registration-idempotency-key', '00000000-0000-4000-8000-000000000123')
  const recovered = loadEnrolmentRecovery(local, session, makeIds())
  assert.equal(recovered.recovery.programCode, '')
  assert.equal(recovered.recovery.enrolmentReference, null)
  assert.equal(recovered.recovery.step, 0)
  assert.equal(recovered.recovery.registrationIdempotencyKey, '00000000-0000-4000-8000-000000000123')
  assert.equal(local.values.get(ENROLMENT_RECOVERY_KEY)?.includes('private-token'), false)
  assert.equal(session.values.size, 0)
})
