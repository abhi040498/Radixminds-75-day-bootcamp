const enrolmentReferencePattern = /^RM-[A-F0-9]{20}$/

/** Prefer the verified API reference, while retaining the saved reference during status failures. */
export function visibleEnrolmentReference(apiReference: unknown, savedReference: unknown): string | null {
  for (const candidate of [apiReference, savedReference]) {
    if (typeof candidate === 'string' && enrolmentReferencePattern.test(candidate)) return candidate
  }
  return null
}
