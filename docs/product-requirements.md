# Radix Minds 75-Day Board Bootcamp — Product Requirements

**Status:** Draft for approval  
**Scope:** Public marketing, enrolment, payment, confirmation, and a limited admin console. This is not an LMS.  
**Working domain:** `bootcamp.radixminds.in` (deployment and DNS configuration pending)

## 1. Product summary

Create a mobile-first website that helps students and parents in India understand the 75-Day Board Bootcamp, compare the Class 10 and Class 12 programs, and complete a trustworthy online enrolment. The website explains the preparation approach and offer, collects the minimum information needed to enrol and communicate with the student, accepts payment through Razorpay, and confirms paid enrolment. Academic delivery and follow-up are handled by the Radix Minds team using WhatsApp, Telegram, and offline/online methods outside this website.

### Goals

- Explain the value, format, subjects, schedule approach, and assessment methods clearly.
- Let a visitor choose a class/program and complete registration on mobile with minimal friction.
- Show clear fees and promotional terms without inventing an MRP or implying guaranteed outcomes.
- Record and reconcile registrations and verified payments.
- Provide staff with a small operational interface for managing program/offer settings and enrolments.
- Establish a credible, premium visual identity using the supplied palette and campaign language.

### Out of scope

No student learning dashboard, lecture/video or notes portal, online classroom, teacher dashboard, online examination engine, attendance system, assignment workflow, or student progress tracking. No automated WhatsApp/Telegram messaging is assumed in the initial scope. Do not add fabricated testimonials, faculty biographies, results, affiliations, accreditations, or guarantees.

## 2. Audience and core needs

| Audience | Need | Product response |
|---|---|---|
| Class 10 student | Know what to study and feel prepared to take the next step | Clear subjects, 75-day framing, preparation features, focused CTA |
| Class 12 student | Confirm the correct stream/subject combination and preparation coverage | Program-specific page and required Mathematics/Biology selection |
| Parent/guardian | Assess credibility, price, payment safety, and what happens after payment | Transparent program and terms, contact details, secure payment, confirmation and support path |
| Bootcamp staff/admin | Keep active offer/program details accurate and reconcile enrolments | Authenticated, auditable admin operations for settings and enrolment/payment status |

## 3. Confirmed information vs configurable placeholders

### Confirmed by the project brief

- Brand/program: **Radix Minds 75-Day Board Bootcamp**; positioning: **Now in Bokaro**.
- Campaign: **75 DAYS. ONE FOCUSED MISSION.** Supporting line: **Be prepared. Be confident. Be board-ready.**
- Promotional message: **100% Rigorous Preparation + 100% Practice & Mock Tests = 200% Exam Ready**. This is campaign language, not a literal academic outcome guarantee.
- Class 10: 75 days; Mathematics, Science, Social Science, English; program fee ₹2,499.
- Class 12: 75 days; Physics, Chemistry, Mathematics **or** Biology; program fee ₹3,499.
- Program features as supplied: last-minute board preparation; structured comprehensive lectures; professional and experienced teachers; high-scoring preparation strategy; topic-wise and complete-subject mock tests; study/revision notes; online and offline testing options; final examination preparation. Class 12 wording also includes subject-wise preparation.
- Display an **80% OFF** offer. Do not invent original MRP. Original price, discounted price, discount percentage, and validity need configuration.
- Online payment provider: Razorpay. Backend: Express/TypeScript REST; Supabase PostgreSQL. Manual deployment to Hostinger-compatible Node.js hosting.
- Initial academic communication is personally managed via WhatsApp/Telegram; no LMS is required.

### Must be configured/approved before production

| Setting | Proposed treatment |
|---|---|
| Offer original/reference price | Optional nullable amount. Never derive or publish an MRP unless the owner supplies and approves it. |
| Discounted payable price | Configurable per program. Current supplied program fees (₹2,499/₹3,499) are confirmed prices, but whether these are the offer prices should be confirmed. Until then, show them as program fees without claiming a calculated strike-through price. |
| Discount percentage | Configurable independently. Show “80% OFF” only while the approved offer is active. Do not calculate from an unapproved original price. |
| Offer validity | Start/end timestamp and timezone; not supplied. Hide an expiry countdown until configured. |
| Academic board, exam year, exact date range, daily timetable, batch size, class mode/venue, language | Not supplied. Avoid claiming specifics; add only after owner confirmation. |
| Address, phone, support email, WhatsApp/Telegram contact links | Not supplied. Required before launch; use editable placeholders during build. |
| Faculty identities, credentials, photos | Not supplied. Do not invent; omit or use an owner-approved team description. |
| Policies | Privacy, terms, cancellation/refund, payment failure, and contact/resolution policy require owner review and publication before accepting payment. |
| Tax/invoice details and legal entity details | Not supplied; configure if applicable to checkout/receipts. |
| Admin user list and roles | Owner-provided; create securely, no public registration. |

## 4. Product principles and success measures

- Lead with clarity and trust; avoid countdown pressure, misleading scarcity, unsupported outcome claims, and hidden charges.
- Preserve a short mobile checkout and explain the next step before the user pays.
- Show a final payable amount before redirecting/launching Razorpay.
- Treat browser return pages as untrusted; only verified server-side payment state means “paid/enrolled.”
- Capture only data needed for enrolment, payment reconciliation, and requested contact.

Suggested launch measures (instrumentation and targets to approve): program-page-to-registration start rate; registration completion rate; Razorpay launch-to-verified-payment rate; payment failure/abandonment rate; support requests about pricing/next steps; mobile performance and form error rate. Do not set numerical targets until baseline and traffic expectations are known.

## 5. Sitemap

```text
/
├── /programs
│   ├── /programs/class-10
│   └── /programs/class-12
├── /approach
├── /fees-and-offers
├── /enrol (program selection / registration start)
│   ├── /enrol/class-10
│   └── /enrol/class-12
├── /payment/result (status lookup; never trusts URL parameters as proof)
├── /enrolment/confirmed (only for a server-confirmed paid order)
├── /contact
├── /privacy
├── /terms
├── /refund-and-cancellation
└── /admin (protected)
    ├── /admin/enrolments
    ├── /admin/programs
    ├── /admin/offers
    └── /admin/settings
```

Header navigation should stay concise: Programs and Contact; primary CTA “Enrol Now.” The preparation roadmap is presented on the homepage and individual program pages; there is no standalone `/roadmap` page. Footer carries contact, policy links, location wording, and brand.

## 6. Homepage section structure

1. **Header:** wordmark, compact navigation, clear enrolment CTA; accessible mobile menu.
2. **Hero:** “Now in Bokaro”; campaign headline; supporting line; primary “Explore Programs”/“Enrol Now” CTA and secondary “See the 75-day plan”; concise visual direction that feels academic and energetic.
3. **Program selector:** two comparison cards, duration, subjects, confirmed program fee, and links to details. Class 12 requires Mathematics or Biology selection at enrolment.
4. **Trust and promise:** explain who the bootcamp is for and what the site/program includes. Only verified operational facts; no fabricated numbers or reviews.
5. **Preparation system:** structured lectures, topic-wise practice, full-subject mock tests, revision notes, online/offline test options, final preparation. Avoid suggesting all options are guaranteed for every batch until delivery details are approved.
6. **75-day roadmap preview:** three illustrative phases (foundation/revision, topic practice, full mocks/final readiness) as a proposed content framework, clearly reviewed by the academic owner before publishing; no invented day-by-day timetable.
7. **Campaign equation:** “100% Rigorous Preparation + 100% Practice & Mock Tests = 200% Exam Ready,” with adjacent clarification that it is motivational campaign messaging, not a result guarantee.
8. **Fees and offer:** program fee and configured offer; 80% OFF only when configured/approved; visible offer terms and validity when supplied.
9. **Who it suits / what happens next:** intended class groups, enrolment → payment verification → personal communication by team on approved channel. Do not promise a response SLA unless set.
10. **FAQ:** duration, subjects, test formats, notes, enrolment, payment, post-payment contact, refund/cancellation, and how to ask about missing logistics.
11. **Final CTA:** select Class 10 or Class 12.
12. **Footer:** contact channels, Bokaro location, legal/policy links, copyright; all real details supplied before launch.

## 7. Individual page structures

### Programs index (`/programs`)

- Intro to the 75-day format and audience.
- Side-by-side Class 10/Class 12 cards with subjects, duration, confirmed fee, features summary.
- Comparison accessibility on narrow screens (stacked cards, no horizontal overflow).
- CTA per program and note that detailed logistics are shared/confirmed by staff if not yet configured.

### Class 10 (`/programs/class-10`)

- Class-specific hero and CTA.
- Four subject tiles: Mathematics, Science, Social Science, English.
- Preparation feature list supplied in brief.
- 75-day approach/assessment section; distinguish program features from confirmed calendar/timetable.
- Fee/offer component and FAQs.
- CTA starts Class 10 registration.

### Class 12 (`/programs/class-12`)

- Class-specific hero and CTA.
- Physics and Chemistry plus clear Mathematics **or** Biology choice.
- Subject-wise preparation and supplied features.
- 75-day approach, fee/offer, FAQs, enrol CTA.
- Explain stream/subject selection where appropriate without collecting unnecessary academic information.

### Approach (`/approach`)

- How structured teaching, topic practice, subject mock tests, revision materials, and final preparation fit together.
- Online/offline testing options stated as supplied; exact availability and logistics configurable.
- Expectations and exclusions: program supports preparation; no score/result guarantee.

### Preparation roadmap

- Present the 75-day framework within the homepage and individual program pages.
- Use phase labels only after academic review; do not invent dates, class hours, or lesson sequence.
- Explain how practice and mock tests build through the program.

### Fees & offers (`/fees-and-offers`)

- Class 10 and Class 12 payable price display.
- Optional reference/original price only when explicitly approved; configurable discount and validity.
- State what is included based on supplied program features.
- Payment safety/support and approved refund/cancellation summary linking to full policy.
- No hidden fees; disclose any additional charge before checkout if applicable.

### Contact (`/contact`)

- Owner-provided phone, email, WhatsApp/Telegram links, and Bokaro address/venue details as approved.
- Contact form optional; if added, include consent/purpose, validation, abuse protection, and retention policy.
- Do not publish placeholder contact data in production.

### Registration (`/enrol`)

- Step 1: choose program (or retain selected program from CTA).
- Step 2: student details: student name, parent/guardian name where applicable, mobile number, optional email; Class 12 subject choice. Academic year/board only if the owner confirms it is needed.
- Step 3: review program, selected subjects, payable amount, offer terms, policies, and contact expectations.
- Step 4: create pending registration/order and launch Razorpay.
- Use clear field labels, inline validation, Indian mobile number support, keyboard-friendly controls, and recoverable errors.

### Payment result and confirmation

- Pending/failed result page gives retry and support route without losing the registration.
- Success page is served only after server-side signature verification and authoritative Razorpay status confirmation (or an equivalent verified webhook state).
- Confirmation shows order/reference ID, program, paid amount, payment status, and a next-step message. No login/dashboard is created.
- Communicate WhatsApp/Telegram follow-up only with approved channel, owner-supplied contact details, and a realistic process statement.

### Policies

- Privacy notice: fields collected, purpose, payment processor hand-off, retention/contact route, user rights/contact details.
- Terms: program description, enrolment, communications, limitations, and applicable terms reviewed by owner/legal adviser.
- Refund/cancellation: owner-approved eligibility, deadlines, process, and resolution contact. Do not launch payments before the policy is supplied.

## 8. Registration and payment user journey

1. Visitor lands on homepage or a shared program link.
2. Visitor compares programs and chooses Class 10 or Class 12.
3. Class 12 visitor selects Mathematics or Biology.
4. Visitor completes concise student/guardian contact form; consents to the privacy notice and confirms program terms.
5. Server validates input, loads active program and offer from database, calculates payable amount in integer paise, and creates an enrolment in `pending_payment` plus an order record with a unique internal reference.
6. Server creates a Razorpay order using server-held credentials and returns only public checkout data (Razorpay order ID, amount, currency, public key ID, display name/description).
7. Browser opens Razorpay Checkout; user completes, cancels, or payment fails.
8. Browser sends checkout result to API. API verifies HMAC signature against the stored order and amount/currency relationship. A verified signature alone is reconciled with the provider's order/payment state; idempotent webhook is the fallback/source for asynchronous updates.
9. API marks payment captured/paid only after authoritative provider verification; atomically updates enrolment to `enrolled` and records event. Duplicate callbacks/webhooks are harmless.
10. Browser polls/loads payment result using an opaque, unguessable confirmation token or authenticated session; success is shown only from persisted verified state.
11. Student/parent receives on-page confirmation and a reference ID. Optional transactional email/SMS/WhatsApp is a future/configurable integration, not assumed for launch.
12. Staff sees the enrolment in admin and contacts the family manually through the configured channel.

**Exceptional paths:** user closes checkout; payment remains pending until reconciled; payment fails/cancels and retry reuses the registration but creates a safe new order as needed; webhook arrives before browser callback; duplicate or delayed events; amount mismatch; refund/dispute recorded and escalated according to approved policy.

## 9. Admin dashboard requirements (limited operations console)

### Included

- Secure admin sign-in; no public sign-up; owner-provisioned users and roles.
- Enrolments list with search/filter by date, program, status, and payment state; pagination; safe export only if owner approves data handling.
- Enrolment detail with contact data, selected program/subjects, timestamps, order/payment IDs, amount/currency, event history, and manual contact notes if required.
- Program settings: active/inactive, title, duration, subjects, feature copy, displayed fee, enrolment availability.
- Offer settings: active window/timezone, display percentage, optional approved reference price, final price, terms/copy. Validate percentage and dates; no automatic invented MRP.
- Payment reconciliation view: pending/failed/captured/refunded; retry provider fetch/reconciliation via server action; no ability to mark a payment as paid manually without a documented audited override policy.
- Site settings for support contact and published policies/links.
- Audit trail for admin setting changes and sensitive actions.

### Excluded

No student accounts, classroom content, academic progress, exams, attendance, teacher management, or bulk messaging in this release.

### Roles

- `owner`: manage admins/settings and all records.
- `operations`: view/manage enrolments and program/offer settings as granted.
- Optional `finance`: read payment details and reconciliation without contact-data export. Final roles are configurable and should follow least privilege.

## 10. Acceptance criteria

- Visitor can understand and reach both program details from the home page on desktop and mobile.
- Class 10 shows only its four confirmed subjects; Class 12 enforces one of Mathematics/Biology.
- Prices and offer messaging match active configured values; no invented MRP, expiry, results, or testimonials appear.
- Registration validates required data and presents the exact server-calculated payable amount before checkout.
- Payment success is impossible to assert from client-side redirect alone; verified payment yields one enrolment despite duplicate events.
- Failed, cancelled, delayed, and pending payment states have understandable recovery paths.
- Admin routes and data are inaccessible without authorization; changes are auditable.
- Policy and contact placeholders are replaced with approved information before production payments are enabled.
- No LMS features are present.
