import { getDatabase } from './supabase.js'
import type { EnrolmentDraftStore, StoredEnrolmentDraft } from './enrolmentDraft.js'

const columns = 'id,session_token_hash,program_code,subject_choice,learning_mode,current_step,full_name,mobile,email,date_of_birth,school_name,board,preferred_language,whatsapp_mobile,registration_idempotency_key,payment_idempotency_key,revision,created_at,updated_at,expires_at'

function mapRow(row: Record<string, unknown>): StoredEnrolmentDraft {
  return {
    id: String(row.id), session_token_hash: String(row.session_token_hash).trim(),
    programCode: (row.program_code as StoredEnrolmentDraft['programCode']) ?? '',
    subjectChoice: (row.subject_choice as StoredEnrolmentDraft['subjectChoice']) ?? '',
    learningMode: (row.learning_mode as StoredEnrolmentDraft['learningMode']) ?? '',
    currentStep: Number(row.current_step) as 0 | 1 | 2,
    fullName: String(row.full_name ?? ''), mobile: String(row.mobile ?? ''), email: String(row.email ?? ''), dateOfBirth: String(row.date_of_birth ?? ''),
    schoolName: String(row.school_name ?? ''), board: String(row.board ?? ''), preferredLanguage: String(row.preferred_language ?? ''), whatsappMobile: String(row.whatsapp_mobile ?? ''),
    registrationIdempotencyKey: String(row.registration_idempotency_key), paymentIdempotencyKey: String(row.payment_idempotency_key),
    revision: Number(row.revision), created_at: String(row.created_at), updated_at: String(row.updated_at), expires_at: String(row.expires_at),
  }
}

export const enrolmentDraftStore: EnrolmentDraftStore = {
  async find(sessionTokenHash) {
    const { data, error } = await getDatabase().from('enrolment_drafts').select(columns).eq('session_token_hash', sessionTokenHash).maybeSingle()
    if (error) throw error
    return data ? mapRow(data as Record<string, unknown>) : null
  },
  async create(input) {
    const { data, error } = await getDatabase().from('enrolment_drafts').insert({
      session_token_hash: input.sessionTokenHash,
      registration_idempotency_key: input.registrationIdempotencyKey,
      payment_idempotency_key: input.paymentIdempotencyKey,
      current_step: 0,
      expires_at: input.expiresAt,
      created_at: input.now,
      updated_at: input.now,
    }).select(columns).single()
    if (error || !data) throw error ?? new Error('DRAFT_CREATE_FAILED')
    return mapRow(data as Record<string, unknown>)
  },
  async update(input) {
    const { data, error } = await getDatabase().from('enrolment_drafts').update({
      program_code: input.payload.programCode || null,
      subject_choice: input.payload.subjectChoice || null,
      learning_mode: input.payload.learningMode || null,
      current_step: input.payload.currentStep,
      full_name: input.payload.fullName || null,
      mobile: input.payload.mobile || null,
      email: input.payload.email || null,
      date_of_birth: input.payload.dateOfBirth || null,
      school_name: input.payload.schoolName || null,
      board: input.payload.board || null,
      preferred_language: input.payload.preferredLanguage || null,
      whatsapp_mobile: input.payload.whatsappMobile || null,
      registration_idempotency_key: input.payload.registrationIdempotencyKey,
      payment_idempotency_key: input.payload.paymentIdempotencyKey,
      revision: input.expectedRevision + 1,
      updated_at: input.now,
      expires_at: input.expiresAt,
    }).eq('session_token_hash', input.sessionTokenHash).eq('revision', input.expectedRevision).gt('expires_at', input.now).select(columns).maybeSingle()
    if (error) throw error
    return data ? mapRow(data as Record<string, unknown>) : null
  },
  async delete(sessionTokenHash, registrationIdempotencyKey) {
    let query = getDatabase().from('enrolment_drafts').delete().eq('session_token_hash', sessionTokenHash)
    if (registrationIdempotencyKey) query = query.eq('registration_idempotency_key', registrationIdempotencyKey)
    const { data, error } = await query.select('id')
    if (error) throw error
    return data?.length ?? 0
  },
}
