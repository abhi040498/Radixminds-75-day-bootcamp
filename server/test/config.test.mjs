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

function inspectApprovedNetlifyContext({ present = true, value, netlifyRuntime = false } = {}) {
  const directory = mkdtempSync(join(os.tmpdir(), 'radixminds-netlify-context-test-'))
  try {
    const source = `import { config } from ${JSON.stringify(configUrl)}; console.log(JSON.stringify({ approvedNetlifyContext: config.APPROVED_NETLIFY_CONTEXT }))`
    const env = {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      DOTENV_CONFIG_PATH: join(directory, 'does-not-exist'),
      NODE_ENV: 'test',
      CONTEXT: 'deploy-preview',
      SITE_NAME: 'rm75daysbootcamp',
      ...(present ? { APPROVED_NETLIFY_CONTEXT: value } : {}),
      ...(netlifyRuntime ? { NETLIFY: 'true' } : {}),
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

function inspectAppOrigin(appOrigin) {
  const directory = mkdtempSync(join(os.tmpdir(), 'radixminds-origin-test-'))
  try {
    const source = `import { config } from ${JSON.stringify(configUrl)}; console.log(JSON.stringify({ appOrigin: config.APP_ORIGIN }))`
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, DOTENV_CONFIG_PATH: join(directory, 'does-not-exist'), NODE_ENV: 'test', APP_ORIGIN: appOrigin },
    })
    const output = result.stdout.trim().split(/\r?\n/).at(-1)
    return { status: result.status, appOrigin: result.status === 0 ? JSON.parse(output).appOrigin : null }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('APP_ORIGIN canonicalizes a trailing slash and rejects paths, query strings and fragments', () => {
  const preview = 'https://deploy-preview-1--radixminds75daysbootcamp.netlify.app'
  assert.deepEqual(inspectAppOrigin(`${preview}/`), { status: 0, appOrigin: preview })
  for (const invalid of [`${preview}/api`, `${preview}/?x=1`, `${preview}/#section`, 'https://user:pass@example.invalid']) {
    assert.notEqual(inspectAppOrigin(invalid).status, 0, 'APP_ORIGIN must be an origin, not a URL path or credentialed URL')
  }
})

test('APPROVED_NETLIFY_CONTEXT accepts absence and normalizes only empty strings', () => {
  for (const [label, options] of [
    ['absent', { present: false }],
    ['empty', { value: '' }],
    ['whitespace-only', { value: ' \t  ' }],
  ]) {
    const result = inspectApprovedNetlifyContext(options)
    assert.equal(result.status, 0, `${label} context should allow configuration startup: ${result.logs}`)
    assert.equal(result.config.approvedNetlifyContext, undefined, `${label} context should normalize to undefined`)
  }
})

test('APPROVED_NETLIFY_CONTEXT accepts only the exact deploy-preview marker', () => {
  const accepted = inspectApprovedNetlifyContext({ value: 'deploy-preview' })
  assert.equal(accepted.status, 0, accepted.logs)
  assert.equal(accepted.config.approvedNetlifyContext, 'deploy-preview')

  for (const value of ['false', 'true', 'production', 'other-context']) {
    const rejected = inspectApprovedNetlifyContext({ value })
    assert.notEqual(rejected.status, 0, `${value} must remain invalid`)
  }
})

test('Netlify startup diagnostic logs only context metadata and approved-marker state', () => {
  for (const [value, expectedState] of [
    [undefined, 'unset'],
    ['', 'empty'],
    [' \t ', 'empty'],
    ['deploy-preview', 'deploy-preview'],
    ['production', 'unexpected'],
  ]) {
    const result = inspectApprovedNetlifyContext({ present: value !== undefined, value, netlifyRuntime: true })
    const diagnosticLine = result.logs.split(/\r?\n/).find(line => line.includes('[config] Netlify origin context'))
    assert.ok(diagnosticLine, 'Netlify function startup should emit the diagnostic')
    const diagnostic = JSON.parse(diagnosticLine.slice(diagnosticLine.indexOf('{')))
    assert.deepEqual(Object.keys(diagnostic).sort(), ['APPROVED_NETLIFY_CONTEXT', 'CONTEXT', 'SITE_NAME'])
    assert.equal(diagnostic.CONTEXT, 'deploy-preview')
    assert.equal(diagnostic.SITE_NAME, 'rm75daysbootcamp')
    assert.equal(diagnostic.APPROVED_NETLIFY_CONTEXT, expectedState)
    if (value === 'production') assert.equal(diagnosticLine.includes('production'), false, 'unexpected raw marker must not be logged')
  }
})

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
    const source = `import handler from ${JSON.stringify(functionUrl)}; const response = await handler(new Request('https://bootcamp.radixminds.in/api/v1/webhooks/razorpay', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'invalid' }, body: 'not-json' }), { ip: '127.0.0.1' }); console.log(JSON.stringify({ statusCode: response.status, body: await response.text() }))`
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
        APP_ORIGIN: 'https://bootcamp.radixminds.in',
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

test('enrolment submission fails closed before database access when the status-token secret is missing', () => {
  const directory = mkdtempSync(join(os.tmpdir(), 'radixminds-enrolment-secret-test-'))
  try {
    const functionUrl = pathToFileURL(resolve('netlify/functions/api.ts')).href
    const source = `
      let fetchCalls = 0;
      globalThis.fetch = async (input) => {
        fetchCalls++;
        const url = new URL(typeof input === 'string' ? input : input.url);
        if (url.pathname !== '/rest/v1/programs') throw new Error('Unexpected synthetic database request');
        return Response.json([{
          id: '00000000-0000-4000-8000-000000000010', code: 'class-10', name: 'Synthetic Class 10',
          duration_days: 75, subjects: ['Mathematics','Science','Social Science','English'],
          program_fee_paise: 249900, standard_fee_paise: null, discount_percent: null,
          offer_valid_until: null, currency: 'INR', is_active: true, enrolment_open: true,
          program_learning_modes: [{ mode: 'online', label: 'Online', is_available: true, batch_label: null }]
        }]);
      };
      const handlerModule = await import(${JSON.stringify(functionUrl)});
      const response = await handlerModule.default(new Request('https://bootcamp.radixminds.in/api/v1/enrolments', {
        method: 'POST',
        headers: {
          origin: 'https://bootcamp.radixminds.in',
          'sec-fetch-site': 'same-origin', 'content-type': 'application/json',
          'idempotency-key': '00000000-0000-4000-8000-000000000099'
        },
        body: JSON.stringify({
          programCode: 'class-10', fullName: 'Synthetic Fixture Student', mobile: '9876543210',
          email: 'fixture@example.invalid', dateOfBirth: '', board: 'CBSE', schoolName: 'Synthetic School',
          preferredLanguage: 'English', subjectChoice: null, learningMode: 'online',
          whatsappUpdatesConsent: false, whatsappMobile: '', policyAcknowledged: true,
          policyVersions: { terms: '2026-11-10', privacy: '2026-11-10', refund: '2026-11-10' }
        }),
      }), { ip: '127.0.0.1' });
      console.log(JSON.stringify({ statusCode: response.status, body: await response.text(), fetchCalls }));
    `
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
        APP_ORIGIN: 'https://bootcamp.radixminds.in',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_SECRET_KEY: 'synthetic-database-secret-fixture',
        RAZORPAY_KEY_ID: 'rzp_test_syntheticfixture',
        RAZORPAY_KEY_SECRET: 'synthetic-razorpay-secret-fixture',
        PAYMENT_ENABLED: 'true',
        POLICIES_APPROVED: 'true',
        RAZORPAY_MODE: 'test',
      },
    })
    assert.equal(result.status, 0, 'the isolated function request should complete')
    const output = result.stdout.trim().split(/\r?\n/).at(-1)
    const response = JSON.parse(output)
    assert.equal(response.statusCode, 503, 'missing status-token configuration must not become an unhandled 500')
    assert.equal(JSON.parse(response.body).error.code, 'REGISTRATION_NOT_CONFIGURED')
    assert.equal(response.fetchCalls, 0, 'the request must fail before any Supabase operation')
    assert.equal(response.body.includes('Synthetic Fixture Student'), false)
    assert.equal(response.body.includes('fixture@example.invalid'), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('enrolment RPC errors log only sanitized diagnostics and preserve the safe 503 response', () => {
  const directory = mkdtempSync(join(os.tmpdir(), 'radixminds-enrolment-rpc-log-test-'))
  try {
    const functionUrl = pathToFileURL(resolve('netlify/functions/api.ts')).href
    const source = `
      let diagnostic = null;
      let fetchCalls = 0;
      console.error = (event, fields) => { if (event === 'api_enrolment_rpc_error') diagnostic = fields; };
      globalThis.fetch = async (input) => {
        fetchCalls++;
        const url = new URL(typeof input === 'string' ? input : input.url);
        if (url.pathname === '/rest/v1/programs') return Response.json([{
          id: '00000000-0000-4000-8000-000000000010', code: 'class-10', name: 'Synthetic Class 10',
          duration_days: 75, subjects: ['Mathematics','Science','Social Science','English'],
          program_fee_paise: 249900, standard_fee_paise: null, discount_percent: null,
          offer_valid_until: null, currency: 'INR', is_active: true, enrolment_open: true,
          program_learning_modes: [{ mode: 'online', label: 'Online', is_available: true, batch_label: null }]
        }]);
        if (url.pathname === '/rest/v1/rpc/create_pending_enrolment') return Response.json({
          code: 'P0001 CODE_CANARY', name: 'PostgrestError', message: 'SUPABASE_MESSAGE_CANARY',
          details: 'SUPABASE_DETAILS_CANARY', hint: 'SUPABASE_HINT_CANARY',
          query: 'SELECT_SQL_CANARY', token: 'TOKEN_CANARY'
        }, { status: 400 });
        throw new Error('Unexpected synthetic fetch path');
      };
      const handlerModule = await import(${JSON.stringify(functionUrl)});
      const response = await handlerModule.default(new Request('https://bootcamp.radixminds.in/api/v1/enrolments', {
        method: 'POST', headers: {
          origin: 'https://bootcamp.radixminds.in',
          'sec-fetch-site': 'same-origin', 'content-type': 'application/json',
          'idempotency-key': '00000000-0000-4000-8000-000000000099'
        },
        body: JSON.stringify({
          programCode: 'class-10', fullName: 'STUDENT_DATA_CANARY', mobile: '9876543210',
          email: 'EMAIL_DATA_CANARY@example.invalid', dateOfBirth: '', board: 'CBSE', schoolName: 'SCHOOL_DATA_CANARY',
          preferredLanguage: 'English', subjectChoice: null, learningMode: 'online',
          whatsappUpdatesConsent: false, whatsappMobile: '', policyAcknowledged: true,
          policyVersions: { terms: '2026-11-10', privacy: '2026-11-10', refund: '2026-11-10' }
        }),
      }), { ip: '127.0.0.1' });
      console.log(JSON.stringify({ statusCode: response.status, body: await response.text(), diagnostic, fetchCalls }));
    `
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
        APP_ORIGIN: 'https://bootcamp.radixminds.in',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_SECRET_KEY: 'synthetic-database-secret-fixture',
        RAZORPAY_KEY_ID: 'rzp_test_syntheticfixture',
        RAZORPAY_KEY_SECRET: 'synthetic-razorpay-secret-fixture',
        RAZORPAY_WEBHOOK_SECRET: 'synthetic-webhook-secret-fixture-long-enough',
        STATUS_TOKEN_SECRET: 'synthetic-status-token-secret-fixture-long-enough',
        PAYMENT_ENABLED: 'true',
        POLICIES_APPROVED: 'true',
        RAZORPAY_MODE: 'test',
      },
    })
    assert.equal(result.status, 0, 'the isolated function request should complete')
    const combinedLogs = `${result.stdout}${result.stderr}`
    const output = result.stdout.trim().split(/\r?\n/).at(-1)
    const resultJson = JSON.parse(output)
    const body = JSON.parse(resultJson.body)
    assert.equal(resultJson.statusCode, 503)
    assert.equal(body.error.code, 'REGISTRATION_SAVE_FAILED')
    assert.equal(resultJson.fetchCalls, 2, 'the test should reach the mocked program read and enrolment RPC only')
    assert.deepEqual(Object.keys(resultJson.diagnostic).sort(), ['httpStatus', 'operation', 'requestId', 'supabaseErrorCode', 'supabaseErrorName'].sort())
    assert.match(resultJson.diagnostic.requestId, /^[0-9a-f-]{36}$/i)
    assert.equal(resultJson.diagnostic.operation, 'create_pending_enrolment')
    assert.equal(resultJson.diagnostic.supabaseErrorCode, 'unknown', 'malformed provider codes must be sanitized')
    assert.match(resultJson.diagnostic.supabaseErrorName, /^(?:[A-Za-z][A-Za-z0-9]{0,39}|unknown)$/)
    assert.equal(resultJson.diagnostic.httpStatus, 503)
    assert.equal(body.error.requestId, resultJson.diagnostic.requestId)
    for (const canary of [
      'SUPABASE_MESSAGE_CANARY', 'SUPABASE_DETAILS_CANARY', 'SUPABASE_HINT_CANARY',
      'SELECT_SQL_CANARY', 'TOKEN_CANARY', 'CODE_CANARY', 'STUDENT_DATA_CANARY', 'EMAIL_DATA_CANARY', 'SCHOOL_DATA_CANARY',
    ]) assert.equal(combinedLogs.includes(canary), false, `${canary} must not be logged or returned`)
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
