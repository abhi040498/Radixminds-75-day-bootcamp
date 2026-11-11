import assert from 'node:assert/strict'
import test from 'node:test'
import { approvedNetlifySiteName, isApprovedBrowserOrigin, productionOrigin, stableDeployPreviewOrigin } from '../src/originPolicy.js'
import { isSameOriginCookieRequest } from '../src/enrolmentSession.js'

const deploymentOrigin = 'https://6af4368b34953cd07626929a--radixminds75daysbootcamp.netlify.app'
const previewContext = {
  appOrigin: stableDeployPreviewOrigin,
  approvedContext: 'deploy-preview',
  siteName: approvedNetlifySiteName,
}
const productionContext = { appOrigin: productionOrigin, approvedContext: 'production', siteName: approvedNetlifySiteName }

test('production accepts only its exact configured origin', () => {
  assert.equal(isApprovedBrowserOrigin(productionOrigin, productionContext), true)
  assert.equal(isApprovedBrowserOrigin(stableDeployPreviewOrigin, productionContext), false)
  assert.equal(isApprovedBrowserOrigin(deploymentOrigin, productionContext), false)
  assert.equal(isApprovedBrowserOrigin('https://deploy-preview-12--radixminds75daysbootcamp.netlify.app', productionContext), false)
  assert.equal(isApprovedBrowserOrigin('https://feature-branch--radixminds75daysbootcamp.netlify.app', productionContext), false)
  assert.equal(isApprovedBrowserOrigin('https://attacker.example', productionContext), false)
})

test('Deploy Preview accepts the stable alias and a valid unique URL only for the approved site context', () => {
  assert.equal(isApprovedBrowserOrigin(stableDeployPreviewOrigin, previewContext), true)
  assert.equal(isApprovedBrowserOrigin(deploymentOrigin, previewContext), true)
  assert.equal(isApprovedBrowserOrigin(deploymentOrigin, { ...previewContext, approvedContext: 'production' }), false)
  assert.equal(isApprovedBrowserOrigin(deploymentOrigin, { ...previewContext, appOrigin: productionOrigin }), false)
  assert.equal(isApprovedBrowserOrigin(deploymentOrigin, { ...previewContext, siteName: 'another-site' }), false)
  assert.equal(isApprovedBrowserOrigin(stableDeployPreviewOrigin, { ...previewContext, siteName: 'another-site' }), false)
  assert.equal(isApprovedBrowserOrigin(productionOrigin, previewContext), false)
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
  assert.equal(isSameOriginCookieRequest(attackerOrigin, 'same-origin', value => isApprovedBrowserOrigin(value, productionContext)), false)
})

test('missing runtime origin or preview identity fails closed', () => {
  assert.equal(isApprovedBrowserOrigin(productionOrigin, {}), false)
  assert.equal(isApprovedBrowserOrigin(stableDeployPreviewOrigin, { appOrigin: stableDeployPreviewOrigin }), false)
  assert.equal(isApprovedBrowserOrigin(deploymentOrigin, { ...previewContext, approvedContext: undefined }), false)
  assert.equal(isApprovedBrowserOrigin(deploymentOrigin, { ...previewContext, siteName: undefined }), false)
})
