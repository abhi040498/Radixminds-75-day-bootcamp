import { config } from './config.js'

export const productionOrigin = 'https://bootcamp.radixminds.in'
export const approvedNetlifySiteNames = ['radixminds75daysbootcamp', 'rm75daysbootcamp'] as const

export const approvedNetlifySites = {
  radixminds75daysbootcamp: {
    stablePreviewOrigin: 'https://deploy-preview-1--radixminds75daysbootcamp.netlify.app',
    productionOrigin: 'https://radixminds75daysbootcamp.netlify.app',
  },
  rm75daysbootcamp: {
    stablePreviewOrigin: 'https://deploy-preview-1--rm75daysbootcamp.netlify.app',
    productionOrigin: 'https://rm75daysbootcamp.netlify.app',
  },
} as const

// Keep the historical exports available to the existing deployment and tests.
export const stableDeployPreviewOrigin = approvedNetlifySites.radixminds75daysbootcamp.stablePreviewOrigin
export const approvedNetlifySiteName = approvedNetlifySiteNames[0]

type OriginPolicyContext = {
  appOrigin?: string
  approvedContext?: string
  siteName?: string
  allowLocalhost?: boolean
}

function canonicalOrigin(value: string): string | null {
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

function previewHostMatches(origin: string, siteName: typeof approvedNetlifySiteNames[number]) {
  const hostname = new URL(origin).hostname
  return new RegExp(`^[a-f0-9]{20,32}--${siteName}\\.netlify\\.app$`, 'i').test(hostname)
}

/** Exact origins are allowed; immutable Netlify URLs require preview context, site identity and stable-origin configuration. */
export function isApprovedBrowserOrigin(origin: string | undefined, context: OriginPolicyContext = {
  // APP_ORIGIN has a local-development default. Never let that fallback
  // authorize an origin in a deployed function or production server.
  appOrigin: process.env.APP_ORIGIN?.trim()
    ? config.APP_ORIGIN
    : process.env.NODE_ENV === 'production' || process.env.NETLIFY === 'true' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)
      ? undefined
      : config.APP_ORIGIN,
  approvedContext: config.APPROVED_NETLIFY_CONTEXT,
  siteName: process.env.SITE_NAME,
  allowLocalhost: process.env.NODE_ENV !== 'production' && process.env.NETLIFY !== 'true' && !process.env.AWS_LAMBDA_FUNCTION_NAME,
}): boolean {
  if (!origin || !context.appOrigin) return false
  const candidate = canonicalOrigin(origin)
  const configured = canonicalOrigin(context.appOrigin)
  if (!candidate || !configured || context.appOrigin !== configured) return false

  if (context.approvedContext === 'deploy-preview') {
    if (!context.siteName || !approvedNetlifySiteNames.includes(context.siteName as typeof approvedNetlifySiteNames[number])) return false
    const siteName = context.siteName as typeof approvedNetlifySiteNames[number]
    const site = approvedNetlifySites[siteName]
    if (configured !== site.stablePreviewOrigin) return false
    return candidate === site.stablePreviewOrigin || previewHostMatches(candidate, siteName)
  }

  // APPROVED_NETLIFY_CONTEXT is a preview-only variable. Any other explicit
  // value is a configuration mismatch and must fail closed.
  if (context.approvedContext !== undefined) return false

  if (configured === productionOrigin) return candidate === productionOrigin

  if (context.siteName && approvedNetlifySiteNames.includes(context.siteName as typeof approvedNetlifySiteNames[number])) {
    const site = approvedNetlifySites[context.siteName as typeof approvedNetlifySiteNames[number]]
    if (configured === site.productionOrigin) return candidate === site.productionOrigin
  }

  const isLocalhost = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(configured)
  return context.allowLocalhost === true && isLocalhost && candidate === configured
}
