# Development Roadmap — Radix Minds 75-Day Board Bootcamp

**Status:** Proposed sequence; effort and calendar dates to be estimated after approval.  
**Gate:** No implementation begins until the product/architecture draft is approved.

## Phase 0 — Approval and content readiness

- Approve this product scope, sitemap, technology choices, payment flow, and admin scope.
- Confirm whether ₹2,499 and ₹3,499 are final payable prices or pre-discount/reference fees.
- Supply approved offer configuration: reference price if any, discounted price, 80% calculation basis, validity window, and terms.
- Supply support details, address/venue wording, board/exam year if relevant, delivery logistics, exact next-step process, refund/cancellation terms, privacy and terms copy, legal/tax receipt details if applicable.
- Decide Class 12 subject selection wording, registration fields, retention period, admin roles, analytics approach, and notification expectations.
- Confirm Hostinger plan and domain/DNS ownership, Supabase project/region, Razorpay account and onboarding readiness.

**Exit:** Owner approves content facts, terms, offer representation, and production responsibilities.

## Phase 1 — Foundation and visual system

- Establish repository structure for `apps/web`, `apps/api`, shared schemas, and database migrations.
- Configure Vite/React/TypeScript, Tailwind, shadcn/ui, React Router, Lucide, lint/typecheck/build scripts.
- Define responsive design tokens from the supplied palette; create header, footer, buttons, cards, forms, typography, and accessibility states.
- Build public page shell and mobile navigation with keyboard support.
- Create backend Express/TypeScript skeleton, configuration validation, request IDs, health endpoint, centralized errors, and OpenAPI baseline.

**Exit:** Both apps build; design shell is reviewed on common mobile and desktop breakpoints.

## Phase 2 — Public information architecture and content

- Implement homepage, program index, Class 10, Class 12, approach, roadmap, fees/offers, contact, FAQ, and policy page templates.
- Populate only confirmed program details; use reviewed placeholders for unknown operational/legal values and block production launch while required content is absent.
- Add responsive layouts, semantic structure, metadata, and owner-supplied assets.
- Review claims and campaign equation for no implied result guarantee.

**Exit:** Owner reviews all public copy and confirms the roadmap reflects actual academic operations.

## Phase 3 — Database, admin, and enrolment

- Create and review Supabase schema migrations, constraints, indexes, environment separation, and access policies.
- Implement public program/offer read APIs; server-side registration validation and price snapshot.
- Implement registration UI, Class 12 subject choice, consent capture, review step, pending-payment persistence, status lookup token.
- Build admin authentication/authorization and initial enrolment, program, offer, settings, and audit views.
- Verify permissions and PII minimization by review; no student-facing LMS features.

**Exit:** Registration can be recorded without payment in a test environment; admin access and configured prices are verified.

## Phase 4 — Razorpay payment and reconciliation

- Implement server-created Razorpay orders, Checkout integration, signature validation, provider status reconciliation, webhook signature verification, idempotency, and mismatch handling.
- Implement pending, success, failed, and cancelled result states; confirmation only from persisted verified status.
- Build admin payment view and safe reconciliation action.
- Run provider test-mode scenarios: success, failure, cancellation, duplicate callback/webhook, webhook-before-browser, retry, amount mismatch, provider unavailable.
- Review refund/cancellation policy and the manual staff process for unresolved payments.

**Exit:** All required payment scenarios behave consistently in test mode and owner approves production payment readiness.

## Phase 5 — Content, accessibility, and release readiness

- Replace all launch-blocking placeholders with approved production information.
- Perform responsive review, keyboard/screen reader spot checks, contrast review, form error and payment recovery review.
- Review privacy/terms/refund copy with the owner/adviser; validate no unauthorized testimonials, results, credentials, MRP, or expiry claim.
- Check page metadata, analytics events (if approved), logging redaction, admin role matrix, and backup/restore process.
- Agree performance budgets and monitor/alert choices; verify dependency and secret management.

**Exit:** Release checklist signed by owner; no critical checkout, privacy, access-control, or mobile usability issues.

## Phase 6 — Manual Hostinger deployment and launch

- Confirm Hostinger plan's Node runtime, static serving, SPA fallback, reverse proxy/API topology, TLS, environment variables, webhook reachability, and process persistence.
- Provision production Supabase configuration, apply migrations, configure production domain and TLS, deploy frontend/API artifacts manually.
- Use Razorpay test mode on production hostname first; confirm webhook delivery and return URLs.
- Owner approves live Razorpay credentials and production offer/prices; enable live mode and perform controlled smoke checkout if operationally approved.
- Monitor first enrolments and reconcile provider records against database; document rollback and incident contacts.

**Exit:** Public site is live at approved domain, payment confirmation is verified end to end, and staff can process enrolments manually.

## Post-launch backlog (separate approval)

- Transactional email/SMS/WhatsApp notifications.
- Automated pending payment reconciliation and expanded reporting/export.
- Search-focused prerendering/SSR if analytics show SPA indexing limitations.
- Future LMS capabilities only as a separately scoped project; none are included in this release.

## Key dependencies and risks to resolve

- Offer display is ambiguous until fee/discount basis and validity are approved.
- Payments must not go live before contact, policy, support, and refund handling information is ready.
- Hostinger deployment capabilities vary by plan; validate the selected plan before committing topology.
- Academic roadmap and online/offline testing logistics require academic-owner review before publication.
- Razorpay live account, webhook setup, and merchant settlement configuration are external dependencies.
- Privacy, retention, and applicable legal/tax disclosures require owner review before collecting live student/guardian data.
