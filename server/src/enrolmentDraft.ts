import { z } from 'zod'

const cleanText = (max: number) => z.string().max(max).transform(value => value.replace(/[\u0000-\u001f\u007f]/g, '').trim())

export const enrolmentDraftPayloadSchema = z.object({
  programCode: z.enum(['', 'class-10', 'class-12']),
  subjectChoice: z.enum(['', 'Mathematics', 'Biology']),
  learningMode: z.enum(['', 'online', 'hybrid', 'offline']),
  currentStep: z.number().int().min(0).max(2),
  fullName: cleanText(120),
  mobile: cleanText(32),
  email: cleanText(180),
  dateOfBirth: cleanText(10),
  schoolName: cleanText(180),
  board: cleanText(80),
  preferredLanguage: cleanText(50),
  whatsappMobile: cleanText(32),
  registrationIdempotencyKey: z.uuid(),
  paymentIdempotencyKey: z.uuid(),
}).strict().refine(value => value.programCode === 'class-12' || value.subjectChoice === '', {
  message: 'Class 10 drafts cannot include a Class 12 subject pathway.',
  path: ['subjectChoice'],
})

export type EnrolmentDraftPayload = z.infer<typeof enrolmentDraftPayloadSchema>

export type StoredEnrolmentDraft = EnrolmentDraftPayload & {
  id: string
  session_token_hash: string
  revision: number
  created_at: string
  updated_at: string
  expires_at: string
}

export interface EnrolmentDraftStore {
  find(sessionTokenHash: string): Promise<StoredEnrolmentDraft | null>
  create(input: { sessionTokenHash: string; registrationIdempotencyKey: string; paymentIdempotencyKey: string; now: string; expiresAt: string }): Promise<StoredEnrolmentDraft>
  update(input: { sessionTokenHash: string; expectedRevision: number; payload: EnrolmentDraftPayload; now: string; expiresAt: string }): Promise<StoredEnrolmentDraft | null>
  delete(sessionTokenHash: string, registrationIdempotencyKey?: string): Promise<number>
}

export function publicDraft(record: StoredEnrolmentDraft) {
  const { session_token_hash: _privateHash, id: _id, created_at: _created, updated_at: _updated, expires_at: _expires, revision, ...draft } = record
  return { draft, revision, expiresAt: record.expires_at }
}

export function emptyDraftPayload(registrationIdempotencyKey: string, paymentIdempotencyKey: string): EnrolmentDraftPayload {
  return { programCode: '', subjectChoice: '', learningMode: '', currentStep: 0, fullName: '', mobile: '', email: '', dateOfBirth: '', schoolName: '', board: '', preferredLanguage: '', whatsappMobile: '', registrationIdempotencyKey, paymentIdempotencyKey }
}

export async function saveEnrolmentDraft(store: EnrolmentDraftStore, input: {
  sessionTokenHash: string
  expectedRevision: number
  payload: unknown
  now?: Date
}) {
  const parsed = enrolmentDraftPayloadSchema.safeParse(input.payload)
  if (!parsed.success) return { ok: false as const, reason: 'invalid' as const }
  const now = input.now ?? new Date()
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const record = await store.update({
    sessionTokenHash: input.sessionTokenHash,
    expectedRevision: input.expectedRevision,
    payload: parsed.data,
    now: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  })
  return record ? { ok: true as const, record } : { ok: false as const, reason: 'conflict' as const }
}

export async function restoreEnrolmentDraft(store: EnrolmentDraftStore, sessionTokenHash: string, now = new Date()) {
  const record = await store.find(sessionTokenHash)
  if (!record || Date.parse(record.expires_at) <= now.getTime()) return null
  return record
}
