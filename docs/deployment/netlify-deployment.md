# Netlify Deployment Preparation

This guide prepares the existing Radix Minds Vite + Express application for Netlify. It does not authorize a production deploy, change DNS, modify Supabase, enable enrolment, or enable payments.

## Architecture

- Vite builds the public React site to `dist/`.
- Netlify publishes `dist/` as static assets.
- The existing Express application is exported from `server/src/index.ts` without opening a listener.
- `netlify/functions/api.ts` wraps that same Express app with `serverless-http`.
- The `/api/*` rewrite invokes the function, preserving the existing frontend `/api/v1/...` requests and backend routes.
- The `/*` rewrite serves `index.html` for React Router paths and refreshes. The API rewrite is intentionally listed first.
- Local and Hostinger Node startup remain available through `server/src/start.ts` and `npm start`.

Netlify's Express guide documents this function adapter and rewrite pattern: <https://docs.netlify.com/build/frameworks/framework-setup-guides/express/>.

## Build settings

The repository root is the Netlify base directory. Configure:

| Setting | Value |
| --- | --- |
| Build command | `npm run build:netlify` |
| Publish directory | `dist` |
| Functions directory | `netlify/functions` |
| Node bundler | `esbuild` |

`build:netlify` builds the frontend and compiles the Express app to `server/dist/` before Netlify bundles the function. `npm run build:hostinger` remains available. The local persistent-server command is `npm start` (Netlify does not use it).

## Environment variables

Configure runtime variables in Netlify's protected environment settings, never in Vite-prefixed variables. Do not copy credentials automatically. Use separate values and contexts for deploy previews and production.

| Variable name | Purpose | Context | Visibility |
|---|---|---|---|
| `NODE_ENV` | Runtime mode | Deploy Preview, Production | Non-secret |
| `APP_ORIGIN` | Exact allowed browser origin | Each context, matching that site URL | Non-secret |
| `SUPABASE_URL` | Supabase API endpoint | Each context | Public endpoint |
| `SUPABASE_PUBLIC_KEY` | Supabase Auth public/anon key | Each context | Public key, restricted by RLS |
| `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | Privileged server-side database access (configure only one alias) | Each context | Secret; server only |
| `STATUS_TOKEN_SECRET` | HMAC secret for enrolment status tokens | Each context | Secret |
| `POLICIES_APPROVED` | Server-side policy/enrolment gate | Deploy Preview, Production | Non-secret; keep `false` until approved and verified |
| `PAYMENT_ENABLED` | Server-side checkout gate | Deploy Preview, Production | Non-secret; keep `false` until separately approved |
| `RAZORPAY_MODE` | Razorpay mode | Test context only initially | Non-secret setting |
| `RAZORPAY_KEY_ID` | Checkout public key identifier | Test context only | Public identifier; never put in Vite config |
| `RAZORPAY_KEY_SECRET` | Order/signature/refund authentication | Test context only | Secret; server only |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook HMAC verification | Test context only | Secret; server only |
| `BOARD_OPTIONS` | Allowed student board values | Each context, optional | Non-secret |
| `LANGUAGE_OPTIONS` | Allowed language values | Each context, optional | Non-secret |
| `WHATSAPP_PHONE` | Support number in message drafts | Each context, optional | Public contact detail |
| `TELEGRAM_URL` | Support link | Each context, optional | Public URL |
| `PORT` | Persistent Node listener port | Local only; not used by Netlify Functions | Non-secret |

The Netlify function smoke test now blanks Supabase, Razorpay, and status-token variables before importing the function bundle; it runs offline. Do not use real credentials for that test.

For public production with paid admissions still disabled, retain `POLICIES_APPROVED=false` and `PAYMENT_ENABLED=false`. Do not change either setting in this preparation task.

## Supabase and migrations

Use the existing Supabase project and keep the service-role credential server-side. This run did not apply SQL. The WhatsApp consent migration and the new WhatsApp-number/policy-version and refund-workflow migrations require ordered validation on the isolated test project before they are considered ready for production. The currently linked project reference must be checked immediately before any remote command; the production reference is prohibited for these checks. Production migration history was not audited or changed during this run.

The frontend build does not require Supabase connectivity. Refund and alternate-WhatsApp database routes remain unavailable until their migrations are installed in the target database.

## Setup and temporary URL verification

1. In Netlify, confirm the existing site is connected to `abhi040498/Radixminds-75-day-bootcamp` and the intended branch. Do not change repository settings or publish from this task.
2. Confirm root base directory, build command `npm run build:netlify`, publish directory `dist`, and functions directory `netlify/functions`.
3. Enter only the isolated TEST project URL and test-only credentials in the Deploy Preview context after verifying their source. Keep production-context secrets separate; do not copy Test Mode secrets to Production.
4. Create a deploy preview. Verify homepage, legal routes, direct refresh on nested routes, `/api/health`, `/api/v1/config`, `/api/v1/programs`, and unauthenticated admin denial. Use a test-project-only API environment; never run database-backed smoke tests against production.
5. Run the isolated integration and consent/refund migration checks after the migration order and project reference are reviewed. No student/payment fixture should be created outside those approved tests.
6. Before any production deployment, separately authorize and verify migration state, secrets, `APP_ORIGIN`, admin access, both gates, webhook configuration, and rollback path. This guide does not authorize those changes.

The Netlify Express integration uses a serverless invocation rather than a permanently running Node process. Function instances may start cold, and process-local rate-limit counters are not a shared persistent store across instances; treat them as best-effort and review abuse controls before opening public enrolment.

## Custom domain and SSL (later, with approval)

1. After the temporary URL passes verification, add `bootcamp.radixminds.in` in Netlify's domain settings.
2. Follow the exact DNS records shown by Netlify. Review existing DNS and mail records before changing anything. This guide does not authorize DNS changes.
3. Wait for domain verification and Netlify certificate provisioning, then confirm the site loads over HTTPS and the certificate is valid.
4. Set `APP_ORIGIN` to the final HTTPS origin and redeploy after the domain owner approves the configuration.

## Netlify Free plan considerations

Netlify Free currently has a fixed monthly usage-credit allowance; sites pause when the account reaches its limit. Function execution, requests, bandwidth, and deploys consume plan resources. The current function defaults include a 60-second synchronous execution limit and a 6 MB buffered request/response limit. Recheck current limits in the Netlify account before launch because plan terms can change. Sources: <https://www.netlify.com/pricing/> and <https://docs.netlify.com/build/functions/configuration/>.

The Razorpay webhook must finish synchronously and acknowledge only after processing. Monitor function duration, failures, and usage. This plan is suitable for initial low-volume evaluation, not a guarantee of uninterrupted service at arbitrary traffic levels.

## Rollback

1. Use Netlify's Deploys page to restore the previously verified deploy.
2. Restore the prior environment-variable configuration if it changed, without exposing secrets in logs or source.
3. Recheck the temporary/custom URL, API health, config, and program routes.
4. Do not roll back by resetting Supabase or deleting student records. No database rollback is part of this Netlify process.

## Current implementation status

- The website is already deployed according to the site owner; this task did not inspect or alter Netlify's live configuration.
- No deploy was triggered, no secrets were transferred, and no domain, DNS, or SSL setting was changed.
- No migration was applied. The local Netlify function smoke-test script is explicitly offline.
- The production payment and policy gates were not changed.
