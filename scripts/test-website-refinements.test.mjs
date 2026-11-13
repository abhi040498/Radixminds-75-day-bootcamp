import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = async path => readFile(resolve(root, path), 'utf8')

test('homepage programme CTA opens the combined Programs route', async () => {
  const hero = await source('src/components/sections/Hero.tsx')
  assert.match(hero, /<Link className="button button-gold" to="\/programs">Explore Class 10 &amp; 12 Programmes/)
  assert.doesNotMatch(hero, /href="#programs"/)
})

test('Programs page uses the illustrated cards with separate class and board badges and two actions', async () => {
  const cards = await source('src/components/sections/ProgramSelection.tsx')
  const programsPage = await source('src/pages/PublicPages.tsx')
  assert.match(cards, /className="compact-card-top">\s*<span>\{grade\.toUpperCase\(\)\}<\/span>\s*<span className="board-options">CBSE · ICSE · STATE BOARD/)
  assert.match(cards, /className="program-enrol">Enroll/)
  assert.match(cards, /className="program-view">Explore/)
  assert.match(cards, /to=\{`\/enrol\?program=\$\{code\}`\}/)
  assert.match(cards, /to=\{`\/programs\/\$\{code\}`\}/)
  assert.match(cards, /formatINR\(program\?\.payablePaise \?\? fallbackFeePaise \?\? 0\)/)
  assert.match(cards, /useProgramCatalog\(\)/)
  assert.match(programsPage, /<ProgramSelection[^>]+compactListings \/>/)
})

test('confirmation flow does not render a student refund form or status', async () => {
  const enrolment = await source('src/pages/Enrolment.tsx')
  assert.doesNotMatch(enrolment, /student-refund-request|student-refund-status|submitRefundRequest|refundReason|refundRequest/)
})

test('no public student refund submission route is registered', async () => {
  const api = await source('server/src/index.ts')
  assert.doesNotMatch(api, /\/api\/v1\/enrolments\/:reference\/refunds/)
  assert.doesNotMatch(api, /rpc\('request_refund'/)
})

test('refund policy remains behind its explicit policy link and enrolment acknowledgement', async () => {
  const policy = await source('docs/legal/refund-and-cancellation-policy.md')
  const app = await source('src/App.tsx')
  const enrolment = await source('src/pages/Enrolment.tsx')
  const footer = await source('src/components/sections/ContactCTA.tsx')
  assert.ok(policy.includes('Students seeking refund assistance must contact the Radix Minds team within 7 calendar days from the date of successful payment. Contacting the team does not guarantee refund approval. All requests are subject to review by Radix Minds management. The management team will determine eligibility and any approved refund amount on a case-by-case basis, subject to applicable laws and the published terms and conditions.'))
  assert.match(app, /path="\/refund-policy" element=\{<LegalPage kind="refund" \/>\}/)
  assert.match(enrolment, /refundPolicyAccepted/)
  assert.match(enrolment, /Refund &(?:amp;)? Cancellation Policy/)
  assert.match(footer, /showRefundPolicyLink = pathname !== '\/enrol\/confirmation'/)
})

test('general and course FAQs do not show refund policy information', async () => {
  const homeFaqs = await source('src/components/sections/FAQs.tsx')
  const coursePages = await source('src/pages/PublicPages.tsx')
  assert.doesNotMatch(homeFaqs, /refund/i)
  assert.doesNotMatch(coursePages, /Can (?:we check|I check).*refund/i)
})
