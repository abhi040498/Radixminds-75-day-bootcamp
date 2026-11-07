import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const bundlePath = new URL('../server/dist/netlify-function-local.cjs', import.meta.url)
const bundleSource = readFileSync(bundlePath, 'utf8')
if (bundleSource.includes('staticFrontend') || bundleSource.includes('frontendBuildDir') || bundleSource.includes('import.meta.url')) {
  throw new Error('Netlify API bundle unexpectedly includes frontend static-file initialization.')
}

const { handler } = require(fileURLToPath(bundlePath))
function eventFor(path) {
  return {
    httpMethod: 'GET',
    path,
    headers: { host: 'localhost' },
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
  }
}

async function request(path) {
  const response = await handler(eventFor(path), {})
  if (!response || typeof response.statusCode !== 'number') throw new Error(`${path}: function returned no HTTP status`)
  let payload = {}
  try { payload = JSON.parse(response.body ?? '{}') } catch { /* Status validation below is sufficient. */ }
  return { status: response.statusCode, payload }
}

const health = await request('/api/health')
if (health.status !== 200) throw new Error(`/api/health returned ${health.status}`)
const databaseConfigured = health.payload.databaseConfigured === true
console.log(`/api/health: ${health.status}; database configured: ${databaseConfigured}`)

const config = await request('/api/v1/config')
if (config.status !== 200) throw new Error(`/api/v1/config returned ${config.status}`)
if (config.payload.policiesApproved !== false) throw new Error('/api/v1/config reports that policies are approved; expected the production gate to remain false')
if (config.payload.paymentMode !== 'test') throw new Error('/api/v1/config does not report Test Mode')
console.log(`/api/v1/config: ${config.status}`)

const programs = await request('/api/v1/programs')
const count = Array.isArray(programs.payload.programs) ? programs.payload.programs.length : 0
const programErrorCode = typeof programs.payload?.error?.code === 'string' ? programs.payload.error.code : 'none'
if (databaseConfigured && programs.status === 200) {
  console.log(`/api/v1/programs: ${programs.status}; records returned: ${count}`)
} else if (databaseConfigured && programs.status === 503 && programErrorCode === 'PROGRAMS_UNAVAILABLE') {
  console.log(`/api/v1/programs: ${programs.status}; database query unavailable (${programErrorCode})`)
} else if (!databaseConfigured && programs.status === 503) {
  console.log(`/api/v1/programs: ${programs.status}; unavailable until database configuration is supplied`)
} else {
  throw new Error(`/api/v1/programs returned unexpected HTTP ${programs.status}`)
}
console.log('Function initialization passed; no frontend static-file paths were loaded.')
