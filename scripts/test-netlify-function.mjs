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
function eventFor(path, method = 'GET', body = null) {
  return {
    httpMethod: method,
    path,
    headers: {
      host: 'localhost',
      ...(method !== 'GET' ? { origin: process.env.APP_ORIGIN || 'http://localhost:5173', 'content-type': 'application/json' } : {}),
    },
    requestContext: { identity: { sourceIp: '127.0.0.1' } },
    queryStringParameters: null,
    body,
    isBase64Encoded: false,
  }
}

async function request(path, method = 'GET', body = null) {
  const response = await handler(eventFor(path, method, body), {})
  if (!response || typeof response.statusCode !== 'number') throw new Error(`${path}: function returned no HTTP status`)
  let payload = {}
  try { payload = JSON.parse(response.body ?? '{}') } catch { /* Status validation below is sufficient. */ }
  return { status: response.statusCode, payload }
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
