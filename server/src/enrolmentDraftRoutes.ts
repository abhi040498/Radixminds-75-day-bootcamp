import { createHash, randomBytes } from 'node:crypto'
import express from 'express'
import { z } from 'zod'
import { enrolmentDraftPayloadSchema, publicDraft, restoreEnrolmentDraft, saveEnrolmentDraft, type EnrolmentDraftStore } from './enrolmentDraft.js'
import { isSameOriginCookieRequest, readCookieValue } from './enrolmentSession.js'

export const DRAFT_COOKIE = 'rm_enrolment_draft'
export const DRAFT_COOKIE_PATH = '/api/v1'
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function clearEnrolmentDraftCookie(res: express.Response, appOrigin: string) {
  res.clearCookie(DRAFT_COOKIE, { httpOnly: true, secure: new URL(appOrigin).protocol === 'https:', sameSite: 'strict', path: DRAFT_COOKIE_PATH })
}

const sessionSchema = z.object({ registrationIdempotencyKey: z.uuid(), paymentIdempotencyKey: z.uuid() }).strict()
const revisionSchema = z.number().int().nonnegative()
const hashToken = (value: string) => createHash('sha256').update(value).digest('hex')

type Diagnostic = {
  route: string
  requestId: string
  event: string
  cookiePresent?: boolean
  sessionValid?: boolean
  validationPassed?: boolean
  operation?: 'find' | 'create' | 'update' | 'delete'
  errorCode?: string
  supabaseStatus?: number
  httpStatus?: number
  revisionConflict?: boolean
}
type Options = {
  store: EnrolmentDraftStore
  appOrigin: string
  databaseConfigured: boolean
  log?: (record: Diagnostic) => void
  now?: () => Date
  makeToken?: () => string
}

function safeErrorCode(error: unknown) {
  const candidate = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined
  return typeof candidate === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(candidate) ? candidate : 'UNKNOWN'
}

function safeErrorStatus(error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: unknown }).status
    : undefined
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined
}

function sameOrigin(req: express.Request, appOrigin: string) {
  const origin = req.get('origin')
  const fetchSite = req.get('sec-fetch-site')
  if (req.method === 'GET') return isSameOriginCookieRequest(origin, fetchSite, appOrigin)
  return origin === appOrigin && (!fetchSite || fetchSite === 'same-origin' || fetchSite === 'none')
}

export function draftTokenFromRequest(req: express.Request) {
  const value = readCookieValue(req.get('cookie'), DRAFT_COOKIE)
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : ''
}

export function createEnrolmentDraftRouter(options: Options) {
  const router = express.Router()
  const log = options.log ?? (record => console.info('enrolment_draft', record))
  const now = options.now ?? (() => new Date())
  const makeToken = options.makeToken ?? (() => randomBytes(32).toString('base64url'))

  function mark(req: express.Request, event: string, details: Partial<Diagnostic> = {}) {
    log({
      route: req.path === '/session' ? 'session' : 'draft',
      requestId: typeof resRequestId(req) === 'string' ? resRequestId(req) : 'unavailable',
      event,
      ...details,
    })
  }

  function setNoStore(res: express.Response) { res.setHeader('Cache-Control', 'private, no-store') }
  function cookieOptions() {
    return { httpOnly: true, secure: new URL(options.appOrigin).protocol === 'https:', sameSite: 'strict' as const, path: DRAFT_COOKIE_PATH, maxAge: DRAFT_TTL_MS }
  }
  function clearCookie(res: express.Response) {
    clearEnrolmentDraftCookie(res, options.appOrigin)
  }
  function fail(res: express.Response, status: number, code: string, message: string) {
    return res.status(status).json({ error: { code, message, requestId: res.locals.requestId } })
  }

  router.use((req, res, next) => {
    setNoStore(res)
    mark(req, 'route_reached', { cookiePresent: Boolean(req.get('cookie')?.includes(`${DRAFT_COOKIE}=`)) })
    if (!sameOrigin(req, options.appOrigin)) {
      mark(req, 'origin_rejected', { httpStatus: 403 })
      return fail(res, 403, 'ORIGIN_REJECTED', 'Request origin is not allowed.')
    }
    next()
  })

  router.get('/', async (req, res) => {
    if (!options.databaseConfigured) {
      mark(req, 'database_unavailable', { operation: 'find', httpStatus: 503 })
      return fail(res, 503, 'CONFIGURATION_REQUIRED', 'Enrolment is not available yet. Please contact the Radix Minds team.')
    }
    const value = draftTokenFromRequest(req)
    mark(req, 'session_validation', { cookiePresent: Boolean(value), sessionValid: false, operation: 'find' })
    if (!value) {
      if (req.get('cookie')?.includes(`${DRAFT_COOKIE}=`)) clearCookie(res)
      return res.json({ draft: null })
    }
    try {
      const record = await restoreEnrolmentDraft(options.store, hashToken(value), now())
      mark(req, 'session_validation', { cookiePresent: true, sessionValid: Boolean(record), operation: 'find' })
      if (!record) {
        clearCookie(res)
        return res.json({ draft: null, expired: true })
      }
      mark(req, 'draft_restored', { operation: 'find', httpStatus: 200, sessionValid: true })
      return res.json(publicDraft(record))
    } catch (error) {
      mark(req, 'save_failed', { operation: 'find', errorCode: safeErrorCode(error), supabaseStatus: safeErrorStatus(error), httpStatus: 503 })
      return fail(res, 503, 'DRAFT_UNAVAILABLE', 'Saved enrolment details could not be loaded. Please retry; your current form remains available.')
    }
  })

  router.post('/session', async (req, res) => {
    if (!options.databaseConfigured) {
      mark(req, 'database_unavailable', { operation: 'create', httpStatus: 503 })
      return fail(res, 503, 'CONFIGURATION_REQUIRED', 'Enrolment is not available yet. Please contact the Radix Minds team.')
    }
    const parsed = sessionSchema.safeParse(req.body)
    mark(req, 'request_validation', { validationPassed: parsed.success })
    if (!parsed.success) return fail(res, 422, 'VALIDATION_ERROR', 'The draft session request is invalid.')

    const existingToken = draftTokenFromRequest(req)
    if (existingToken) {
      try {
        const existing = await restoreEnrolmentDraft(options.store, hashToken(existingToken), now())
        mark(req, 'session_validation', { cookiePresent: true, sessionValid: Boolean(existing), operation: 'find' })
        if (existing) return res.json(publicDraft(existing))
        await options.store.delete(hashToken(existingToken))
        clearCookie(res)
      } catch (error) {
        mark(req, 'save_failed', { operation: 'find', errorCode: safeErrorCode(error), supabaseStatus: safeErrorStatus(error), httpStatus: 503 })
        return fail(res, 503, 'DRAFT_UNAVAILABLE', 'A secure draft session could not be checked. Your form data remains on this page; retry saving.')
      }
    } else {
      mark(req, 'session_validation', { cookiePresent: false, sessionValid: false })
    }

    const createdAt = now()
    const sessionToken = makeToken()
    try {
      const record = await options.store.create({
        sessionTokenHash: hashToken(sessionToken),
        registrationIdempotencyKey: parsed.data.registrationIdempotencyKey,
        paymentIdempotencyKey: parsed.data.paymentIdempotencyKey,
        now: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + DRAFT_TTL_MS).toISOString(),
      })
      res.cookie(DRAFT_COOKIE, sessionToken, cookieOptions())
      mark(req, 'save_succeeded', { operation: 'create', httpStatus: 201 })
      return res.status(201).json(publicDraft(record))
    } catch (error) {
      const errorCode = safeErrorCode(error)
      const conflict = errorCode === '23505'
      mark(req, 'save_failed', { operation: 'create', errorCode, supabaseStatus: safeErrorStatus(error), httpStatus: conflict ? 409 : 503 })
      return fail(res, conflict ? 409 : 503, conflict ? 'DRAFT_SESSION_CONFLICT' : 'DRAFT_UNAVAILABLE', conflict
        ? 'This draft session could not be started because its request identifiers are already in use. Reload the form to start a fresh session.'
        : 'A secure draft session could not be started. Your form data remains on this page; retry saving.')
    }
  })

  router.put('/', async (req, res) => {
    if (!options.databaseConfigured) {
      mark(req, 'database_unavailable', { operation: 'update', httpStatus: 503 })
      return fail(res, 503, 'CONFIGURATION_REQUIRED', 'Enrolment is not available yet. Please contact the Radix Minds team.')
    }
    const sessionToken = draftTokenFromRequest(req)
    mark(req, 'session_validation', { cookiePresent: Boolean(sessionToken), sessionValid: false })
    if (!sessionToken) return fail(res, 401, 'DRAFT_SESSION_REQUIRED', 'Start a secure draft session before saving details.')
    const revision = revisionSchema.safeParse(req.body?.expectedRevision)
    const payload = enrolmentDraftPayloadSchema.safeParse(req.body?.draft)
    const valid = revision.success && payload.success
    mark(req, 'request_validation', { validationPassed: valid })
    if (!revision.success || !payload.success) return fail(res, 422, 'VALIDATION_ERROR', 'Check the saved enrolment details and try again.')
    try {
      const result = await saveEnrolmentDraft(options.store, { sessionTokenHash: hashToken(sessionToken), expectedRevision: revision.data, payload: payload.data, now: now() })
      if (!result.ok) {
        if (result.reason === 'invalid') return fail(res, 422, 'VALIDATION_ERROR', 'Check the saved enrolment details and try again.')
        const current = await options.store.find(hashToken(sessionToken))
        const expired = !current || Date.parse(current.expires_at) <= now().getTime()
        mark(req, expired ? 'session_expired' : 'revision_conflict', { operation: 'update', revisionConflict: !expired, httpStatus: expired ? 410 : 409 })
        if (expired) {
          clearCookie(res)
          return fail(res, 410, 'DRAFT_EXPIRED', 'This saved draft expired. Your current details remain on this page; save again to start a new secure draft.')
        }
        return fail(res, 409, 'DRAFT_REVISION_CONFLICT', 'This draft changed in another tab. Reload the saved details before saving again.')
      }
      res.cookie(DRAFT_COOKIE, sessionToken, cookieOptions())
      mark(req, 'session_validation', { cookiePresent: true, sessionValid: true })
      mark(req, 'save_succeeded', { operation: 'update', httpStatus: 200 })
      return res.json(publicDraft(result.record))
    } catch (error) {
      mark(req, 'save_failed', { operation: 'update', errorCode: safeErrorCode(error), supabaseStatus: safeErrorStatus(error), httpStatus: 503 })
      return fail(res, 503, 'DRAFT_SAVE_FAILED', 'Your details are still on this page but could not be saved. Retry the save before leaving.')
    }
  })

  router.delete('/', async (req, res) => {
    const sessionToken = draftTokenFromRequest(req)
    if (sessionToken && options.databaseConfigured) {
      try {
      await options.store.delete(hashToken(sessionToken))
        mark(req, 'save_succeeded', { operation: 'delete', httpStatus: 204, sessionValid: true })
      } catch (error) {
        mark(req, 'save_failed', { operation: 'delete', errorCode: safeErrorCode(error), supabaseStatus: safeErrorStatus(error), httpStatus: 503 })
        return fail(res, 503, 'DRAFT_DELETE_FAILED', 'The saved draft could not be invalidated. Please retry.')
      }
    }
    clearCookie(res)
    return res.status(204).end()
  })

  return router
}

function resRequestId(req: express.Request) {
  return (req.res?.locals?.requestId as string | undefined) ?? 'unavailable'
}
