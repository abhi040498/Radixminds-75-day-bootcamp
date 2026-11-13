import express, { type ErrorRequestHandler, type Request, type RequestHandler } from 'express'
import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import Razorpay from 'razorpay'
import { z } from 'zod'
import { config, boardOptions, languageOptions, hasAdminAuth, hasDatabase, hasRazorpay, checkoutBaseReady } from './config.js'
import { getAuthClient, getDatabase } from './supabase.js'
import { createStatusToken, csrfOriginGuard, newPublicReference, safeHexEqual, sha256, verifyHmac, validateRazorpayKeyMode } from './security.js'
import { createRazorpayWebhookHandler } from './razorpayWebhook.js'
import { razorpayWebhookStore } from './razorpayWebhookStore.js'
import { policyVersions } from './policyVersions.js'
import { policyAcknowledgementSchema, policyVersionsSchema } from './policyAcknowledgement.js'

const app = express()
app.disable('x-powered-by')
app.use(helmet({ crossOriginEmbedderPolicy: false }))
app.use(cors({ origin: config.APP_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Enrolment-Token'] }))
app.use((req, res, next) => {
  const suppliedRequestId = req.get('x-request-id')
  const requestId = suppliedRequestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedRequestId)
    ? suppliedRequestId
    : randomUUID()
  res.setHeader('x-request-id', requestId)
  res.locals.requestId = requestId
  next()
})

// Netlify's trusted platform IP is adapted to socket.remoteAddress by the
// function entry point. Never use X-Forwarded-For or enable Express proxy trust.
app.set('trust proxy', false)
function trustedRateLimitKey(req: Request) {
  const clientIp = req.socket.remoteAddress
  // The route guard below rejects missing/invalid addresses before a limiter.
  // Keep a restrictive key as a final defense if the guard is ever reordered.
  return typeof clientIp === 'string' && isIP(clientIp) !== 0
    ? ipKeyGenerator(clientIp)
    : 'trusted-client-ip-unavailable'
}
const limiterOptions = { windowMs: 15 * 60 * 1000, standardHeaders: 'draft-8' as const, legacyHeaders: false, keyGenerator: trustedRateLimitKey }
const publicLimiter = rateLimit({ ...limiterOptions, limit: 30 })
const checkoutLimiter = rateLimit({ ...limiterOptions, limit: 8 })
const adminLoginLimiter = rateLimit({ ...limiterOptions, limit: 8 })

const requireTrustedClientIp: RequestHandler = (req, res, next) => {
  const clientIp = req.socket.remoteAddress
  if (typeof clientIp !== 'string' || isIP(clientIp) === 0) {
    return fail(res, 503, 'CLIENT_IP_UNAVAILABLE', 'This request cannot be processed right now. Please try again later.')
  }
  return next()
}

const requireEnrollmentPolicy: RequestHandler = (_req, res, next) => {
  if (config.POLICIES_APPROVED !== 'true') {
    return fail(res, 503, 'POLICIES_NOT_APPROVED', 'Enrolment submissions are temporarily unavailable while the first-seven-day refund clause is finalized. Please contact Radix Minds.')
  }
  return next()
}

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
}).extend(policyAcknowledgementSchema.shape)

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
const handleRazorpayWebhook = createRazorpayWebhookHandler(config.RAZORPAY_WEBHOOK_SECRET, razorpayWebhookStore)
app.post('/api/v1/webhooks/razorpay', razorpayWebhook, async (req, res) => {
  if (!hasDatabase) return res.status(503).json({ error: 'Webhook processing is not available.' })
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

app.post('/api/v1/enrolments', csrfOriginGuard, requireEnrollmentPolicy, requireTrustedClientIp, publicLimiter, async (req, res) => {
  if (!hasDatabase) return databaseUnavailable(res)
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
  if (!program.is_active || !program.enrolment_open) return fail(res, 409, 'ENROLMENT_CLOSED', 'Enrolment for this program is currently closed. Please contact the team.')
  const availableModes = (program.program_learning_modes as Array<{ mode: string; label: string; is_available: boolean }> ?? []).filter(mode => mode.is_available)
  if (!availableModes.length) return fail(res, 409, 'LEARNING_MODE_UNAVAILABLE', 'This batch is not configured for enrolment yet. Please contact the team.')
  const selectedMode = input.learningMode ? availableModes.find(mode => mode.mode === input.learningMode) : null
  if (input.learningMode && !selectedMode) return fail(res, 422, 'LEARNING_MODE_UNAVAILABLE', 'This learning mode is not offered for the selected batch.')

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
    terms_accepted: input.termsAccepted,
    privacy_consent: input.privacyConsent,
    refund_policy_accepted: input.refundPolicyAccepted,
    terms_policy_version: input.policyVersions.terms,
    privacy_policy_version: input.policyVersions.privacy,
    refund_policy_version: input.policyVersions.refund,
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

app.post('/api/v1/enrolments/:reference/payment-orders', csrfOriginGuard, requireTrustedClientIp, checkoutLimiter, async (req, res) => {
  if (!hasDatabase) return databaseUnavailable(res)
  if (!checkoutBaseReady || !validateRazorpayKeyMode()) return fail(res, 503, 'PAYMENT_NOT_CONFIGURED', 'Secure online payment is not configured yet. Please contact Radix Minds.')
  const token = req.get('x-enrolment-token') ?? ''
  const enrollment = await getEnrollmentByToken(String(req.params.reference ?? ''), token)
  if (!enrollment) return fail(res, 404, 'ENROLMENT_NOT_FOUND', 'This registration could not be found. Return to the enrolment form or contact the team.')
  if (enrollment.status === 'confirmed') return fail(res, 409, 'ALREADY_CONFIRMED', 'This enrolment is already confirmed.')
  const key = req.get('idempotency-key')
  if (!validIdempotencyKey(key)) return fail(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Refresh the checkout step and try again.')
  const { data: claimed, error: claimError } = await getDatabase().rpc('claim_payment_attempt', { p_enrolment_id: enrollment.id, p_idempotency_key: key })
  const payment = Array.isArray(claimed) ? claimed[0] : claimed
  if (claimError || !payment) return fail(res, 503, 'PAYMENT_ORDER_UNAVAILABLE', 'We could not prepare checkout. Your registration is saved; please retry in a moment.')
  if (payment.provider_order_id) return res.json(withCheckoutOrder(payment, enrollment.public_reference))
  if (payment.status !== 'creating') return fail(res, 409, 'PAYMENT_ORDER_RETRY', 'Please retry checkout to create a fresh payment order.')

  try {
    const client = razorpayClient()
    const order = await client.orders.create({ amount: Number(payment.amount_paise), currency: payment.currency, receipt: payment.payment_id, notes: { enrolment_reference: enrollment.public_reference, payment_attempt: String(payment.attempt_number) }, partial_payment: false })
    const { data: updated, error: updateError } = await getDatabase().from('payments').update({ provider_order_id: order.id, status: 'created', updated_at: new Date().toISOString() }).eq('id', payment.payment_id).select('id,status,provider_order_id,amount_paise,currency').single()
    if (updateError || !updated) return fail(res, 503, 'PAYMENT_ORDER_SAVE_FAILED', 'Payment order is not ready yet. Please retry; do not make a second payment.')
    return res.status(201).json(withCheckoutOrder(updated, enrollment.public_reference))
  } catch {
    await getDatabase().from('payments').update({ status: 'order_failed', updated_at: new Date().toISOString() }).eq('id', payment.payment_id).eq('status', 'creating')
    return fail(res, 503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Razorpay could not prepare checkout. Your registration is saved; please retry or contact the team.')
  }
})

const verifySchema = z.object({ enrolmentReference: z.string().regex(/^RM-[A-F0-9]{20}$/), razorpayOrderId: z.string().min(8).max(64), razorpayPaymentId: z.string().min(8).max(64), razorpaySignature: z.string().regex(/^[0-9a-f]{64}$/i) })
app.post('/api/v1/payments/verify', csrfOriginGuard, requireTrustedClientIp, checkoutLimiter, async (req, res) => {
  if (!hasDatabase || !checkoutBaseReady) return fail(res, 503, 'PAYMENT_NOT_CONFIGURED', 'Payment verification is not available yet. Please contact the team.')
  const parsed = verifySchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 422, 'VALIDATION_ERROR', 'Payment details could not be verified.')
  const token = req.get('x-enrolment-token') ?? ''
  const enrollment = await getEnrollmentByToken(parsed.data.enrolmentReference, token)
  if (!enrollment) return fail(res, 404, 'ENROLMENT_NOT_FOUND', 'Registration could not be found.')
  const db = getDatabase()
  const { data: paymentRow, error: lookupError } = await db.from('payments').select('id,provider_order_id,amount_paise,currency,status').eq('enrolment_id', enrollment.id).eq('provider_order_id', parsed.data.razorpayOrderId).maybeSingle()
  if (lookupError || !paymentRow) return fail(res, 400, 'PAYMENT_ORDER_MISMATCH', 'This payment order does not match the saved registration.')
  const signedMessage = `${paymentRow.provider_order_id}|${parsed.data.razorpayPaymentId}`
  if (!config.RAZORPAY_KEY_SECRET || !verifyHmac(signedMessage, parsed.data.razorpaySignature, config.RAZORPAY_KEY_SECRET)) return fail(res, 400, 'PAYMENT_SIGNATURE_INVALID', 'Payment verification failed. No enrolment confirmation was issued.')

  try {
    const providerPayment = await razorpayClient().payments.fetch(parsed.data.razorpayPaymentId)
    if (providerPayment.order_id !== paymentRow.provider_order_id || providerPayment.amount !== paymentRow.amount_paise || providerPayment.currency !== paymentRow.currency) {
      await db.from('payments').update({ status: 'needs_review', provider_payment_id: providerPayment.id, updated_at: new Date().toISOString() }).eq('id', paymentRow.id).neq('status', 'captured')
      return fail(res, 409, 'PAYMENT_MISMATCH', 'Payment details need review. Contact Radix Minds before trying to pay again.')
    }
    if (providerPayment.status === 'captured') {
      const { data: confirmed, error: confirmError } = await db.rpc('confirm_captured_payment', { p_provider_order_id: providerPayment.order_id, p_provider_payment_id: providerPayment.id, p_amount_paise: providerPayment.amount, p_currency: providerPayment.currency, p_signature_verified: true })
      if (confirmError) return fail(res, 503, 'CONFIRMATION_PENDING', 'Payment was received. Confirmation is being checked; please wait and refresh this page.')
      const confirmation = Array.isArray(confirmed) ? confirmed[0] : confirmed
      if (confirmation?.result === 'needs_review') return fail(res, 409, 'PAYMENT_MISMATCH', 'Payment details need review. Contact Radix Minds.')
      return res.json({ status: 'confirmed', enrolmentReference: enrollment.public_reference, paymentReference: providerPayment.id, amountPaise: providerPayment.amount, currency: providerPayment.currency })
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

app.get('/api/v1/enrolments/:reference/status', requireTrustedClientIp, publicLimiter, async (req, res) => {
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
      if (captured) await db.rpc('confirm_captured_payment', { p_provider_order_id: payment.provider_order_id, p_provider_payment_id: captured.id, p_amount_paise: captured.amount, p_currency: captured.currency, p_signature_verified: true })
      else {
        const failed = attempts.items.find(item => item.status === 'failed')
        if (failed) await markFailedPayment(db, failed.id, payment.provider_order_id)
      }
    } catch { /* Webhook/callback can resolve the pending state later. */ }
  }

  const { data: finalEnrollment } = await db.from('enrolments').select('status').eq('id', enrollment.id).single()
  const { data: finalPayment } = await db.from('payments').select('provider_payment_id,amount_paise,currency,status,captured_at').eq('enrolment_id', enrollment.id).order('attempt_number', { ascending: false }).limit(1).maybeSingle()
  const status = finalEnrollment?.status === 'confirmed' ? 'confirmed' : finalPayment?.status === 'failed' ? 'failed' : finalEnrollment?.status === 'needs_review' ? 'needs_review' : 'pending'
  return res.json({ status, enrolmentReference: enrollment.public_reference, studentName: student?.full_name ?? '', program: enrollment.program_snapshot, subjects: enrollment.subjects_snapshot, price: enrollment.pricing_snapshot, payment: finalPayment ? { reference: finalPayment.provider_payment_id, amountPaise: finalPayment.amount_paise, currency: finalPayment.currency, status: finalPayment.status, capturedAt: finalPayment.captured_at } : null, support: { whatsappPhone: config.WHATSAPP_PHONE, telegramUrl: config.TELEGRAM_URL } })
})

app.post('/api/v1/enquiries', csrfOriginGuard, requireTrustedClientIp, publicLimiter, async (req, res) => {
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

app.post('/api/v1/admin/session', csrfOriginGuard, requireTrustedClientIp, adminLoginLimiter, async (req, res) => {
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
  return data as { enrolments: Array<Record<string, unknown>>; total: number; page: number; pageSize: number }
}

app.get('/api/v1/admin/enrolments', requireAdmin, async (req, res) => {
  if (!hasDatabase) return databaseUnavailable(res)
  const role = (res.locals.admin as { role: 'owner' | 'operations' | 'finance' }).role
  try {
    const data = await getAdminEnrolmentPage(req, Number(req.query.page) || 1, Number(req.query.pageSize) || 30)
    const enrolments = role === 'finance' ? data.enrolments.map(row => {
      const financeRow = { ...row }
      for (const key of ['student_name','student_mobile','student_email','board','school_name','internal_remarks','student_id']) delete financeRow[key]
      return financeRow
    }) : data.enrolments
    return res.json({ ...data, enrolments })
  } catch { return fail(res, 422, 'ADMIN_FILTER_INVALID', 'Check the enrolment filters and try again.') }
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
  if (config.POLICIES_APPROVED !== 'true') return fail(res,503,'POLICIES_NOT_APPROVED','Manual enrolment creation is paused until the first-seven-day refund clause is finalized.')
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

const sanitizedLogField = (value: unknown) => typeof value === 'string'
  ? value.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 80) || 'unknown'
  : 'unknown'

const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const errorName = error instanceof Error ? error.name : 'unknown'
  const errorCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  const stackFrames = error instanceof Error && error.stack
    ? error.stack.split('\n').slice(1, 9).map((frame) => frame.trim().slice(0, 300))
    : []
  console.error('api_error', {
    requestId: res.locals.requestId,
    method: req.method,
    errorName: sanitizedLogField(errorName),
    errorCode: sanitizedLogField(errorCode),
    stackFrames,
  })
  return fail(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again or contact the team.')
}

// API fallthrough and error handling are attached by each runtime entry point.
// The Netlify function adds only these API handlers; the Node server also adds
// the static Vite frontend before them.
const apiNotFoundHandler: express.RequestHandler = (_req, res) => fail(res, 404, 'NOT_FOUND', 'API route was not found.')

export { app, apiNotFoundHandler, errorHandler }
