import serverless from 'serverless-http'
import type { Context } from '@netlify/functions'
import { isIP } from 'node:net'
import { apiNotFoundHandler, app, errorHandler } from '../../server/src/index.js'

app.use(apiNotFoundHandler)
app.use(errorHandler)

const expressHandler = serverless(app)

interface ApiGatewayV2Event {
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

interface LambdaHttpResponse {
  statusCode: number
  headers?: Record<string, string | number | boolean | string[] | undefined>
  multiValueHeaders?: Record<string, string[] | undefined>
  body?: string | null
  isBase64Encoded?: boolean
}

function responseHeaders(response: LambdaHttpResponse) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(response.headers ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item)
    } else if (value !== undefined) {
      headers.append(name, String(value))
    }
  }
  for (const [name, values] of Object.entries(response.multiValueHeaders ?? {})) {
    for (const value of values ?? []) headers.append(name, value)
  }
  return headers
}

/**
 * Use Netlify's typed modern Context.ip as the sole client-IP source. Adapt it
 * into the API Gateway v2 shape consumed by serverless-http; never infer the
 * rate-limit identity from request headers such as X-Forwarded-For.
 */
export default async function handler(request: Request, context: Context): Promise<Response> {
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

  const result = await expressHandler(
    event as Parameters<typeof expressHandler>[0],
    {} as Parameters<typeof expressHandler>[1],
  ) as LambdaHttpResponse

  const status = Number.isInteger(result.statusCode) ? result.statusCode : 500
  const responseBody = result.body == null
    ? null
    : result.isBase64Encoded
      ? new Uint8Array(Buffer.from(result.body, 'base64'))
      : result.body
  return new Response(status === 204 || status === 205 || status === 304 ? null : responseBody, {
    status,
    headers: responseHeaders(result),
  })
}
