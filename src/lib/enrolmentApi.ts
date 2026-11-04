export type LearningMode = { mode: 'online' | 'offline' | 'hybrid'; label: string; batchLabel: string | null }
export type PublicProgram = {
  code: 'class-10' | 'class-12'
  name: string
  durationDays: number
  subjects: unknown
  payablePaise: number
  standardPaise: number | null
  discountPercent: number | null
  offerValidThrough: string | null
  currency: 'INR'
  enrolmentOpen: boolean
  modes: LearningMode[]
  checkoutReady: boolean
}
export type ApiError = Error & { fields?: Record<string, string>; code?: string }

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  } catch {
    throw new Error('The enrolment service could not be reached. Please try again or contact Radix Minds.')
  }
  const body = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string; fields?: Record<string, string> } }
  if (!response.ok) {
    const error = new Error(body.error?.message || 'Something went wrong. Please try again.') as ApiError
    error.code = body.error?.code
    error.fields = body.error?.fields
    throw error
  }
  return body as T
}

export const formatINR = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100)
