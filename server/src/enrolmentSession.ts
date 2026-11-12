const referencePattern = /^RM-[A-F0-9]{20}$/

/**
 * Cookie security is derived from the validated application origin, never from
 * request Host or forwarded headers. Only an explicitly local HTTP origin in
 * a non-deployed runtime may omit Secure; missing or invalid configuration
 * fails closed by requiring Secure.
 */
export function isSecureCookieOrigin(appOrigin: string | undefined, deployedRuntime: boolean) {
  if (!appOrigin) return true
  try {
    const parsed = new URL(appOrigin)
    const isBareOrigin = parsed.origin === appOrigin
      && !parsed.username && !parsed.password
      && parsed.pathname === '/' && !parsed.search && !parsed.hash
    if (!isBareOrigin) return true
    if (parsed.protocol === 'https:') return true
    const isLocalHttp = parsed.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    return !isLocalHttp || deployedRuntime
  } catch {
    return true
  }
}

export function enrolmentSessionCookieName(reference: string) {
  return referencePattern.test(reference) ? `rm_enrolment_${reference}` : null
}

export function readCookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader || !/^[A-Za-z0-9_-]+$/.test(name)) return ''
  const pair = cookieHeader.split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`))
  if (!pair) return ''
  try { return decodeURIComponent(pair.slice(name.length + 1)) } catch { return '' }
}

/** The status/recovery GETs can reconcile payment state, so require a same-origin browser request. */
export function isSameOriginCookieRequest(origin: string | undefined, fetchSite: string | undefined, isOriginAllowed: string | ((value: string) => boolean)) {
  const matches = (value: string) => typeof isOriginAllowed === 'string' ? value === isOriginAllowed : isOriginAllowed(value)
  if (origin && !matches(origin)) return false
  if (fetchSite && fetchSite !== 'same-origin') return false
  return (origin !== undefined && matches(origin)) || fetchSite === 'same-origin'
}
