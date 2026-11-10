import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWhatsAppConfirmationDraft, isWhatsAppConfirmationEligible } from '../src/whatsappConfirmation.js'

test('WhatsApp draft eligibility requires consent, confirmed online enrolment and matching captured payment', () => {
  const eligible = { source:'online', enrolmentStatus:'confirmed', consentAt:'2026-11-10T10:00:00Z', paymentStatus:'captured', paymentOrderId:'order_test_1', paymentId:'pay_test_1', capturedAt:'2026-11-10T10:01:00Z', paymentAmountPaise:249900, paymentCurrency:'INR', expectedAmountPaise:249900, expectedCurrency:'INR' }
  assert.equal(isWhatsAppConfirmationEligible(eligible), true)
  assert.equal(isWhatsAppConfirmationEligible({ ...eligible, source:'manual' }), false)
  assert.equal(isWhatsAppConfirmationEligible({ ...eligible, enrolmentStatus:'pending_payment' }), false)
  assert.equal(isWhatsAppConfirmationEligible({ ...eligible, consentAt:null }), false)
  assert.equal(isWhatsAppConfirmationEligible({ ...eligible, paymentStatus:'authorized' }), false)
  assert.equal(isWhatsAppConfirmationEligible({ ...eligible, paymentAmountPaise:349900 }), false)
  assert.equal(isWhatsAppConfirmationEligible({ ...eligible, paymentCurrency:'USD' }), false)
  assert.equal(isWhatsAppConfirmationEligible({ ...eligible, paymentOrderId:null }), false)
})

test('draft contains confirmed admission and payment details and is a manual wa.me link', () => {
  const result = buildWhatsAppConfirmationDraft({
    studentName: 'Aarav Kumar', studentMobile: '+919876543210', admissionReference: 'RM-TEST-01',
    programName: 'Class 10 Board Bootcamp', subjects: ['Mathematics', 'Science'], amountPaise: 249900,
    paymentReference: 'pay_test_verified_01', startDate: '30 November 2026', supportPhone: '919304829718',
  })
  assert.match(result.url, /^https:\/\/wa\.me\/919876543210\?text=/)
  const message = decodeURIComponent(result.url.split('?text=')[1]!)
  assert.match(message, /Aarav Kumar/)
  assert.match(message, /RM-TEST-01/)
  assert.match(message, /Mathematics, Science/)
  assert.match(message, /₹2,499/)
  assert.match(message, /pay_test_verified_01/)
  assert.match(message, /schedule and joining instructions will be shared before the programme begins/)
  assert.match(message, /\+919304829718/)
  assert.equal(result.message, message)
})

test('rejects invalid student/support phone numbers and invalid payment amounts', () => {
  const base = { studentName:'Test Student', studentMobile:'+919876543210', admissionReference:'RM-TEST-02', programName:'Class 12', subjects:['Physics'], amountPaise:349900, paymentReference:'pay_test_02', startDate:'30 November 2026', supportPhone:'919304829718' }
  assert.throws(() => buildWhatsAppConfirmationDraft({ ...base, studentMobile:'12345' }), /INVALID_WHATSAPP_NUMBER/)
  assert.throws(() => buildWhatsAppConfirmationDraft({ ...base, supportPhone:'12345' }), /INVALID_WHATSAPP_NUMBER/)
  assert.throws(() => buildWhatsAppConfirmationDraft({ ...base, amountPaise:-1 }), /INVALID_PAYMENT_AMOUNT/)
})
