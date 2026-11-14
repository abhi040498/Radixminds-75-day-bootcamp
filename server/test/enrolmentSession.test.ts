import assert from 'node:assert/strict'
import test from 'node:test'
import { enrolmentSessionCookieName, isSameOriginCookieRequest, isSecureCookieOrigin, readCookieValue } from '../src/enrolmentSession.js'

test('admin cookie Secure follows the configured HTTPS production and Deploy Preview origins', () => {
  assert.equal(isSecureCookieOrigin('https://bootcamp.radixminds.in', true), true)
  assert.equal(isSecureCookieOrigin('https://deploy-preview-1--radixminds75daysbootcamp.netlify.app', true), true)
})

test('only local HTTP development may issue an admin cookie without Secure', () => {
  assert.equal(isSecureCookieOrigin('http://localhost:5173', false), false)
  assert.equal(isSecureCookieOrigin('http://127.0.0.1:5173', false), false)
  assert.equal(isSecureCookieOrigin('http://localhost:5173', true), true)
})

test('missing or invalid origin configuration fails closed with Secure enabled', () => {
  assert.equal(isSecureCookieOrigin(undefined, false), true)
  assert.equal(isSecureCookieOrigin('not a URL', false), true)
  assert.equal(isSecureCookieOrigin('http://attacker.example', false), true)
  assert.equal(isSecureCookieOrigin('http://localhost:5173/path', false), true)
})

test('enrolment session cookies are scoped by a validated public reference', () => {
  assert.equal(enrolmentSessionCookieName('RM-0123456789ABCDEF0123'), 'rm_enrolment_RM-0123456789ABCDEF0123')
  assert.equal(enrolmentSessionCookieName('PGCT-test-fixture'), null)
})

test('cookie parser reads only the requested reference-scoped cookie and safely rejects malformed encoding', () => {
  const header = 'other=value; rm_enrolment_RM-0123456789ABCDEF0123=opaque%2Dtoken'
  assert.equal(readCookieValue(header, 'rm_enrolment_RM-0123456789ABCDEF0123'), 'opaque-token')
  assert.equal(readCookieValue(header, 'rm_enrolment_RM-AAAAAAAAAAAAAAAAAAAA'), '')
  assert.equal(readCookieValue('rm_enrolment_RM-0123456789ABCDEF0123=%E0%A4%A', 'rm_enrolment_RM-0123456789ABCDEF0123'), '')
})

test('state-reconciling status GETs require same-origin Origin or Fetch Metadata', () => {
  const appOrigin = 'https://deploy-preview-1--example.netlify.app'
  assert.equal(isSameOriginCookieRequest(appOrigin, 'same-origin', appOrigin), true)
  assert.equal(isSameOriginCookieRequest(undefined, 'same-origin', appOrigin), true)
  assert.equal(isSameOriginCookieRequest(`${appOrigin}/`, 'same-origin', appOrigin), false)
  assert.equal(isSameOriginCookieRequest('https://attacker.invalid', 'cross-site', appOrigin), false)
  assert.equal(isSameOriginCookieRequest('https://sibling.example.netlify.app', 'same-site', appOrigin), false)
  assert.equal(isSameOriginCookieRequest(undefined, undefined, appOrigin), false)
})
