import { app } from './index.js'
import { config, hasDatabase, hasRazorpay } from './config.js'

app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`Radix Minds API listening on ${config.PORT}; database=${hasDatabase}; razorpay=${hasRazorpay}; paymentMode=${config.RAZORPAY_MODE}`)
})
