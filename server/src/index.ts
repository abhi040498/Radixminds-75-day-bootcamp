import express, { type ErrorRequestHandler } from 'express'
import { randomUUID } from 'node:crypto'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import Razorpay from 'razorpay'
import { z } from 'zod'
import { config, boardOptions, languageOptions, hasAdminAuth, hasDatabase, hasRazorpay, hasValidRazorpayWebhookSecret, checkoutBaseReady } from './config.js'
import { getAuthClient, getDatabase } from './supabase.js'
import { createStatusToken, csrfOriginGuard, newPublicReference, safeHexEqual, sha256, verifyHmac, validateRazorpayKeyMode } from './security.js'
import { createRazorpayWebhookHandler } from './razorpayWebhook.js'
import { razorpayWebhookStore } from './razorpayWebhookStore.js'
import { policyVersions } from './policyVersions.js'
import { policyAcknowledgementSchema, policyVersionsSchema } from './policyAcknowledgement.js'
import { paymentIdentityMismatch } from './paymentIntegrity.js'
import { createPaymentOrder, PaymentOrderError } from './paymentOrderCoordinator.js'
import { paymentOrderStore } from './paymentOrderStore.js'
import { resolveEnrolmentProgramSelection, type EnrolmentProgram } from './enrolmentProgramSelection.js'
import { buildWhatsAppConfirmationDraft, isWhatsAppConfirmationEligible } from './whatsappConfirmation.js'

const app = express()
app.disable('x-powered-by')
app.use(helmet({ crossOriginEmbedderPolicy: false }))
app.use(cors({ origin: config.APP_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Enrolment-Token'] }))
app.use((req, res, next) => {
  const requestId = req.get('x-request-id')?.slice(0, 80) || randomUUID()
  res.setHeader('x-request-id', requestId)
  res.locals.requestId = requestId
  next()
})

const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false })
const checkoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false })
const adminLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false })

type ApiErrorCode = 'CONFIGURATION_REQUIRED' | 'VALIDATION_ERROR' | 'NOT_FOUND' | 'PAYMENT_PENDING' | 'PAYMENT_FAILED' | 'PAYMENT_MISMATCH' | 'ALREADY_CONFIRMED'
function fail(res: express.Response, status: number, code: ApiErrorCode | string, message: string, fields?: Record<string, string>) {
  return res.status(status).json({ error: { code, message, requestId: res.locals.requestId, ...(fields ? { fields } : {}) } })
}
function databaseUnavailable(res: express.Response) {
  return fail(res, 503, 'CONFIGURATION_REQUIRED', 'Enrolment is not available yet. Please contact the Radix Minds team.', { setup: 'Supabase database configuration is required.' })
}
function razorpayClient() {
  if (!hasRazorpay || !config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET || !validateRazorpayKeyMode()) throw new Error('RAZORPAY_NOT_CONFIGURED')
  return new Razorpay({ key_id: config.RAZORPAY_KEY_ID, key_secret: config.RAZORPAY_KEY_SECRET })
}
function createRazorpayOrderProvider() {
  const client = razorpayClient()
  // Razorpay's SDK has no constructor timeout option; its documented internal
  // Axios instance is configured so a provider call cannot hold a lease open
  // indefinitely. Database fencing remains authoritative if a worker resumes late.
  const api = client.api as unknown as { rq: { defaults: { timeout: number } } }
  api.rq.defaults.timeout = 20_000
  return { createOrder: (input: Parameters<typeof client.orders.create>[0]) => client.orders.create(input) }
}
function normalizeIndiaMobile(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) return `+91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`
  throw new Error('INVALID_MOBILE')
}
function isValidIndianMobile(value: string) {
  try { return /^\+91[6-9]\d{9}$/.test(normalizeIndiaMobile(value)) } catch { return false }
}
function validIdempotencyKey(value: string | undefined) {
  return Boolean(value && z.uuid().safeParse(value).success)
}
function verifiedDiscountPercent(program: { program_fee_paise: number; standard_fee_paise: number | null; discount_percent: number | null }) {
  const payable = Number(program.program_fee_paise)
  const standard = program.standard_fee_paise === null ? null : Number(program.standard_fee_paise)
  const configured = program.discount_percent === null ? null : Number(program.discount_percent)
  if (!Number.isSafeInteger(payable) || standard === null || !Number.isSafeInteger(standard) || standard <= payable || configured === null || !Number.isFinite(configured)) return null
  const computed = Math.round(((standard - payable) / standard) * 10000) / 100
  return Math.abs(computed - configured) <= 0.01 ? configured : null
}

const enrolmentSchema = z.object({
  programCode: z.enum(['class-10', 'class-12']),
  fullName: z.string().trim().min(2).max(120),
  mobile: z.string().refine(isValidIndianMobile, 'Enter a valid 10-digit Indian mobile number.'),
  email: z.email().max(180),
  dateOfBirth: z.union([z.literal(''), z.iso.date()]).optional(),
  board: z.string().trim().min(2).max(80),
  schoolName: z.string().trim().min(2).max(180),
  preferredLanguage: z.string().trim().max(50).optional(),
  subjectChoice: z.enum(['Mathematics', 'Biology']).nullable().optional(),
  learningMode: z.enum(['online', 'offline', 'hybrid']).nullable().optional(),
  whatsappUpdatesConsent: z.boolean().optional().default(false),
  whatsappMobile: z.union([z.literal(''), z.string().refine(isValidIndianMobile, 'Enter a valid Indian WhatsApp number.')]).optional(),
}).extend(policyAcknowledgementSchema.shape).strict()

const enquirySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  mobile: z.string().refine(isValidIndianMobile, 'Enter a valid 10-digit Indian mobile number.'),
  email: z.union([z.literal(''), z.email().max(180)]).optional(),
  programCode: z.enum(['class-10', 'class-12']).nullable().optional(),
  message: z.string().trim().min(4).max(2000),
  consent: z.literal(true),
})

const razorpayWebhook = express.raw({ type: 'application/json', limit: '1mb' })
async function markFailedPayment(db: ReturnType<typeof getDatabase>, paymentId: string, orderId: string) {
  const { error: linkError } = await db.from('payments').update({ provider_payment_id: paymentId, updated_at: new Date().toISOString() }).eq('provider_order_id', orderId).in('status', ['created', 'authorized'])
  if (linkError) throw linkError
  const { error } = await db.rpc('mark_provider_payment_failed', { p_provider_payment_id: paymentId })
  if (error) throw error
}
const handleRazorpayWebhook = createRazorpayWebhookHandler(hasValidRazorpayWebhookSecret ? config.RAZORPAY_WEBHOOK_SECRET : undefined, razorpayWebhookStore)
app.post('/api/v1/webhooks/razorpay', razorpayWebhook, async (req, res) => {
  if (!hasDatabase || !hasValidRazorpayWebhookSecret) return res.status(503).json({ error: 'Webhook processing is not available.' })
  const result = await handleRazorpayWebhook({
    rawBody: req.body,
    signature: req.get('x-razorpay-signature'),
    eventId: req.get('x-razorpay-event-id'),
  })
  return res.status(result.status).json(result.body)
})

app.use(express.json({ limit: '32kb' }))
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'radix-minds-enrolment-api', databaseConfigured: hasDatabase, razorpayConfigured: hasRazorpay, paymentMode: config.RAZORPAY_MODE }))

app.get('/api/v1/config', (_req, res) => res.json({ boards: boardOptions, languages: languageOptions, policiesApproved: config.POLICIES_APPROVED === 'true', paymentMode: config.RAZORPAY_MODE }))

app.get('/api/v1/programs', async (_req, res) => {
  if (!hasDatabase) return databaseUnavailable(res)
  const { data, error } = await getDatabase().from('programs').select('id,code,name,duration_days,subjects,program_fee_paise,standard_fee_paise,discount_percent,offer_valid_until,currency,is_active,enrolment_open,program_learning_modes(mode,label,is_available,batch_label)').eq('is_active', true).order('code')
  if (error) return fail(res, 503, 'PROGRAMS_UNAVAILABLE', 'Program details are temporarily unavailable.')
  const programs = (data ?? []).map((program: Record<string, unknown>) => {
    const modes = (program.program_learning_modes as Array<{ mode: string; label: string; is_available: boolean; batch_label: string | null }> ?? []).filter(mode => mode.is_available).map(({ mode, label, batch_label }) => ({ mode, label, batchLabel: batch_label }))
    return { code: program.code, name: program.name, durationDays: program.duration_days, subjects: program.subjects, payablePaise: program.program_fee_paise, standardPaise: program.standard_fee_paise, discountPercent: verifiedDiscountPercent(program as { program_fee_paise: number; standard_fee_paise: number | null; discount_percent: number | null }), offerValidThrough: program.offer_valid_until, currency: program.currency, enrolmentOpen: program.enrolment_open, modes, checkoutReady: checkoutBaseReady && validateRazorpayKeyMode() && modes.length > 0 }
  })
  return res.json({ programs })
})

app.post('/api/v1/enrolments', publicLimiter, csrfOriginGuard, async (req, res) => {
  if (!hasDatabase) return databaseUnavailable(res)
  if (config.POLICIES_APPROVED !== 'true') return fail(res, 503, 'POLICIES_NOT_APPROVED', 'Enrolment submissions are temporarily unavailable while the approved policies and consent workflow are being prepared. Please contact Radix Minds.')
  const parsed = enrolmentSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 422, 'VALIDATION_ERROR', 'Please check the highlighted fields and try again.', Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0] ?? 'form'), issue.message])))
  const idempotencyKey = req.get('idempotency-key')
  if (!validIdempotencyKey(idempotencyKey)) return fail(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Refresh the registration form and try again.')

  const input = parsed.data
  if (input.programCode === 'class-10' && input.subjectChoice) return fail(res, 422, 'INVALID_PATHWAY', 'Class 10 does not require a pathway selection.')
  if (!boardOptions.some(option => option.toLowerCase() === input.board.toLowerCase())) return fail(res, 422, 'BOARD_NOT_SUPPORTED', 'Choose a board listed on the form.', { board: 'Select a board from the available choices.' })
  if (input.preferredLanguage && !languageOptions.some(option => option.toLowerCase() === input.preferredLanguage!.toLowerCase())) return fail(res, 422, 'LANGUAGE_NOT_SUPPORTED', 'Choose a preferred language listed on the form.', { preferredLanguage: 'Select a language from the available choices.' })
  if (input.dateOfBirth && new Date(input.dateOfBirth).getTime() > Date.now()) return fail(res, 422, 'INVALID_DATE_OF_BIRTH', 'Date of birth cannot be in the future.', { dateOfBirth: 'Choose a valid date.' })

  const db = getDatabase()
  const { data: program, error: programError } = await db.from('programs').select('id,code,name,duration_days,subjects,program_fee_paise,standard_fee_paise,discount_percent,offer_valid_until,currency,is_active,enrolment_open,program_learning_modes(mode,label,is_available,batch_label)').eq('code', input.programCode).maybeSingle()
  if (programError || !program) return fail(res, 404, 'PROGRAM_NOT_FOUND', 'That program could not be found.')
  const selection = resolveEnrolmentProgramSelection(input.programCode, program as EnrolmentProgram, input.learningMode)
  if (!selection.ok) {
    if (selection.code === 'PROGRAM_NOT_FOUND') return fail(res, 404, 'PROGRAM_NOT_FOUND', 'That program could not be found.')
    if (selection.code === 'ENROLMENT_CLOSED') return fail(res, 409, 'ENROLMENT_CLOSED', 'Enrolment for this program is currently closed. Please contact the team.')
    if (selection.code === 'LEARNING_MODES_NOT_CONFIGURED') return fail(res, 409, 'LEARNING_MODE_UNAVAILABLE', 'This batch is not configured for enrolment yet. Please contact the team.')
    return fail(res, 422, 'LEARNING_MODE_UNAVAILABLE', 'This learning mode is not offered for the selected batch.')
  }
  const { selectedMode } = selection

  const subjectList = program.code === 'class-10'
    ? ['Mathematics', 'Science', 'Social Science', 'English']
    : input.subjectChoice ? ['Physics', 'Chemistry', input.subjectChoice] : ['Physics', 'Chemistry', 'Mathematics or Biology (to be confirmed)']
  const priceSnapshot = { currency: program.currency, payable_paise: program.program_fee_paise, standard_paise: program.standard_fee_paise, discount_percent: verifiedDiscountPercent(program), offer_valid_until: program.offer_valid_until }
  const programSnapshot = { code: program.code, name: program.name, duration_days: program.duration_days, learning_mode: input.learningMode ?? null, learning_mode_label: selectedMode?.label ?? 'To be confirmed with Radix Minds' }
  const statusToken = createStatusToken(idempotencyKey!)
  const rpcInput = {
    idempotency_key: idempotencyKey,
    public_reference: newPublicReference(),
    full_name: input.fullName,
    mobile_e164: normalizeIndiaMobile(input.mobile),
    email: input.email.toLowerCase(),
    date_of_birth: input.dateOfBirth || '',
    guardian_name: null,
    guardian_mobile_e164: null,
    guardian_email: '',
    program_id: program.id,
    board: input.board,
    school_name: input.schoolName,
    preferred_language: input.preferredLanguage || null,
    subject_choice: input.subjectChoice ?? '',
    learning_mode: input.learningMode ?? null,
    terms_accepted: input.policyAcknowledged,
    privacy_consent: input.policyAcknowledged,
    refund_policy_accepted: input.policyAcknowledged,
    terms_policy_version: input.policyVersions.terms,
    privacy_policy_version: input.policyVersions.privacy,
    refund_policy_version: input.policyVersions.refund,
    whatsapp_updates_consent: input.whatsappUpdatesConsent,
    whatsapp_mobile_e164: input.whatsappMobile ? normalizeIndiaMobile(input.whatsappMobile) : null,
    program_snapshot: programSnapshot,
    subjects_snapshot: subjectList,
    pricing_snapshot: priceSnapshot,
    status_token_hash: sha256(statusToken),
  }
  const { data: result, error } = await db.rpc('create_pending_enrolment', { p_input: rpcInput })
  const created = Array.isArray(result) ? result[0] : result
  if (error || !created?.enrolment_id || !created.public_reference) return fail(res, 503, 'REGISTRATION_SAVE_FAILED', 'We could not save your registration just now. Please try again or contact the team.')
  const checkoutReady = checkoutBaseReady && validateRazorpayKeyMode()
  return res.status(201).json({ enrolmentReference: created.public_reference, statusToken, status: 'pending_payment', paymentStatus: 'pending', checkoutReady, message: checkoutReady ? 'Your details are saved. Continue to secure payment.' : 'Your enrolment request is saved. Payment is pending; the team will share the next step.' })
})

function getEnrollmentByToken(reference: string, token: string) {
  return getDatabase().from('enrolments').select('id,public_reference,status,student_id,program_id,program_snapshot,subjects_snapshot,pricing_snapshot,status_token_hash,status_token_expires_at,created_at').eq('public_reference', reference).maybeSingle().then(({ data, error }) => {
    if (error || !data || new Date(data.status_token_expires_at).getTime() < Date.now() || !safeHexEqual(sha256(token), data.status_token_hash.trim())) return null
    return data
  })
}

function withCheckoutOrder(payment: { id: string; status: string; provider_order_id: string | null; amount_paise: number; currency: string }, reference: string) {
  if (!payment.provider_order_id) throw new Error('ORDER_NOT_READY')
  if (!config.RAZORPAY_KEY_ID) throw new Error('RAZORPAY_NOT_CONFIGURED')
  return { paymentAttemptId: payment.id, enrolmentReference: reference, orderId: payment.provider_order_id, keyId: config.RAZORPAY_KEY_ID, amount: payment.amount_paise, currency: payment.currency, name: 'Radix Minds', description: '75-Day Board Bootcamp', status: payment.status }
}

app.post('/api/v1/enrolments/:reference/payment-orders', checkoutLimiter, csrfOriginGuard, async (req, res) => {
  if (!hasDatabase) return databaseUnavailable(res)
  if (!checkoutBaseReady || !validateRazorpayKeyMode()) return fail(res, 503, 'PAYMENT_NOT_CONFIGURED', 'Secure online payment is not configured yet. Please contact Radix Minds.')
  const token = req.get('x-enrolment-token') ?? ''
  const enrollment = await getEnrollmentByToken(String(req.params.reference ?? ''), token)
  if (!enrollment) return fail(res, 404, 'ENROLMENT_NOT_FOUND', 'This registration could not be found. Return to the enrolment form or contact the team.')
  if (enrollment.status === 'confirmed') return fail(res, 409, 'ALREADY_CONFIRMED', 'This enrolment is already confirmed.')
  if (enrollment.status !== 'pending_payment') return fail(res, 409, 'ENROLMENT_STATE_CONFLICT', 'This registration is not awaiting payment. Please contact Radix Minds before retrying.')
  const key = req.get('idempotency-key')
  if (!validIdempotencyKey(key)) return fail(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Refresh the checkout step and try again.')
  try {
    const payment = await createPaymentOrder(paymentOrderStore, createRazorpayOrderProvider(), {
      enrolmentId: enrollment.id,
      enrolmentReference: enrollment.public_reference,
      idempotencyKey: key!,
      leaseToken: randomUUID(),
    })
    return res.json(withCheckoutOrder(payment, enrollment.public_reference))
  } catch (error) {
    if (error instanceof PaymentOrderError) {
      if (error.code === 'idempotency_conflict') return fail(res, 409, 'IDEMPOTENCY_KEY_CONFLICT', 'This checkout request key is already associated with a different registration. Start a fresh checkout request.')
      if (error.code === 'in_progress') return fail(res, 409, 'PAYMENT_ORDER_IN_PROGRESS', 'A payment order is already being prepared. Wait briefly before trying again.')
      if (error.code === 'retry') return fail(res, 409, 'PAYMENT_ORDER_RETRY', 'Please start a fresh checkout attempt to prepare a payment order.')
      if (error.code === 'lease_lost') return fail(res, 409, 'PAYMENT_ORDER_RETRY', 'This order preparation expired before it could be saved. It cannot be used; retry checkout to prepare a fresh order.')
      if (error.code === 'provider_unavailable') return fail(res, 503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Razorpay could not prepare checkout. Your registration is saved; please retry or contact the team.')
      if (error.code === 'provider_mismatch') return fail(res, 503, 'PAYMENT_ORDER_MISMATCH', 'Razorpay returned order details that did not match the saved checkout. No order was sent to checkout; please contact the team.')
      return fail(res, 503, 'PAYMENT_ORDER_SAVE_FAILED', 'The payment order could not be safely saved. It was not sent to checkout; please retry or contact the team.')
    }
    return fail(res, 503, 'PAYMENT_ORDER_UNAVAILABLE', 'We could not prepare checkout. Your registration is saved; please retry in a moment.')
  }
})

const verifySchema = z.object({ enrolmentReference: z.string().regex(/^RM-[A-F0-9]{20}$/), razorpayOrderId: z.string().min(8).max(64), razorpayPaymentId: z.string().min(8).max(64), razorpaySignature: z.string().regex(/^[0-9a-f]{64}$/i) })
app.post('/api/v1/payments/verify', checkoutLimiter, csrfOriginGuard, async (req, res) => {
  if (!hasDatabase || !checkoutBaseReady) return fail(res, 503, 'PAYMENT_NOT_CONFIGURED', 'Payment verification is not available yet. Please contact the team.')
  const parsed = verifySchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 422, 'VALIDATION_ERROR', 'Payment details could not be verified.')
  const token = req.get('x-enrolment-token') ?? ''
  const enrollment = await getEnrollmentByToken(parsed.data.enrolmentReference, token)
  if (!enrollment) return fail(res, 404, 'ENROLMENT_NOT_FOUND', 'Registration could not be found.')
  const db = getDatabase()
  const { data: paymentRow, error: lookupError } = await db.from('payments').select('id,provider_order_id,provider_payment_id,amount_paise,currency,status').eq('enrolment_id', enrollment.id).eq('provider_order_id', parsed.data.razorpayOrderId).maybeSingle()
  if (lookupError || !paymentRow) return fail(res, 400, 'PAYMENT_ORDER_MISMATCH', 'This payment order does not match the saved registration.')
  const signedMessage = `${paymentRow.provider_order_id}|${parsed.data.razorpayPaymentId}`
  if (!config.RAZORPAY_KEY_SECRET || !verifyHmac(signedMessage, parsed.data.razorpaySignature, config.RAZORPAY_KEY_SECRET)) return fail(res, 400, 'PAYMENT_SIGNATURE_INVALID', 'Payment verification failed. No enrolment confirmation was issued.')

  try {
    const providerPayment = await razorpayClient().payments.fetch(parsed.data.razorpayPaymentId)
    const providerAmountPaise = Number(providerPayment.amount)
    if (!Number.isSafeInteger(providerAmountPaise) || paymentIdentityMismatch({ providerOrderId: paymentRow.provider_order_id, providerPaymentId: paymentRow.provider_payment_id, amountPaise: Number(paymentRow.amount_paise), currency: paymentRow.currency, status: paymentRow.status }, { orderId: providerPayment.order_id, paymentId: providerPayment.id, amountPaise: providerAmountPaise, currency: providerPayment.currency })) {
      await db.from('payments').update({ status: 'needs_review', provider_payment_id: providerPayment.id, updated_at: new Date().toISOString() }).eq('id', paymentRow.id).neq('status', 'captured')
      return fail(res, 409, 'PAYMENT_MISMATCH', 'Payment details need review. Contact Radix Minds before trying to pay again.')
    }
    if (providerPayment.status === 'captured') {
      if (enrollment.status !== 'pending_payment' && enrollment.status !== 'confirmed') return fail(res, 409, 'ENROLMENT_STATE_CONFLICT', 'This registration needs a status check before payment can be confirmed. Please contact Radix Minds.')
      if (paymentRow.status === 'captured') {
        if (enrollment.status !== 'confirmed') return fail(res, 409, 'ENROLMENT_STATE_CONFLICT', 'Payment records need a status check before this registration can be confirmed. Please contact Radix Minds.')
        return res.json({ status: 'confirmed', enrolmentReference: enrollment.public_reference, paymentReference: providerPayment.id, amountPaise: providerAmountPaise, currency: providerPayment.currency })
      }
      if (enrollment.status !== 'pending_payment') return fail(res, 409, 'ENROLMENT_STATE_CONFLICT', 'This registration needs a status check before payment can be confirmed. Please contact Radix Minds.')
      const { data: confirmed, error: confirmError } = await db.rpc('confirm_captured_payment', { p_provider_order_id: providerPayment.order_id, p_provider_payment_id: providerPayment.id, p_amount_paise: providerAmountPaise, p_currency: providerPayment.currency, p_signature_verified: true })
      if (confirmError) return fail(res, 503, 'CONFIRMATION_PENDING', 'Payment was received. Confirmation is being checked; please wait and refresh this page.')
      const confirmation = Array.isArray(confirmed) ? confirmed[0] : confirmed
      if (confirmation?.result === 'needs_review') return fail(res, 409, 'PAYMENT_MISMATCH', 'Payment details need review. Contact Radix Minds.')
      return res.json({ status: 'confirmed', enrolmentReference: enrollment.public_reference, paymentReference: providerPayment.id, amountPaise: providerAmountPaise, currency: providerPayment.currency })
    }
    if (providerPayment.status === 'failed') {
      await markFailedPayment(db, providerPayment.id, paymentRow.provider_order_id)
      return res.status(202).json({ status: 'failed', message: 'The payment was not completed. You may safely retry checkout.' })
    }
    await db.from('payments').update({ provider_payment_id: providerPayment.id, status: 'authorized', provider_signature_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', paymentRow.id).neq('status', 'captured')
    return res.status(202).json({ status: 'pending', message: 'Payment is awaiting capture confirmation. Keep this page open or check again shortly.' })
  } catch {
    return res.status(202).json({ status: 'pending', message: 'We are checking payment status with Razorpay. Keep this page open and check again shortly.' })
  }
})

app.get('/api/v1/enrolments/:reference/status', publicLimiter, async (req, res) => {
  if (!hasDatabase) return databaseUnavailable(res)
  const enrollment = await getEnrollmentByToken(String(req.params.reference ?? ''), req.get('x-enrolment-token') ?? '')
  if (!enrollment) return fail(res, 404, 'ENROLMENT_NOT_FOUND', 'This confirmation link is invalid or expired.')
  const db = getDatabase()
  const { data: student } = await db.from('students').select('full_name').eq('id', enrollment.student_id).maybeSingle()
  const { data: payment } = await db.from('payments').select('provider_order_id,provider_payment_id,amount_paise,currency,status,captured_at').eq('enrolment_id', enrollment.id).order('attempt_number', { ascending: false }).limit(1).maybeSingle()

  if (enrollment.status !== 'confirmed' && payment?.provider_order_id && hasRazorpay) {
    try {
      const attempts = await razorpayClient().orders.fetchPayments(payment.provider_order_id)
      const captured = attempts.items.find(item => item.status === 'captured')
      if (captured) {
        const capturedAmountPaise = Number(captured.amount)
        const mismatch = !Number.isSafeInteger(capturedAmountPaise) || paymentIdentityMismatch({ providerOrderId: payment.provider_order_id, providerPaymentId: payment.provider_payment_id, amountPaise: Number(payment.amount_paise), currency: payment.currency, status: payment.status }, { orderId: captured.order_id, paymentId: captured.id, amountPaise: capturedAmountPaise, currency: captured.currency })
        if (mismatch) {
          await db.from('payments').update({ status: 'needs_review', provider_payment_id: captured.id, updated_at: new Date().toISOString() }).eq('provider_order_id', payment.provider_order_id).neq('status', 'captured')
        } else if (payment.status !== 'captured' && enrollment.status === 'pending_payment') {
          await db.rpc('confirm_captured_payment', { p_provider_order_id: payment.provider_order_id, p_provider_payment_id: captured.id, p_amount_paise: capturedAmountPaise, p_currency: captured.currency, p_signature_verified: true })
        }
      }
      else {
        const failed = attempts.items.find(item => item.status === 'failed')
        if (failed) await markFailedPayment(db, failed.id, payment.provider_order_id)
      }
    } catch { /* Webhook/callback can resolve the pending state later. */ }
  }

  const { data: finalEnrollment } = await db.from('enrolments').select('status').eq('id', enrollment.id).single()
  const { data: finalPayment } = await db.from('payments').select('provider_payment_id,amount_paise,currency,status,captured_at').eq('enrolment_id', enrollment.id).order('attempt_number', { ascending: false }).limit(1).maybeSingle()
  const { data: refundRequest } = await db.from('refund_requests').select('request_reference,status,requested_at,cutoff_at,decision,decided_at,approved_amount_paise,provider_status').eq('enrolment_id', enrollment.id).maybeSingle()
  const status = finalEnrollment?.status === 'confirmed' ? 'confirmed' : finalPayment?.status === 'failed' ? 'failed' : finalPayment?.status === 'needs_review' || finalEnrollment?.status === 'needs_review' ? 'needs_review' : 'pending'
  return res.json({ status, enrolmentReference: enrollment.public_reference, studentName: student?.full_name ?? '', program: enrollment.program_snapshot, subjects: enrollment.subjects_snapshot, price: enrollment.pricing_snapshot, payment: finalPayment ? { reference: finalPayment.provider_payment_id, amountPaise: finalPayment.amount_paise, currency: finalPayment.currency, status: finalPayment.status, capturedAt: finalPayment.captured_at } : null, refundRequest: refundRequest ? { reference: refundRequest.request_reference, status: refundRequest.status, requestedAt: refundRequest.requested_at, cutoffAt: refundRequest.cutoff_at, decision: refundRequest.decision, decidedAt: refundRequest.decided_at, approvedAmountPaise: refundRequest.approved_amount_paise, providerStatus: refundRequest.provider_status } : null, support: { whatsappPhone: config.WHATSAPP_PHONE, telegramUrl: config.TELEGRAM_URL } })
})

const refundRequestSchema = z.object({ reason: z.string().trim().min(4).max(2000) }).strict()
app.post('/api/v1/enrolments/:reference/refunds', publicLimiter, csrfOriginGuard, async (req, res) => {
  if (!hasDatabase) return databaseUnavailable(res)
  const parsed = refundRequestSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 422, 'VALIDATION_ERROR', 'Enter a short reason for the refund request.')
  const reference = String(req.params.reference ?? '')
  const enrollment = await getEnrollmentByToken(reference, req.get('x-enrolment-token') ?? '')
  if (!enrollment) return fail(res, 404, 'ENROLMENT_NOT_FOUND', 'This confirmation link is invalid or expired.')
  const key = req.get('idempotency-key')
  if (!validIdempotencyKey(key)) return fail(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Refresh the page and try again.')
  const { data, error } = await getDatabase().rpc('request_refund', { p_public_reference: reference, p_idempotency_key: key, p_reason: parsed.data.reason })
  if (error) {
    const message = String(error.message ?? '')
    if (message.includes('REFUND_REQUEST_WINDOW_CLOSED')) return fail(res, 409, 'REFUND_WINDOW_CLOSED', 'The standard refund request window has closed. Contact Radix Minds if an applicable legal exception needs review.')
    if (message.includes('REFUND_PAYMENT_NOT_CAPTURED')) return fail(res, 409, 'REFUND_PAYMENT_NOT_CAPTURED', 'A verified captured payment is required to request a refund.')
    if (message.includes('REFUND_REQUEST_EXISTS')) return fail(res, 409, 'REFUND_REQUEST_EXISTS', 'A refund request already exists for this enrolment.')
    if (message.includes('ENROLMENT_NOT_FOUND')) return fail(res, 404, 'ENROLMENT_NOT_FOUND', 'This enrolment could not be found.')
    return fail(res, 503, 'REFUND_REQUEST_UNAVAILABLE', 'The refund request could not be saved. Please contact Radix Minds.')
  }
  const request = Array.isArray(data) ? data[0] : data
  if (!request?.refund_request_id) return fail(res, 503, 'REFUND_REQUEST_UNAVAILABLE', 'The refund request could not be saved.')
  return res.status(request.existing ? 200 : 201).json({ submitted: true, status: request.status, requestReference: request.request_reference, requestedAt: request.requested_at, cutoffAt: request.cutoff_at, message: 'Your request has been received for review. Submission does not guarantee approval.' })
})

const refundExceptionSchema=z.object({enrolmentReference:z.string().regex(/^RM-[A-F0-9]{20}$/),reason:z.string().trim().min(4).max(2000),exceptionNote:z.string().trim().min(4).max(2000)}).strict()

app.post('/api/v1/enquiries', publicLimiter, csrfOriginGuard, async (req, res) => {
  if (!hasDatabase) return databaseUnavailable(res)
  const parsed = enquirySchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 422, 'VALIDATION_ERROR', 'Please check the enquiry form and try again.', Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0] ?? 'form'), issue.message])))
  const data = parsed.data
  const { error } = await getDatabase().from('enquiry_submissions').insert({ full_name: data.fullName, mobile_e164: normalizeIndiaMobile(data.mobile), email: data.email?.toLowerCase() || null, program_code: data.programCode || null, message: data.message, contact_consent_at: new Date().toISOString() })
  if (error) return fail(res, 503, 'ENQUIRY_SAVE_FAILED', 'We could not submit your enquiry just now. Please contact the team directly.')
  return res.status(201).json({ received: true, message: 'Your enquiry has been sent to the Radix Minds team.' })
})

function readCookie(req: express.Request, name: string) {
  const cookies = req.get('cookie') ?? ''
  const entry = cookies.split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : ''
}
async function getAdmin(req: express.Request) {
  if (!hasAdminAuth) return null
  const token = readCookie(req, 'rm_admin_session')
  if (!token) return null
  const auth = getAuthClient()
  const { data: { user }, error } = await auth.auth.getUser(token)
  if (error || !user) return null
  const { data: admin } = await getDatabase().from('admin_users').select('id,role,is_active').eq('id', user.id).maybeSingle()
  if (!admin?.is_active) return null
  return admin as { id: string; role: 'owner' | 'operations' | 'finance'; is_active: boolean }
}
async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const admin = await getAdmin(req)
    if (!admin) return fail(res, 401, 'ADMIN_AUTH_REQUIRED', 'Please sign in with an authorized Radix Minds admin account.')
    res.locals.admin = admin
    return next()
  } catch { return fail(res, 503, 'ADMIN_AUTH_UNAVAILABLE', 'Admin sign-in is temporarily unavailable.') }
}

app.post('/api/v1/admin/refunds/exception',requireAdmin,csrfOriginGuard,async(req,res)=>{
  if(!canManageEnrolments(res))return fail(res,403,'ADMIN_ROLE_RESTRICTED','This admin role cannot record a refund exception.')
  if(!hasDatabase)return databaseUnavailable(res)
  const parsed=refundExceptionSchema.safeParse(req.body)
  if(!parsed.success)return fail(res,422,'VALIDATION_ERROR','Provide the enrolment reference, request reason and documented exception basis.')
  const admin=res.locals.admin as {id:string}
  const {data,error}=await getDatabase().rpc('request_refund_exception',{p_public_reference:parsed.data.enrolmentReference,p_idempotency_key:randomUUID(),p_reason:parsed.data.reason,p_admin_user_id:admin.id,p_exception_note:parsed.data.exceptionNote})
  if(error){const message=String(error.message??'');if(message.includes('REFUND_PAYMENT_NOT_CAPTURED'))return fail(res,409,'REFUND_PAYMENT_NOT_CAPTURED','A verified captured payment is required.');if(message.includes('ENROLMENT_NOT_FOUND'))return fail(res,404,'ENROLMENT_NOT_FOUND','Enrolment was not found.');return fail(res,503,'REFUND_EXCEPTION_UNAVAILABLE','The exception request could not be recorded.')}
  const request=Array.isArray(data)?data[0]:data
  if(!request?.refund_request_id)return fail(res,503,'REFUND_EXCEPTION_UNAVAILABLE','The exception request could not be recorded.')
  return res.status(request.existing?200:201).json({submitted:true,requestReference:request.request_reference,status:request.status,authorizedException:true})
})

const refundDecisionSchema = z.object({ decision: z.enum(['approved','rejected']), approvedAmountPaise: z.number().int().positive().optional(), internalNote: z.string().max(4000).optional() }).strict()
app.get('/api/v1/admin/refunds', requireAdmin, async (_req,res) => {
  if (!canManageEnrolments(res)) return fail(res,403,'ADMIN_ROLE_RESTRICTED','This admin role cannot review refund requests.')
  if (!hasDatabase) return databaseUnavailable(res)
  const {data,error}=await getDatabase().from('refund_requests').select('id,enrolment_id,payment_id,request_reference,requested_at,cutoff_at,reason,status,decision,decided_at,approved_amount_paise,internal_note,provider_refund_id,provider_status,failure_reason').order('requested_at',{ascending:false}).limit(200)
  if(error)return fail(res,503,'REFUND_LIST_UNAVAILABLE','Refund requests could not be loaded. Confirm the refund schema migration is installed.')
  const enrolmentIds=[...new Set((data??[]).map(row=>row.enrolment_id))];const paymentIds=[...new Set((data??[]).map(row=>row.payment_id))]
  const [{data:enrolments,error:enrolmentError},{data:payments,error:paymentError}]=await Promise.all([
    enrolmentIds.length?getDatabase().from('enrolments').select('id,public_reference,student_id,program_snapshot').in('id',enrolmentIds):Promise.resolve({data:[],error:null}),
    paymentIds.length?getDatabase().from('payments').select('id,provider_payment_id,amount_paise,currency,status').in('id',paymentIds):Promise.resolve({data:[],error:null}),
  ])
  if(enrolmentError||paymentError)return fail(res,503,'REFUND_LIST_UNAVAILABLE','Refund request relationships could not be loaded.')
  const studentIds=[...new Set((enrolments??[]).map(row=>row.student_id))]
  const {data:students,error:studentError}=studentIds.length?await getDatabase().from('students').select('id,full_name,mobile_e164,email').in('id',studentIds):{data:[],error:null}
  if(studentError)return fail(res,503,'REFUND_LIST_UNAVAILABLE','Student details for refund review could not be loaded.')
  const byEnrolment=new Map((enrolments??[]).map(row=>[row.id,row]));const byPayment=new Map((payments??[]).map(row=>[row.id,row]));const byStudent=new Map((students??[]).map(row=>[row.id,row]))
  return res.json({refundRequests:(data??[]).map(item=>{const enrolment=byEnrolment.get(item.enrolment_id);const payment=byPayment.get(item.payment_id);const student=enrolment?byStudent.get(enrolment.student_id):null;return {id:item.id,requestReference:item.request_reference,requestedAt:item.requested_at,cutoffAt:item.cutoff_at,reason:item.reason,status:item.status,decision:item.decision,decidedAt:item.decided_at,approvedAmountPaise:item.approved_amount_paise,providerRefundId:item.provider_refund_id,providerStatus:item.provider_status,failureReason:item.failure_reason,internalNote:item.internal_note,student:student?{name:student.full_name,mobile:student.mobile_e164,email:student.email}:null,enrolment:enrolment?{reference:enrolment.public_reference,program:enrolment.program_snapshot}:null,payment:payment?{reference:payment.provider_payment_id,amountPaise:payment.amount_paise,currency:payment.currency,status:payment.status}:null}})})
})

app.post('/api/v1/admin/refunds/:id/decision',requireAdmin,csrfOriginGuard,async(req,res)=>{
  if(!canManageEnrolments(res))return fail(res,403,'ADMIN_ROLE_RESTRICTED','This admin role cannot decide refund requests.')
  const id=z.uuid().safeParse(req.params.id);const parsed=refundDecisionSchema.safeParse(req.body)
  if(!id.success||!parsed.success)return fail(res,422,'VALIDATION_ERROR','Enter a valid refund decision and approved amount.')
  if(parsed.data.decision==='rejected'&&parsed.data.approvedAmountPaise!==undefined)return fail(res,422,'REFUND_AMOUNT_INVALID','A rejected request cannot have an approved refund amount.')
  const admin=res.locals.admin as {id:string}
  const {data,error}=await getDatabase().rpc('decide_refund_request',{p_refund_request_id:id.data,p_admin_user_id:admin.id,p_decision:parsed.data.decision,p_approved_amount_paise:parsed.data.approvedAmountPaise??null,p_internal_note:parsed.data.internalNote??null})
  if(error){const message=String(error.message??'');if(message.includes('REFUND_AMOUNT_INVALID'))return fail(res,422,'REFUND_AMOUNT_INVALID','The approved amount must be no more than the captured payment amount.');if(message.includes('REFUND_DECISION_CONFLICT'))return fail(res,409,'REFUND_DECISION_CONFLICT','This refund request has already been decided or is being processed.');return fail(res,503,'REFUND_DECISION_UNAVAILABLE','The refund decision could not be recorded.')}
  const decision=Array.isArray(data)?data[0]:data
  if(!decision?.refund_request_id)return fail(res,503,'REFUND_DECISION_UNAVAILABLE','The refund decision could not be recorded.')
  return res.json({updated:true,status:decision.status,approvedAmountPaise:decision.approved_amount_paise})
})

app.post('/api/v1/admin/refunds/:id/process',requireAdmin,csrfOriginGuard,async(req,res)=>{
  if(!canManageEnrolments(res))return fail(res,403,'ADMIN_ROLE_RESTRICTED','This admin role cannot initiate refunds.')
  if(!hasDatabase)return databaseUnavailable(res)
  if(!checkoutBaseReady||config.RAZORPAY_MODE!=='test'||!config.RAZORPAY_KEY_ID?.startsWith('rzp_test_')||!config.RAZORPAY_KEY_SECRET)return fail(res,503,'REFUND_PROCESSING_DISABLED','Refund processing is disabled until an authorized test-mode payment configuration is enabled.')
  const id=z.uuid().safeParse(req.params.id);if(!id.success)return fail(res,404,'REFUND_REQUEST_NOT_FOUND','Refund request was not found.')
  const admin=res.locals.admin as {id:string}
  const {data:claimRows,error:claimError}=await getDatabase().rpc('claim_refund_processing',{p_refund_request_id:id.data,p_admin_user_id:admin.id})
  const claim=Array.isArray(claimRows)?claimRows[0]:claimRows
  if(claimError||!claim?.provider_payment_id||!claim?.provider_idempotency_key||!claim?.amount_paise)return fail(res,409,'REFUND_NOT_READY','Only an approved refund can be processed.')
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000)
  try{
    const authorization=Buffer.from(`${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`).toString('base64')
    const response=await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(claim.provider_payment_id)}/refund`,{method:'POST',headers:{Authorization:`Basic ${authorization}`,'Content-Type':'application/json','X-Refund-Idempotency':claim.provider_idempotency_key},body:JSON.stringify({amount:Number(claim.amount_paise),notes:{refund_request_id:String(claim.refund_request_id)}}),signal:controller.signal})
    const provider=await response.json().catch(()=>null) as {id?:unknown;status?:unknown}|null
    if(!response.ok||typeof provider?.id!=='string'||!['processed','pending','failed'].includes(String(provider.status))){
      await getDatabase().rpc('record_refund_provider_result',{p_refund_request_id:id.data,p_admin_user_id:admin.id,p_provider_status:'failed',p_provider_refund_id:null,p_failure_reason:`RAZORPAY_HTTP_${response.status}`})
      return fail(res,502,'REFUND_PROVIDER_FAILED','Razorpay did not accept the refund request. Review the recorded status before retrying.')
    }
    const {data:resultRows,error:resultError}=await getDatabase().rpc('record_refund_provider_result',{p_refund_request_id:id.data,p_admin_user_id:admin.id,p_provider_status:provider.status,p_provider_refund_id:provider.id,p_failure_reason:null})
    const result=Array.isArray(resultRows)?resultRows[0]:resultRows
    if(resultError||!result?.refund_request_id)return fail(res,202,'REFUND_RECONCILIATION_PENDING','Razorpay returned a refund reference. Database reconciliation is pending; do not create a new refund request.')
    return res.json({processed:true,status:result.status,providerStatus:result.provider_status,providerRefundId:result.provider_refund_id})
  }catch{
    return res.status(202).json({processed:false,status:'refund_processing',message:'The provider result is being reconciled. Retry only from this admin request so the same idempotency key and amount are reused.'})
  }finally{clearTimeout(timer)}
})

app.post('/api/v1/admin/session', adminLoginLimiter, csrfOriginGuard, async (req, res) => {
  if (!hasAdminAuth) return fail(res, 503, 'ADMIN_NOT_CONFIGURED', 'Supabase admin sign-in is not configured.')
  const parsed = z.object({ email: z.email().max(180), password: z.string().min(8).max(256) }).safeParse(req.body)
  if (!parsed.success) return fail(res, 422, 'VALIDATION_ERROR', 'Enter a valid admin email and password.')
  const auth = getAuthClient()
  const { data, error } = await auth.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password })
  if (error || !data.session || !data.user) return fail(res, 401, 'ADMIN_SIGN_IN_FAILED', 'Admin sign-in failed.')
  const { data: admin } = await getDatabase().from('admin_users').select('id,is_active,role').eq('id', data.user.id).maybeSingle()
  if (!admin?.is_active) return fail(res, 403, 'ADMIN_NOT_AUTHORIZED', 'This account is not authorized for the enrolment console.')
  res.cookie('rm_admin_session', data.session.access_token, { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', maxAge: data.session.expires_in * 1000, path: '/api/v1/admin' })
  return res.json({ signedIn: true, admin: { email: data.user.email, role: admin.role } })
})
app.post('/api/v1/admin/session/logout', csrfOriginGuard, (req, res) => {
  res.clearCookie('rm_admin_session', { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', path: '/api/v1/admin' })
  res.json({ signedOut: true })
})
app.get('/api/v1/admin/session', requireAdmin, (_req, res) => res.json({ signedIn: true, role: (res.locals.admin as { role: string }).role }))
app.get('/api/v1/admin/dashboard', requireAdmin, async (_req, res) => {
  if (!hasDatabase) return databaseUnavailable(res)
  const { data, error } = await getDatabase().rpc('get_admin_dashboard_metrics')
  if (error || !data) return fail(res, 503, 'ADMIN_METRICS_UNAVAILABLE', 'Dashboard totals could not be loaded.')
  return res.json({ metrics: data })
})

const adminListQuery = z.object({
  search: z.string().max(100).optional(),
  program: z.enum(['class-10','class-12']).optional(),
  status: z.enum(['pending_payment','confirmed','cancelled','refunded','needs_review']).optional(),
  paymentStatus: z.enum(['creating','order_failed','created','authorized','captured','failed','cancelled','needs_review','unpaid','recorded_paid','not_started']).optional(),
  learningMode: z.enum(['online','hybrid','offline']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
})
async function getAdminEnrolmentPage(req: express.Request, page: number, pageSize: number) {
  const params = adminListQuery.safeParse({ ...req.query, page, pageSize })
  if (!params.success) throw new Error('INVALID_ADMIN_FILTER')
  const term = params.data.search?.replace(/[%_,*()]/g, ' ').trim().slice(0, 100) || null
  const { data, error } = await getDatabase().rpc(params.data.learningMode ? 'admin_enrolment_page_by_mode' : 'admin_enrolment_page', {
    p_search: term,
    p_program: params.data.program ?? null,
    p_enrolment_status: params.data.status ?? null,
    p_payment_status: params.data.paymentStatus ?? null,
    ...(params.data.learningMode ? { p_learning_mode: params.data.learningMode } : {}),
    p_page: params.data.page,
    p_page_size: params.data.pageSize,
  })
  if (error || !data) throw new Error('ADMIN_DATA_UNAVAILABLE')
  const result = data as { enrolments: Array<Record<string, unknown>>; total: number; page: number; pageSize: number }
  if (result.enrolments.length) {
    const ids = result.enrolments.map(row => String(row.id))
    const { data: consentRows, error: consentError } = await getDatabase().from('enrolments').select('id,whatsapp_updates_consent_at,whatsapp_mobile_e164').in('id', ids)
    if (consentError) throw new Error('ADMIN_CONSENT_DATA_UNAVAILABLE')
    const consentById = new Map((consentRows ?? []).map(row => [row.id, {consented:Boolean(row.whatsapp_updates_consent_at),number:row.whatsapp_mobile_e164}]))
    result.enrolments = result.enrolments.map(row => ({ ...row, whatsapp_updates_consented: consentById.get(String(row.id))?.consented ?? false, whatsapp_mobile_e164:consentById.get(String(row.id))?.number ?? null }))
  }
  return result
}

app.get('/api/v1/admin/enrolments', requireAdmin, async (req, res) => {
  if (!hasDatabase) return databaseUnavailable(res)
  const role = (res.locals.admin as { role: 'owner' | 'operations' | 'finance' }).role
  try {
    const data = await getAdminEnrolmentPage(req, Number(req.query.page) || 1, Number(req.query.pageSize) || 30)
    const enrolments = role === 'finance' ? data.enrolments.map(row => {
      const financeRow = { ...row }
      for (const key of ['student_name','student_mobile','student_email','board','school_name','internal_remarks','student_id','whatsapp_updates_consented']) delete financeRow[key]
      return financeRow
    }) : data.enrolments
    return res.json({ ...data, enrolments })
  } catch { return fail(res, 422, 'ADMIN_FILTER_INVALID', 'Check the enrolment filters and try again.') }
})

app.post('/api/v1/admin/enrolments/:id/whatsapp-draft', requireAdmin, csrfOriginGuard, async (req, res) => {
  if (!canManageEnrolments(res)) return fail(res,403,'ADMIN_ROLE_RESTRICTED','This admin role cannot access student contact information.')
  const id = z.uuid().safeParse(req.params.id)
  if (!id.success) return fail(res,404,'ENROLMENT_NOT_FOUND','Enrolment was not found.')
  const db = getDatabase()
  const { data: enrolment, error: enrolmentError } = await db.from('enrolments').select('id,public_reference,status,source,student_id,program_snapshot,subjects_snapshot,pricing_snapshot,whatsapp_updates_consent_at,whatsapp_mobile_e164').eq('id',id.data).maybeSingle()
  if (enrolmentError) return fail(res,503,'WHATSAPP_DRAFT_UNAVAILABLE','WhatsApp confirmation is unavailable until the consent schema is installed.')
  if (!enrolment) return fail(res,404,'ENROLMENT_NOT_FOUND','Enrolment was not found.')
  if (enrolment.source !== 'online' || enrolment.status !== 'confirmed' || !enrolment.whatsapp_updates_consent_at) return fail(res,409,'WHATSAPP_NOT_ELIGIBLE','A manual message requires an online confirmed enrolment and recorded WhatsApp consent.')
  const [{ data: student, error: studentError }, { data: payment, error: paymentError }] = await Promise.all([
    db.from('students').select('full_name,mobile_e164').eq('id',enrolment.student_id).maybeSingle(),
    db.from('payments').select('provider_order_id,provider_payment_id,amount_paise,currency,status,captured_at').eq('enrolment_id',enrolment.id).eq('status','captured').order('attempt_number',{ascending:false}).limit(1).maybeSingle(),
  ])
  if (studentError || paymentError) return fail(res,503,'WHATSAPP_DRAFT_UNAVAILABLE','Verified admission details could not be loaded.')
  const snapshot = enrolment.pricing_snapshot as { payable_paise?: unknown; currency?: unknown } | null
  const paymentIsEligible = Boolean(payment && isWhatsAppConfirmationEligible({
    source:enrolment.source, enrolmentStatus:enrolment.status, consentAt:enrolment.whatsapp_updates_consent_at,
    paymentStatus:payment.status, paymentOrderId:payment.provider_order_id, paymentId:payment.provider_payment_id,
    capturedAt:payment.captured_at, paymentAmountPaise:Number(payment.amount_paise),
    paymentCurrency:payment.currency, expectedAmountPaise:Number(snapshot?.payable_paise),
    expectedCurrency:typeof snapshot?.currency === 'string' ? snapshot.currency : null,
  }))
  if (!student || !payment || !paymentIsEligible) return fail(res,409,'PAYMENT_NOT_VERIFIED','A captured payment matching this admission is required before preparing a confirmation.')
  try {
    const draft = buildWhatsAppConfirmationDraft({ studentName:student.full_name, studentMobile:enrolment.whatsapp_mobile_e164 ?? student.mobile_e164, admissionReference:enrolment.public_reference, programName:(enrolment.program_snapshot as {name?:string} | null)?.name ?? '75-Day Board Bootcamp', subjects:Array.isArray(enrolment.subjects_snapshot) ? enrolment.subjects_snapshot.map(String) : [], amountPaise:Number(payment.amount_paise), paymentReference:payment.provider_payment_id, supportPhone:config.WHATSAPP_PHONE })
    return res.json({ ready:true, sent:false, notice:'Draft prepared. Review and send it manually in WhatsApp.', ...draft })
  } catch {
    return fail(res,422,'WHATSAPP_DRAFT_INVALID','The saved student contact number is not valid for WhatsApp.')
  }
})

function csvCell(value: unknown) {
  const raw = String(value ?? '')
  const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}
app.get('/api/v1/admin/enrolments/export', requireAdmin, async (req, res) => {
  const role = (res.locals.admin as { role: 'owner' | 'operations' | 'finance' }).role
  if (role === 'finance') return fail(res, 403, 'ADMIN_ROLE_RESTRICTED', 'This admin role cannot export student contact information.')
  if (!hasDatabase) return databaseUnavailable(res)
  try {
    const first = await getAdminEnrolmentPage(req, 1, 100)
    const all = [...first.enrolments]
    const pageCount = Math.min(100, Math.ceil(first.total / 100))
    for (let page = 2; page <= pageCount; page++) all.push(...(await getAdminEnrolmentPage(req, page, 100)).enrolments)
    const header = ['Enrolment ID','Student name','Mobile number','Class','Board','School','Payment status','Enrolment status','Registration date','Record source','Manual payment status','Payment reference','Amount (INR)','Internal remarks']
    const lines = all.map(row => {
      const program = row.program_snapshot as { code?: string; name?: string } | null
      const price = row.pricing_snapshot as { payable_paise?: number } | null
      return [row.public_reference,row.student_name,row.student_mobile,program?.code === 'class-10' ? 'Class 10' : 'Class 12',row.board,row.school_name,row.payment_status ?? row.manual_payment_status,row.status,row.created_at,row.source,row.manual_payment_status,row.provider_payment_id,typeof row.payment_amount_paise === 'number' ? (row.payment_amount_paise / 100).toFixed(2) : typeof price?.payable_paise === 'number' ? (price.payable_paise / 100).toFixed(2) : '',row.internal_remarks].map(csvCell).join(',')
    })
    res.setHeader('Content-Type','text/csv; charset=utf-8')
    res.setHeader('Content-Disposition','attachment; filename="radix-minds-enrolments.csv"')
    return res.send(`\uFEFF${[header.map(csvCell).join(','),...lines].join('\r\n')}`)
  } catch { return fail(res, 422, 'ADMIN_EXPORT_FAILED', 'The filtered student export could not be created.') }
})

const adminEnrolmentUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  mobile: z.string().refine(isValidIndianMobile, 'Enter a valid Indian mobile number.').optional(),
  email: z.email().max(180).optional(),
  internalRemarks: z.string().max(4000).nullable().optional(),
}).refine(data => Object.values(data).some(value => value !== undefined), 'Add at least one change.')
function canManageEnrolments(res: express.Response) { return (res.locals.admin as { role: string }).role !== 'finance' }
app.patch('/api/v1/admin/enrolments/:id', requireAdmin, csrfOriginGuard, async (req, res) => {
  if (!canManageEnrolments(res)) return fail(res, 403, 'ADMIN_ROLE_RESTRICTED', 'This admin role cannot edit enrolment records.')
  const parsed = adminEnrolmentUpdateSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 422, 'VALIDATION_ERROR', 'Check the contact fields or internal remark and try again.')
  const db = getDatabase()
  const { data: row, error: lookupError } = await db.from('enrolments').select('id,student_id').eq('id',req.params.id).maybeSingle()
  if (lookupError || !row) return fail(res, 404, 'ENROLMENT_NOT_FOUND', 'Enrolment record was not found.')
  const { fullName, mobile, email, internalRemarks } = parsed.data
  if (fullName !== undefined || mobile !== undefined || email !== undefined) {
    const changes: Record<string, string> = {}
    if (fullName !== undefined) changes.full_name = fullName
    if (mobile !== undefined) changes.mobile_e164 = normalizeIndiaMobile(mobile)
    if (email !== undefined) changes.email = email.toLowerCase()
    const { error } = await db.from('students').update(changes).eq('id',row.student_id)
    if (error) return fail(res, 503, 'STUDENT_UPDATE_FAILED', 'Student contact information could not be updated.')
  }
  if (internalRemarks !== undefined) {
    const admin = res.locals.admin as { id: string }
    const { error } = await db.from('enrolments').update({ internal_remarks: internalRemarks || null, remarks_updated_by: admin.id, updated_at: new Date().toISOString() }).eq('id',row.id)
    if (error) return fail(res, 503, 'REMARK_UPDATE_FAILED', 'Internal remarks could not be saved.')
  }
  return res.json({ updated: true })
})

const manualEnrolmentSchema = z.object({
  fullName: z.string().trim().min(2).max(120), mobile: z.string().refine(isValidIndianMobile), email: z.email().max(180),
  programCode: z.enum(['class-10','class-12']), board: z.string().trim().min(2).max(80), schoolName: z.string().trim().min(2).max(180),
  dateOfBirth: z.union([z.literal(''),z.iso.date()]).optional(), preferredLanguage: z.string().trim().max(50).optional(),
  subjectChoice: z.enum(['Mathematics','Biology']).nullable().optional(), learningMode: z.enum(['online','offline','hybrid']).nullable().optional(),
  manualPaymentStatus: z.enum(['unpaid','recorded_paid']), manualPaymentReference: z.string().trim().max(160).optional(),
  internalRemarks: z.string().max(4000).optional(), consentsRecorded: z.literal(true),
  policyVersions: policyVersionsSchema,
})
app.post('/api/v1/admin/manual-enrolments', requireAdmin, csrfOriginGuard, async (req,res) => {
  if (!canManageEnrolments(res)) return fail(res,403,'ADMIN_ROLE_RESTRICTED','This admin role cannot create manual enrolments.')
  if (config.POLICIES_APPROVED !== 'true') return fail(res,503,'POLICIES_NOT_APPROVED','Manual enrolment creation is paused until the approved policies and consent workflow are ready.')
  const parsed = manualEnrolmentSchema.safeParse(req.body)
  if (!parsed.success) return fail(res,422,'VALIDATION_ERROR','Check the student, program and consent details before saving.')
  const input = parsed.data
  if (input.programCode === 'class-10' && input.subjectChoice) return fail(res,422,'INVALID_PATHWAY','Class 10 does not use a Mathematics/Biology pathway.')
  const db = getDatabase()
  const { data: program, error } = await db.from('programs').select('id,code,name,duration_days,program_fee_paise,standard_fee_paise,discount_percent,currency,subjects,program_learning_modes(mode,label,is_available)').eq('code',input.programCode).eq('is_active',true).maybeSingle()
  if (error || !program) return fail(res,404,'PROGRAM_NOT_FOUND','Active program was not found.')
  const modes = (program.program_learning_modes as Array<{mode:string;label:string;is_available:boolean}> ?? []).filter(mode => mode.is_available)
  const selectedMode = input.learningMode ? modes.find(mode => mode.mode === input.learningMode) : null
  if (input.learningMode && !selectedMode) return fail(res,422,'LEARNING_MODE_UNAVAILABLE','Choose a mode currently offered for the program.')
  const admin = res.locals.admin as {id:string}
  const subjects = input.programCode === 'class-10' ? ['Mathematics','Science','Social Science','English'] : input.subjectChoice ? ['Physics','Chemistry',input.subjectChoice] : ['Physics','Chemistry','Mathematics or Biology (to be confirmed)']
  const { data: created, error: createError } = await db.rpc('create_admin_manual_enrolment',{p_input:{
    admin_user_id:admin.id,idempotency_key:randomUUID(),public_reference:newPublicReference(),full_name:input.fullName,mobile_e164:normalizeIndiaMobile(input.mobile),email:input.email.toLowerCase(),
    date_of_birth:input.dateOfBirth || '',guardian_name:'',guardian_mobile_e164:'',guardian_email:'',
    program_id:program.id,board:input.board,school_name:input.schoolName,preferred_language:input.preferredLanguage || '',subject_choice:input.subjectChoice || '',learning_mode:input.learningMode || '',
    terms_policy_version:input.policyVersions.terms,privacy_policy_version:input.policyVersions.privacy,refund_policy_version:input.policyVersions.refund,
    consents_recorded:input.consentsRecorded,
    program_snapshot:{code:program.code,name:program.name,duration_days:program.duration_days,learning_mode:input.learningMode || null,learning_mode_label:selectedMode?.label ?? 'To be confirmed with Radix Minds'},
    subjects_snapshot:subjects,pricing_snapshot:{currency:program.currency,payable_paise:program.program_fee_paise,standard_paise:program.standard_fee_paise,discount_percent:verifiedDiscountPercent(program)},
    status_token_hash:sha256(randomUUID()),internal_remarks:input.internalRemarks || '',manual_payment_status:input.manualPaymentStatus,manual_payment_reference:input.manualPaymentReference || '',
  }})
  const record = Array.isArray(created) ? created[0] : created
  if (createError || !record?.enrolment_id) return fail(res,503,'MANUAL_ENROLMENT_FAILED','The manual enrolment could not be saved.')
  return res.status(201).json({created:true,source:'manual',enrolmentId:record.public_reference,manualPaymentStatus:input.manualPaymentStatus,verifiedOnlinePayment:false})
})

const manualPaymentUpdateSchema = z.object({status:z.enum(['unpaid','recorded_paid']),reference:z.string().trim().max(160).optional()})
app.patch('/api/v1/admin/enrolments/:id/manual-payment', requireAdmin, csrfOriginGuard, async (req,res) => {
  if (!canManageEnrolments(res)) return fail(res,403,'ADMIN_ROLE_RESTRICTED','This admin role cannot update manual payment records.')
  const parsed = manualPaymentUpdateSchema.safeParse(req.body)
  if (!parsed.success) return fail(res,422,'VALIDATION_ERROR','Choose a valid manual payment state.')
  const admin = res.locals.admin as {id:string}
  const {data:updated,error} = await getDatabase().from('enrolments').update({manual_payment_status:parsed.data.status,manual_payment_reference:parsed.data.reference || null,manual_payment_recorded_at:parsed.data.status==='recorded_paid'?new Date().toISOString():null,manual_payment_recorded_by:parsed.data.status==='recorded_paid'?admin.id:null,updated_at:new Date().toISOString()}).eq('id',req.params.id).eq('source','manual').select('id').maybeSingle()
  if (error || !updated) return fail(res,404,'MANUAL_ENROLMENT_NOT_FOUND','Manual enrolment was not found.')
  return res.json({updated:true,verifiedOnlinePayment:false})
})
app.get('/api/v1/admin/enquiries', requireAdmin, async (req, res) => {
  const role = (res.locals.admin as { role: 'owner' | 'operations' | 'finance' }).role
  if (role === 'finance') return fail(res, 403, 'ADMIN_ROLE_RESTRICTED', 'This admin role cannot access student enquiries.')
  if (!hasDatabase) return databaseUnavailable(res)
  const requestedPage = Number(req.query.page)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1
  const pageSize = 30
  let query = getDatabase().from('enquiry_submissions').select('id,full_name,mobile_e164,email,program_code,message,status,internal_remarks,created_at', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
  if (typeof req.query.status === 'string' && ['new','in_progress','resolved','closed'].includes(req.query.status)) query = query.eq('status',req.query.status)
  const { data, count, error } = await query
  if (error) return fail(res, 503, 'ADMIN_DATA_UNAVAILABLE', 'Enquiries could not be loaded.')
  return res.json({ enquiries: data, total: count ?? 0, page, pageSize })
})
app.patch('/api/v1/admin/enquiries/:id', requireAdmin, csrfOriginGuard, async (req,res) => {
  if (!canManageEnrolments(res)) return fail(res,403,'ADMIN_ROLE_RESTRICTED','This admin role cannot manage enquiries.')
  const parsed = z.object({status:z.enum(['new','in_progress','resolved','closed']).optional(),internalRemarks:z.string().max(4000).nullable().optional()}).refine(value => value.status !== undefined || value.internalRemarks !== undefined).safeParse(req.body)
  if (!parsed.success) return fail(res,422,'VALIDATION_ERROR','Choose an enquiry status or enter an internal remark.')
  const admin = res.locals.admin as {id:string}
  const patch: Record<string,unknown> = {updated_at:new Date().toISOString(),handled_by:admin.id}
  if (parsed.data.status !== undefined) patch.status = parsed.data.status
  if (parsed.data.internalRemarks !== undefined) patch.internal_remarks = parsed.data.internalRemarks || null
  const {data,error} = await getDatabase().from('enquiry_submissions').update(patch).eq('id',req.params.id).select('id').maybeSingle()
  if (error || !data) return fail(res,404,'ENQUIRY_NOT_FOUND','Enquiry record was not found.')
  return res.json({updated:true})
})

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error('api_error', { requestId: res.locals.requestId, name: error instanceof Error ? error.name : 'unknown' })
  return fail(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again or contact the team.')
}

// API fallthrough and error handling are attached by each runtime entry point.
// The Netlify function adds only these API handlers; the Node server also adds
// the static Vite frontend before them.
const apiNotFoundHandler: express.RequestHandler = (_req, res) => fail(res, 404, 'NOT_FOUND', 'API route was not found.')

export { app, apiNotFoundHandler, errorHandler }
