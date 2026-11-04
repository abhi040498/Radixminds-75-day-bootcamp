import 'dotenv/config'
import { z } from 'zod'

const optional = z.string().trim().optional().transform(value => value || undefined)
const statusSecret = optional.refine(value => !value || value.length >= 32, 'STATUS_TOKEN_SECRET must have at least 32 characters.')
const webhookSecret = optional.refine(value => !value || value.length >= 24, 'RAZORPAY_WEBHOOK_SECRET must have at least 24 characters.')
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  SUPABASE_URL: optional,
  SUPABASE_PUBLIC_KEY: optional,
  SUPABASE_SECRET_KEY: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: webhookSecret,
  RAZORPAY_MODE: z.enum(['test', 'live']).default('test'),
  STATUS_TOKEN_SECRET: statusSecret,
  POLICIES_APPROVED: z.enum(['true', 'false']).default('false'),
  PAYMENT_ENABLED: z.enum(['true', 'false']).default('false'),
  BOARD_OPTIONS: z.string().default('CBSE,ICSE,State Board,Other'),
  LANGUAGE_OPTIONS: z.string().default('English,Hindi,Bilingual'),
  WHATSAPP_PHONE: z.string().default('919304829718'),
  TELEGRAM_URL: z.string().url().default('https://t.me/radixminds'),
})

export const config = envSchema.parse(process.env)
export const supabaseSecret = config.SUPABASE_SECRET_KEY ?? config.SUPABASE_SERVICE_ROLE_KEY
export const hasDatabase = Boolean(config.SUPABASE_URL && supabaseSecret)
export const hasAdminAuth = Boolean(config.SUPABASE_URL && config.SUPABASE_PUBLIC_KEY && supabaseSecret)
export const hasRazorpay = Boolean(config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET)
export const checkoutBaseReady = hasDatabase && hasRazorpay && Boolean(config.RAZORPAY_WEBHOOK_SECRET && config.STATUS_TOKEN_SECRET) && config.PAYMENT_ENABLED === 'true' && config.POLICIES_APPROVED === 'true'

export const boardOptions = config.BOARD_OPTIONS.split(',').map(value => value.trim()).filter(Boolean)
export const languageOptions = config.LANGUAGE_OPTIONS.split(',').map(value => value.trim()).filter(Boolean)
