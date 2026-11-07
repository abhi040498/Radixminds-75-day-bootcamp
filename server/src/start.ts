import { apiNotFoundHandler, app, errorHandler } from './index.js'
import { config, hasDatabase, hasRazorpay } from './config.js'
import { attachStaticFrontend } from './staticFrontend.js'

attachStaticFrontend(app)
app.use(apiNotFoundHandler)
app.use(errorHandler)

app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`Radix Minds API listening on ${config.PORT}; database=${hasDatabase}; razorpay=${hasRazorpay}; paymentMode=${config.RAZORPAY_MODE}`)
})
