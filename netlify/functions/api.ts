import serverless from 'serverless-http'
import type { Handler } from '@netlify/functions'
import { apiNotFoundHandler, app, errorHandler } from '../../server/src/index.js'

app.use(apiNotFoundHandler)
app.use(errorHandler)

const expressHandler = serverless(app)
export const handler: Handler = (event, context) => expressHandler(event, context) as ReturnType<Handler>
