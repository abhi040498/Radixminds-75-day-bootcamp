import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const scriptPath = fileURLToPath(import.meta.url)
const bundlePath = new URL('../server/dist/netlify-function-local.cjs', import.meta.url)
const bundleSource = readFileSync(bundlePath, 'utf8')
if (bundleSource.includes('staticFrontend') || bundleSource.includes('frontendBuildDir') || bundleSource.includes('import.meta.url')) {
  throw new Error('Netlify API bundle unexpectedly includes frontend static-file initialization.')
}

const scenario = process.argv[2]
if (scenario !== '--scenario') {
  for (const name of ['closed', 'open']) {
    const child = spawnSync(process.execPath, [scriptPath, '--scenario', name], { encoding: 'utf8' })
    if (child.stdout) process.stdout.write(child.stdout)
    if (child.stderr) process.stderr.write(child.stderr)
    if (child.error) throw child.error
    if (child.status !== 0) throw new Error(`${name} Netlify function scenario failed with exit ${child.status}`)
  }
  console.log('Netlify function initialization and trusted-IP regression checks passed.')
  process.exit(0)
}

const mode = process.argv[3]
if (mode !== 'closed' && mode !== 'open') throw new Error('Unknown isolated test scenario.')

// Make this offline test independent of any developer or deployment secrets.
for (const name of [
  'SUPABASE_URL', 'SUPABASE_PUBLIC_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'STATUS_TOKEN_SECRET',
]) delete process.env[name]
for (const name of ['APPROVED_NETLIFY_CONTEXT', 'SITE_NAME', 'NETLIFY', 'AWS_LAMBDA_FUNCTION_NAME']) delete process.env[name]
process.env.DOTENV_CONFIG_PATH = join(tmpdir(), `radixminds-offline-no-env-${process.pid}.env`)
Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_ORIGIN: 'https://bootcamp.radixminds.in',
  POLICIES_APPROVED: mode === 'closed' ? 'false' : 'true',
  PAYMENT_ENABLED: 'false',
  RAZORPAY_MODE: 'test',
})

const { default: handler } = require(fileURLToPath(bundlePath))
if (typeof handler !== 'function') throw new Error('Netlify function bundle has no default Fetch handler.')

function makeRequest(path, { method = 'GET', origin = process.env.APP_ORIGIN, ip, forwardedFor, body, requestId, preflightMethod, preflightHeaders } = {}) {
  const headers = new Headers()
  if (origin !== undefined) headers.set('origin', origin)
  if (forwardedFor !== undefined) headers.set('x-forwarded-for', forwardedFor)
  if (preflightMethod !== undefined) headers.set('access-control-request-method', preflightMethod)
  if (preflightHeaders !== undefined) headers.set('access-control-request-headers', preflightHeaders)
  if (body !== undefined) headers.set('content-type', 'application/json')
  if (requestId) headers.set('x-request-id', requestId)
  const request = new Request(`https://bootcamp.radixminds.in${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body } : {}),
  })
  return handler(request, ip === undefined ? {} : { ip })
}

async function payloadOf(response) {
  let payload = {}
  try { payload = await response.clone().json() } catch { /* Some limiter responses are plain text. */ }
  return payload
}

async function assertJsonResponse(response, status, code, label) {
  const payload = await payloadOf(response)
  if (response.status !== status || payload?.error?.code !== code) {
    throw new Error(`${label}: expected HTTP ${status} ${code}; received HTTP ${response.status} ${payload?.error?.code ?? 'no-json-code'}`)
  }
  return payload
}

async function runClosedGateCases() {
  const health = await makeRequest('/api/health', { ip: '203.0.113.10' })
  const healthPayload = await payloadOf(health)
  if (health.status !== 200 || healthPayload.databaseConfigured !== false || healthPayload.paymentMode !== 'test') throw new Error('Closed scenario health check failed.')
  const configResponse = await makeRequest('/api/v1/config', { ip: '203.0.113.10' })
  const configPayload = await payloadOf(configResponse)
  if (configResponse.status !== 200 || configPayload.policiesApproved !== false || configPayload.paymentMode !== 'test') {
    throw new Error('Configuration endpoint did not retain the closed policy and Test Mode values.')
  }
  const programs = await makeRequest('/api/v1/programs', { ip: '203.0.113.10' })
  if (programs.status !== 503) throw new Error(`Programs endpoint returned unexpected HTTP ${programs.status} without database configuration.`)

  const preflight = await makeRequest('/api/v1/enrolments', {
    method: 'OPTIONS',
    ip: '203.0.113.10',
    preflightMethod: 'POST',
    preflightHeaders: 'content-type,idempotency-key,x-enrolment-token',
  })
  if (preflight.status !== 204
    || preflight.headers.get('access-control-allow-origin') !== process.env.APP_ORIGIN
    || preflight.headers.get('access-control-allow-credentials') !== 'true'
    || !preflight.headers.get('access-control-allow-headers')?.toLowerCase().split(',').map(value => value.trim()).includes('x-enrolment-token')) {
    throw new Error('Credentialed OPTIONS preflight did not preserve the exact configured origin.')
  }
  const rejectedPreflight = await makeRequest('/api/v1/enrolments', {
    method: 'OPTIONS',
    origin: 'https://attacker.example.invalid',
    ip: '203.0.113.10',
    preflightMethod: 'PUT',
    preflightHeaders: 'content-type',
  })
  if (rejectedPreflight.headers.get('access-control-allow-origin')) {
    throw new Error('CORS granted permission to an unapproved origin.')
  }

  for (const [path, method] of [
    ['/api/v1/enrolment-draft', 'GET'],
    ['/api/v1/enrolment-draft/session', 'POST'],
    ['/api/v1/enrolment-draft', 'PUT'],
    ['/api/v1/enrolment-draft', 'DELETE'],
  ]) {
    const response = await makeRequest(path, { method, ip: '203.0.113.10', ...(method === 'GET' ? {} : { body: '{}' }) })
    if (response.status !== 404) throw new Error(`Removed draft route ${method} ${path} returned ${response.status}, expected 404.`)
  }

  const orderGate = await makeRequest('/api/v1/enrolments/RM-AAAAAAAAAAAAAAAAAAAA/payment-orders', { method: 'POST', ip: '203.0.113.10', body: '{}' })
  // With Supabase deliberately absent, the route fails at its database
  // prerequisite before evaluating the Razorpay configuration gate.
  await assertJsonResponse(orderGate, 503, 'CONFIGURATION_REQUIRED', 'payment-order database prerequisite')
  const verifyGate = await makeRequest('/api/v1/payments/verify', { method: 'POST', ip: '203.0.113.10', body: '{}' })
  await assertJsonResponse(verifyGate, 503, 'PAYMENT_NOT_CONFIGURED', 'closed payment-verification gate')
  const unsignedWebhook = await makeRequest('/api/v1/webhooks/razorpay', { method: 'POST', ip: '203.0.113.10', body: '{"event":"payment.captured","payload":{}}' })
  if (unsignedWebhook.status !== 503) throw new Error(`Unsigned webhook was not rejected while unconfigured: HTTP ${unsignedWebhook.status}.`)

  // The origin guard remains first; a closed policy must not weaken CSRF checks.
  await assertJsonResponse(
    await makeRequest('/api/v1/enrolments', { method: 'POST', origin: 'https://unapproved.invalid', ip: '203.0.113.10', body: '{}' }),
    403, 'ORIGIN_REJECTED', 'wrong Origin',
  )

  // Both requests must reach the policy response before the limiter, even when
  // Netlify does not supply an IP to the function context.
  await assertJsonResponse(
    await makeRequest('/api/v1/enrolments', { method: 'POST', ip: undefined, body: '{}' }),
    503, 'POLICIES_NOT_APPROVED', 'closed policy without platform IP',
  )
  await assertJsonResponse(
    await makeRequest('/api/v1/enrolments', { method: 'POST', ip: '203.0.113.11', body: '{}' }),
    503, 'POLICIES_NOT_APPROVED', 'closed policy with platform IP',
  )

  const bodyMarker = 'PRIVATE_BODY_MARKER_DO_NOT_LOG'
  const captured = []
  const originalError = console.error
  console.error = (...args) => captured.push(args)
  let malformed
  try {
    malformed = await makeRequest('/api/v1/enrolments', {
      method: 'POST', ip: '203.0.113.12',
      body: `{"marker":"${bodyMarker}",`,
    })
  } finally {
    console.error = originalError
  }
  if (malformed.status !== 400) throw new Error(`Malformed JSON expected HTTP 400; received ${malformed.status}.`)
  const requestId = malformed.headers.get('x-request-id')
  if (!requestId) throw new Error('Malformed JSON response is missing its server-generated request ID.')
  const logText = JSON.stringify(captured)
  const publicText = await malformed.text()
  if (!logText.includes(requestId) || !logText.includes('name') || !logText.includes('stackFrames')) {
    throw new Error('Safe error log is missing request-correlated diagnostic fields.')
  }
  if (logText.includes(bodyMarker) || publicText.includes(bodyMarker) || publicText.includes('stackFrames')) {
    throw new Error('Error diagnostics exposed request-body content or internal stack data.')
  }
  const event = captured.find(([name]) => name === 'api_error')?.[1]
  if (!event || typeof event.errorCode !== 'string' || !Array.isArray(event.stackFrames) || event.stackFrames.length > 8 || event.stackFrames.some((frame) => frame.length > 300)) {
    throw new Error('Error log stack frames are not bounded.')
  }
  console.log('Closed policy: missing/valid IP -> 503 POLICIES_NOT_APPROVED; wrong Origin -> 403; error logs stay sanitized.')
  console.log('Legacy offline smoke checks: exact-origin CORS, removed draft routes, payment gates, webhook rejection, and program unavailability passed.')
}

async function runOpenGateCases() {
  for (let count = 1; count <= 31; count += 1) {
    const response = await makeRequest('/api/v1/enrolments', {
      method: 'POST',
      ip: '198.51.100.24',
      forwardedFor: `192.0.2.${count}`,
      body: '{}',
    })
    if (count <= 30) {
      await assertJsonResponse(response, 503, 'CONFIGURATION_REQUIRED', `trusted IP request ${count}`)
    } else if (response.status !== 429) {
      throw new Error(`Spoofed X-Forwarded-For changed limiter identity: request 31 expected 429, received ${response.status}.`)
    }
  }

  for (let count = 1; count <= 31; count += 1) {
    const response = await makeRequest('/api/v1/enrolments', {
      method: 'POST',
      ip: '2001:db8:abcd:12::4',
      forwardedFor: `2001:db8:ffff::${count.toString(16)}`,
      body: '{}',
    })
    if (count <= 30) {
      await assertJsonResponse(response, 503, 'CONFIGURATION_REQUIRED', `IPv6 trusted IP request ${count}`)
    } else if (response.status !== 429) {
      throw new Error(`IPv6-safe rate limit failed: request 31 expected 429, received ${response.status}.`)
    }
  }

  // No trusted address is a controlled failure, never an undefined-IP throw or
  // an opportunity to reach the database/application handler.
  for (let count = 1; count <= 31; count += 1) {
    await assertJsonResponse(
      await makeRequest('/api/v1/enrolments', { method: 'POST', forwardedFor: `192.0.2.${100 + count}`, body: '{}' }),
      503, 'CLIENT_IP_UNAVAILABLE', `missing platform IP request ${count}`,
    )
  }

  const corsRequest = new Request('https://bootcamp.radixminds.in/api/v1/enrolments', {
    method: 'OPTIONS',
    headers: {
      origin: process.env.APP_ORIGIN,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type,idempotency-key',
    },
  })
  const corsResponse = await handler(corsRequest, { ip: '198.51.100.25' })
  if (corsResponse.status !== 204 || corsResponse.headers.get('access-control-allow-origin') !== process.env.APP_ORIGIN || corsResponse.headers.get('access-control-allow-credentials') !== 'true') {
    throw new Error('Credentialed OPTIONS preflight did not preserve the configured origin.')
  }
  console.log('Open policy: 30 requests pass the limiter, request 31 is 429; spoofed X-Forwarded-For does not alter identity; missing IP fails closed.')
}

if (mode === 'closed') await runClosedGateCases()
else await runOpenGateCases()
