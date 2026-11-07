import serverless from 'serverless-http'
import type { Handler } from '@netlify/functions'
import { app } from '../../server/src/index.js'

const expressHandler = serverless(app)
export const handler: Handler = (event, context) => expressHandler(event, context) as ReturnType<Handler>
