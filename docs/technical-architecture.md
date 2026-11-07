# Technical Architecture — Current Implementation

**Status:** Existing implementation; deployment configuration prepared, not deployed.

## Runtime

- Root package is a single TypeScript/React/Vite project.
- Frontend: React 18, TypeScript, Vite and React Router.
- Backend: Node.js with Express 5 and TypeScript, under `server/src`.
- Database/Auth: Supabase PostgreSQL and Supabase Auth, accessed server-side.
- API prefix: `/api/v1`.
- Local API default port: `4000`.
- Vite development server proxies `/api` to `http://127.0.0.1:4000`.
- Production is prepared as one Node process serving the Vite `dist/` assets and `/api/*` from the same origin.

## Main API groups

- Public: programs, config, enrolment, enrolment status and enquiries.
- Payment routes exist but checkout remains a separate, intentionally postponed launch phase.
- Admin APIs require the existing Supabase Auth session and an active `admin_users` role.
- Razorpay webhook implementation files and migration in this working tree are not deployment-ready until the separately postponed payment phase and database migration are reviewed and tested.

## Data model

The application uses the existing Supabase tables `programs`, `program_learning_modes`, `students`, `enrolments`, `payments`, `razorpay_webhook_events`, `admin_users`, and `enquiry_submissions`, plus existing database RPC functions. Do not reset data or apply unreviewed migrations during deployment preparation.

## Deployment constraints

- Build both frontend and API before `npm start`.
- Provide secrets through the Hostinger application environment, not files or frontend variables.
- Configure `APP_ORIGIN=https://bootcamp.radixminds.in`, Supabase server credentials and an approved `STATUS_TOKEN_SECRET`.
- `POLICIES_APPROVED` remains false until owner-approved legal content is published. The public enrolment API refuses to persist student data while it is false.
- Razorpay checkout remains disabled in this phase. Never set `PAYMENT_ENABLED=true` or switch to live mode as part of deployment preparation.
- Actual deployment requires the owner’s Hostinger plan, domain/DNS and SSL configuration; none have been changed here.
