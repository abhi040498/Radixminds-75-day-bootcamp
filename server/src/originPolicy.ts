import { config } from './config.js'

export const productionOrigin = 'https://bootcamp.radixminds.in'
export const stableDeployPreviewOrigin = 'https://deploy-preview-1--radixminds75daysbootcamp.netlify.app'
export const approvedNetlifySiteName = 'radixminds75daysbootcamp'

type OriginPolicyContext = {
  appOrigin: string
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
  appOrigin: config.APP_ORIGIN,
  approvedContext: config.APPROVED_NETLIFY_CONTEXT,
  siteName: process.env.SITE_NAME,
}): boolean {
  if (!origin) return false
  const canonical = canonicalHttpsOrigin(origin)
  if (!canonical) return false

  if (canonical === productionOrigin || canonical === stableDeployPreviewOrigin || canonical === context.appOrigin) return true

  if (
    context.appOrigin !== stableDeployPreviewOrigin
    || context.approvedContext !== 'deploy-preview'
    || context.siteName !== approvedNetlifySiteName
  ) return false

  const hostname = new URL(canonical).hostname
  return /^[a-f0-9]{20,32}--radixminds75daysbootcamp\.netlify\.app$/i.test(hostname)
}
