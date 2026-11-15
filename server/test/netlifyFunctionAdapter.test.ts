import assert from 'node:assert/strict'
import { test } from 'node:test'
import express from 'express'
import serverless from 'serverless-http'
import type { Context } from '@netlify/functions'
import { createNetlifyFunctionHandler, type LambdaHttpResponse } from '../../netlify/functions/adapter.js'
import { enrolmentSessionCookieName, readCookieValue } from '../src/enrolmentSession.js'

const reference = 'RM-AAAAAAAAAAAAAAAAAAAA'
const enrolmentCookieName = enrolmentSessionCookieName(reference)!
const context = { ip: '203.0.113.10' } as Context

function makeAdapter(app: express.Express) {
  const serverlessHandler = serverless(app)
  return createNetlifyFunctionHandler(async event => await serverlessHandler(
    event as Parameters<typeof serverlessHandler>[0],
    {} as Parameters<typeof serverlessHandler>[1],
  ) as LambdaHttpResponse)
}

function setCookieValues(response: Response) {
  assert.equal(typeof response.headers.getSetCookie, 'function', 'test runtime must expose separate Set-Cookie values')
  return response.headers.getSetCookie()
}

test('Netlify adapter forwards two serverless-http v2 cookies as distinct Set-Cookie headers with attributes intact', async () => {
  const app = express()
  app.get('/api/v1/fixture', (_req, res) => {
    res.setHeader('X-Fixture', 'preserved')
    res.cookie(enrolmentCookieName, 'synthetic-token+with/encoding', {
      httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1', maxAge: 60 * 24 * 60 * 60 * 1000,
      expires: new Date('2026-10-21T07:28:00.000Z'),
    })
    res.cookie('rm_last_enrolment', reference, {
      httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1', maxAge: 60 * 24 * 60 * 60 * 1000,
      expires: new Date('2026-10-21T07:28:00.000Z'),
    })
    res.status(201).json({ enrolmentReference: reference, saved: true })
  })

  const response = await makeAdapter(app)(new Request('https://bootcamp.radixminds.in/api/v1/fixture'), context)
  const cookies = setCookieValues(response)
  assert.equal(response.status, 201)
  assert.equal(response.headers.get('x-fixture'), 'preserved')
  assert.deepEqual(await response.json(), { enrolmentReference: reference, saved: true })
  assert.equal(cookies.length, 2)
  assert.match(cookies[0]!, new RegExp(`^${enrolmentCookieName}=`))
  assert.match(cookies[1]!, /^rm_last_enrolment=/)
  for (const cookie of cookies) {
    assert.match(cookie, /; HttpOnly/i)
    assert.match(cookie, /; Secure/i)
    assert.match(cookie, /; SameSite=Strict/i)
    assert.match(cookie, /; Path=\/api\/v1/i)
    assert.match(cookie, /; Max-Age=5184000/i)
    assert.match(cookie, /; Expires=[A-Za-z]{3}, .+ GMT/i)
  }
  assert.notEqual(cookies[0], cookies[1], 'multiple cookies must not be comma-joined')
})

test('adapter de-duplicates cookies present in multiple Lambda response representations', async () => {
  const cookieA = 'session=synthetic; HttpOnly; Expires=Wed, 21 Oct 2026 07:28:00 GMT'
  const cookieB = 'last=RM-AAAAAAAAAAAAAAAAAAAA; Path=/api/v1'
  const response = await createNetlifyFunctionHandler(async () => ({
    statusCode: 202,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookieA },
    multiValueHeaders: { 'set-cookie': [cookieA] },
    cookies: [cookieA, cookieB],
    body: JSON.stringify({ queued: true }),
  }))(
    new Request('https://bootcamp.radixminds.in/fixture'),
    context,
  )

  assert.equal(response.status, 202)
  assert.deepEqual(setCookieValues(response), [cookieA, cookieB])
  assert.deepEqual(await response.json(), { queued: true })
})

test('inbound Cookie header with both enrolment cookies reaches Express unchanged', async () => {
  const app = express()
  app.get('/api/v1/enrolments/:reference/status', (req, res) => {
    res.json({ cookie: req.get('cookie') ?? null })
  })
  const handler = makeAdapter(app)
  const cookieHeader = `${enrolmentCookieName}=synthetic-token%2Bwith%2Fencoding; rm_last_enrolment=${reference}`
  const response = await handler(new Request(`https://bootcamp.radixminds.in/api/v1/enrolments/${reference}/status`, {
    headers: { Cookie: cookieHeader },
  }), context)

  assert.equal(response.status, 200)
  assert.equal((await response.json()).cookie, cookieHeader)
  assert.equal(readCookieValue(cookieHeader, enrolmentCookieName), 'synthetic-token+with/encoding')
  assert.equal(readCookieValue(cookieHeader, 'rm_last_enrolment'), reference)
})

test('adapter preserves normal, error, base64 and cookie-free responses', async () => {
  const invoke = (result: LambdaHttpResponse) => createNetlifyFunctionHandler(async () => result)(
    new Request('https://bootcamp.radixminds.in/fixture'),
    context,
  )

  const ordinary = await invoke({ statusCode: 200, headers: { 'Content-Type': 'application/json', 'X-Result': 'ok' }, body: '{"ok":true}' })
  assert.equal(ordinary.status, 200)
  assert.equal(ordinary.headers.get('x-result'), 'ok')
  assert.deepEqual(await ordinary.json(), { ok: true })
  assert.deepEqual(setCookieValues(ordinary), [])

  const emptyCookies = await invoke({ statusCode: 204, cookies: [], body: null })
  assert.equal(emptyCookies.status, 204)
  assert.equal(await emptyCookies.text(), '')

  const error = await invoke({ statusCode: 409, headers: { 'Content-Type': 'application/json' }, body: '{"error":{"code":"PAYMENT_PENDING"}}' })
  assert.equal(error.status, 409)
  assert.deepEqual(await error.json(), { error: { code: 'PAYMENT_PENDING' } })

  const base64 = await invoke({ statusCode: 200, headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.from([0, 1, 2, 255]).toString('base64'), isBase64Encoded: true })
  assert.deepEqual([...new Uint8Array(await base64.arrayBuffer())], [0, 1, 2, 255])
})

test('synthetic enrolment response cookies authenticate the subsequent status request through the adapter', async () => {
  const app = express()
  app.post('/api/v1/enrolments', (_req, res) => {
    res.cookie(enrolmentCookieName, 'synthetic-status-token', { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1', maxAge: 60_000 })
    res.cookie('rm_last_enrolment', reference, { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1', maxAge: 60_000 })
    res.status(201).json({ enrolmentReference: reference })
  })
  app.get('/api/v1/enrolments/:reference/status', (req, res) => {
    const cookie = req.get('cookie')
    const token = readCookieValue(cookie, enrolmentSessionCookieName(req.params.reference) ?? '')
    if (req.params.reference !== reference || token !== 'synthetic-status-token') return res.status(404).json({ error: 'not found' })
    return res.status(200).json({ status: 'pending_payment', enrolmentReference: req.params.reference })
  })

  const handler = makeAdapter(app)
  const creation = await handler(new Request('https://bootcamp.radixminds.in/api/v1/enrolments', { method: 'POST' }), context)
  assert.equal(creation.status, 201)
  const setCookies = setCookieValues(creation)
  assert.equal(setCookies.length, 2)
  const browserCookie = setCookies.map(cookie => cookie.split(';', 1)[0]).join('; ')
  const status = await handler(new Request(`https://bootcamp.radixminds.in/api/v1/enrolments/${reference}/status`, { headers: { Cookie: browserCookie } }), context)

  assert.equal(status.status, 200)
  assert.deepEqual(await status.json(), { status: 'pending_payment', enrolmentReference: reference })
})
