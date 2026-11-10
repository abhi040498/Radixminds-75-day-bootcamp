import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveEnrolmentProgramSelection, type EnrolmentProgram } from '../src/enrolmentProgramSelection.js'

const class10: EnrolmentProgram = {
  code: 'class-10', is_active: true, enrolment_open: true,
  program_learning_modes: [
    { mode: 'online', label: 'Online — Live Interactive Classes', is_available: true },
    { mode: 'hybrid', label: 'Hybrid — Flexible Online + Classroom Learning', is_available: true },
    { mode: 'offline', label: 'Offline — Classroom Training', is_available: true },
  ],
}

test('rejects a missing or mismatched program before enrolment creation', () => {
  assert.deepEqual(resolveEnrolmentProgramSelection('class-10', null), { ok: false, code: 'PROGRAM_NOT_FOUND' })
  assert.deepEqual(resolveEnrolmentProgramSelection('class-12', class10), { ok: false, code: 'PROGRAM_NOT_FOUND' })
})

test('rejects inactive or closed programs', () => {
  assert.deepEqual(resolveEnrolmentProgramSelection('class-10', { ...class10, is_active: false }), { ok: false, code: 'ENROLMENT_CLOSED' })
  assert.deepEqual(resolveEnrolmentProgramSelection('class-10', { ...class10, enrolment_open: false }), { ok: false, code: 'ENROLMENT_CLOSED' })
})

test('only database-configured available learning modes are selectable', () => {
  const onlineOnly = { ...class10, program_learning_modes: [{ mode: 'online', label: 'Online', is_available: true }, { mode: 'hybrid', label: 'Hybrid', is_available: false }] }
  assert.deepEqual(resolveEnrolmentProgramSelection('class-10', onlineOnly, 'hybrid'), { ok: false, code: 'LEARNING_MODE_UNAVAILABLE' })
  assert.deepEqual(resolveEnrolmentProgramSelection('class-10', { ...class10, program_learning_modes: [] }, 'online'), { ok: false, code: 'LEARNING_MODES_NOT_CONFIGURED' })
  const selected = resolveEnrolmentProgramSelection('class-10', class10, 'hybrid')
  assert.equal(selected.ok, true)
  if (selected.ok) assert.equal(selected.selectedMode?.mode, 'hybrid')
})
