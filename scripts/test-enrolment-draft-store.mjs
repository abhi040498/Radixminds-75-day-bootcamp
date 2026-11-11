import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'dotenv'
import { createIsolatedTestChildEnv, validateTestApiEnvironment } from './test-api-env.mjs'

const testProjectRef = 'oohcwibhjmzrrpuxonck'
const testProjectHostname = `${testProjectRef}.supabase.co`
const envPath = resolve(process.cwd(), '.env.test.local')
const workerPath = resolve(process.cwd(), 'server/test/enrolmentDraftStore.integration.ts')

let testEnv
try {
  testEnv = parse(readFileSync(envPath, 'utf8'))
  const configuredUrl = new URL(testEnv.SUPABASE_URL)
  const exactTestUrl = configuredUrl.protocol === 'https:'
    && configuredUrl.hostname === testProjectHostname
    && configuredUrl.origin === testEnv.SUPABASE_URL
    && !configuredUrl.username && !configuredUrl.password && !configuredUrl.port
    && configuredUrl.pathname === '/' && !configuredUrl.search && !configuredUrl.hash
  if (!exactTestUrl) {
    throw new Error('TEST_PROJECT_MISMATCH')
  }
  // The local test file predates RADIXMINDS_TEST_SUPABASE_URL. Supply the
  // expected endpoint only after independently verifying the exact approved ref.
  validateTestApiEnvironment({ ...testEnv, RADIXMINDS_TEST_SUPABASE_URL: testEnv.SUPABASE_URL })
} catch {
  console.error('Blocked: .env.test.local is missing or does not target the approved isolated TEST project.')
  process.exit(2)
}

const linkedRefPath = resolve(process.cwd(), 'supabase/.temp/project-ref')
try {
  if (readFileSync(linkedRefPath, 'utf8').trim() !== testProjectRef) throw new Error('LINKED_PROJECT_MISMATCH')
} catch {
  console.error('Blocked: the local Supabase project link does not match the approved TEST project.')
  process.exit(2)
}

const env = createIsolatedTestChildEnv(testEnv, envPath)
console.log(`Verified isolated TEST Supabase project ref ${testProjectRef}; starting disposable store test.`)
const result = spawnSync(process.execPath, ['--import', 'tsx', workerPath], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  windowsHide: true,
})

if (result.error) {
  console.error('Could not start the isolated draft-store integration test.')
  process.exit(2)
}
process.exit(result.status ?? 1)
