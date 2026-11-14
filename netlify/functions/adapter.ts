import type { Context } from '@netlify/functions'
import { isIP } from 'node:net'

export interface ApiGatewayV2Event {
  version: '2.0'
  rawPath: string
  rawQueryString: string
  headers: Record<string, string>
  requestContext: {
    http: {
      method: string
      path: string
      protocol: string
      sourceIp?: string
      userAgent?: string
    }
  }
  body?: string
  isBase64Encoded: boolean
}

export interface LambdaHttpResponse {
  statusCode: number
  headers?: Record<string, string | number | boolean | string[] | undefined>
  multiValueHeaders?: Record<string, string[] | undefined>
  /** HTTP API v2 transports Set-Cookie values in this separate array. */
  cookies?: string[]
  body?: string | null
  isBase64Encoded?: boolean
}

type ExpressLambdaHandler = (event: ApiGatewayV2Event) => Promise<LambdaHttpResponse>

function createResponseHeaders(response: LambdaHttpResponse) {
  const headers = new Headers()
  const cookieValues: string[] = []

  const appendValue = (name: string, value: string | number | boolean | undefined) => {
    if (value === undefined) return
    if (name.toLowerCase() === 'set-cookie') cookieValues.push(String(value))
    else headers.append(name, String(value))
  }

  for (const [name, value] of Object.entries(response.headers ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) appendValue(name, item)
    } else {
      appendValue(name, value)
    }
  }
  for (const [name, values] of Object.entries(response.multiValueHeaders ?? {})) {
    for (const value of values ?? []) appendValue(name, value)
  }
  for (const cookie of response.cookies ?? []) {
    if (typeof cookie === 'string') cookieValues.push(cookie)
  }

  // A response may expose the same cookie through more than one Lambda
  // representation. De-duplicate exact cookie values, never comma-join them:
  // Expires attributes themselves contain commas.
  const seenCookies = new Set<string>()
  for (const cookie of cookieValues) {
    const identity = cookie.trim()
    if (!identity || seenCookies.has(identity)) continue
    seenCookies.add(identity)
    headers.append('Set-Cookie', cookie)
  }

  return headers
}

function toWebResponse(response: LambdaHttpResponse): Response {
  const status = Number.isInteger(response.statusCode) ? response.statusCode : 500
  const responseBody = response.body == null
    ? null
    : response.isBase64Encoded
      ? new Uint8Array(Buffer.from(response.body, 'base64'))
      : response.body

  return new Response(status === 204 || status === 205 || status === 304 ? null : responseBody, {
    status,
    headers: createResponseHeaders(response),
  })
}

/**
 * Adapt Netlify's Fetch request/context to serverless-http's API Gateway v2
 * contract, then preserve its response contract at the final Fetch Response
 * boundary (including the distinct HTTP API v2 cookies array).
 */
export function createNetlifyFunctionHandler(expressHandler: ExpressLambdaHandler) {
  return async function handler(request: Request, context: Context): Promise<Response> {
    const url = new URL(request.url)
    const platformIp = typeof context.ip === 'string' && isIP(context.ip) !== 0
      ? context.ip
      : undefined
    const hasBody = request.body !== null
    const body = hasBody ? Buffer.from(await request.arrayBuffer()).toString('base64') : undefined

    const event: ApiGatewayV2Event = {
      version: '2.0',
      rawPath: url.pathname,
      rawQueryString: url.search.startsWith('?') ? url.search.slice(1) : '',
      // Fetch Headers preserves the Cookie request header as a semicolon-
      // separated string. Forward it unchanged; Express reads req.get('cookie').
      headers: Object.fromEntries(request.headers.entries()),
      requestContext: {
        http: {
          method: request.method,
          path: url.pathname,
          protocol: url.protocol.replace(/:$/, ''),
          ...(platformIp ? { sourceIp: platformIp } : {}),
          ...(request.headers.get('user-agent') ? { userAgent: request.headers.get('user-agent')! } : {}),
        },
      },
      ...(body !== undefined ? { body } : {}),
      isBase64Encoded: hasBody,
    }

    return toWebResponse(await expressHandler(event))
  }
}
