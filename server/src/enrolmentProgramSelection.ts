export type ProgramLearningMode = {
  mode: string
  label: string
  is_available: boolean
  batch_label?: string | null
}

export type EnrolmentProgram = {
  code: string
  is_active: boolean
  enrolment_open: boolean
  program_learning_modes: ProgramLearningMode[] | null
}

export type ProgramSelectionErrorCode = 'PROGRAM_NOT_FOUND' | 'ENROLMENT_CLOSED' | 'LEARNING_MODES_NOT_CONFIGURED' | 'LEARNING_MODE_UNAVAILABLE'

export type ProgramSelectionResult =
  | { ok: true; availableModes: ProgramLearningMode[]; selectedMode: ProgramLearningMode | null }
  | { ok: false; code: ProgramSelectionErrorCode }

/** Pure policy used after the program row is loaded; availability remains database-backed. */
export function resolveEnrolmentProgramSelection(
  requestedProgramCode: string,
  program: EnrolmentProgram | null,
  requestedMode?: string | null,
): ProgramSelectionResult {
  if (!program || program.code !== requestedProgramCode) return { ok: false, code: 'PROGRAM_NOT_FOUND' }
  if (!program.is_active || !program.enrolment_open) return { ok: false, code: 'ENROLMENT_CLOSED' }

  const availableModes = (program.program_learning_modes ?? []).filter(mode => mode.is_available)
  if (availableModes.length === 0) return { ok: false, code: 'LEARNING_MODES_NOT_CONFIGURED' }

  const selectedMode = requestedMode ? availableModes.find(mode => mode.mode === requestedMode) ?? null : null
  if (requestedMode && !selectedMode) return { ok: false, code: 'LEARNING_MODE_UNAVAILABLE' }
  return { ok: true, availableModes, selectedMode }
}
