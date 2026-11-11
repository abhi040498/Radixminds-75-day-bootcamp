import serverless from 'serverless-http'
import { isIP } from 'node:net'
import type { Handler, HandlerContext, HandlerEvent } from '@netlify/functions'
import { apiNotFoundHandler, app, errorHandler } from '../../server/src/index.js'

app.use(apiNotFoundHandler)
app.use(errorHandler)

const expressHandler = serverless(app)

type NetlifyProxyEvent = HandlerEvent & {
  version?: string
  requestContext?: {
    identity?: { sourceIp?: unknown; [key: string]: unknown }
    http?: { sourceIp?: unknown; method?: string; [key: string]: unknown }
    [key: string]: unknown
  }
}
type NetlifyContextWithIp = HandlerContext & { ip?: unknown }

function eventWithTrustedClientIp(event: HandlerEvent, context: HandlerContext): HandlerEvent {
  const netlifyEvent = event as NetlifyProxyEvent
  const netlifyContext = context as NetlifyContextWithIp
  const eventSourceIp = netlifyEvent.version === '2.0'
    ? netlifyEvent.requestContext?.http?.sourceIp
    : netlifyEvent.requestContext?.identity?.sourceIp
  // Netlify's context IP is authoritative. The event source IP is the
  // platform-provided fallback for the Lambda-compatible event shape.
  const clientIp = [netlifyContext.ip, eventSourceIp].find(value => typeof value === 'string' && isIP(value) !== 0)
  const requestContext = netlifyEvent.requestContext ?? {}

  if (netlifyEvent.version === '2.0') {
    return {
      ...event,
      requestContext: {
        ...requestContext,
        http: { ...requestContext.http, ...(clientIp ? { sourceIp: clientIp } : {}) },
      },
    } as HandlerEvent
  }

  return {
    ...event,
    requestContext: {
      ...requestContext,
      identity: { ...requestContext.identity, ...(clientIp ? { sourceIp: clientIp } : {}) },
    },
  } as HandlerEvent
}

export const handler: Handler = (event, context) => expressHandler(eventWithTrustedClientIp(event, context), context) as ReturnType<Handler>
