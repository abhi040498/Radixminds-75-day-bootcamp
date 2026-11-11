import { config } from './config.js'

export const productionOrigin = 'https://bootcamp.radixminds.in'
export const stableDeployPreviewOrigin = 'https://deploy-preview-1--radixminds75daysbootcamp.netlify.app'
export const approvedNetlifySiteName = 'radixminds75daysbootcamp'

type OriginPolicyContext = {
  appOrigin?: string
  approvedContext?: string
  siteName?: string
}

function canonicalHttpsOrigin(value: string): string | null {
  try {
    const parsed = new URL(value)
    const secureOrigin = parsed.protocol === 'https:'
    const localDevelopmentOrigin = parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    if ((!secureOrigin && !localDevelopmentOrigin) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return null
    if (parsed.origin !== value) return null
    return parsed.origin
  } catch {
    return null
  }
}

/** Exact fixed origins are allowed; unique deploy URLs require preview-scoped runtime identity. */
export function isApprovedBrowserOrigin(origin: string | undefined, context: OriginPolicyContext = {
  // APP_ORIGIN has a local-development default in config.ts. Do not let that
  // fallback authorize localhost (or any origin) in a deployed runtime.
  appOrigin: process.env.APP_ORIGIN?.trim()
    ? config.APP_ORIGIN
    : process.env.NODE_ENV === 'production' || process.env.NETLIFY === 'true' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)
      ? undefined
      : config.APP_ORIGIN,
  approvedContext: config.APPROVED_NETLIFY_CONTEXT,
  siteName: process.env.SITE_NAME,
}): boolean {
  if (!origin) return false
  const canonical = canonicalHttpsOrigin(origin)
  if (!canonical) return false

  if (context.approvedContext === 'deploy-preview') {
    if (context.appOrigin !== stableDeployPreviewOrigin || context.siteName !== approvedNetlifySiteName) return false
    if (canonical === stableDeployPreviewOrigin) return true
    const hostname = new URL(canonical).hostname
    return /^[a-f0-9]{20,32}--radixminds75daysbootcamp\.netlify\.app$/i.test(hostname)
  }

  // Production and other non-preview runtimes get exactly their configured
  // origin. Never let a mis-scoped APP_ORIGIN turn a preview URL into an
  // approved production origin.
  if (!context.appOrigin || context.appOrigin === stableDeployPreviewOrigin) return false
  const configuredOrigin = canonicalHttpsOrigin(context.appOrigin)
  if (!configuredOrigin || /^(?:[a-z0-9-]+--)?radixminds75daysbootcamp\.netlify\.app$/i.test(new URL(configuredOrigin).hostname)) return false
  return canonical === configuredOrigin
}
