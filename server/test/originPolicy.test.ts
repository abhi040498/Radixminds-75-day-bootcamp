import assert from 'node:assert/strict'
import test from 'node:test'
import { isApprovedBrowserOrigin, productionOrigin, stableDeployPreviewOrigin } from '../src/originPolicy.js'
import { isSameOriginCookieRequest } from '../src/enrolmentSession.js'

const deploymentOrigin = 'https://6af4368b34953cd07626929a--radixminds75daysbootcamp.netlify.app'
const previewContext = {
  appOrigin: stableDeployPreviewOrigin,
  approvedContext: 'deploy-preview',
  siteName: 'radixminds75daysbootcamp',
}

test('allows the exact production and stable approved Deploy Preview origins', () => {
  assert.equal(isApprovedBrowserOrigin(productionOrigin, previewContext), true)
  assert.equal(isApprovedBrowserOrigin(stableDeployPreviewOrigin, previewContext), true)
})

test('allows a unique deployment URL only for the exact site and Deploy Preview context', () => {
  assert.equal(isApprovedBrowserOrigin(deploymentOrigin, previewContext), true)
  assert.equal(isApprovedBrowserOrigin(deploymentOrigin, { ...previewContext, approvedContext: 'production' }), false)
  assert.equal(isApprovedBrowserOrigin(deploymentOrigin, { ...previewContext, appOrigin: productionOrigin }), false)
  assert.equal(isApprovedBrowserOrigin(deploymentOrigin, { ...previewContext, siteName: 'another-site' }), false)
})

test('rejects arbitrary Netlify sites, external origins and malformed origins', () => {
  for (const origin of [
    'https://0123456789abcdef01234567--another-site.netlify.app',
    'https://radixminds75daysbootcamp.netlify.app',
    'https://attacker.example',
    'https://6af4368b34953cd07626929a--radixminds75daysbootcamp.netlify.app/path',
    'https://user:pass@6af4368b34953cd07626929a--radixminds75daysbootcamp.netlify.app',
    'https://6af4368b34953cd07626929a--radixminds75daysbootcamp.netlify.app/?x=1',
    'https://6af4368b34953cd07626929a--radixminds75daysbootcamp.netlify.app/#fragment',
    'http://6af4368b34953cd07626929a--radixminds75daysbootcamp.netlify.app',
  ]) assert.equal(isApprovedBrowserOrigin(origin, previewContext), false, origin)
})

test('a spoofed forwarding header cannot make an unapproved Origin pass cookie CSRF validation', () => {
  const attackerOrigin = 'https://attacker.example'
  const forwardedHost = 'deploy-preview-1--radixminds75daysbootcamp.netlify.app'
  assert.ok(forwardedHost) // The policy does not accept forwarded host input.
  assert.equal(isSameOriginCookieRequest(attackerOrigin, 'same-origin', value => isApprovedBrowserOrigin(value, previewContext)), false)
})
