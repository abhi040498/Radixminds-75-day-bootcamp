import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { config } from '../src/config.js'
import { enrolmentDraftStore } from '../src/enrolmentDraftStore.js'
import { emptyDraftPayload } from '../src/enrolmentDraft.js'

const testProjectRef = 'oohcwibhjmzrrpuxonck'

let stage = 'preflight'
let rowId: string | null = null
let sessionHash: string | null = null
let registrationKey: string | null = null
let created = false
let failure: unknown = null
let cleanupFailed = false

try {
  const actualUrl = new URL(config.SUPABASE_URL ?? '')
  assert.equal(actualUrl.protocol, 'https:')
  assert.equal(actualUrl.hostname, `${testProjectRef}.supabase.co`)
  assert.equal(actualUrl.origin, config.SUPABASE_URL)
  assert.equal(actualUrl.username, '')
  assert.equal(actualUrl.password, '')
  assert.equal(actualUrl.port, '')
  assert.equal(actualUrl.pathname, '/')
  assert.equal(actualUrl.search, '')
  assert.equal(actualUrl.hash, '')
  assert.equal(config.PAYMENT_ENABLED, 'false')
  assert.equal(config.POLICIES_APPROVED, 'false')
  assert.equal(config.RAZORPAY_MODE, 'test')

  sessionHash = randomBytes(32).toString('hex')
  registrationKey = randomUUID()
  const paymentKey = randomUUID()
  const now = new Date()
  const nowIso = now.toISOString()
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

  stage = 'insert'
  // Arm finally cleanup before awaiting the network response: an insert may
  // commit even if its response is interrupted.
  created = true
  const inserted = await enrolmentDraftStore.create({
    sessionTokenHash: sessionHash,
    registrationIdempotencyKey: registrationKey,
    paymentIdempotencyKey: paymentKey,
    now: nowIso,
    expiresAt,
  })
  rowId = inserted.id
  assert.equal(inserted.revision, 0)
  assert.equal(inserted.session_token_hash, sessionHash)
  assert.equal(inserted.registrationIdempotencyKey, registrationKey)
  console.log('PASS insert')

  stage = 'lookup by session hash'
  const found = await enrolmentDraftStore.find(sessionHash)
  assert.equal(found?.id, rowId)
  assert.equal(found?.revision, 0)
  console.log('PASS matching-session lookup')

  const updatedPayload = {
    ...emptyDraftPayload(registrationKey, paymentKey),
    programCode: 'class-10' as const,
    learningMode: 'online' as const,
    currentStep: 1 as const,
    fullName: 'Synthetic Draft Fixture',
    mobile: '9000000001',
    email: 'draft-fixture@example.invalid',
    schoolName: 'Synthetic Test School',
    board: 'CBSE',
  }

  stage = 'expected-revision update'
  const updated = await enrolmentDraftStore.update({ sessionTokenHash: sessionHash, expectedRevision: 0, payload: updatedPayload, now: new Date().toISOString(), expiresAt })
  assert.equal(updated?.id, rowId)
  assert.equal(updated?.revision, 1)
  assert.equal(updated?.programCode, 'class-10')
  assert.equal(updated?.learningMode, 'online')
  assert.equal(updated?.fullName, 'Synthetic Draft Fixture')
  console.log('PASS expected-revision update')

  stage = 'stale-revision rejection'
  const stalePayload = { ...updatedPayload, fullName: 'Stale Synthetic Fixture' }
  const staleUpdate = await enrolmentDraftStore.update({ sessionTokenHash: sessionHash, expectedRevision: 0, payload: stalePayload, now: new Date().toISOString(), expiresAt })
  assert.equal(staleUpdate, null)
  const afterStale = await enrolmentDraftStore.find(sessionHash)
  assert.equal(afterStale?.revision, 1)
  assert.equal(afterStale?.fullName, 'Synthetic Draft Fixture')
  console.log('PASS stale-revision rejection')

  stage = 'session isolation'
  const otherSessionHash = randomBytes(32).toString('hex')
  assert.equal(await enrolmentDraftStore.find(otherSessionHash), null)
  const otherSessionUpdate = await enrolmentDraftStore.update({ sessionTokenHash: otherSessionHash, expectedRevision: 1, payload: stalePayload, now: new Date().toISOString(), expiresAt })
  assert.equal(otherSessionUpdate, null)
  assert.equal((await enrolmentDraftStore.find(sessionHash))?.fullName, 'Synthetic Draft Fixture')
  console.log('PASS other-session isolation')

  stage = 'delete'
  const deleted = await enrolmentDraftStore.delete(sessionHash, registrationKey)
  assert.equal(deleted, 1)
  assert.equal(await enrolmentDraftStore.find(sessionHash), null)
  console.log('PASS exact-session delete and post-delete lookup')
} catch (error) {
  failure = error
} finally {
  if (created && sessionHash && registrationKey) {
    try {
      const remaining = await enrolmentDraftStore.find(sessionHash)
      if (remaining) {
        const deleted = await enrolmentDraftStore.delete(sessionHash, registrationKey)
        if (deleted !== 1) throw new Error('CLEANUP_COUNT_MISMATCH')
      }
      if (await enrolmentDraftStore.find(sessionHash)) throw new Error('CLEANUP_RESIDUAL_ROW')
      console.log('PASS finally cleanup')
    } catch {
      cleanupFailed = true
      console.error(`FAIL cleanup; disposable draft row id: ${rowId ?? 'not returned'}; registration key: ${registrationKey}`)
    }
  } else {
    console.log('PASS cleanup (no disposable row remained)')
  }
}

if (failure) {
  const errorCode = typeof failure === 'object' && failure !== null && 'code' in failure ? String((failure as { code: unknown }).code) : failure instanceof Error ? failure.name : 'unknown'
  console.error(`FAIL ${stage}: ${errorCode}`)
  if (created && rowId) console.error(`Disposable draft row id for cleanup: ${rowId}; registration key: ${registrationKey}`)
  process.exitCode = 1
}
if (cleanupFailed) process.exitCode = 1
