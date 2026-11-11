import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function invokeNetlifyRequests(requests, extraEnv = {}) {
  const functionUrl = pathToFileURL(resolve('netlify/functions/api.ts')).href
  const source = `
    const { handler } = await import(${JSON.stringify(functionUrl)});
    const responses = [];
    for (const request of ${JSON.stringify(requests)}) {
      const response = await handler({
      httpMethod: request.method || 'POST', path: request.path || '/api/v1/enrolments',
        headers: {
          origin: request.origin || 'https://example-test-project.netlify.app',
          'sec-fetch-site': 'same-origin', 'content-type': 'application/json',
          ...(request.requestMethod ? { 'access-control-request-method': request.requestMethod } : {}),
          ...(request.requestHeaders ? { 'access-control-request-headers': request.requestHeaders } : {}),
          'x-forwarded-for': request.forwardedFor
        },
        body: '{}', isBase64Encoded: false,
        requestContext: { identity: request.eventIp ? { sourceIp: request.eventIp } : {} }
      }, request.contextIp ? { ip: request.contextIp } : {});
      responses.push(request.method === 'OPTIONS' ? { statusCode: response.statusCode, headers: response.headers } : response.statusCode);
    }
    console.log(JSON.stringify(responses));
  `
  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      DOTENV_CONFIG_PATH: 'nonexistent-test-env-file',
      NODE_ENV: 'test',
      APP_ORIGIN: 'https://example-test-project.netlify.app',
      ...extraEnv,
      PAYMENT_ENABLED: 'false',
      POLICIES_APPROVED: 'false',
      RAZORPAY_MODE: 'test',
    },
  })
}

test('Netlify function allows credentialed preflight from the validated unique preview origin', () => {
  const origin = 'https://6af4368b34953cd07626929a--radixminds75daysbootcamp.netlify.app'
  const result = invokeNetlifyRequests([{ method: 'OPTIONS', path: '/api/v1/enrolments', origin, requestMethod: 'POST', requestHeaders: 'content-type,idempotency-key' }], {
    APP_ORIGIN: 'https://deploy-preview-1--radixminds75daysbootcamp.netlify.app',
    APPROVED_NETLIFY_CONTEXT: 'deploy-preview',
    SITE_NAME: 'radixminds75daysbootcamp',
  })
  assert.equal(result.status, 0, result.stderr)
  const response = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1))[0]
  assert.equal(response.statusCode, 204, JSON.stringify(response))
  assert.equal(response.headers['access-control-allow-origin'], origin)
  assert.equal(response.headers['access-control-allow-credentials'], 'true')
  assert.match(response.headers['access-control-allow-headers'], /content-type/i)
})

test('unapproved origin receives no credentialed CORS permission', () => {
  const result = invokeNetlifyRequests([{ method: 'OPTIONS', path: '/api/v1/enrolments', origin: 'https://other-site.netlify.app', requestMethod: 'POST' }], {
    APP_ORIGIN: 'https://deploy-preview-1--radixminds75daysbootcamp.netlify.app',
    APPROVED_NETLIFY_CONTEXT: 'deploy-preview',
    SITE_NAME: 'radixminds75daysbootcamp',
  })
  assert.equal(result.status, 0, result.stderr)
  const response = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1))[0]
  assert.equal(response.headers['access-control-allow-origin'], undefined)
  assert.equal(response.headers['access-control-allow-credentials'], undefined)
})

test('Netlify rate limiting uses trusted client IP and ignores spoofed X-Forwarded-For', () => {
  const requests = Array.from({ length: 31 }, (_, index) => ({
    contextIp: '198.51.100.10',
    forwardedFor: `203.0.113.${(index % 200) + 1}`,
  }))
  requests.push({ contextIp: '198.51.100.11', forwardedFor: '203.0.113.250' })
  const result = invokeNetlifyRequests(requests)
  assert.equal(result.status, 0, result.stderr)
  const statuses = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1))
  assert.deepEqual(statuses.slice(0, 30), Array(30).fill(503), 'valid client requests should pass through rate limiting to the closed policy gate')
  assert.equal(statuses[30], 429, 'the 31st request from the same Netlify IP must be rate limited')
  assert.equal(statuses[31], 503, 'a different trusted Netlify IP must have an independent bucket')
})

test('missing Netlify source IP fails into a shared safe bucket without a TypeError', () => {
  const result = invokeNetlifyRequests([{ forwardedFor: '203.0.113.77' }])
  assert.equal(result.status, 0, result.stderr)
  const statuses = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1))
  assert.deepEqual(statuses, [503], 'missing platform IP must not crash or use client-supplied X-Forwarded-For')
  assert.doesNotMatch(result.stderr, /ERR_INVALID_ARG_TYPE|ERR_ERL_UNDEFINED_IP_ADDRESS|ERR_ERL_UNEXPECTED_X_FORWARDED_FOR/)
})
