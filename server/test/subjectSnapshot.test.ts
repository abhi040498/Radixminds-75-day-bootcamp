import assert from 'node:assert/strict'
import test from 'node:test'
import { formatSubjectSnapshot } from '../../src/lib/subjectSnapshot.js'

test('formats Class 10 array subject snapshots', () => {
  assert.equal(
    formatSubjectSnapshot(['Mathematics', 'Science', 'Social Science', 'English']),
    'Mathematics · Science · Social Science · English',
  )
})

test('formats Class 12 shared and choice-based JSONB subject snapshots', () => {
  assert.equal(
    formatSubjectSnapshot({ shared: ['Physics', 'Chemistry'], choice: ['Mathematics', 'Biology'] }),
    'Physics · Chemistry · Choose one: Mathematics / Biology',
  )
})

test('formats a selected Class 12 JSONB subject string', () => {
  assert.equal(
    formatSubjectSnapshot({ shared: ['Physics', 'Chemistry'], choice: 'Biology' }),
    'Physics · Chemistry · Biology',
  )
})

test('safely handles null, missing and malformed snapshots', () => {
  for (const snapshot of [null, undefined, {}, { shared: [null, 3] }, 42, 'Science', [null, {}, ' English ']]) {
    assert.doesNotThrow(() => formatSubjectSnapshot(snapshot))
  }
  assert.equal(formatSubjectSnapshot(null), 'Subject details unavailable')
  assert.equal(formatSubjectSnapshot({ shared: [null, 3] }), 'Subject details unavailable')
  assert.equal(formatSubjectSnapshot([null, {}, ' English ']), 'English')
})
