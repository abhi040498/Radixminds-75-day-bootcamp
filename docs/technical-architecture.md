# Technical Architecture — Radix Minds 75-Day Board Bootcamp

**Status:** Draft for approval  
**Target stack:** React, Vite, TypeScript, Tailwind, shadcn/ui, React Router, Lucide; Node.js/Express/TypeScript; Supabase PostgreSQL; Razorpay; Hostinger-compatible Node.js hosting with manual deployment.

## 1. System context

```text
Student / Parent browser
  ├── React + Vite public site and protected admin UI
  ├── Razorpay Checkout (provider hosted/SDK UI; card/payment data stays with provider)
  └── HTTPS REST requests
          ↓
Node.js + Express API (Hostinger Node.js application)
  ├── Supabase PostgreSQL (server-side connection / narrowly scoped credentials)
  ├── Razorpay Orders / Payments API
  └── Razorpay webhook endpoint
```

The site can be deployed as a static Vite build and the API as a separate Node.js application under the same domain/reverse proxy or separate API hostname. Preferred production shape: `bootcamp.radixminds.in` serves the static frontend and `/api/*` is proxied to the Express service. Confirm Hostinger plan support for SPA fallback, Node process persistence, TLS, and reverse-proxy configuration before implementation/deployment. Supabase is managed database/auth infrastructure; do not expose service credentials to browser code.

## 2. Repository / application boundaries

Proposed single repository:

```text
apps/
  web/                 # Vite React SPA, marketing + registration + admin UI
  api/                 # Express REST API, webhooks, admin operations
packages/
  shared/              # validation schemas, API types, enums (no secrets)
supabase/
  migrations/          # versioned SQL schema and indexes
docs/
```

Use TypeScript strict mode. Frontend owns display, client-side UX validation, routing, accessibility, and Razorpay Checkout invocation. Backend owns authoritative validation, pricing, offer eligibility, registration/order state, provider communication, payment verification, and admin authorization. Shared schemas may describe contracts, but server validation remains authoritative.

## 3. Database schema proposal

Use UUID primary keys, UTC timestamps (`timestamptz`), INR integer amounts in paise, explicit status enums/check constraints, foreign keys, and indexes. Never store full card, UPI PIN, CVV, or other payment instrument secrets.

### `programs`

- `id uuid PK`
- `code text UNIQUE` (`class_10`, `class_12`)
- `name text`, `duration_days integer`
- `subjects jsonb` (Class 12 Mathematics/Biology represented as a required choice group, not two simultaneous subjects)
- `features jsonb`, `description text`
- `base_fee_paise bigint` (confirmed current fees: 249900 and 349900 if treated as payable list prices)
- `currency char(3)` default `INR`
- `is_active boolean`, `enrolment_open boolean`
- `created_at`, `updated_at`

### `offers`

- `id uuid PK`, `program_id uuid FK`
- `label text`, `discount_percent numeric(5,2) NULL`
- `reference_price_paise bigint NULL` (only owner-approved; never infer)
- `payable_price_paise bigint NOT NULL`
- `starts_at timestamptz NULL`, `ends_at timestamptz NULL`, `display_timezone text`
- `terms text`, `is_active boolean`
- `created_by uuid FK admin_users`, `created_at`, `updated_at`

Enforce one applicable active offer per program in service logic and add an appropriate partial unique index if operational semantics are fixed. Snapshot all price/offer terms into the registration/order at creation so later changes do not rewrite a customer's pending checkout.

### `enrolments`

- `id uuid PK`; `public_reference text UNIQUE` (non-sequential, non-guessable)
- `program_id uuid FK`; `offer_id uuid NULL FK`
- `student_name text NOT NULL`; `guardian_name text NULL`
- `mobile_e164 text NOT NULL`; `email text NULL`
- `subject_choice text NULL` (required and constrained for Class 12)
- `program_name_snapshot text`, `subjects_snapshot jsonb`
- `amount_due_paise bigint`, `currency char(3)`
- `status text CHECK`: `pending_payment`, `enrolled`, `cancelled`, `refunded` (final transitions controlled by service)
- `privacy_consent_at timestamptz`, `terms_accepted_at timestamptz`
- `created_at`, `updated_at`

Do not collect date of birth, school, address, or board unless the owner establishes a clear need and the privacy notice covers it.

### `payment_orders`

- `id uuid PK`; `enrolment_id uuid FK`; `provider text` default `razorpay`
- `provider_order_id text UNIQUE`; `provider_payment_id text NULL UNIQUE`
- `amount_paise bigint NOT NULL`, `currency char(3) NOT NULL`
- `status text CHECK`: `created`, `authorized`, `captured`, `failed`, `cancelled`, `refunded`, `needs_review`
- `provider_signature_verified_at timestamptz NULL`
- `created_at`, `updated_at`, `captured_at timestamptz NULL`

### `payment_events`

- `id uuid PK`; `provider_event_id text UNIQUE`; `payment_order_id uuid NULL FK`
- `event_type text`; `payload_redacted jsonb` (allow-listed metadata only)
- `signature_valid boolean`; `received_at timestamptz`; `processed_at timestamptz NULL`; `processing_error text NULL`

Maintain idempotency by unique provider event ID and provider payment/order IDs. Avoid retaining full webhook payload if it contains unnecessary personal/provider data.

### `admin_users` and `audit_log`

- Admin maps to a Supabase Auth user UUID; role enum/check (`owner`, `operations`, `finance`), `is_active`, timestamps.
- Audit rows: actor ID, action, resource type/ID, changed fields (avoid duplicating sensitive PII), timestamp, request ID, optional IP/agent under approved retention policy.
- Never store password hashes when Supabase Auth is used. Require MFA for owner/admin accounts where available.

### Data retention and access

Retention period is **to be configured/approved**. Define deletion/anonymization policy for abandoned registrations, payment/audit records, and backups before launch. Restrict production database access to API/admin operations; use migrations for schema changes. If Supabase RLS is enabled, keep browser anon access to these tables disabled; API uses server authorization and narrowly scoped service access, or database-role policies where feasible.

## 4. REST API architecture

Base path `/api/v1`; JSON; HTTPS only; request IDs; consistent errors `{ error: { code, message, requestId, fields? } }`. Validate request bodies and path/query values on the server with a schema library (e.g. Zod). Version and document the contract with OpenAPI.

### Public read endpoints

- `GET /programs` — active public program cards and approved display prices.
- `GET /programs/:code` — program content and current eligible offer copy.
- `GET /site-settings/public` — approved contact, policies, and checkout availability only.

### Registration and payment endpoints

- `POST /enrolments` — validate program, subject choice, consent, pricing; create pending enrolment and initial order atomically where practical.
- `POST /enrolments/:id/payment-orders` — create/retry Razorpay order; server derives amount from current approved configuration or documented registration snapshot.
- `POST /payments/verify` — verify Razorpay Checkout signature; verify expected order/amount/currency and provider status; idempotently update records.
- `POST /webhooks/razorpay` — read raw body for HMAC verification; persist event idempotently; process safe event transitions.
- `GET /payment-status/:token` — return minimal status for unguessable, expiring/limited-use public status token; no arbitrary enrolment lookup by sequential ID.

### Admin endpoints (authenticated + role checked)

- `GET /admin/enrolments`, `GET /admin/enrolments/:id`
- `GET/PATCH /admin/programs/:id`
- `GET/POST/PATCH /admin/offers` (with validation, audit, and conflict detection)
- `GET /admin/payments/:id`; `POST /admin/payments/:id/reconcile` (server-side provider fetch)
- `GET/PATCH /admin/settings`
- `GET /admin/audit-log` (owner or authorized finance/operations scope)

No endpoint may accept a client-supplied payment amount as authoritative. Keep admin API permissions least-privilege. Pagination, filters, and sorting use allow-listed fields.

## 5. Payment integrity and state model

- Store Razorpay key secret and webhook secret only in server environment/secrets manager; public key ID may be sent to the browser.
- Create provider orders server-side using amount in paise and currency INR. Persist internal order before returning Checkout data.
- Validate request origin/CSRF strategy as appropriate, and rate-limit order creation to reduce abuse.
- Verify HMAC signature using timing-safe comparison and the exact provider-required message; associate payment ID with the stored provider order ID.
- Confirm captured status through provider API or signed webhook; never trust query parameters or Checkout's client response alone.
- Check event amount, currency, provider order ID, payment ID, and expected internal state before transition.
- Process webhook retries idempotently; acknowledge only after durable event persistence, then safely process/retry work.
- State transitions must be monotonic where possible; late failure must not downgrade a captured payment. Mismatches become `needs_review` and alert/log for staff.
- Reconcile pending orders via admin action or scheduled/manual provider query (scheduled job optional, hosting support to confirm).
- Refund workflow, partial refunds, chargebacks, receipts, and automated notifications are not assumed; define policy and implementation before enabling those features.

## 6. Security and privacy architecture

- HTTPS/TLS for all traffic; secure headers (Helmet), strict CORS allowlist, CSP, and production error pages without stack traces/secrets.
- Supabase Auth for staff identity; no public admin signup; strong passwords, MFA where available, account disablement, and server-side role checks on every admin operation.
- Keep database service role, Razorpay secrets, auth secrets, webhook secrets, and session signing secrets out of source, Vite variables, logs, and browser bundles. Use Hostinger environment settings or another approved secret store; rotate secrets.
- Use secure, HTTP-only, SameSite cookies if API sessions are used; CSRF protection for cookie-authenticated mutations. If using Supabase access tokens, validate JWT signature/issuer/audience and expiry server-side; do not rely on frontend route guards.
- Validate and normalize all input; parameterized SQL/ORM queries; output encoding; avoid HTML injection for admin-edited copy or sanitize/render plain text.
- Rate-limit registration, status lookup, admin login, and order creation; bot protection/CAPTCHA only if abuse warrants it. Do not rate-limit webhook deliveries in a way that drops valid provider retries.
- Avoid PII in URLs, logs, analytics, and error messages. Redact phone/email and webhook payloads; constrain support exports; audit sensitive access.
- Minimize fields and publish accurate privacy, terms, and refund/cancellation policies before launch. Define retention, deletion, backup, and incident response process.
- Protect public status lookup with a high-entropy token, expiry, rate limit, and minimal response. Do not expose names/phone numbers through guessable IDs.
- Dependency updates, lockfiles, production-only installs, backups, restore checks, and a documented secret rotation path.

## 7. Frontend architecture and design system

- Vite React + TypeScript, React Router routes, Tailwind tokens, shadcn/ui primitives, Lucide icons.
- Shared shell for header/footer; separate public routes and admin route group with server-checked authorization.
- Design tokens: Midnight Navy `#142B49`, Warm Ivory `#F7F5EF`, Academic Gold `#E9A23B`, Deep Teal `#367C77`; document accessible foreground/background pairs and test contrast.
- Responsive layouts with mobile-first typography, touch targets, compact navigation, no overflow; semantic landmarks, visible focus, form labels, keyboard operation, reduced-motion support.
- Use real owner-supplied photography/brand assets only; use custom typographic/shape treatment or approved stock/illustration rather than invented faculty/student outcome imagery.
- Route-level metadata, descriptive page titles, Open Graph basics, sitemap/robots, canonical domain after DNS approval. Marketing pages should be crawlable; consider prerender/SSR if search visibility requirements exceed SPA capabilities on chosen hosting.
- Track only approved privacy-conscious aggregate conversion events; do not send contact fields or student identity to analytics.

## 8. Hostinger deployment architecture (manual)

### Proposed production topology

- `bootcamp.radixminds.in`: built static web assets served over TLS with SPA fallback to `index.html`.
- `/api/*`: reverse-proxied to the Node.js Express process (or use an API subdomain if plan/reverse proxy constraints require it).
- Supabase project: production database/auth in a separate environment from development; restrict credentials and network access where available.
- Razorpay: test credentials in staging; live credentials only after end-to-end approval and webhook URL registration.

### Deployment steps and controls

1. Create separate local/development and production Supabase projects or clearly isolated schemas/credentials; apply versioned migrations and seed only non-sensitive program defaults.
2. Configure DNS and TLS for the chosen host/API topology; verify redirects, headers, SPA routes, and webhook reachability.
3. Build frontend (`npm ci`, typecheck/build) and API (`npm ci`, compile); deploy static `dist` and compiled Node entry point using Hostinger's supported Node app setup and documented start command.
4. Configure environment variables in Hostinger control panel, not in committed files; check health endpoint and database/provider connectivity without exposing secrets.
5. Register Razorpay webhook endpoint and secret; configure only necessary events; verify raw-body signature and retry behavior.
6. Run Razorpay test-mode end-to-end checkout; verify success, failure, cancellation, duplicate webhook, delayed callback, and reconciliation; then owner approves live-mode switch.
7. Back up database before migration; use migration with rollback plan; deploy API before frontend when backward-compatible, otherwise use coordinated versioning.
8. Smoke-check public routes, mobile view, admin access, logs, payment callback, HTTPS, and production pricing; monitor errors and reconcile pending payments.

Hostinger plan capabilities, deployment commands, Node runtime version, persistent process setup, reverse proxy, scheduled task support, environment configuration, and database egress are **to be verified** against the selected plan. Do not assume a particular control-panel feature.

## 9. Operational requirements

- Structured logs with request IDs and redaction; health/readiness endpoint without secrets; provider/database failures observable.
- Error monitoring and uptime monitoring are configurable vendor choices (not selected).
- Database backup frequency, retention, point-in-time recovery, and restore owner are to be decided.
- Manual support process for pending/mismatched payments and refund requests must be documented before launch.
- Accessibility target: WCAG 2.2 AA as a project goal, including focus/keyboard, contrast, labels/errors, and reduced motion.
- Performance goal: optimize mobile assets and Core Web Vitals; numeric budgets to be agreed after initial implementation and hosting validation.
