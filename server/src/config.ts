import 'dotenv/config'
import { z } from 'zod'

const optional = z.string().trim().optional().transform(value => value || undefined)
const appOrigin = z.string().url()
  .refine(value => {
    const parsed = new URL(value)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && !parsed.username && !parsed.password
      && parsed.pathname === '/' && !parsed.search && !parsed.hash
  }, 'APP_ORIGIN must be an HTTP(S) origin without a path, query or fragment.')
  // Origin headers never contain a trailing slash. Canonicalize configured
  // origins once so CORS and CSRF checks compare the same representation.
  .transform(value => new URL(value).origin)
const statusSecret = optional.refine(value => !value || value.length >= 32, 'STATUS_TOKEN_SECRET must have at least 32 characters.')
const webhookSecretMinimumLength = 24
const razorpayMode = z.preprocess(
  value => typeof value === 'string' ? value.trim() || undefined : value,
  z.enum(['test', 'live']).default('test'),
)

export function isWebhookSecretReady(value: string | undefined) {
  return Boolean(value && value.trim().length >= webhookSecretMinimumLength)
}

const rawWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
const webhookSecretLength = typeof rawWebhookSecret === 'string' ? rawWebhookSecret.trim().length : 0
if (process.env.NETLIFY === 'true' || process.env.AWS_LAMBDA_FUNCTION_NAME) {
  console.info('[config] Razorpay webhook secret runtime check', {
    exists: rawWebhookSecret !== undefined,
    characterLength: webhookSecretLength,
    meetsMinimumLength: webhookSecretLength >= webhookSecretMinimumLength,
  })
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_ORIGIN: appOrigin.default('http://localhost:5173'),
  // Set only in the Netlify Deploy Preview Functions scope. Netlify's runtime
  // SITE_NAME is checked alongside this explicit context marker before a
  // deployment-specific URL is accepted as a browser origin.
  APPROVED_NETLIFY_CONTEXT: z.literal('deploy-preview').optional(),
  SUPABASE_URL: optional,
  SUPABASE_PUBLIC_KEY: optional,
  SUPABASE_SECRET_KEY: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  // An invalid optional webhook setting must not prevent unrelated API routes
  // from starting. Payment readiness and the webhook route fail closed below.
  RAZORPAY_WEBHOOK_SECRET: optional,
  RAZORPAY_MODE: razorpayMode,
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
export const hasValidRazorpayWebhookSecret = isWebhookSecretReady(config.RAZORPAY_WEBHOOK_SECRET)
export const checkoutBaseReady = hasDatabase && hasRazorpay && hasValidRazorpayWebhookSecret && Boolean(config.STATUS_TOKEN_SECRET) && config.PAYMENT_ENABLED === 'true' && config.POLICIES_APPROVED === 'true'

export const boardOptions = config.BOARD_OPTIONS.split(',').map(value => value.trim()).filter(Boolean)
export const languageOptions = config.LANGUAGE_OPTIONS.split(',').map(value => value.trim()).filter(Boolean)
