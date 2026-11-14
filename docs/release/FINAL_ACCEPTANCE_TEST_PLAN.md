# Radix Minds 75-Day Bootcamp — Final Acceptance Test Plan

This plan separates local, offline checks from acceptance that requires the Netlify Deploy Preview, the isolated Supabase TEST project, a provisioned TEST administrator, or Razorpay Test Mode. A passing local test is not evidence of a live provider transaction.

## Safety and test environments

- **Deploy Preview:** `https://deploy-preview-1--radixminds75daysbootcamp.netlify.app`
- **Only database permitted for TEST acceptance:** RadixMinds Bootcamp Test, project reference `oohcwibhjmzrrpuxonck`.
- **Production:** `https://bootcamp.radixminds.in`. Do not use production credentials, create production records, or test payments/refunds there.
- Keep production `PAYMENT_ENABLED=false` and `POLICIES_APPROVED=false`. Do not change production environment variables or deploy from this plan.
- For preview testing, use a Deploy Preview context with `APP_ORIGIN` exactly matching the preview origin, the isolated TEST Supabase URL and keys, `RAZORPAY_MODE=test`, and Razorpay `rzp_test_` credentials only. Set preview payment/policy gates only if the business has separately authorized a controlled preview checkout. Never copy these values into Production scope.
- Configure variables in Netlify UI under **Site configuration → Environment variables**, scoped to **Deploy Previews** (or a dedicated preview branch/context). Keep service-role, Razorpay secret, webhook secret, and status-token values server-side. Do not paste values in tickets, chat, logs, or this report.
- Current actual Netlify settings, Supabase connectivity, TEST admin provisioning, and Razorpay credentials are **not inspectable from this repository**. Record dashboard evidence before running external acceptance.

## How to run offline checks

From the repository root in PowerShell:

```powershell
npm test
npm run build
npm run build:netlify
npm run test:netlify-function
npm run audit:secrets
git diff --check
```

These checks must use synthetic fixtures or offline stubs. They must not send requests to Supabase or Razorpay. Save terminal output and the commit/working-tree identifier in the release evidence record. The test suite does not prove a real checkout, database integration, or Netlify runtime configuration.

## Runtime environment-variable inventory

| Variable | Purpose | Client-visible? | Preview requirement |
|---|---|---:|---|
| `APP_ORIGIN` | Exact allowed browser origin, including CORS/CSRF checks | No | Set to the Deploy Preview origin used for the test |
| `SUPABASE_URL` | Supabase project endpoint | Public configuration | Must identify only the isolated TEST project |
| `SUPABASE_PUBLIC_KEY` | Supabase Auth client key | Public configuration | TEST project key only |
| `SUPABASE_SECRET_KEY` | Server database access | **Secret; server only** | TEST project service key only |
| `SUPABASE_SERVICE_ROLE_KEY` | Server database access alias | **Secret; server only** | If used, TEST project service key only; do not set conflicting aliases |
| `STATUS_TOKEN_SECRET` | Signs public enrolment status tokens | **Secret; server only** | Unique random preview secret, at least 32 characters |
| `RAZORPAY_MODE` | Selects key-prefix validation | No | `test` |
| `RAZORPAY_KEY_ID` | Razorpay Checkout public key ID | Checkout key is client-visible | Must begin `rzp_test_` in preview |
| `RAZORPAY_KEY_SECRET` | Server-side order/payment/refund API credential | **Secret; server only** | Test credential only |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook HMAC key; minimum trimmed length 24 | **Secret; server only** | Test webhook secret only; match the Razorpay TEST webhook configuration |
| `PAYMENT_ENABLED` | Server-side payment gate | No | Only enable in an explicitly authorized isolated preview test context; Production remains false |
| `POLICIES_APPROVED` | Server-side registration/payment policy gate | No | Only enable in an explicitly authorized isolated preview test context; Production remains false |
| `BOARD_OPTIONS`, `LANGUAGE_OPTIONS` | Optional form options | No | Optional; use approved values |
| `WHATSAPP_PHONE`, `TELEGRAM_URL` | Support links in the product/status UI | Public contact information | Confirm current support contact details |

The application reads server settings from `process.env` at module initialization. Vite/browser code must not receive `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, or `STATUS_TOKEN_SECRET`. Do not use `VITE_` prefixes for these values.

## Acceptance cases

### 1. Offline automated acceptance

| Test | Exact execution | Expected result | Classification / environment | Evidence / blockers |
|---|---|---|---|---|
| API configuration safety | `npm run test:config` | Missing, empty, whitespace-only, 23-character secrets fail readiness; 24-character and longer synthetic secrets pass only with all other synthetic gates set; invalid secret does not make checkout ready | Automated unit + local function handler, no provider/network | Save TAP output. Does not test Netlify’s configured runtime value |
| Invalid webhook configuration response | Included in `npm run test:config` | A local function request with an invalid secret gets HTTP 503 before malformed body/signature validation; no database/provider call | Automated isolated function invocation | Source/HTTP status evidence; no external webhook delivery |
| Webhook HMAC/event/idempotency behavior | `npm run test:webhook` (also part of `npm test`) | Exact raw-body HMAC, invalid signatures, duplicate/retry, stale lease, mismatch and out-of-order unit cases behave as asserted | Automated unit with mocked store | Does not prove deployed webhook secret or Supabase RPC behavior |
| Enrolment and policy validation | `npm run test:enrolment` and `npm run test:policies` (also part of `npm test`) | Valid programme/path selection and required acknowledgements pass; invalid inputs fail | Automated unit | No registration is persisted |
| Payment integrity/concurrency logic | `npm run test:payment` (also part of `npm test`) | Mocked signature/amount/status and coordinator fencing cases pass | Automated unit/mock | Does not prove Razorpay or simultaneous PostgreSQL behavior |
| Refund cutoff and decision validation | `npm run test:refunds` (also part of `npm test`) | Captured payment date is day 1 in Asia/Kolkata; window stays open through the end of day 7 and closes at 00:00 IST after day 7; amount validation rejects zero/over-capture | Automated unit | Database RPC boundary still needs isolated TEST integration evidence |
| WhatsApp consent/draft | `npm run test:whatsapp` (also part of `npm test`) | Requires online confirmed enrolment, consent, and matching captured INR payment; draft contains verified details and says schedule/joining details will follow; no message is sent | Automated unit | No WhatsApp Business API integration is configured or claimed |
| API test launcher isolation | `npm run test:api-test-launcher` (also part of `npm test`) | Test launcher isolates environment and gates | Automated unit | Does not start the API against Supabase |
| Complete unit suite | `npm test` | All constituent suites pass | Automated, offline | Record exact test/pass/fail counts from output |
| Frontend/API build | `npm run build` | TypeScript frontend build and Vite output succeed | Build, offline | Not deployment evidence |
| Netlify build and secret audit | `npm run build:netlify` | Frontend/API build and repository secret audit succeed | Build, offline | Does not verify Netlify-scoped runtime variables |
| Netlify function smoke | `npm run test:netlify-function` | Function initializes; health/config routes and closed safety gates behave as script expects | Offline function bundle | No Supabase or Razorpay transaction |
| Secret audit / bundle inspection | `npm run audit:secrets`; inspect `dist/` and `server/dist/` for forbidden credential values using the repository audit | No credentials or secret values in tracked examples or browser bundles | Automated/local | Do not print secret values. Record only names/paths and pass/fail |
| Whitespace/diff check | `git diff --check` | No whitespace errors | Local | Preserve unrelated worktree changes |

### 2. Deploy Preview smoke tests (manual, isolated TEST configuration)

Before calling the preview, verify in Netlify UI that **the Deploy Preview context only** has the isolated TEST project URL/keys, `APP_ORIGIN` matching the preview origin, `RAZORPAY_MODE=test`, test-only Razorpay credentials and webhook secret. Confirm Production values and gates are unchanged without copying them into a report. Never use the Production URL for these steps.

PowerShell GET checks (read-only):

```powershell
$base = 'https://deploy-preview-1--radixminds75daysbootcamp.netlify.app'
Invoke-RestMethod -Method Get -Uri "$base/api/health"
Invoke-RestMethod -Method Get -Uri "$base/api/v1/config"
Invoke-RestMethod -Method Get -Uri "$base/api/v1/programs"
```

Expected: HTTP 200 for health/config; health does not expose secrets; config reports the intended mode/gate; programme list includes Class 10 ₹2,499 and Class 12 ₹3,499 in INR, configured learning modes only. If a route returns a configuration or database error, stop and correct the Preview context; do not change Production.

| Test | Execution | Expected result | Classification / environment | Evidence / blockers |
|---|---|---|---|---|
| API health/config/catalogue | Commands above | Correct function routes, Test mode, both programmes, fees and modes | Manual HTTP, Deploy Preview + isolated TEST | Save status/payload with personal data redacted; stop on wrong project/config |
| Desktop/mobile public pages | Open preview in browser; inspect 1440px desktop and 320/375/430px mobile, plus 768px and 1024px | Home, programme pages, links, form, error/loading states and content remain readable; no horizontal overflow | Manual browser | Screenshot evidence; browser QA is not replaced by a build |
| Class 10 registration | Use a synthetic test identity, available Class 10 mode, valid test-only policies and a fresh UUID idempotency key; submit once | Server creates `pending_payment`, trusted fee is ₹2,499, reference/token returned; duplicate key does not create another enrolment | Manual integration; Deploy Preview + isolated TEST database | Record reference and sanitized response. If policy gate is false, expected 503 and stop rather than bypass |
| Class 12 registration | Same using Class 12, selected Maths/Biology pathway and fresh identity/key | Pending registration snapshots ₹3,499 and correct programme/subjects/mode | Manual integration; isolated TEST | Same evidence rules |
| Invalid registration/mode/policy | Submit missing/invalid fields or unsupported mode; try with required acknowledgement omitted | 4xx validation or closed policy-gate response; no unintended record | Manual integration; isolated TEST | Confirm via admin/read-only test tooling, not broad cleanup |

### 3. Razorpay Test Mode acceptance (real sandbox only)

Prerequisites: a preview deploy with isolated TEST Supabase, explicitly authorized preview payment gates, Razorpay TEST key ID/secret, matching TEST webhook secret and a Razorpay dashboard TEST webhook pointing to the Deploy Preview webhook endpoint. Do not put secret values in chat, browser code, or screenshots. If any prerequisite is absent, mark the case **BLOCKED**, do not substitute a mock and do not test Production.

For each successful/failed/abandoned checkout, use a fresh synthetic enrolment and follow the UI. Do not edit request amounts in DevTools as a way to force success.

| Test | Execution | Expected result | Classification / environment | Evidence / blockers |
|---|---|---|---|---|
| Test order creation/amount | Select each class and start checkout | Server creates INR order from saved DB fee snapshot only: ₹2,499 / ₹3,499; saved order associated with same pending enrolment | Real Razorpay TEST + isolated TEST DB | Razorpay TEST order reference and sanitized DB/admin evidence |
| Successful checkout and verification | Complete Razorpay TEST checkout using provider-supported test method | Backend verifies HMAC, fetches provider payment, matches order/payment/amount/currency and captured state; confirms once | Real sandbox transaction | Record provider TEST IDs, status, amount/currency, enrolment status; never expose secrets |
| Invalid callback signature | In isolated test tooling only, submit altered signature against a synthetic test order | 4xx signature rejection; payment/enrolment not confirmed | Manual/API negative test in Deploy Preview | Preserve only sanitized response and record status |
| Failed/abandoned checkout | Complete a provider failure scenario and separately close checkout | Failed remains failed; abandoned/authorized remains pending; neither is confirmed | Real sandbox checkout | Provider and admin status evidence |
| Duplicate callback/retry | Repeat verification with same captured payment | Idempotent confirmed result; one payment identity and one confirmed enrolment | Real sandbox + API | Before/after record counts/status |
| Captured amount/currency/order mismatch | Use an isolated test harness or provider-issued values only; never alter a real amount to simulate a capture | Rejected or needs-review according to server logic; never confirms mismatched enrolment | Test-only negative integration | Must not create synthetic “successful” responses; if unavailable, mark BLOCKED |
| Real webhook HMAC | Deliver genuine Razorpay TEST event to the configured preview webhook | Raw-body signature validates; event claimed and processed | Real Razorpay TEST webhook | Razorpay webhook delivery status plus matching event row/status |
| Duplicate webhook | Use Razorpay dashboard resend for the same event | Acknowledged idempotently; no duplicate payment confirmation | Real webhook resend | Event ID, delivery attempts, final status |
| Delayed/out-of-order event | Use TEST provider event sequencing if available | A late failure cannot downgrade captured; valid capture can reconcile earlier pending/failure | Real TEST integration | If provider cannot produce scenario, mark BLOCKED; unit tests alone do not count |

### 4. Admin, refund, and WhatsApp acceptance (manual, authenticated TEST admin)

Prerequisites: a dedicated Supabase Auth TEST user provisioned through the established admin process and active `admin_users` role. Confirm the operator identity in the isolated TEST project before logging in. Ordinary authenticated users and finance role must not decide/approve refunds. Do not create admin records by bypassing policy/RLS.

| Test | Execution | Expected result | Classification / environment | Evidence / blockers |
|---|---|---|---|---|
| Admin authentication | Sign in through the admin UI with the dedicated TEST admin | Server validates Supabase Auth user and active admin row; cookie is HttpOnly; unauthenticated requests are denied | Manual; Deploy Preview + TEST Auth | Redact email/token; verify endpoint returns 401 when signed out |
| Ordinary user/finance authorization | Use ordinary TEST account and finance-role account against admin list, decision, processing, and WhatsApp draft endpoints | No admin data/actions; refund decisions/processing restricted to active owner/operations roles | Manual negative authorization | Capture sanitized 401/403; do not change role grants to pass |
| Refund request eligibility | Submit from a confirmed captured TEST enrolment on payment date and near the end of Kolkata calendar day 7; verify just before and at cutoff via isolated database-controlled test timestamps | Request accepted strictly before stored cutoff; rejected at/after cutoff; pending/failed payments rejected; duplicate key/request idempotent | Real TEST DB boundary test; does not call Razorpay refund | Record captured timestamp, `cutoff_at`, request timestamp/status. Do not change server clocks or production records |
| Refund admin decision | TEST owner/operations opens request and approves within captured amount; separately reject another request; try finance/ordinary user | Decisions persist with actor/time/audit event; invalid/over-capture rejected; request submission/approval does not itself call provider | Manual authenticated TEST integration | Audit row IDs and statuses, sanitized |
| Refund provider processing | Only after explicit TEST approval, process an approved synthetic TEST refund from admin action | Same DB idempotency key reused; provider refund ID/status reconciled; no LIVE request | Real Razorpay TEST refund | If TEST payment/refund credentials or provider setup unavailable, BLOCKED |
| WhatsApp consent off | Use a confirmed captured TEST enrolment with no consent | Draft endpoint refuses; no send attempt | Manual admin TEST | Sanitized 409 / eligibility evidence |
| WhatsApp consent on | Use confirmed captured TEST enrolment with explicit consent and valid saved number | Admin endpoint returns a ready-to-review `wa.me` draft with actual record values and schedule “will be shared”; `sent:false`; no automatic send | Manual admin TEST | Verify draft contents locally, redact PII in evidence; manually sending requires a separate decision |
| Invalid number/unverified payment | Use controlled TEST fixture with invalid phone or noncaptured payment | Draft refused; no message created/sent | Manual isolated TEST | Sanitized error and unchanged state |

### 5. Evidence record template

For each case record: test name; UTC and Asia/Kolkata timestamp; environment (`local`, `deploy-preview`, `supabase-test`, `razorpay-test`); test operator; result (`PASS`, `FAIL`, `BLOCKED`, `NOT TESTED`); sanitized HTTP status/response; synthetic enrolment/payment/event reference; relevant admin/audit status; screenshot or log location. Never include passwords, keys, tokens, cookies, full webhook bodies, student PII, or raw environment dumps.

## Release blockers and sign-off

The repository cannot establish whether Netlify Preview variables, Supabase TEST project schema, TEST admin account, Razorpay sandbox credentials/webhook, or actual browser experience are configured. These require operator evidence. This code-level plan does not authorize preview gate changes, provider calls, refunds, WhatsApp sending, production deployment, or live payments.

Before final acceptance, all local tests/builds must pass; the preview context must be independently verified to point only to TEST; and each external case must be marked with actual evidence. Production paid admissions remain blocked until production legal approval, production configuration, production admin control, provider webhook, and deployment are separately authorized and verified.
