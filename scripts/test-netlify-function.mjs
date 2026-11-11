import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
// This is an offline function smoke test. Set explicit empty values before the
// bundle imports dotenv/config so repository .env values cannot be loaded.
for (const name of [
  'SUPABASE_URL', 'SUPABASE_PUBLIC_KEY', 'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET', 'STATUS_TOKEN_SECRET',
]) process.env[name] = ''
process.env.PAYMENT_ENABLED = 'false'
process.env.POLICIES_APPROVED = 'false'
process.env.RAZORPAY_MODE = 'test'
process.env.TEST_NETLIFY_FUNCTION_OFFLINE = 'true'
process.env.APP_ORIGIN = 'http://localhost:5173'
process.env.NODE_ENV = 'test'
const bundlePath = new URL('../server/dist/netlify-function-local.cjs', import.meta.url)
const bundleSource = readFileSync(bundlePath, 'utf8')
if (bundleSource.includes('staticFrontend') || bundleSource.includes('frontendBuildDir') || bundleSource.includes('import.meta.url')) {
  throw new Error('Netlify API bundle unexpectedly includes frontend static-file initialization.')
}

const { handler } = require(fileURLToPath(bundlePath))
function eventFor(path, method = 'GET', body = null, extraHeaders = {}) {
  return {
    httpMethod: method,
    path,
    headers: {
      host: 'localhost',
      ...(method !== 'GET' ? { origin: process.env.APP_ORIGIN || 'http://localhost:5173', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' } : {}),
      ...extraHeaders,
    },
    requestContext: { identity: { sourceIp: '127.0.0.1' } },
    queryStringParameters: null,
    body,
    isBase64Encoded: false,
  }
}

async function request(path, method = 'GET', body = null, headers = {}) {
  const response = await handler(eventFor(path, method, body, headers), {})
  if (!response || typeof response.statusCode !== 'number') throw new Error(`${path}: function returned no HTTP status`)
  let payload = {}
  try { payload = JSON.parse(response.body ?? '{}') } catch { /* Status validation below is sufficient. */ }
  return { status: response.statusCode, payload, headers: response.headers }
}

const health = await request('/api/health')
if (health.status !== 200) throw new Error(`/api/health returned ${health.status}`)
const databaseConfigured = health.payload.databaseConfigured === true
if (process.env.TEST_NETLIFY_FUNCTION_OFFLINE === 'true' && databaseConfigured) {
  throw new Error('Offline function smoke test unexpectedly has database credentials; refusing to issue database-backed requests.')
}
console.log(`/api/health: ${health.status}; database configured: ${databaseConfigured}`)

const config = await request('/api/v1/config')
if (config.status !== 200) throw new Error(`/api/v1/config returned ${config.status}`)
if (config.payload.policiesApproved !== false) throw new Error('/api/v1/config reports that policies are approved; expected the production gate to remain false')
if (config.payload.paymentMode !== 'test') throw new Error('/api/v1/config does not report Test Mode')
console.log(`/api/v1/config: ${config.status}`)

const preflight = await request('/api/v1/enrolments', 'OPTIONS', null, {
  'access-control-request-method': 'POST',
  'access-control-request-headers': 'content-type,idempotency-key',
})
const responseHeader = (headers, name) => Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
if (preflight.status !== 204
  || responseHeader(preflight.headers, 'access-control-allow-origin') !== process.env.APP_ORIGIN
  || responseHeader(preflight.headers, 'access-control-allow-credentials') !== 'true'
  || !String(responseHeader(preflight.headers, 'access-control-allow-methods') ?? '').split(',').map(value => value.trim()).includes('POST')) {
  throw new Error('Netlify Function CORS preflight did not allow the exact configured origin and credentialed POST request.')
}
console.log('/api/v1/enrolments OPTIONS: 204; exact-origin credentialed POST preflight passed')
const rejectedPreflight = await request('/api/v1/enrolments', 'OPTIONS', null, {
  origin: 'https://attacker.example.invalid',
  'access-control-request-method': 'PUT',
  'access-control-request-headers': 'content-type',
})
if (responseHeader(rejectedPreflight.headers, 'access-control-allow-origin')) {
  throw new Error('Netlify Function CORS preflight reflected an unapproved origin.')
}
console.log('/api/v1/enrolments OPTIONS: unapproved origin received no CORS permission')

for (const [path, method] of [
  ['/api/v1/enrolment-draft', 'GET'],
  ['/api/v1/enrolment-draft/session', 'POST'],
  ['/api/v1/enrolment-draft', 'PUT'],
  ['/api/v1/enrolment-draft', 'DELETE'],
]) {
  const removedDraftRoute = await request(path, method, method === 'GET' ? null : '{}')
  if (removedDraftRoute.status !== 404) throw new Error(`Removed draft endpoint ${method} ${path} returned ${removedDraftRoute.status}, expected 404.`)
}
console.log('Draft API endpoints: GET/POST/PUT/DELETE all return 404')

const orderGate = await request('/api/v1/enrolments/RM-AAAAAAAAAAAAAAAAAAAA/payment-orders', 'POST', '{}')
const orderGateCode = typeof orderGate.payload?.error?.code === 'string' ? orderGate.payload.error.code : 'none'
const expectedOrderGateCode = databaseConfigured ? 'PAYMENT_NOT_CONFIGURED' : 'CONFIGURATION_REQUIRED'
if (orderGate.status !== 503 || orderGateCode !== expectedOrderGateCode) {
  throw new Error('Payment order route did not remain closed by the payment/policy safety gates.')
}
console.log(`/api/v1/enrolments/:reference/payment-orders: ${orderGate.status}; safety gate remains closed`)

const verifyGate = await request('/api/v1/payments/verify', 'POST', '{}')
const verifyGateCode = typeof verifyGate.payload?.error?.code === 'string' ? verifyGate.payload.error.code : 'none'
if (verifyGate.status !== 503 || verifyGateCode !== 'PAYMENT_NOT_CONFIGURED') {
  throw new Error('Payment verification route did not remain closed by the payment/policy safety gates.')
}
console.log(`/api/v1/payments/verify: ${verifyGate.status}; safety gate remains closed`)

const unsignedWebhook = await request('/api/v1/webhooks/razorpay', 'POST', JSON.stringify({ event: 'payment.captured', payload: {} }))
const expectedWebhookStatus = databaseConfigured ? 400 : 503
if (unsignedWebhook.status !== expectedWebhookStatus) throw new Error('Webhook route returned an unexpected status for the configured isolated test mode.')
console.log(`/api/v1/webhooks/razorpay: ${unsignedWebhook.status}; unsigned event rejected`)

const programs = await request('/api/v1/programs')
const count = Array.isArray(programs.payload.programs) ? programs.payload.programs.length : 0
const programErrorCode = typeof programs.payload?.error?.code === 'string' ? programs.payload.error.code : 'none'
if (databaseConfigured && programs.status === 200) {
  const expectedFees = new Map([['class-10', 249900], ['class-12', 349900]])
  for (const [code, expectedPaise] of expectedFees) {
    const program = programs.payload.programs.find(item => item.code === code)
    if (!program || program.payablePaise !== expectedPaise || program.durationDays !== 75) {
      throw new Error(`/api/v1/programs did not return the configured 75-day fee for ${code}.`)
    }
  }
  console.log(`/api/v1/programs: ${programs.status}; records returned: ${count}`)
  console.log('Program configuration verified: Class 10 ₹2,499; Class 12 ₹3,499; 75 days each.')
} else if (databaseConfigured && programs.status === 503 && programErrorCode === 'PROGRAMS_UNAVAILABLE') {
  console.log(`/api/v1/programs: ${programs.status}; database query unavailable (${programErrorCode})`)
} else if (!databaseConfigured && programs.status === 503) {
  console.log(`/api/v1/programs: ${programs.status}; unavailable until database configuration is supplied`)
} else {
  throw new Error(`/api/v1/programs returned unexpected HTTP ${programs.status}`)
}
console.log('Function initialization passed; no frontend static-file paths were loaded.')
