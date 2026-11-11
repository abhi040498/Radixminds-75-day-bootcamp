const referencePattern = /^RM-[A-F0-9]{20}$/

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
export function isSameOriginCookieRequest(origin: string | undefined, fetchSite: string | undefined, appOrigin: string) {
  if (origin && origin !== appOrigin) return false
  if (fetchSite && fetchSite !== 'same-origin') return false
  return origin === appOrigin || fetchSite === 'same-origin'
}
