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

Set server variables in Netlify's site environment configuration. Do not put Supabase service-role or Razorpay secrets in Vite variables, browser code, or committed files. Do not copy secrets into Netlify automatically.

Required/configurable server variable names:

- `NODE_ENV`
- `APP_ORIGIN`
- `SUPABASE_URL`
- `SUPABASE_PUBLIC_KEY`
- `SUPABASE_SECRET_KEY` (or the supported alias `SUPABASE_SERVICE_ROLE_KEY`)
- `STATUS_TOKEN_SECRET`
- `POLICIES_APPROVED`
- `PAYMENT_ENABLED`
- `BOARD_OPTIONS`
- `LANGUAGE_OPTIONS`
- `WHATSAPP_PHONE`
- `TELEGRAM_URL`

For documentation only, the credential-shaped variables use intentionally fake placeholders such as `YOUR_SUPABASE_URL`, `YOUR_SUPABASE_PUBLIC_KEY`, `YOUR_SUPABASE_SECRET_KEY`, and `YOUR_RANDOM_STATUS_TOKEN_SECRET`. These values are not usable credentials. Enter real values only in Netlify's protected environment-variable settings; do not copy them into source files.

Netlify supplies the function runtime; `PORT` is for the local/Hostinger listener and is not required by the function. Razorpay variables are recognized by the existing application but must remain payment-disabled in this phase: `RAZORPAY_MODE`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`.

For the initial safe deployment configuration, use `POLICIES_APPROVED=false` and `PAYMENT_ENABLED=false`. Do not set them true to work around the server-side policy gate. The first-seven-day refund calculation remains an unresolved business decision.

## Supabase and migrations

Keep the existing Supabase project and server-side service-role access. Do not add a `VITE_` prefix to privileged credentials. This deployment configuration does not execute SQL or migrate data.

The production project has two pending migrations, `202611050001` and `202611050002`. The first supplies the admin learning-mode filter RPC; the second supplies the webhook claim function and processing state used by the current backend. Reconcile these migrations through the reviewed Supabase migration process before relying on those features. Until then, admin filtering by learning mode and database-backed webhook processing are unavailable. The React/Vite build itself is independent of them.

## Setup and temporary URL verification

1. Confirm the intended GitHub repository and branch. Ensure `.env` and other secret files are not committed; `.gitignore` already excludes `.env` files.
2. In Netlify, create a site by importing the repository from GitHub. Do not publish while reviewing the initial deploy settings.
3. Set the repository root as the base directory and use the build settings above (also declared in `netlify.toml`).
4. Add the environment-variable names and approved values in Netlify's environment settings. Keep policy approval and payment disabled. Enter secrets only in the dashboard; never paste them into source or this guide.
5. Build a deploy preview or use `netlify dev` locally. With Netlify CLI installed, `netlify dev` runs the Vite site and functions using the repository configuration. Use only read-only endpoints for smoke checks until an isolated test Supabase project is configured.
6. Verify the temporary `*.netlify.app` URL: homepage, legal routes, direct refresh on nested routes, `/api/health`, `/api/v1/config`, `/api/v1/programs`, admin unauthenticated denial, and API error handling. Do not create production enrolments or payment attempts.
7. Verify that `POLICIES_APPROVED` and `PAYMENT_ENABLED` remain false in the function environment and that no service-role or payment secret appears in deployed assets or logs.

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

## Explicitly not performed

- No Netlify site was created or published.
- No GitHub repository was connected.
- No secrets were transferred.
- No custom domain, DNS, or SSL configuration was changed.
- No Supabase migrations or production data were changed.
- Enrolment and payment gates were not changed.
