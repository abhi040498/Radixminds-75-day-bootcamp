const UNAVAILABLE_SUBJECTS = 'Subject details unavailable'

export type SharedChoiceSubjectSnapshot = {
  shared?: readonly string[]
  choice?: readonly string[] | string
}

export type SubjectSnapshot = readonly string[] | SharedChoiceSubjectSnapshot | null | undefined

function subjectNames(value: unknown): string[] {
  const values = typeof value === 'string' ? [value] : Array.isArray(value) ? value : []
  return values.flatMap(item => typeof item === 'string' && item.trim() ? [item.trim()] : [])
}

/** Formats the JSONB shapes used by enrolment snapshots without trusting API data. */
export function formatSubjectSnapshot(snapshot: unknown): string {
  if (Array.isArray(snapshot)) {
    const names = subjectNames(snapshot)
    return names.length ? names.join(' · ') : UNAVAILABLE_SUBJECTS
  }

  if (typeof snapshot !== 'object' || snapshot === null) return UNAVAILABLE_SUBJECTS

  const shape = snapshot as SharedChoiceSubjectSnapshot
  const shared = subjectNames(shape.shared)
  const choices = subjectNames(shape.choice)
  const parts: string[] = []

  if (shared.length) parts.push(shared.join(' · '))
  if (choices.length) {
    parts.push(Array.isArray(shape.choice) ? `Choose one: ${choices.join(' / ')}` : choices.join(' · '))
  }

  return parts.length ? parts.join(' · ') : UNAVAILABLE_SUBJECTS
}
