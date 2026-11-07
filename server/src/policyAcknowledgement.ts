import { z } from 'zod'
import { policyVersions } from './policyVersions.js'

export const policyVersionsSchema = z.object({
  terms: z.literal(policyVersions.terms),
  privacy: z.literal(policyVersions.privacy),
  refund: z.literal(policyVersions.refund),
}).strict()

export const policyAcknowledgementSchema = z.object({
  termsAccepted: z.literal(true),
  privacyConsent: z.literal(true),
  refundPolicyAccepted: z.literal(true),
  communicationConsent: z.literal(true),
  policyVersions: policyVersionsSchema,
})
