import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = async path => readFile(resolve(root, path), 'utf8')

test('hero programme CTA opens the combined Programs route', async () => {
  const hero = await source('src/components/sections/Hero.tsx')
  assert.match(hero, /<Link className="button button-gold" to="\/programs">Explore Class 10 &amp; 12 Programmes/)
  assert.doesNotMatch(hero, /href="#programs"/)
})

test('programme listing cards expose separate board badges and two correct actions', async () => {
  const cards = await source('src/components/sections/ProgramSelection.tsx')
  const programsPage = await source('src/pages/PublicPages.tsx')
  assert.match(cards, /program-class-badge">\{grade\.toUpperCase\(\)\}/)
  assert.match(cards, /program-board-badge">CBSE · ICSE · STATE BOARD/)
  assert.match(cards, /className="compact-card-top"[\s\S]*?<span>\{grade\.toUpperCase\(\)\}<\/span>[\s\S]*?<span className="board-options">CBSE · ICSE · STATE BOARD/)
  assert.match(cards, /className="program-enrol">Enroll/)
  assert.match(cards, /className="program-view">Explore/)
  assert.match(cards, /program-listing-actions/)
  assert.match(programsPage, /<ProgramSelection[^>]+compactListings \/>/)
  assert.match(cards, /to=\{`\/enrol\?program=\$\{code\}`\}/)
  assert.match(cards, /to=\{index === 0 \? '\/programs\/class-10' : '\/programs\/class-12'\}/)
  assert.match(cards, /formatINR\(program\.payablePaise\)/)
  assert.match(cards, /\{program\.durationDays\}-Day Programme/)
})

test('confirmation flow has no student refund application or status display', async () => {
  const page = await source('src/pages/Enrolment.tsx')
  assert.doesNotMatch(page, /student-refund-request|student-refund-status|submitRefundRequest|refundReason|refundMessage/)
  assert.doesNotMatch(page, /\/enrolments\/\$\{sessionInfo\.reference\}\/refunds/)
  assert.match(page, /I have read and agree to the <Link to="\/terms-and-conditions"/)
  assert.match(page, /<PolicyAcknowledgement checked=\{form\.policyAcknowledged\}/)
  assert.match(page, /Refund &amp; Cancellation Policy/)
})

test('public enrolment status omits refund records and self-service request route', async () => {
  const api = await source('server/src/index.ts')
  assert.doesNotMatch(api, /app\.post\('\/api\/v1\/enrolments\/:reference\/refunds'/)
  assert.doesNotMatch(api, /refundRequest: refundRequest/)
  assert.match(api, /app\.post\('\/api\/v1\/admin\/refunds\/:id\/decision'/)
  assert.match(api, /app\.post\('\/api\/v1\/admin\/refunds\/:id\/process'/)
})

test('refund policy is available through the explicit policy route and contains approved wording', async () => {
  const policy = await source('docs/legal/refund-and-cancellation-policy.md')
  const app = await source('src/App.tsx')
  const footer = await source('src/components/sections/ContactCTA.tsx')
  assert.ok(policy.includes('Students seeking refund assistance must contact the Radix Minds team within 7 calendar days from the date of successful payment. Contacting the team does not guarantee refund approval. All requests are subject to review by Radix Minds management. The management team will determine eligibility and any approved refund amount on a case-by-case basis, subject to applicable laws and the published terms and conditions.'))
  assert.match(app, /path="\/refund-policy" element=\{<LegalPage kind="refund" \/>\}/)
  assert.match(footer, /showRefundPolicyLink = pathname !== '\/enrol\/confirmation'/)
})

test('general and course FAQs no longer publish refund policy copy', async () => {
  const homeFaqs = await source('src/components/sections/FAQs.tsx')
  const coursePages = await source('src/pages/PublicPages.tsx')
  assert.doesNotMatch(homeFaqs, /refund requests within 7 calendar days/i)
  assert.doesNotMatch(coursePages, /refund requests within 7 calendar days/i)
})
