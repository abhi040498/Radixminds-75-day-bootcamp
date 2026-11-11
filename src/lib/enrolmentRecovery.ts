export const ENROLMENT_DRAFT_KEY = 'radixminds:enrolment-progress:v1'

export type EnrolmentDraft = {
  programCode: 'class-10' | 'class-12' | ''
  subjectChoice: 'Mathematics' | 'Biology' | ''
  learningMode: 'online' | 'hybrid' | 'offline' | ''
  step: 0 | 1 | 2
  registrationIdempotencyKey: string
  paymentIdempotencyKey: string
  enrolmentReference: string | null
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const referencePattern = /^RM-[A-F0-9]{20}$/

function randomUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function createEnrolmentDraft(makeId = randomUuid): EnrolmentDraft {
  return {
    programCode: '', subjectChoice: '', learningMode: '', step: 0,
    registrationIdempotencyKey: makeId(), paymentIdempotencyKey: makeId(), enrolmentReference: null,
  }
}

function normalizeDraft(value: unknown, makeId: () => string): EnrolmentDraft | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const programCode = candidate.programCode === 'class-10' || candidate.programCode === 'class-12' ? candidate.programCode : ''
  const subjectChoice = candidate.subjectChoice === 'Mathematics' || candidate.subjectChoice === 'Biology' ? candidate.subjectChoice : ''
  const learningMode = candidate.learningMode === 'online' || candidate.learningMode === 'hybrid' || candidate.learningMode === 'offline' ? candidate.learningMode : ''
  const step = candidate.step === 1 || candidate.step === 2 ? candidate.step : 0
  const reference = typeof candidate.enrolmentReference === 'string' && referencePattern.test(candidate.enrolmentReference) ? candidate.enrolmentReference : null
  return {
    programCode, subjectChoice, learningMode, step,
    registrationIdempotencyKey: typeof candidate.registrationIdempotencyKey === 'string' && uuidPattern.test(candidate.registrationIdempotencyKey) ? candidate.registrationIdempotencyKey : makeId(),
    paymentIdempotencyKey: typeof candidate.paymentIdempotencyKey === 'string' && uuidPattern.test(candidate.paymentIdempotencyKey) ? candidate.paymentIdempotencyKey : makeId(),
    enrolmentReference: reference,
  }
}

export function loadEnrolmentDraft(storage: StorageLike | null, makeId = randomUuid) {
  if (!storage) return { draft: createEnrolmentDraft(makeId), recovered: false }
  try {
    const raw = storage.getItem(ENROLMENT_DRAFT_KEY)
    if (!raw) return { draft: createEnrolmentDraft(makeId), recovered: false }
    const draft = normalizeDraft(JSON.parse(raw), makeId)
    return draft ? { draft, recovered: true } : { draft: createEnrolmentDraft(makeId), recovered: false }
  } catch {
    return { draft: createEnrolmentDraft(makeId), recovered: false }
  }
}

/** Migrate only selections and the non-authorizing idempotency key from the old session store. */
export function loadEnrolmentRecovery(localStorage: StorageLike | null, sessionStorage: StorageLike | null, makeId = randomUuid) {
  const current = loadEnrolmentDraft(localStorage, makeId)
  if (current.recovered) {
    clearLegacySession(sessionStorage)
    return current
  }

  let legacyProgram: EnrolmentDraft['programCode'] = ''
  try {
    const raw = sessionStorage?.getItem('radixminds:enrolment-session')
    if (raw) {
      const old = JSON.parse(raw) as Record<string, unknown>
      legacyProgram = old.programCode === 'class-10' || old.programCode === 'class-12' ? old.programCode : ''
    }
  } catch { /* Ignore malformed legacy browser state. */ }

  let oldRegistrationKey: string | null = null
  try {
    const oldKey = sessionStorage?.getItem('radixminds:registration-idempotency-key')
    if (oldKey && uuidPattern.test(oldKey)) oldRegistrationKey = oldKey
  } catch { /* Ignore unavailable legacy storage. */ }

  if (!legacyProgram && !oldRegistrationKey) {
    clearLegacySession(sessionStorage)
    return current
  }
  const draft = createEnrolmentDraft(makeId)
  draft.programCode = legacyProgram
  draft.registrationIdempotencyKey = oldRegistrationKey ?? draft.registrationIdempotencyKey
  // Old releases kept the bearer token in sessionStorage. Never migrate the
  // public reference without its authorization cookie; asking the student to
  // re-enter details and retry the same idempotency key safely recovers it.
  draft.step = 1
  saveEnrolmentDraft(localStorage, draft)
  clearLegacySession(sessionStorage)
  return { draft, recovered: true }
}

function clearLegacySession(storage: StorageLike | null) {
  try {
    storage?.removeItem('radixminds:enrolment-session')
    storage?.removeItem('radixminds:registration-idempotency-key')
  } catch { /* Ignore unavailable legacy storage. */ }
}

/** Whitelist-only persistence: never writes form fields, consent, credentials or session tokens. */
export function saveEnrolmentDraft(storage: StorageLike | null, value: EnrolmentDraft) {
  if (!storage) return
  const safeDraft = normalizeDraft(value, randomUuid)
  if (!safeDraft) return
  try { storage.setItem(ENROLMENT_DRAFT_KEY, JSON.stringify(safeDraft)) } catch { /* Storage may be unavailable; the in-memory form still works. */ }
}

/** Personal details and policy acknowledgement are intentionally cleared on refresh. */
export function restoreEnrolmentStep(draft: EnrolmentDraft): 0 | 1 | 2 {
  if (draft.enrolmentReference) return 2
  if (draft.step === 0) return 0
  return 1
}

export function isEnrolmentReference(value: unknown): value is string {
  return typeof value === 'string' && referencePattern.test(value)
}
