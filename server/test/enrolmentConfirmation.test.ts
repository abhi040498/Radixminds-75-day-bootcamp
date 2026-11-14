import assert from 'node:assert/strict'
import test from 'node:test'
import { visibleEnrolmentReference } from '../../src/lib/enrolmentConfirmation.js'

test('confirmation fallback displays the saved admission reference if status lookup is unavailable', () => {
  assert.equal(visibleEnrolmentReference(null, 'RM-0123456789ABCDEF0123'), 'RM-0123456789ABCDEF0123')
})

test('confirmation prefers the verified API reference over the saved reference', () => {
  assert.equal(visibleEnrolmentReference('RM-AAAAAAAAAAAAAAAAAAAA', 'RM-BBBBBBBBBBBBBBBBBBBB'), 'RM-AAAAAAAAAAAAAAAAAAAA')
})

test('confirmation ignores malformed and non-string references', () => {
  assert.equal(visibleEnrolmentReference(null, 'PGCT-test-fixture'), null)
  assert.equal(visibleEnrolmentReference(42, null), null)
})
