import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { config } from './config.js'

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function safeHexEqual(left: string, right: string) {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false
  const leftBytes = Buffer.from(left, 'hex')
  const rightBytes = Buffer.from(right, 'hex')
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

export function createStatusToken(idempotencyKey: string) {
  if (!config.STATUS_TOKEN_SECRET) throw new Error('STATUS_TOKEN_SECRET is not configured')
  return createHmac('sha256', config.STATUS_TOKEN_SECRET).update(`enrolment:${idempotencyKey}`).digest('hex')
}

export function verifyHmac(message: string | Buffer, suppliedHex: string, secret: string) {
  if (!/^[0-9a-f]{64}$/i.test(suppliedHex)) return false
  const expected = createHmac('sha256', secret).update(message).digest()
  const supplied = Buffer.from(suppliedHex, 'hex')
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export function newPublicReference() {
  return `RM-${randomBytes(10).toString('hex').toUpperCase()}`
}

export function csrfOriginGuard(req: Request, res: Response, next: NextFunction) {
  const origin = req.get('origin')
  const fetchSite = req.get('sec-fetch-site')
  if (origin !== config.APP_ORIGIN || (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none')) {
    return res.status(403).json({ error: { code: 'ORIGIN_REJECTED', message: 'Request origin is not allowed.' } })
  }
  next()
}

export function validateRazorpayKeyMode() {
  const key = config.RAZORPAY_KEY_ID
  if (!key) return false
  return config.RAZORPAY_MODE === 'test' ? key.startsWith('rzp_test_') : key.startsWith('rzp_live_')
}
