export const ENROLMENT_RECOVERY_KEY = 'radixminds:enrolment-progress:v1'

export type EnrolmentRecovery = {
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

export function createEnrolmentRecovery(makeId = randomUuid): EnrolmentRecovery {
  return {
    programCode: '', subjectChoice: '', learningMode: '', step: 0,
    registrationIdempotencyKey: makeId(), paymentIdempotencyKey: makeId(), enrolmentReference: null,
  }
}

function normalizeRecovery(value: unknown, makeId: () => string): EnrolmentRecovery | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const reference = typeof candidate.enrolmentReference === 'string' && referencePattern.test(candidate.enrolmentReference) ? candidate.enrolmentReference : null
  const programCode = reference && (candidate.programCode === 'class-10' || candidate.programCode === 'class-12') ? candidate.programCode : ''
  return {
    // Unsubmitted selections and form progress are deliberately never restored.
    programCode,
    subjectChoice: '',
    learningMode: '',
    step: reference ? 2 : 0,
    registrationIdempotencyKey: typeof candidate.registrationIdempotencyKey === 'string' && uuidPattern.test(candidate.registrationIdempotencyKey) ? candidate.registrationIdempotencyKey : makeId(),
    paymentIdempotencyKey: typeof candidate.paymentIdempotencyKey === 'string' && uuidPattern.test(candidate.paymentIdempotencyKey) ? candidate.paymentIdempotencyKey : makeId(),
    enrolmentReference: reference,
  }
}

function clearLegacySession(storage: StorageLike | null) {
  try {
    storage?.removeItem('radixminds:enrolment-session')
    storage?.removeItem('radixminds:registration-idempotency-key')
  } catch { /* Ignore unavailable browser storage. */ }
}

/** Restore only idempotency keys and an already-submitted admission reference. */
export function loadEnrolmentRecovery(localStorage: StorageLike | null, sessionStorage: StorageLike | null, makeId = randomUuid) {
  let recovery = createEnrolmentRecovery(makeId)
  try {
    const raw = localStorage?.getItem(ENROLMENT_RECOVERY_KEY)
    if (raw) recovery = normalizeRecovery(JSON.parse(raw), makeId) ?? recovery
  } catch { /* Ignore malformed or unavailable browser storage. */ }

  // Older releases stored an idempotency key in sessionStorage. Keep that
  // retry protection, but never restore selections or an unverified reference.
  let migratedRegistrationKey = false
  try {
    const oldKey = sessionStorage?.getItem('radixminds:registration-idempotency-key')
    if (!recovery.enrolmentReference && oldKey && uuidPattern.test(oldKey)) {
      recovery.registrationIdempotencyKey = oldKey
      migratedRegistrationKey = true
    }
  } catch { /* Ignore unavailable browser storage. */ }
  if (migratedRegistrationKey) saveEnrolmentRecovery(localStorage, recovery)
  clearLegacySession(sessionStorage)
  return { recovery, recovered: Boolean(recovery.enrolmentReference) }
}

/** Persist only request idempotency keys and a server-issued submitted reference. */
export function saveEnrolmentRecovery(storage: StorageLike | null, value: EnrolmentRecovery) {
  if (!storage) return
  const safeRecovery = normalizeRecovery(value, randomUuid)
  if (!safeRecovery) return
  try { storage.setItem(ENROLMENT_RECOVERY_KEY, JSON.stringify(safeRecovery)) } catch { /* Storage may be unavailable; in-memory flow still works. */ }
}

export function restoreEnrolmentStep(recovery: EnrolmentRecovery): 0 | 1 | 2 {
  return recovery.enrolmentReference ? 2 : 0
}

export function isEnrolmentReference(value: unknown): value is string {
  return typeof value === 'string' && referencePattern.test(value)
}
