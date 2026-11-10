import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const configUrl = pathToFileURL(resolve('server/src/config.ts')).href

function inspectConfiguration(webhookSecret, functionRuntime = false, razorpayMode = 'test') {
  const directory = mkdtempSync(join(os.tmpdir(), 'radixminds-config-test-'))
  try {
    const securityUrl = pathToFileURL(resolve('server/src/security.ts')).href
    const source = `import { checkoutBaseReady, hasValidRazorpayWebhookSecret, config } from ${JSON.stringify(configUrl)}; import { validateRazorpayKeyMode } from ${JSON.stringify(securityUrl)}; console.log(JSON.stringify({ checkoutReady: checkoutBaseReady && validateRazorpayKeyMode(), hasValidRazorpayWebhookSecret, razorpayMode: config.RAZORPAY_MODE }))`
    const env = {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      DOTENV_CONFIG_PATH: join(directory, 'does-not-exist'),
      NODE_ENV: 'test',
      APP_ORIGIN: 'https://example-test-project.netlify.app',
      SUPABASE_URL: 'https://example-test-project.supabase.co',
      SUPABASE_SECRET_KEY: 'synthetic-database-secret-fixture',
      RAZORPAY_KEY_ID: 'rzp_test_syntheticfixture',
      RAZORPAY_KEY_SECRET: 'synthetic-razorpay-secret-fixture',
      STATUS_TOKEN_SECRET: 'synthetic-status-token-secret-fixture-long-enough',
      PAYMENT_ENABLED: 'true',
      POLICIES_APPROVED: 'true',
      ...(razorpayMode === null ? {} : { RAZORPAY_MODE: razorpayMode }),
      ...(webhookSecret === undefined ? {} : { RAZORPAY_WEBHOOK_SECRET: webhookSecret }),
      ...(functionRuntime ? { AWS_LAMBDA_FUNCTION_NAME: 'synthetic-function-test' } : {}),
    }
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env,
    })
    if (result.status !== 0) return { status: result.status, config: null, logs: `${result.stdout}${result.stderr}` }
    const output = result.stdout.trim().split(/\r?\n/).at(-1)
    return { status: result.status, config: JSON.parse(output), logs: result.stdout }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('missing, empty, whitespace-only and short webhook secrets keep checkout closed', () => {
  for (const [label, secret] of [
    ['missing', undefined],
    ['empty', ''],
    ['whitespace-only', '   \t  '],
    ['shorter than 24 characters', 'x'.repeat(23)],
  ]) {
    assert.deepEqual(inspectConfiguration(secret).config, {
      checkoutReady: false,
      hasValidRazorpayWebhookSecret: false,
      razorpayMode: 'test',
    }, `${label} secret must not enable checkout`)
  }
})

test('exactly 24 and longer webhook secrets pass readiness when every other synthetic gate is enabled', () => {
  for (const [label, secret] of [
    ['exactly 24 characters', 'x'.repeat(24)],
    ['longer valid secret', 'x'.repeat(64)],
  ]) {
    assert.deepEqual(inspectConfiguration(secret).config, {
      checkoutReady: true,
      hasValidRazorpayWebhookSecret: true,
      razorpayMode: 'test',
    }, `${label} should pass the webhook configuration check`)
  }
})

test('invalid webhook configuration returns 503 before signature verification', () => {
  const directory = mkdtempSync(join(os.tmpdir(), 'radixminds-webhook-route-test-'))
  try {
    const functionUrl = pathToFileURL(resolve('netlify/functions/api.ts')).href
    const source = `import { handler } from ${JSON.stringify(functionUrl)}; const response = await handler({ httpMethod: 'POST', path: '/api/v1/webhooks/razorpay', headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'invalid' }, body: 'not-json', isBase64Encoded: false, requestContext: { identity: { sourceIp: '127.0.0.1' } } }, {}); console.log(JSON.stringify({ statusCode: response.statusCode, body: response.body }))`
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        DOTENV_CONFIG_PATH: join(directory, 'does-not-exist'),
        NODE_ENV: 'test',
        APP_ORIGIN: 'https://example-test-project.netlify.app',
        SUPABASE_URL: 'https://example-test-project.supabase.co',
        SUPABASE_SECRET_KEY: 'synthetic-database-secret-fixture',
        RAZORPAY_KEY_ID: 'rzp_test_syntheticfixture',
        RAZORPAY_KEY_SECRET: 'synthetic-razorpay-secret-fixture',
        STATUS_TOKEN_SECRET: 'synthetic-status-token-secret-fixture-long-enough',
        PAYMENT_ENABLED: 'true',
        POLICIES_APPROVED: 'true',
        RAZORPAY_MODE: 'test',
        RAZORPAY_WEBHOOK_SECRET: '   ',
      },
    })
    assert.equal(result.status, 0, 'the isolated function request should complete')
    const output = result.stdout.trim().split(/\r?\n/).at(-1)
    assert.equal(JSON.parse(output).statusCode, 503, 'invalid configuration must be rejected before the invalid signature/body reaches the webhook handler')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('function startup diagnostic reports only presence, length and threshold result', () => {
  const secretFixture = 'synthetic-private-value-not-for-logs'
  const result = inspectConfiguration(secretFixture, true)
  assert.match(result.logs, /exists: true/)
  assert.match(result.logs, /characterLength: 36/)
  assert.match(result.logs, /meetsMinimumLength: true/)
  assert.equal(result.logs.includes(secretFixture), false)
})

test('Razorpay mode accepts test/live after trimming surrounding whitespace', () => {
  for (const mode of ['test', 'live', '  test \t', '\n live  ']) {
    const result = inspectConfiguration('x'.repeat(24), false, mode)
    assert.equal(result.status, 0, `mode with valid surrounding whitespace should parse`)
    assert.equal(result.config.razorpayMode, mode.trim() || mode)
    assert.equal(result.config.checkoutReady, mode.trim() === 'test', 'the synthetic test key is usable only in Test Mode')
  }
})

test('missing, empty and whitespace-only Razorpay mode use the existing safe test-mode default', () => {
  for (const mode of [null, '', '   \t ']) {
    const result = inspectConfiguration('x'.repeat(24), false, mode)
    assert.equal(result.status, 0)
    assert.equal(result.config.razorpayMode, 'test')
    assert.equal(result.config.checkoutReady, true)
  }
})

test('arbitrary Razorpay modes are rejected rather than coerced to test', () => {
  for (const mode of ['staging', 'TEST', 'production', 'test-live']) {
    const result = inspectConfiguration('x'.repeat(24), false, mode)
    assert.notEqual(result.status, 0, `invalid mode ${JSON.stringify(mode)} must fail configuration validation`)
    assert.equal(result.config, null)
  }
})
