import serverless from 'serverless-http'
import { apiNotFoundHandler, app, errorHandler } from '../../server/src/index.js'
import { createNetlifyFunctionHandler, type LambdaHttpResponse } from './adapter.js'

app.use(apiNotFoundHandler)
app.use(errorHandler)

const expressHandler = serverless(app)

export default createNetlifyFunctionHandler(async event => await expressHandler(
  event as Parameters<typeof expressHandler>[0],
  {} as Parameters<typeof expressHandler>[1],
) as LambdaHttpResponse)
