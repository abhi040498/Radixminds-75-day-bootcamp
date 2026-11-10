import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import {
  APPROVED_TEST_PROJECT_URL,
  createIsolatedTestChildEnv,
  isApprovedTestProjectUrl,
  validateTestApiEnvironment,
} from './test-api-env.mjs'

const validEnv = {
  SUPABASE_URL: APPROVED_TEST_PROJECT_URL,
  SUPABASE_PUBLIC_KEY: 'test-public-key-fixture',
  SUPABASE_SECRET_KEY: 'test-secret-key-fixture',
  STATUS_TOKEN_SECRET: 'test-only-random-status-token-secret-fixture',
  PAYMENT_ENABLED: 'true',
  POLICIES_APPROVED: 'true',
  RAZORPAY_MODE: 'live',
  RAZORPAY_KEY_ID: 'production-key-fixture',
  RAZORPAY_KEY_SECRET: 'production-secret-fixture',
  RAZORPAY_WEBHOOK_SECRET: 'production-webhook-fixture',
}
const require = createRequire(import.meta.url)

test('accepts only the exact approved HTTPS test URL', () => {
  assert.equal(isApprovedTestProjectUrl(APPROVED_TEST_PROJECT_URL), true)
  assert.doesNotThrow(() => validateTestApiEnvironment(validEnv))
})

for (const [label, url] of [
  ['production URL', 'https://orkuiauxjlfexmntndim.supabase.co'],
  ['HTTP URL', 'http://oohcwibhjmzrrpuxonck.supabase.co'],
  ['wrong hostname', 'https://other-project.supabase.co'],
  ['embedded credentials', 'https://user:password@oohcwibhjmzrrpuxonck.supabase.co'],
  ['unexpected port', 'https://oohcwibhjmzrrpuxonck.supabase.co:8443'],
  ['URL path', 'https://oohcwibhjmzrrpuxonck.supabase.co/rest/v1'],
  ['query string', 'https://oohcwibhjmzrrpuxonck.supabase.co?apikey=fixture'],
  ['fragment', 'https://oohcwibhjmzrrpuxonck.supabase.co#fragment'],
]) {
  test(`rejects ${label}`, () => {
    assert.equal(isApprovedTestProjectUrl(url), false)
    assert.throws(() => validateTestApiEnvironment({ ...validEnv, SUPABASE_URL: url }))
  })
}

test('forces both gates off and removes inherited production credentials', () => {
  const parentEnv = {
    PATH: 'fixture-path',
    SUPABASE_URL: 'https://orkuiauxjlfexmntndim.supabase.co',
    SUPABASE_PUBLIC_KEY: 'production-public-fixture',
    SUPABASE_SECRET_KEY: 'production-secret-fixture',
    SUPABASE_SERVICE_ROLE_KEY: 'production-service-fixture',
    STATUS_TOKEN_SECRET: 'production-status-fixture',
    PAYMENT_ENABLED: 'true',
    POLICIES_APPROVED: 'true',
    RAZORPAY_MODE: 'live',
    RAZORPAY_KEY_ID: 'production-key-fixture',
    RAZORPAY_KEY_SECRET: 'production-secret-fixture',
    RAZORPAY_WEBHOOK_SECRET: 'production-webhook-fixture',
    DOTENV_CONFIG_PATH: resolve('.env'),
    NODE_OPTIONS: '--require production-preload-fixture',
  }
  const child = createIsolatedTestChildEnv(validEnv, resolve('.env.test.local'), parentEnv)

  assert.equal(child.SUPABASE_URL, APPROVED_TEST_PROJECT_URL)
  assert.equal(child.SUPABASE_PUBLIC_KEY, validEnv.SUPABASE_PUBLIC_KEY)
  assert.equal(child.SUPABASE_SECRET_KEY, validEnv.SUPABASE_SECRET_KEY)
  assert.equal(child.SUPABASE_SERVICE_ROLE_KEY, '')
  assert.equal(child.PAYMENT_ENABLED, 'false')
  assert.equal(child.POLICIES_APPROVED, 'false')
  assert.equal(child.RAZORPAY_MODE, 'test')
  assert.equal(child.RAZORPAY_KEY_ID, '')
  assert.equal(child.RAZORPAY_KEY_SECRET, '')
  assert.equal(child.RAZORPAY_WEBHOOK_SECRET, '')
  assert.equal(child.DOTENV_CONFIG_PATH, resolve('.env.test.local'))
  assert.equal('NODE_OPTIONS' in child, false)
  assert.equal(Object.values(child).some(value => String(value).includes('production-')), false)
})

test('dotenv in the child loads the explicit test file and ignores a sibling .env', () => {
  const directory = mkdtempSync(join(os.tmpdir(), 'radixminds-test-env-'))
  try {
    const regularEnvPath = join(directory, '.env')
    const testEnvPath = join(directory, '.env.test.local')
    writeFileSync(regularEnvPath, 'ROOT_ENV_SENTINEL=must-not-load\n')
    writeFileSync(testEnvPath, 'TEST_ENV_SENTINEL=loaded-from-test-file\n')
    const dotenvConfigPath = pathToFileURL(require.resolve('dotenv/config')).href
    const source = `import ${JSON.stringify(dotenvConfigPath)}; process.stdout.write(JSON.stringify({ root: process.env.ROOT_ENV_SENTINEL ?? null, test: process.env.TEST_ENV_SENTINEL ?? null }))`
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
      cwd: directory,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, DOTENV_CONFIG_PATH: testEnvPath },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), { root: null, test: 'loaded-from-test-file' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
