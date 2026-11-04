# Enrolment system implementation

## Implemented

- Three-step, mobile-first registration for Class 10 and Class 12.
- Student name, mobile, email, school and board are collected before a concise review/payment screen. Guardian contact, preferred language, subject pathway and learning mode are left for the Radix Minds team to confirm after enrolment.
- Prices sourced from Supabase on the server and presented as integer INR paise. The configured program fee is ₹2,499 for Class 10 and ₹3,499 for Class 12; no original MRP is seeded or displayed.
- Supabase tables and service-only RPCs for programs, learning modes, students, enrolments, payments, Razorpay webhook events, admin users and enquiries.
- Razorpay order creation on the API, test/live key-mode validation, checkout callback signature verification, provider-side payment fetch, captured-payment confirmation, webhook signature validation, status reconciliation, rate limiting and idempotent payment attempts.
- Opaque enrolment status token; admin users authenticate with Supabase Auth plus an active `admin_users` row. Finance role does not receive student identity fields.
- Lightweight admin console at `/admin`: overview metrics, searchable/filterable enrolments, payment references, authorized contact edits and internal remarks, CSV export, enquiry status/remarks, and authorized manual enrolments.
- Manual enrolments and any manually recorded receipts are tagged separately from online records. They do not create Razorpay payment rows and are excluded from verified revenue. Finance staff cannot access student contact details, enquiry records, exports, or write actions.
- Confirmation view with enrolment/payment references, printable acknowledgement and explicit WhatsApp/Telegram contact links. No private group auto-join occurs.
- Admin enrolment console at `/admin`; support enquiry endpoint `POST /api/v1/enquiries`.

## Confirmed inputs versus configuration required

**Confirmed:** Class 10 and Class 12 subject pathways, 75-day duration, INR 2,499 / INR 3,499 program fees, 80% promotional messaging, Bokaro location, the provided public contact channels.

**Must be configured before online enrolment:** Supabase project URL and server-only secret, the project public/publishable key for Auth, Razorpay test credentials and webhook secret, `STATUS_TOKEN_SECRET`, approved final terms and privacy copy, currently offered batch learning modes, active batch status, supported boards and languages. The website does not guess online/offline/hybrid availability.

The initial migration intentionally seeds no modes and has payment feature flags off by default. Configure at least one offered mode only after the batch arrangement is confirmed; the registration UI does not ask the student to choose one. Apply migrations in order, including `202610310002_optional_registration_details.sql` when the earlier enrolment schema is already installed. The legal routes are launch placeholders; do not approve payment until the owner has replaced these with reviewed final policies.

## Setup

1. Copy `.env.example` to `.env` locally or add its keys as server environment variables. Never add `.env` to version control or use `VITE_` prefixes for private credentials.
2. Apply `supabase/migrations/202610310001_enrolment.sql` to the Supabase project.
3. Apply `supabase/migrations/202610310003_admin_console.sql` after the base enrolment schema.
4. In Supabase Auth, create staff accounts, then insert each approved Auth user UUID into `public.admin_users` with the least-privileged role. Never enable public self-registration for the admin console.
5. In `program_learning_modes`, set `is_available=true` only for modes actually offered for the relevant program. Confirm `programs.enrolment_open` for the batch.
6. In the Razorpay test dashboard, use the test Key ID/Secret, configure the webhook URL `/api/v1/webhooks/razorpay`, use the same webhook secret, and subscribe to `payment.captured` and `payment.failed` events.
7. Replace the legal placeholders with approved copy and set `POLICIES_APPROVED=true`. Set `PAYMENT_ENABLED=true` only for test rollout after reviewing the config. Use a random `STATUS_TOKEN_SECRET` of at least 32 characters and a webhook secret of at least 24 characters.
8. Run `npm run dev:all`; Vite forwards `/api` to the local API on port 4000.

## API outline

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/config` | Configured board and language choices |
| `GET /api/v1/programs` | Active fees, modes and checkout availability |
| `POST /api/v1/enrolments` | Validate, snapshot configured fees and create a pending registration |
| `POST /api/v1/enrolments/:reference/payment-orders` | Create/reuse a server-side Razorpay order |
| `POST /api/v1/payments/verify` | Verify checkout HMAC, then fetch provider payment before confirmation |
| `GET /api/v1/enrolments/:reference/status` | Token-protected confirmation/status reconciliation |
| `POST /api/v1/webhooks/razorpay` | Verify raw-body webhook signature and process idempotently |
| `POST /api/v1/enquiries` | Store a consented enquiry |
| `/api/v1/admin/*` | Supabase-authenticated staff session and protected records |

The admin API includes `GET /dashboard`, `GET /enrolments`, `GET /enrolments/export`, `PATCH /enrolments/:id`, `POST /manual-enrolments`, `PATCH /enrolments/:id/manual-payment`, and enquiry list/update routes. All are server-authorized; database RPCs used for reporting and manual enrollment are executable only by the server's service role.

## Test-mode acceptance checklist

This workspace currently has no project-specific Supabase or Razorpay secrets, so a real Razorpay test-mode transaction cannot be initiated from this environment yet. Once the configuration above is supplied, use the Razorpay test checkout with a provider test payment instrument and verify:

1. Invalid and missing fields show inline validation and create no database row.
2. Class 12 pathway and learning mode remain unassigned during checkout; the API stores them as pending team follow-up and never selects an undisclosed default. A batch still must have at least one genuinely offered mode configured before checkout can open.
3. A repeated registration idempotency key returns the same pending enrolment without creating another student row.
4. A payment order amount equals the server-side fee snapshot, never a browser-submitted amount.
5. A valid signature plus provider status `captured` confirms once; a forged signature, mismatched order/amount/currency, or merely authorized payment never confirms.
6. `payment.failed`, checkout dismissal, network interruption, pending state, duplicate webhook delivery and retry do not create duplicate enrolments or double-capture confirmation.
7. Confirmation exposes only limited student details and correct receipt references; no card or CVV data is stored.
8. No WhatsApp/Telegram private group is joined automatically; joining requires the student's/family's explicit action.
9. Admin routes reject unauthenticated users, and finance role cannot read student contact details or enquiry submissions.

## Hosting

Build the frontend with `npm run build` and API with `npm run build:api`. Deploy the Vite `dist` assets and Node API on Hostinger Node.js hosting; configure the SPA fallback to `index.html`, set server environment variables in the hosting control panel, and route `/api/*` to the Node process (or use the configured same-origin reverse proxy). Add the deployed HTTPS origin to `APP_ORIGIN` and configure the identical public origin for the frontend/API. Razorpay webhooks must reach the API directly over HTTPS. If a Content-Security-Policy is set on static hosting, allow the Razorpay Checkout script and its payment frames/connections per the current Razorpay integration documentation. Keep secrets out of browser bundles, logs and deployment artifacts.
