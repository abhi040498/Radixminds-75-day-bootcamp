import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyDraftPayload, restoreEnrolmentDraft, saveEnrolmentDraft, type EnrolmentDraftStore, type StoredEnrolmentDraft } from '../src/enrolmentDraft.js'

const registrationKey = '00000000-0000-4000-8000-000000000001'
const paymentKey = '00000000-0000-4000-8000-000000000002'

function memoryStore(): EnrolmentDraftStore {
  const rows = new Map<string, StoredEnrolmentDraft>()
  return {
    async find(hash) { return rows.get(hash) ?? null },
    async create(input) {
      const row = { id: `draft-${rows.size + 1}`, session_token_hash: input.sessionTokenHash, ...emptyDraftPayload(input.registrationIdempotencyKey, input.paymentIdempotencyKey), revision: 0, created_at: input.now, updated_at: input.now, expires_at: input.expiresAt }
      rows.set(input.sessionTokenHash, row)
      return row
    },
    async update(input) {
      const row = rows.get(input.sessionTokenHash)
      if (!row || row.revision !== input.expectedRevision || Date.parse(row.expires_at) <= Date.parse(input.now)) return null
      const next = { ...row, ...input.payload, revision: row.revision + 1, updated_at: input.now, expires_at: input.expiresAt }
      rows.set(input.sessionTokenHash, next)
      return next
    },
    async delete(hash, key) {
      const row = rows.get(hash)
      if (!row || (key && row.registrationIdempotencyKey !== key)) return 0
      rows.delete(hash)
      return 1
    },
  }
}

function filledDraft() {
  return { ...emptyDraftPayload(registrationKey, paymentKey), programCode: 'class-12' as const, subjectChoice: 'Biology' as const, learningMode: 'hybrid' as const, currentStep: 1 as const, fullName: 'Student Example', mobile: '9876543210', email: 'student@example.invalid', dateOfBirth: '2009-03-04', schoolName: 'Example School', board: 'CBSE', preferredLanguage: 'English', whatsappMobile: '9876543211' }
}

test('student details and Class 12 pathway/mode save and restore by the same session', async () => {
  const store = memoryStore()
  const now = new Date('2026-11-11T10:00:00Z')
  const hash = 'a'.repeat(64)
  await store.create({ sessionTokenHash: hash, registrationIdempotencyKey: registrationKey, paymentIdempotencyKey: paymentKey, now: now.toISOString(), expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString() })
  const saved = await saveEnrolmentDraft(store, { sessionTokenHash: hash, expectedRevision: 0, payload: filledDraft(), now })
  assert.equal(saved.ok, true)
  if (!saved.ok) return
  const restored = await restoreEnrolmentDraft(store, hash, new Date(now.getTime() + 1000))
  assert.equal(restored?.fullName, 'Student Example')
  assert.equal(restored?.programCode, 'class-12')
  assert.equal(restored?.subjectChoice, 'Biology')
  assert.equal(restored?.learningMode, 'hybrid')
  assert.equal(restored?.currentStep, 1)
})

test('Class 10 and all supported learning modes restore without a pathway', async (t) => {
  for (const learningMode of ['online', 'hybrid', 'offline'] as const) {
    await t.test(learningMode, async () => {
      const store = memoryStore()
      const now = new Date('2026-11-11T10:00:00Z')
      const hash = `${learningMode}:`.padEnd(64, 'a').slice(0, 64)
      await store.create({ sessionTokenHash: hash, registrationIdempotencyKey: registrationKey, paymentIdempotencyKey: paymentKey, now: now.toISOString(), expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString() })
      const payload = { ...emptyDraftPayload(registrationKey, paymentKey), programCode: 'class-10' as const, learningMode, currentStep: 0 as const }
      const saved = await saveEnrolmentDraft(store, { sessionTokenHash: hash, expectedRevision: 0, payload, now })
      assert.equal(saved.ok, true)
      const restored = await restoreEnrolmentDraft(store, hash, now)
      assert.equal(restored?.programCode, 'class-10')
      assert.equal(restored?.subjectChoice, '')
      assert.equal(restored?.learningMode, learningMode)
    })
  }
})

test('a different draft session cannot restore or overwrite another session', async () => {
  const store = memoryStore()
  const now = new Date('2026-11-11T10:00:00Z')
  const hashA = 'a'.repeat(64)
  const hashB = 'b'.repeat(64)
  await store.create({ sessionTokenHash: hashA, registrationIdempotencyKey: registrationKey, paymentIdempotencyKey: paymentKey, now: now.toISOString(), expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString() })
  const saved = await saveEnrolmentDraft(store, { sessionTokenHash: hashA, expectedRevision: 0, payload: filledDraft(), now })
  assert.equal(saved.ok, true)
  assert.equal(await restoreEnrolmentDraft(store, hashB, now), null)
  const unauthorized = await saveEnrolmentDraft(store, { sessionTokenHash: hashB, expectedRevision: 0, payload: filledDraft(), now })
  assert.deepEqual(unauthorized, { ok: false, reason: 'conflict' })
  assert.equal((await restoreEnrolmentDraft(store, hashA, now))?.fullName, 'Student Example')
})

test('expired drafts cannot be restored or updated', async () => {
  const store = memoryStore()
  const now = new Date('2026-11-11T10:00:00Z')
  const hash = 'c'.repeat(64)
  await store.create({ sessionTokenHash: hash, registrationIdempotencyKey: registrationKey, paymentIdempotencyKey: paymentKey, now: now.toISOString(), expiresAt: new Date(now.getTime() + 1000).toISOString() })
  const afterExpiry = new Date(now.getTime() + 1001)
  assert.equal(await restoreEnrolmentDraft(store, hash, afterExpiry), null)
  const result = await saveEnrolmentDraft(store, { sessionTokenHash: hash, expectedRevision: 0, payload: filledDraft(), now: afterExpiry })
  assert.deepEqual(result, { ok: false, reason: 'conflict' })
})

test('consent fields are neither accepted nor returned by the draft schema', async () => {
  const store = memoryStore()
  const now = new Date('2026-11-11T10:00:00Z')
  const hash = 'd'.repeat(64)
  await store.create({ sessionTokenHash: hash, registrationIdempotencyKey: registrationKey, paymentIdempotencyKey: paymentKey, now: now.toISOString(), expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString() })
  const result = await saveEnrolmentDraft(store, { sessionTokenHash: hash, expectedRevision: 0, payload: { ...filledDraft(), policyAcknowledged: true, whatsappUpdatesConsent: true }, now })
  assert.deepEqual(result, { ok: false, reason: 'invalid' })
})

test('compare-and-set saves prevent an older concurrent autosave overwriting a newer revision', async () => {
  const store = memoryStore()
  const now = new Date('2026-11-11T10:00:00Z')
  const hash = 'e'.repeat(64)
  await store.create({ sessionTokenHash: hash, registrationIdempotencyKey: registrationKey, paymentIdempotencyKey: paymentKey, now: now.toISOString(), expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString() })
  const [first, stale] = await Promise.all([
    saveEnrolmentDraft(store, { sessionTokenHash: hash, expectedRevision: 0, payload: filledDraft(), now }),
    saveEnrolmentDraft(store, { sessionTokenHash: hash, expectedRevision: 0, payload: { ...filledDraft(), fullName: 'Stale Update' }, now }),
  ])
  assert.equal([first, stale].filter(result => result.ok).length, 1)
  assert.equal([first, stale].filter(result => !result.ok && result.reason === 'conflict').length, 1)
  assert.notEqual((await restoreEnrolmentDraft(store, hash, now))?.fullName, 'Stale Update')
})

test('failed validation leaves the stored draft unchanged and available for retry', async () => {
  const store = memoryStore()
  const now = new Date('2026-11-11T10:00:00Z')
  const hash = 'f'.repeat(64)
  await store.create({ sessionTokenHash: hash, registrationIdempotencyKey: registrationKey, paymentIdempotencyKey: paymentKey, now: now.toISOString(), expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString() })
  const invalid = await saveEnrolmentDraft(store, { sessionTokenHash: hash, expectedRevision: 0, payload: { ...filledDraft(), fullName: 'x'.repeat(121) }, now })
  assert.deepEqual(invalid, { ok: false, reason: 'invalid' })
  assert.equal((await restoreEnrolmentDraft(store, hash, now))?.fullName, '')
  const retry = await saveEnrolmentDraft(store, { sessionTokenHash: hash, expectedRevision: 0, payload: filledDraft(), now })
  assert.equal(retry.ok, true)
})

test('deleting a draft invalidates only the exact session', async () => {
  const store = memoryStore()
  const now = new Date('2026-11-11T10:00:00Z')
  const hashA = '1'.repeat(64)
  const hashB = '2'.repeat(64)
  for (const hash of [hashA, hashB]) await store.create({ sessionTokenHash: hash, registrationIdempotencyKey: registrationKey, paymentIdempotencyKey: paymentKey, now: now.toISOString(), expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString() })
  assert.equal(await store.delete(hashA, registrationKey), 1)
  assert.equal(await restoreEnrolmentDraft(store, hashA, now), null)
  assert.equal((await restoreEnrolmentDraft(store, hashB, now))?.registrationIdempotencyKey, registrationKey)
})
