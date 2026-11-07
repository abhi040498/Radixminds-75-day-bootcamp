# Radix Minds 75-Day Board Bootcamp

React/Vite frontend and Express API in one Node.js application, with Supabase PostgreSQL/Auth. The Express server serves the built React SPA and API from one origin in production.

## Local development

1. Install the supported Node.js runtime and run `npm ci`.
2. Copy `.env.example` to `.env` and enter the required local Supabase credentials. Never share or commit `.env`.
3. Keep `POLICIES_APPROVED=false` until the final terms and privacy notice are reviewed and published. With this flag false, enrolment creation intentionally does not write student data.
4. Start both servers with `npm run dev:all`. Vite is normally available at `http://localhost:5173`; Express uses `http://localhost:4000`.

## Build and production start

```powershell
npm ci
npm run build:hostinger
npm start
```

`build:hostinger` runs the frontend TypeScript/Vite production build and the Express TypeScript build. `npm start` launches `server/dist/index.js`; Express then serves `dist/` and handles `/api/*`.

For Hostinger’s Node.js Web App configuration, set the build command to `npm ci && npm run build:hostinger` and the start command to `npm start`, with the repository root as the application root. Confirm the dashboard’s detected build and start commands before publishing.

## Environment configuration

See `.env.example` for the environment-variable names. Sensitive values are intentionally blank; set them only in local ignored `.env` or the hosting dashboard. Set production variables using the hosting dashboard:

- `NODE_ENV=production`
- `PORT` (use the runtime-provided port if Hostinger assigns one)
- `APP_ORIGIN=https://bootcamp.radixminds.in`
- `SUPABASE_URL`, `SUPABASE_PUBLIC_KEY`, `SUPABASE_SECRET_KEY`
- `STATUS_TOKEN_SECRET` (at least 32 random characters)
- `BOARD_OPTIONS`, `LANGUAGE_OPTIONS`, `WHATSAPP_PHONE`, `TELEGRAM_URL`
- `POLICIES_APPROVED=false` until legal text is owner-approved
- `PAYMENT_ENABLED=false` and `RAZORPAY_MODE=test` while payment integration is postponed

Do not add Supabase secret/service-role values, Razorpay secrets or status-token secrets to Vite variables or frontend files. Production payment configuration is intentionally not part of this phase.

## Supabase setup

Use the existing Supabase project and reviewed migration history. Confirm that the application’s existing tables, functions, RLS policies and active admin role records exist before deployment. Do not reset production data. Apply reviewed SQL through the Supabase migration process, not by copying arbitrary snippets into production. Keep server access keys only in Hostinger environment settings.

Before collecting student information, the owner must approve and publish the final terms and privacy notice and then explicitly change `POLICIES_APPROVED` to `true` in the server environment. Until that approval, enrolment writes return a clear unavailable response.

## Razorpay status

Checkout, payment verification and webhook setup are postponed to a later implementation phase. Keep `PAYMENT_ENABLED=false`; do not configure live credentials or accept real payments. Existing payment routes are not evidence that an end-to-end payment is ready. The separate webhook changes and migration in the repository require their own review and integration test before they are deployed.

## Hostinger manual deployment checklist

1. Confirm the selected Hostinger plan supports Node.js web applications and the project’s Node runtime. Hostinger currently documents Node.js web apps on Business and Cloud plans; exact limits depend on the chosen plan.
2. Create a Node.js Web App for `bootcamp.radixminds.in` (Hostinger documents subdomains as separate websites/apps).
3. Upload the project or connect the approved repository. Do not include `.env`, local logs or student data.
4. Set the build command to `npm ci && npm run build:hostinger` and start command to `npm start`.
5. Add reviewed environment variables in Hostinger. Confirm the assigned runtime port behavior.
6. Configure the domain in Hostinger and enable SSL/HTTPS. Do not change nameservers or DNS until the domain owner approves the exact records and checks existing email records.
7. Verify `/api/health`, `/api/v1/config`, `/api/v1/programs`, page refreshes on nested routes, static assets, CORS and admin authorization.
8. Keep enrolment writes blocked until policies are approved. Keep payments disabled in this phase.
9. Record the deployed build/version and verify logs contain no secrets or personal information.

Hostinger documentation: [Deploy a Node.js website](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/) and [connect a custom domain](https://www.hostinger.com/support/how-to-connect-a-custom-domain-to-a-node-js-application/).

## Rollback

Keep the previously deployed build artifact and environment configuration in the hosting dashboard. If verification fails, restore the previous application build/configuration through Hostinger’s deployment controls, then re-check health and public routes. Do not roll back by resetting Supabase or deleting student records.

## Current launch blockers

- Owner-approved final terms and privacy content are needed before enrolment data collection.
- Payment is intentionally postponed; the pending-payment request route must be enabled only after legal approval and separately reviewed before launch.
- Confirm Hostinger plan, Node runtime/assigned port, domain mapping, SSL and final production environment variables.
- Confirm production Supabase migrations, RLS, backups and recovery process with the project owner.
- Faculty and authentic sample learning materials must be supplied before replacing existing clearly marked placeholders.
