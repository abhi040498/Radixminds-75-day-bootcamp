import assert from 'node:assert/strict'
import test from 'node:test'
import { enrolmentSessionCookieName, isSameOriginCookieRequest, readCookieValue } from '../src/enrolmentSession.js'

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
