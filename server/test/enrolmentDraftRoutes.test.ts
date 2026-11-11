import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import { emptyDraftPayload, type EnrolmentDraftStore, type StoredEnrolmentDraft } from '../src/enrolmentDraft.js'
import { createEnrolmentDraftRouter, DRAFT_COOKIE } from '../src/enrolmentDraftRoutes.js'

const appOrigin = 'https://preview.example.invalid'
const registrationKey = '00000000-0000-4000-8000-000000000001'
const paymentKey = '00000000-0000-4000-8000-000000000002'
const sessionToken = 't'.repeat(43)

function memoryStore() {
  const rows = new Map<string, StoredEnrolmentDraft>()
  const store: EnrolmentDraftStore = {
    async find(hash) { return rows.get(hash) ?? null },
    async create(input) {
      const row: StoredEnrolmentDraft = {
        id: `draft-${rows.size + 1}`, session_token_hash: input.sessionTokenHash,
        ...emptyDraftPayload(input.registrationIdempotencyKey, input.paymentIdempotencyKey),
        revision: 0, created_at: input.now, updated_at: input.now, expires_at: input.expiresAt,
      }
      rows.set(input.sessionTokenHash, row)
      return row
    },
    async update(input) {
      const current = rows.get(input.sessionTokenHash)
      if (!current || current.revision !== input.expectedRevision || Date.parse(current.expires_at) <= Date.parse(input.now)) return null
      const next = { ...current, ...input.payload, revision: current.revision + 1, updated_at: input.now, expires_at: input.expiresAt }
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
  return { store, rows }
}

type TestResponse = { status: number; body?: Record<string, any>; cookie?: string; clearedCookie?: boolean; headers: Record<string, string> }

async function withApi(options: { databaseConfigured?: boolean; now?: () => Date; store?: EnrolmentDraftStore } = {}, run: (request: (method: string, path: string, body?: unknown, cookie?: string, origin?: string) => Promise<TestResponse>, logs: unknown[]) => Promise<void>) {
  const { store: defaultStore } = memoryStore()
  const logs: unknown[] = []
  const router = createEnrolmentDraftRouter({
    store: options.store ?? defaultStore,
    appOrigin,
    databaseConfigured: options.databaseConfigured ?? true,
    now: options.now,
    makeToken: () => sessionToken,
    log: entry => logs.push(entry),
  })

  const request = async (method: string, path: string, body?: unknown, cookie?: string, origin = appOrigin): Promise<TestResponse> => {
    const response: TestResponse = { status: 200, headers: {} }
    const res = Object.assign(Object.create(express.response), {
      locals: { requestId: 'draft-test-request' },
      setHeader(name: string, value: string) { response.headers[name.toLowerCase()] = value; return this },
      status(code: number) { response.status = code; return this },
      json(value: Record<string, any>) { response.body = value; return this },
      cookie(name: string, value: string, cookieOptions: Record<string, unknown>) {
        response.cookie = `${name}=${value}; Path=${cookieOptions.path}; Max-Age=${Math.floor(Number(cookieOptions.maxAge) / 1000)}${cookieOptions.httpOnly ? '; HttpOnly' : ''}${cookieOptions.secure ? '; Secure' : ''}; SameSite=${cookieOptions.sameSite}`
        return this
      },
      clearCookie(name: string) { response.clearedCookie = true; response.cookie = `${name}=; Max-Age=0`; return this },
      end() { return this },
    })
    const headers: Record<string, string> = { origin, ...(cookie ? { cookie } : {}), 'sec-fetch-site': 'same-origin' }
    const req = Object.assign(Object.create(express.request), { method, url: path, originalUrl: path, baseUrl: '/api/v1/enrolment-draft', headers, body, res })
    Object.defineProperty(req, 'path', { value: path, configurable: true })
    req.get = (name: string) => headers[name.toLowerCase()]
    const middleware = router.stack[0]!.handle
    let routePromise = Promise.resolve()
    middleware(req, res, () => {
      const layer = router.stack.find(item => item.route?.path === path && item.route.methods[method.toLowerCase()])
      if (!layer?.route) throw new Error('TEST_ROUTE_NOT_FOUND')
      routePromise = Promise.resolve(layer.route.stack[0]!.handle(req, res, () => undefined))
    })
    await routePromise
    return response
  }
  await run(request, logs)
}

function formPayload(fullName = 'Synthetic Student') {
  return {
    ...emptyDraftPayload(registrationKey, paymentKey),
    programCode: 'class-12' as const, subjectChoice: 'Biology' as const, learningMode: 'hybrid' as const,
    currentStep: 1 as const, fullName, mobile: '9000000001', email: 'synthetic@example.invalid',
    schoolName: 'Synthetic School', board: 'CBSE', preferredLanguage: 'English', whatsappMobile: '9000000002',
  }
}

test('first autosave creates secure HttpOnly session, subsequent autosave and refresh restore the draft', async () => {
  const clock = { value: new Date('2026-11-11T10:00:00Z') }
  const { store } = memoryStore()
  await withApi({ store, now: () => new Date(clock.value) }, async (request, logs) => {
    const session = await request('POST', '/session', { registrationIdempotencyKey: registrationKey, paymentIdempotencyKey: paymentKey })
    assert.equal(session.status, 201)
    assert.match(session.cookie ?? '', new RegExp(`^${DRAFT_COOKIE}=`))
    assert.match(session.cookie ?? '', /HttpOnly/i)
    assert.match(session.cookie ?? '', /Secure/i)
    assert.match(session.cookie ?? '', /SameSite=Strict/i)
    assert.match(session.cookie ?? '', /Path=\/api\/v1/i)
    const cookie = session.cookie!.split(';', 1)[0]!

    const saved = await request('PUT', '/', { expectedRevision: 0, draft: formPayload() }, cookie)
    assert.equal(saved.status, 200)
    assert.equal(saved.body?.revision, 1)
    assert.equal(saved.body?.draft.fullName, 'Synthetic Student')

    const restored = await request('GET', '/', undefined, cookie)
    assert.equal(restored.status, 200)
    assert.equal(restored.body?.revision, 1)
    assert.equal(restored.body?.draft.programCode, 'class-12')
    assert.equal(restored.body?.draft.subjectChoice, 'Biology')
    assert.equal(restored.body?.draft.learningMode, 'hybrid')
    assert.equal(restored.body?.draft.fullName, 'Synthetic Student')
    assert.equal('policyAcknowledged' in restored.body!.draft, false)
    assert.equal('whatsappUpdatesConsent' in restored.body!.draft, false)
    const renderedLogs = JSON.stringify(logs)
    for (const sensitive of ['Synthetic Student', '9000000001', 'synthetic@example.invalid', sessionToken]) assert.equal(renderedLogs.includes(sensitive), false)
  })
})

test('rapid autosaves use compare-and-set and reject the stale revision', async () => {
  const { store } = memoryStore()
  await withApi({ store }, async (request) => {
    const session = await request('POST', '/session', { registrationIdempotencyKey: registrationKey, paymentIdempotencyKey: paymentKey })
    const cookie = session.cookie!.split(';', 1)[0]!
    const results = await Promise.all(['First update', 'Second update'].map(fullName => request('PUT', '/', { expectedRevision: 0, draft: formPayload(fullName) }, cookie)))
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409])
    assert.equal(results.find(result => result.status === 409)?.body?.error.code, 'DRAFT_REVISION_CONFLICT')
    assert.equal((await request('GET', '/', undefined, cookie)).body?.revision, 1)
  })
})

test('expired draft is not restored and its cookie is cleared', async () => {
  const clock = { value: new Date('2026-11-11T10:00:00Z') }
  const { store } = memoryStore()
  await withApi({ store, now: () => new Date(clock.value) }, async (request) => {
    const session = await request('POST', '/session', { registrationIdempotencyKey: registrationKey, paymentIdempotencyKey: paymentKey })
    const cookie = session.cookie!.split(';', 1)[0]!
    clock.value = new Date(clock.value.getTime() + 8 * 86400000)
    const expired = await request('GET', '/', undefined, cookie)
    assert.equal(expired.status, 200)
    assert.equal(expired.body?.draft, null)
    assert.equal(expired.clearedCookie, true)
  })
})

test('unavailable store returns safe 503 diagnostics and invalid payload returns 422', async () => {
  await withApi({ databaseConfigured: false }, async (request) => {
    const unavailable = await request('POST', '/session', { registrationIdempotencyKey: registrationKey, paymentIdempotencyKey: paymentKey })
    assert.equal(unavailable.status, 503)
    assert.equal(unavailable.body?.error.code, 'CONFIGURATION_REQUIRED')
  })
  const { store } = memoryStore()
  await withApi({ store }, async (request) => {
    const invalid = await request('POST', '/session', { registrationIdempotencyKey: 'invalid', paymentIdempotencyKey: paymentKey })
    assert.equal(invalid.status, 422)
    assert.equal(invalid.body?.error.code, 'VALIDATION_ERROR')
  })
})

test('Supabase operation failures return safe status and code diagnostics without exposing error details', async () => {
  const base = memoryStore().store
  const failingStore: EnrolmentDraftStore = {
    ...base,
    async find() { throw Object.assign(new Error('private database detail'), { code: 'PGRST000', status: 503 }) },
    async create() { throw Object.assign(new Error('sensitive request context'), { code: '23505', status: 409 }) },
  }
  await withApi({ store: failingStore }, async (request, logs) => {
    const lookup = await request('GET', '/')
    assert.equal(lookup.status, 200)
    const session = await request('POST', '/session', { registrationIdempotencyKey: registrationKey, paymentIdempotencyKey: paymentKey })
    assert.equal(session.status, 409)
    assert.equal(session.body?.error.code, 'DRAFT_SESSION_CONFLICT')
    const logText = JSON.stringify(logs)
    assert.match(logText, /23505/)
    assert.equal(logText.includes('private database detail'), false)
    assert.equal(logText.includes('sensitive request context'), false)
  })
  const unavailableStore: EnrolmentDraftStore = {
    ...base,
    async find() { throw Object.assign(new Error('private database detail'), { code: 'PGRST000', status: 503 }) },
  }
  await withApi({ store: unavailableStore }, async (request, logs) => {
    const result = await request('GET', '/', undefined, `${DRAFT_COOKIE}=${sessionToken}`)
    assert.equal(result.status, 503)
    assert.equal(result.body?.error.code, 'DRAFT_UNAVAILABLE')
    assert.equal(JSON.stringify(logs).includes('private database detail'), false)
    assert.equal(JSON.stringify(logs).includes('PGRST000'), true)
  })
})

test('cross-origin writes are rejected and revision conflicts are explicit', async () => {
  const { store } = memoryStore()
  await withApi({ store }, async (request) => {
    const rejected = await request('POST', '/session', { registrationIdempotencyKey: registrationKey, paymentIdempotencyKey: paymentKey }, undefined, 'https://attacker.example.invalid')
    assert.equal(rejected.status, 403)
    const session = await request('POST', '/session', { registrationIdempotencyKey: registrationKey, paymentIdempotencyKey: paymentKey })
    const cookie = session.cookie!.split(';', 1)[0]!
    const stale = await request('PUT', '/', { expectedRevision: 4, draft: formPayload() }, cookie)
    assert.equal(stale.status, 409)
    assert.equal(stale.body?.error.code, 'DRAFT_REVISION_CONFLICT')
  })
})
