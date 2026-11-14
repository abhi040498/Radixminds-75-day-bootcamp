# Radix Minds 75-Day Board Bootcamp

Existing React/Vite frontend and Express API, deployed through Netlify static hosting and Netlify Functions, with Supabase for application data and Razorpay integration kept behind server-side gates.

## Local development

```powershell
npm ci
npm run dev
npm run dev:api
```

The frontend is normally available at `http://localhost:5173`; the local Express API uses `http://localhost:4000`. Keep `.env` ignored and never share credentials in chat or commit them.

For isolated API work, use `npm run start:api:test` with a separately provisioned `.env.test.local`. The launcher validates the isolated test Supabase URL and forces `PAYMENT_ENABLED=false`, `POLICIES_APPROVED=false`, and `RAZORPAY_MODE=test`.

## Netlify build and deployment

The current hosting target is Netlify. `netlify.toml` sets the Vite publish directory to `dist`, uses `netlify/functions`, routes `/api/*` to the Express function, and then applies the React Router fallback.

```powershell
npm ci
npm run build:netlify
npm test
npm run test:netlify-function
```

Read [the Netlify deployment runbook](docs/deployment/netlify-deployment.md) before changing deployment settings. This repository work does not authorize a production deploy, domain/DNS change, or production environment-variable change.

## Current safety state

- `POLICIES_APPROVED=false` and `PAYMENT_ENABLED=false` remain required for production until policy/database readiness and payment testing are independently approved.
- The browser cannot declare a payment successful. The server verifies the saved order, signature, provider payment status, amount, currency, and capture before confirmation.
- Razorpay Test Mode has not been verified with a real sandbox checkout in this task; unit and function tests are not proof of a provider transaction.
- WhatsApp confirmation is a consent-gated admin draft for manual review. No automated WhatsApp message is sent.
- Refund requests are requests for review, not automatic approvals. A separate authorized admin decision and provider-processing action are required.
- Database migrations must be applied only to the explicitly verified isolated test project during test validation. Production migration state must be independently inspected before launch.

## Data and security notes

The server uses the Supabase service-role credential only in server runtime. Never expose it through `VITE_*`, browser bundles, documentation examples, or logs. Admin APIs validate the Supabase session and active `admin_users` role on the server. Do not create public admin registrations.

The payment/concurrency SQL under `scripts/concurrency/` is a separate isolated-test suite. Its fixture and race scripts must only be run against the test project and only in the documented order; do not rerun fixture setup or cleanup blindly.
