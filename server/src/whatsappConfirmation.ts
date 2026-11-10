export type WhatsAppConfirmationInput = {
  studentName: string
  studentMobile: string
  admissionReference: string
  programName: string
  subjects: string[]
  amountPaise: number
  paymentReference: string
  supportPhone: string
}

export type WhatsAppConfirmationEligibility = {
  source: string
  enrolmentStatus: string
  consentAt: string | null
  paymentStatus: string | null
  paymentOrderId: string | null
  paymentId: string | null
  capturedAt: string | null
  paymentAmountPaise: number
  paymentCurrency: string
  expectedAmountPaise: number | null
  expectedCurrency: string | null
}

export function isWhatsAppConfirmationEligible(value: WhatsAppConfirmationEligibility) {
  return value.source === 'online'
    && value.enrolmentStatus === 'confirmed'
    && Boolean(value.consentAt)
    && value.paymentStatus === 'captured'
    && Boolean(value.paymentOrderId && value.paymentId && value.capturedAt)
    && Number.isSafeInteger(value.paymentAmountPaise)
    && value.paymentAmountPaise > 0
    && value.paymentAmountPaise === value.expectedAmountPaise
    && value.paymentCurrency === 'INR'
    && value.expectedCurrency === 'INR'
}

function indiaWhatsAppNumber(value: string) {
  const digits = value.replace(/\D/g, '')
  const national = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits
  if (!/^[6-9]\d{9}$/.test(national)) throw new Error('INVALID_WHATSAPP_NUMBER')
  return `91${national}`
}

export function buildWhatsAppConfirmationDraft(input: WhatsAppConfirmationInput) {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise < 0) throw new Error('INVALID_PAYMENT_AMOUNT')
  const studentNumber = indiaWhatsAppNumber(input.studentMobile)
  const supportNumber = indiaWhatsAppNumber(input.supportPhone)
  const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(input.amountPaise / 100)
  const lines = [
    `Hello ${input.studentName},`,
    '',
    `Your admission to ${input.programName} is confirmed.`,
    `Admission reference: ${input.admissionReference}`,
    `Subjects: ${input.subjects.join(', ') || 'As shown in your admission details'}`,
    `Payment received: ${amount} (reference ${input.paymentReference})`,
    'Your programme schedule and joining instructions will be shared before the programme begins.',
    '',
    `For support, contact Radix Minds at +${supportNumber}.`,
  ]
  const message = lines.join('\n')
  return { url: `https://wa.me/${studentNumber}?text=${encodeURIComponent(message)}`, message }
}
