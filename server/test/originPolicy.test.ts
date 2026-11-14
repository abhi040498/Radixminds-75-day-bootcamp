import assert from 'node:assert/strict'
import test from 'node:test'
import {
  approvedNetlifySites,
  isApprovedBrowserOrigin,
  productionOrigin,
} from '../src/originPolicy.js'
import { isSameOriginCookieRequest } from '../src/enrolmentSession.js'

const previewCases = [
  {
    siteName: 'radixminds75daysbootcamp',
    ...approvedNetlifySites.radixminds75daysbootcamp,
    deploymentOrigin: 'https://6af4368b34953cd07626929a--radixminds75daysbootcamp.netlify.app',
  },
  {
    siteName: 'rm75daysbootcamp',
    ...approvedNetlifySites.rm75daysbootcamp,
    deploymentOrigin: 'https://a8169af23e5bf0d19bc0a284--rm75daysbootcamp.netlify.app',
  },
] as const

test('production custom domain is accepted only as the exact configured APP_ORIGIN', () => {
  const productionContext = { appOrigin: productionOrigin }
  assert.equal(isApprovedBrowserOrigin(productionOrigin, productionContext), true)
  assert.equal(isApprovedBrowserOrigin('https://bootcamp.radixminds.in/', productionContext), false)
  assert.equal(isApprovedBrowserOrigin(previewCases[0].stablePreviewOrigin, productionContext), false)
  assert.equal(isApprovedBrowserOrigin('https://attacker.example', productionContext), false)
})

test('Netlify production origins are accepted only when exact APP_ORIGIN and SITE_NAME match', () => {
  for (const site of previewCases) {
    assert.equal(isApprovedBrowserOrigin(site.productionOrigin, { appOrigin: site.productionOrigin, siteName: site.siteName }), true)
    assert.equal(isApprovedBrowserOrigin(site.productionOrigin, { appOrigin: productionOrigin, siteName: site.siteName }), false)
    assert.equal(isApprovedBrowserOrigin(site.productionOrigin, { appOrigin: site.productionOrigin, siteName: previewCases[1 - previewCases.indexOf(site)].siteName }), false)
  }
})

test('both approved preview identities accept only their matching stable alias and immutable deployment URL', () => {
  for (const site of previewCases) {
    const context = { appOrigin: site.stablePreviewOrigin, approvedContext: 'deploy-preview', siteName: site.siteName }
    assert.equal(isApprovedBrowserOrigin(site.stablePreviewOrigin, context), true)
    assert.equal(isApprovedBrowserOrigin(site.deploymentOrigin, context), true)
  }
})

test('preview origin, site identity and context must all match', () => {
  for (const site of previewCases) {
    const other = previewCases[1 - previewCases.indexOf(site)]
    const valid = { appOrigin: site.stablePreviewOrigin, approvedContext: 'deploy-preview', siteName: site.siteName }
    assert.equal(isApprovedBrowserOrigin(site.deploymentOrigin, { ...valid, siteName: other.siteName }), false)
    assert.equal(isApprovedBrowserOrigin(site.stablePreviewOrigin, { ...valid, siteName: other.siteName }), false)
    assert.equal(isApprovedBrowserOrigin(site.deploymentOrigin, { ...valid, approvedContext: undefined }), false)
    assert.equal(isApprovedBrowserOrigin(site.deploymentOrigin, { ...valid, approvedContext: 'production' }), false)
    assert.equal(isApprovedBrowserOrigin(site.deploymentOrigin, { ...valid, appOrigin: other.stablePreviewOrigin }), false)
    assert.equal(isApprovedBrowserOrigin(other.stablePreviewOrigin, valid), false)
  }
})

test('arbitrary Netlify URLs, external origins and malformed origins are rejected', () => {
  const context = {
    appOrigin: previewCases[0].stablePreviewOrigin,
    approvedContext: 'deploy-preview',
    siteName: previewCases[0].siteName,
  }
  for (const origin of [
    'https://0123456789abcdef01234567--another-site.netlify.app',
    'https://radixminds75daysbootcamp.netlify.app',
    'https://feature-branch--radixminds75daysbootcamp.netlify.app',
    'https://deploy-preview-2--radixminds75daysbootcamp.netlify.app',
    'https://attacker.example',
    'https://6af4368b34953cd07626929a--radixminds75daysbootcamp.netlify.app/path',
    'https://user:pass@6af4368b34953cd07626929a--radixminds75daysbootcamp.netlify.app',
    'http://6af4368b34953cd07626929a--radixminds75daysbootcamp.netlify.app',
  ]) assert.equal(isApprovedBrowserOrigin(origin, context), false, origin)
})

test('missing runtime configuration and spoofed forwarding headers fail closed', () => {
  assert.equal(isApprovedBrowserOrigin(productionOrigin, {}), false)
  assert.equal(isApprovedBrowserOrigin(previewCases[0].stablePreviewOrigin, { appOrigin: previewCases[0].stablePreviewOrigin }), false)
  assert.equal(isApprovedBrowserOrigin(previewCases[0].deploymentOrigin, { appOrigin: previewCases[0].stablePreviewOrigin, approvedContext: 'deploy-preview' }), false)
  const attackerOrigin = 'https://attacker.example'
  const forwardedHost = 'deploy-preview-1--radixminds75daysbootcamp.netlify.app'
  assert.ok(forwardedHost) // The origin policy has no forwarded-host input.
  assert.equal(isSameOriginCookieRequest(attackerOrigin, 'same-origin', value => isApprovedBrowserOrigin(value, { appOrigin: productionOrigin })), false)
})
