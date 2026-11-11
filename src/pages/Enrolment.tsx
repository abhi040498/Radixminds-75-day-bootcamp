import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BadgeCheck, Check, CircleAlert, Clock3, CreditCard, GraduationCap, LockKeyhole, MessageCircle, ShieldCheck } from 'lucide-react'
import { bootcampDates, deliveryOptions, type LearningMode, type ProgramCode } from '../data/bootcampSchedule'
import { api, formatINR, type ApiError, type PublicProgram } from '../lib/enrolmentApi'
import { visibleEnrolmentReference } from '../lib/enrolmentConfirmation'
import { isEnrolmentReference, loadEnrolmentRecovery, restoreEnrolmentStep, saveEnrolmentRecovery, type StorageLike } from '../lib/enrolmentRecovery'
import { canStartPayment, resolveCheckoutOutcome, type CheckoutEvent, type CheckoutStatusResult, type PaymentOutcome, type PaymentAttemptSnapshot } from '../lib/paymentCheckoutRecovery'
import { useProgramCatalog } from '../lib/useProgramCatalog'
import { policyVersions } from '../data/policyVersions'
type FormState = {
  programCode: ProgramCode | ''
  fullName: string; mobile: string; whatsappMobile: string; email: string; dateOfBirth: string
  board: string; schoolName: string; preferredLanguage: string
  subjectChoice: 'Mathematics' | 'Biology' | ''
  learningMode: LearningMode | ''
  policyAcknowledged: boolean
  whatsappUpdatesConsent: boolean
}
type EnrolmentSession = { reference: string; programCode: ProgramCode }
type CheckoutOrder = { enrolmentReference: string; orderId: string; keyId: string; amount: number; currency: string; name: string; description: string }
type CheckoutResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
type WindowWithRazorpay = Window & { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (event: { error?: { description?: string } }) => void) => void } }

const initialForm: FormState = { programCode: '', fullName: '', mobile: '', whatsappMobile: '', email: '', dateOfBirth: '', board: '', schoolName: '', preferredLanguage: '', subjectChoice: '', learningMode: '', policyAcknowledged: false, whatsappUpdatesConsent: false }
function makeIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = window.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function browserStorage(kind: 'localStorage' | 'sessionStorage'): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window[kind] } catch { return null }
}

function Field({ label, name, value, onChange, error, ...props }: { label: string; name: string; value: string; onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void; error?: string; type?: string; placeholder?: string; inputMode?: 'text' | 'tel' | 'email' | 'numeric'; optional?: boolean; autoComplete?: string; min?: string; max?: string; children?: React.ReactNode }) {
  const id = `enrol-${name}`
  return <label className={`enrol-field${error ? ' has-error' : ''}`} htmlFor={id}><span>{label}{props.optional && <small> · Optional</small>}</span>{props.children ? <select id={id} name={name} value={value} onChange={onChange} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}>{props.children}</select> : <input id={id} name={name} value={value} onChange={onChange} type={props.type ?? 'text'} placeholder={props.placeholder} inputMode={props.inputMode} autoComplete={props.autoComplete} min={props.min} max={props.max} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />}{error && <small id={`${id}-error`} className="enrol-field-error">{error}</small>}</label>
}

function PolicyAcknowledgement({ checked, onChange, error }: { checked: boolean; onChange: (event: ChangeEvent<HTMLInputElement>) => void; error?: string }) {
  return <div className={`enrol-consent-panel${error ? ' has-error' : ''}`}>
    <label className="enrol-consent" htmlFor="policy-acknowledged">
      <input id="policy-acknowledged" name="policyAcknowledged" type="checkbox" checked={checked} onChange={onChange} aria-invalid={Boolean(error)} aria-describedby={error ? 'policy-acknowledged-error' : undefined} />
      <span className="enrol-consent-box" aria-hidden="true"><Check size={13} /></span>
      <span className="enrol-consent-copy">I have read and agree to the <Link to="/terms-and-conditions" target="_blank" rel="noreferrer">Terms &amp; Conditions</Link> and <Link to="/refund-policy" target="_blank" rel="noreferrer">Refund &amp; Cancellation Policy</Link>, and acknowledge the <Link to="/privacy-policy" target="_blank" rel="noreferrer">Privacy Policy</Link>.</span>
    </label>
    {error && <small id="policy-acknowledged-error" className="enrol-field-error" role="alert">{error}</small>}
  </div>
}

function stepErrors(step: number, form: FormState, eligibleBoards: string[]) {
  const errors: Record<string, string> = {}
  const phone = (value: string) => /^(?:[6-9]\d{9}|91[6-9]\d{9})$/.test(value.replace(/\D/g, ''))
  if (step === 0) {
    if (!form.programCode) errors.programCode = 'Choose a program to continue.'
    else if (form.programCode === 'class-12' && !form.subjectChoice) errors.subjectChoice = 'Choose the Mathematics or Biology pathway.'
    if (!form.learningMode) errors.learningMode = 'Choose an available learning mode.'
  }
  if (step === 1) {
      if (form.fullName.trim().length < 2) errors.fullName = 'Enter the student’s full name.'
    if (!phone(form.mobile)) errors.mobile = 'Enter a valid Indian mobile number.'
      if (form.whatsappMobile && !phone(form.whatsappMobile)) errors.whatsappMobile = 'Enter a valid Indian WhatsApp number or leave it blank.'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = 'Enter a valid email address.'
    if (!form.board || !eligibleBoards.includes(form.board)) errors.board = 'Choose a board.'
    if (form.schoolName.trim().length < 2) errors.schoolName = 'Enter the school name.'
  }
  if (step === 2) {
    if (!form.policyAcknowledged) errors.policyAcknowledged = 'Accept the linked policies to continue.'
  }
  return errors
}

async function loadRazorpayCheckout() {
  const browser = window as WindowWithRazorpay
  if (browser.Razorpay) return
  const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]')
  if (existing) {
    await new Promise<void>((resolve, reject) => { existing.addEventListener('load', () => resolve(), { once: true }); existing.addEventListener('error', () => reject(new Error('Payment window could not load.')), { once: true }) })
    return
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.dataset.razorpayCheckout = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Payment window could not load. Check your connection and try again.'))
    document.body.appendChild(script)
  })
}

function moneySummary(program: PublicProgram) {
  return <div className="enrol-fee-lines"><div><span>{program.name}</span><b>{program.durationDays} days</b></div>{program.standardPaise !== null && <div><span>Original price</span><del>{formatINR(program.standardPaise)}</del></div>}{program.discountPercent !== null && <div><span>Configured offer</span><b>{program.discountPercent}% off</b></div>}{program.offerValidThrough && <div><span>Offer valid through</span><b>{new Date(`${program.offerValidThrough}T00:00:00`).toLocaleDateString('en-IN')}</b></div>}<div className="enrol-fee-total"><span>Final payable amount</span><strong>{formatINR(program.payablePaise)}</strong></div><small>Price is confirmed again by the server before checkout.</small></div>
}

export function EnrolmentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [initialRecovery] = useState(() => loadEnrolmentRecovery(browserStorage('localStorage'), browserStorage('sessionStorage')))
  const [recovery, setRecovery] = useState(initialRecovery.recovery)
  const [step, setStep] = useState(() => restoreEnrolmentStep(initialRecovery.recovery))
  const [form, setForm] = useState<FormState>(() => ({ ...initialForm, programCode: initialRecovery.recovery.programCode, subjectChoice: initialRecovery.recovery.subjectChoice, learningMode: initialRecovery.recovery.learningMode }))
  const { programs, loading: programsLoading, error: programError, retry: retryProgramData } = useProgramCatalog()
  const [boards, setBoards] = useState(['CBSE', 'ICSE', 'State Board', 'Other'])
  const [policiesApproved, setPoliciesApproved] = useState(false)
  const [setupError, setSetupError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const submissionInFlight = useRef(false)
  const [message, setMessage] = useState('')
  const [paymentOutcome, setPaymentOutcome] = useState<PaymentOutcome>('pending')
  const [paymentAttempt, setPaymentAttempt] = useState<PaymentAttemptSnapshot | null>(null)
  const [savedSession, setSavedSession] = useState<EnrolmentSession | null>(() => initialRecovery.recovery.enrolmentReference && initialRecovery.recovery.programCode ? { reference: initialRecovery.recovery.enrolmentReference, programCode: initialRecovery.recovery.programCode } : null)
  const [resumeSubmittedEnrollment] = useState(Boolean(initialRecovery.recovery.enrolmentReference))

  useEffect(() => {
    if (resumeSubmittedEnrollment) navigate('/enrol/confirmation', { replace: true })
  }, [navigate, resumeSubmittedEnrollment])

  useEffect(() => {
    api<{ boards: string[]; languages: string[]; policiesApproved: boolean }>('/config')
      .then(options => { setBoards(options.boards); setPoliciesApproved(options.policiesApproved) })
      .catch(error => setSetupError(error instanceof Error ? error.message : 'Enrolment configuration is unavailable.'))
  }, [])

  useEffect(() => {
    if (programsLoading || initialRecovery.recovered) return
    const requested = searchParams.get('program')
    if (requested !== 'class-10' && requested !== 'class-12') return
    const requestedProgram = programs.find(item => item.code === requested)
    const requestedMode = searchParams.get('mode')
    const validMode = (requestedMode === 'online' || requestedMode === 'hybrid' || requestedMode === 'offline') && requestedProgram?.modes.some(item => item.mode === requestedMode)
      ? requestedMode
      : ''
    const requestedPathway = searchParams.get('pathway')
    const validPathway = requested === 'class-12' && (requestedPathway === 'Mathematics' || requestedPathway === 'Biology') ? requestedPathway : ''
    setForm(current => ({ ...current, programCode: requested, learningMode: validMode, subjectChoice: validPathway }))
    const requestedStep = validMode && (requested === 'class-10' || validPathway) ? 1 : 0
    setStep(requestedStep)
    setRecovery(current => ({ ...current, programCode: requested, learningMode: validMode, subjectChoice: validPathway, step: requestedStep }))
  }, [programs, programsLoading, searchParams, initialRecovery.recovered])

  const program = programs.find(item => item.code === form.programCode)
  const fee = useMemo(() => program ? moneySummary(program) : null, [program])
  const setField = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = event.target
    const name = target.name as keyof FormState
    const value = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value
    setForm(current => ({ ...current, [name]: value }))
    setErrors(current => { const next = { ...current }; delete next[name]; return next })
  }
  const chooseProgram = (code: ProgramCode) => {
    setForm(current => ({ ...current, programCode: code, subjectChoice: '', learningMode: '' }))
    setRecovery(current => ({ ...current, programCode: code, subjectChoice: '', learningMode: '' }))
    setErrors({})
  }
  const validate = () => {
    const next = stepErrors(step, form, boards)
    if (step === 0 && form.learningMode && !program?.modes.some(item => item.mode === form.learningMode)) next.learningMode = 'That learning mode is not currently available for this batch.'
    setErrors(next)
    return Object.keys(next).length === 0
  }
  const nextStep = () => {
    if (step === 0 && !form.programCode) { setErrors({ programCode: 'Choose a program to continue.' }); return }
    if (!validate()) return
    const next = Math.min(2, step + 1) as 0 | 1 | 2
    setErrors({}); setMessage(''); setStep(next); setRecovery(current => ({ ...current, step: next }))
  }
  const previousStep = () => { const next = Math.max(0, step - 1) as 0 | 1 | 2; setErrors({}); setMessage(''); setStep(next); setRecovery(current => ({ ...current, step: next })) }

  const applyPaymentOutcome = (result: CheckoutStatusResult) => {
    setPaymentOutcome(result.status)
    if (result.status === 'confirmed') {
      navigate('/enrol/confirmation')
      return
    }
    if (result.status === 'failed') {
      setPaymentAttempt(null)
      setRecovery(current => { const next = { ...current, paymentIdempotencyKey: makeIdempotencyKey() }; saveEnrolmentRecovery(browserStorage('localStorage'), next); return next })
      setMessage('The server verified that this payment failed. Your enrolment remains pending, and you can retry secure payment.')
      return
    }
    setPaymentAttempt(result.payment ?? null)
    setMessage(result.status === 'needs_review'
      ? 'Payment needs a manual check. Your enrolment is not confirmed. Please contact Radix Minds before trying again.'
      : 'Payment status is still pending verification. Your enrolment is not confirmed. Check the status before making another attempt.')
  }

  const reconcileCheckout = async (session: EnrolmentSession, event: CheckoutEvent, verify?: () => Promise<CheckoutStatusResult>) => {
    try {
      const result = await resolveCheckoutOutcome(
        event,
        verify ?? (async () => ({ status: 'pending' as const })),
        () => api<{ status: PaymentOutcome; payment: PaymentAttemptSnapshot | null }>(`/enrolments/${session.reference}/status`),
      )
      applyPaymentOutcome(result)
    } catch (error) {
      setPaymentOutcome('pending')
      setPaymentAttempt({ status: 'verification_unavailable', reference: null })
      setMessage(error instanceof Error ? error.message : 'We could not verify payment status. Check again before retrying.')
    } finally {
      setBusy(false)
    }
  }
  const checkPaymentStatus = (session: EnrolmentSession) => {
    if (busy) return
    setBusy(true)
    setMessage('Checking payment status with the server…')
    void reconcileCheckout(session, 'dismissed')
  }

  const launchPayment = async (session: EnrolmentSession, retry = false) => {
    setBusy(true); setMessage('')
    try {
      const order = await api<CheckoutOrder>(`/enrolments/${session.reference}/payment-orders`, { method: 'POST', headers: { 'Idempotency-Key': recovery.paymentIdempotencyKey }, body: '{}' })
      setPaymentAttempt({ status: 'created', reference: null })
      setPaymentOutcome('pending')
      await loadRazorpayCheckout()
      const RazorpayConstructor = (window as WindowWithRazorpay).Razorpay
      if (!RazorpayConstructor) throw new Error('Secure checkout could not start. Please try again.')
      const checkout = new RazorpayConstructor({
        key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency,
        name: order.name, description: order.description,
        prefill: { name: form.fullName, email: form.email, contact: form.mobile },
        theme: { color: '#142B49' },
        modal: { ondismiss: () => { void reconcileCheckout(session, 'dismissed') } },
        handler: async (result: CheckoutResult) => {
          await reconcileCheckout(session, 'handler', () => api<{ status: PaymentOutcome }>('/payments/verify', { method: 'POST', body: JSON.stringify({ enrolmentReference: session.reference, razorpayOrderId: result.razorpay_order_id, razorpayPaymentId: result.razorpay_payment_id, razorpaySignature: result.razorpay_signature }) }))
        },
      })
      checkout.on('payment.failed', () => { void reconcileCheckout(session, 'payment.failed') })
      checkout.open()
    } catch (error) {
      setPaymentAttempt(null)
      setPaymentOutcome('pending')
      setBusy(false)
      setMessage(`${retry ? 'Checkout could not be retried. ' : ''}${error instanceof Error ? error.message : 'Please try again.'}`)
    }
  }

  const saveAndPay = async () => {
    if (submissionInFlight.current || busy) return
    if (!validate() || !program) return
    if (!program.enrolmentOpen) { setMessage('Enrolment for this program is currently closed. Contact the Radix Minds team for the next steps.'); return }
    if (!policiesApproved) { setMessage('Enrolment submissions are temporarily unavailable while the approved policies and consent workflow are being prepared. Please contact Radix Minds.'); return }
    submissionInFlight.current = true
    setBusy(true); setMessage('')
    try {
      saveEnrolmentRecovery(browserStorage('localStorage'), recovery)
      const result = await api<{ enrolmentReference: string; checkoutReady: boolean }>('/enrolments', { method: 'POST', headers: { 'Idempotency-Key': recovery.registrationIdempotencyKey }, body: JSON.stringify({ ...form, programCode: form.programCode, subjectChoice: form.subjectChoice || null, learningMode: form.learningMode || null, dateOfBirth: form.dateOfBirth || '', policyVersions }) })
      if (!isEnrolmentReference(result.enrolmentReference)) throw new Error('The registration was saved, but its admission reference could not be confirmed. Check status before submitting again.')
      const session: EnrolmentSession = { reference: result.enrolmentReference, programCode: form.programCode as ProgramCode }
      setRecovery(current => { const next = { ...current, programCode: form.programCode as ProgramCode, subjectChoice: form.subjectChoice, learningMode: form.learningMode, step: 2 as const, enrolmentReference: result.enrolmentReference }; saveEnrolmentRecovery(browserStorage('localStorage'), next); return next })
      setSavedSession(session)
      setBusy(false)
      submissionInFlight.current = false
      if (result.checkoutReady && program.checkoutReady) await launchPayment(session)
      else navigate('/enrol/confirmation')
    } catch (error) {
      setBusy(false)
      submissionInFlight.current = false
      const apiError = error as ApiError
      setErrors(apiError.fields ?? {})
      setMessage(error instanceof Error ? error.message : 'We could not save your registration. Please retry.')
    }
  }

  const programName = form.programCode === 'class-10' ? 'Class 10' : form.programCode === 'class-12' ? 'Class 12' : ''
  const paymentReady = Boolean(program?.checkoutReady)
  const stepLabels = ['Program', 'Student details', paymentReady ? 'Review & pay' : 'Review & submit']

  return <section className="enrolment-page"><div className="page-wrap enrolment-wrap">
    <div className="enrolment-heading"><span className="public-card-eyebrow">PROGRAM ENROLMENT</span><h1>Let’s make the next<br /><em>75 days count.</em></h1><p>Choose a program, enter student details, then review your selection and current fee.</p></div>
    {(setupError || programError) && <div className="enrol-setup-note" role="status"><CircleAlert size={18} /><span>{setupError || programError} Current program, pricing and mode availability must load before enrolment can continue.</span>{programError && <button type="button" onClick={retryProgramData}>Try again</button>}</div>}
    <div className="enrolment-layout"><div className="enrolment-main">
      <ol className="enrolment-progress" aria-label="Registration steps">{stepLabels.map((label, index) => <li key={label} className={`${index === step ? 'is-current' : ''}${index < step ? ' is-complete' : ''}`}><span>{index < step ? <Check size={13} /> : index + 1}</span><small>{label}</small></li>)}</ol>
      <form className="enrolment-form" onSubmit={event => event.preventDefault()} noValidate>
        {step === 0 && <div className="enrolment-step-content"><div className="enrolment-step-heading"><span>STEP 01</span><h2>Choose your program</h2><p>Select a class, then confirm the Class 12 pathway and a learning mode currently open for the batch.</p></div><div className="enrol-program-options">{(['class-10', 'class-12'] as ProgramCode[]).map(code => {
          const item = programs.find(entry => entry.code === code)
          const active = form.programCode === code
          const subjects = code === 'class-10' ? ['Mathematics', 'Science', 'Social Science', 'English'] : ['Physics', 'Chemistry', 'Mathematics or Biology']
          return <button type="button" key={code} className={`enrol-program-card ${active ? 'is-selected' : ''}`} aria-pressed={active} onClick={() => chooseProgram(code)}><span className="enrol-program-card-top"><i>{active && <Check size={14} />}</i><small>75-DAY BOARD BOOTCAMP</small></span><strong>{code === 'class-10' ? 'Class 10' : 'Class 12'}</strong><span className="enrol-program-subjects">{subjects.join(' · ')}</span><span className="enrol-program-price">{item ? formatINR(item.payablePaise) : 'Fee unavailable'} <small>{item ? 'program fee' : 'load current program details'}</small></span>{item?.discountPercent !== null && item?.discountPercent !== undefined && <span className="enrol-program-offer">{item.discountPercent}% OFF</span>}</button>
        })}</div>{errors.programCode && <p className="enrol-field-error">{errors.programCode}</p>}
          {form.programCode === 'class-12' && <fieldset className="enrol-choice-fieldset"><legend>Choose your subject pathway</legend><div className="enrol-choice-grid">{(['Mathematics', 'Biology'] as const).map(subject => <button type="button" key={subject} className={form.subjectChoice === subject ? 'is-selected' : ''} aria-pressed={form.subjectChoice === subject} onClick={() => { setForm(current => ({ ...current, subjectChoice: subject })); setRecovery(current => ({ ...current, subjectChoice: subject })); setErrors(current => ({ ...current, subjectChoice: '' })) }}><span>{form.subjectChoice === subject && <Check size={14} />}</span><b>{subject === 'Mathematics' ? 'PCM' : 'PCB'}</b><small>Physics + Chemistry + {subject}</small></button>)}</div>{errors.subjectChoice && <small className="enrol-field-error">{errors.subjectChoice}</small>}</fieldset>}
          {form.programCode && <fieldset className="enrol-choice-fieldset enrol-mode-fieldset"><legend>Choose your learning mode</legend><p>All three modes share the same subjects, academic plan, published timetable, learning materials, practice, assessments and support.</p><div className="enrol-choice-grid enrol-mode-choice-grid">{(['online', 'hybrid', 'offline'] as const).map(mode => {
            const modeAvailable = program?.modes.some(item => item.mode === mode) ?? false
            return <button type="button" key={mode} disabled={!modeAvailable} className={`${form.learningMode === mode && modeAvailable ? 'is-selected' : ''}${!modeAvailable ? ' is-disabled' : ''}`} aria-pressed={form.learningMode === mode && modeAvailable} onClick={() => { setForm(current => ({ ...current, learningMode: mode })); setRecovery(current => ({ ...current, learningMode: mode })); setErrors(current => ({ ...current, learningMode: '' })) }}><span>{form.learningMode === mode && modeAvailable && <Check size={14} />}</span><b>{deliveryOptions[mode].label}</b><small>{deliveryOptions[mode].detail}</small><em>{modeAvailable ? program?.modes.find(item => item.mode === mode)?.batchLabel ?? 'Available for this batch' : programsLoading ? 'Checking availability…' : 'Not currently open for this batch'}</em></button>
          })}</div>{errors.learningMode && <small className="enrol-field-error">{errors.learningMode}</small>}{!programsLoading && !program?.modes.length && <p className="enrol-mode-unavailable"><CircleAlert size={16} /> No learning mode is currently configured as available for this batch. Please contact Radix Minds.</p>}</fieldset>}
        </div>}

        {step === 1 && <div className="enrolment-step-content"><div className="enrolment-step-heading"><span>STEP 02 · {programName.toUpperCase()}</span><h2>Student details</h2><p>Students below 18 and students aged 18 or above may enrol. Enter the student details and school board below.</p></div><div className="enrol-fields-grid"><Field label="Student name" name="fullName" value={form.fullName} onChange={setField} error={errors.fullName} autoComplete="name" placeholder="Full name" /><Field label="Mobile number" name="mobile" value={form.mobile} onChange={setField} error={errors.mobile} type="tel" inputMode="tel" autoComplete="tel" placeholder="10-digit mobile number" /><Field label="Email ID" name="email" value={form.email} onChange={setField} error={errors.email} type="email" inputMode="email" autoComplete="email" placeholder="student@example.com" /><Field label="School" name="schoolName" value={form.schoolName} onChange={setField} error={errors.schoolName} autoComplete="organization" placeholder="School name" /><Field label="Board" name="board" value={form.board} onChange={setField} error={errors.board}><option value="">Choose a board</option>{boards.map(board => <option value={board} key={board}>{board}</option>)}</Field><Field label="WhatsApp number" name="whatsappMobile" value={form.whatsappMobile} onChange={setField} error={errors.whatsappMobile} type="tel" inputMode="tel" autoComplete="tel" placeholder="Use mobile if same" optional /></div><label className="whatsapp-consent"><input type="checkbox" name="whatsappUpdatesConsent" checked={form.whatsappUpdatesConsent} onChange={setField} /><span><b>Optional WhatsApp updates</b><small>Radix Minds may use the WhatsApp number above, or your mobile if it is the same, to send admission confirmation and joining information after payment is verified. This is optional and is not required to enrol.</small></span></label></div>}

        {step === 2 && <div className="enrolment-step-content"><div className="enrolment-step-heading"><span>STEP 03</span><h2>{paymentReady ? 'Review & pay' : 'Review & submit'}</h2><p>Review your selected program, pathway, learning mode, details and final payable amount.</p></div>{savedSession ? <div className="enrol-inline-warning" role="status"><Check size={17} /><span>Admission reference: <strong>{savedSession.reference}</strong>. Your registration is saved; payment is confirmed only after server verification.</span></div> : <div className="enrol-inline-warning" role="status"><CircleAlert size={17} /><span>Reviewing does not submit your registration. The admission reference is created and shown after you submit this step.</span></div>}<div className="enrol-review-card"><div className="enrol-review-head"><span><GraduationCap size={18} /> {program?.name}</span><button type="button" className="enrol-review-edit" onClick={() => { setStep(0); setRecovery(current => ({ ...current, step: 0 })) }}>Change program</button></div><div className="enrol-review-grid"><div><small>STUDENT</small><b>{form.fullName}</b></div><div><small>PROGRAM DURATION</small><b>{programName} · {program?.durationDays ?? 75} days</b></div>{form.programCode === 'class-12' && <div><small>SUBJECT PATHWAY</small><b>Physics · Chemistry · {form.subjectChoice}</b></div>}<div><small>LEARNING MODE</small><b>{form.learningMode ? deliveryOptions[form.learningMode].label : 'Not selected'}</b></div><div><small>MOBILE</small><b>{form.mobile}</b></div><div><small>EMAIL</small><b>{form.email}</b></div><div><small>BOARD</small><b>{form.board}</b></div><div><small>SCHOOL</small><b>{form.schoolName}</b></div></div>{fee}</div><div className="enrol-refund-policy"><strong>REFUND POLICY</strong><p>Students may submit refund requests within 7 calendar days from the date of successful payment. Submission of a refund request does not guarantee approval. All requests are subject to review by RadixMinds management. The administration will determine the eligibility and approved refund amount on a case-by-case basis, subject to applicable laws and the published terms and conditions.</p></div><div className="enrol-consent-list"><PolicyAcknowledgement checked={form.policyAcknowledged} onChange={setField} error={errors.policyAcknowledged} /></div>{!paymentReady && <div className="enrol-inline-warning"><Clock3 size={17} /><span>Online payment is not active in this phase. If your enrolment is accepted, it will remain pending payment until the team shares the next step. No payment is confirmed here.</span></div>}{!policiesApproved && <div className="enrol-inline-warning" role="status"><LockKeyhole size={17} /><span>Enrolment submission is paused until the approved policies and consent workflow are ready. No student details will be saved until the server-side policy gate is approved. Read the <Link to="/terms-and-conditions">Terms</Link>, <Link to="/privacy-policy">Privacy Policy</Link> and <Link to="/refund-policy">Refund Policy</Link>. <Link to="/contact">Contact Radix Minds</Link>.</span></div>}</div>}
        {message && <div className="enrol-message" role="alert"><CircleAlert size={17} />{message}</div>}
        <div className="enrol-form-actions">{step > 0 && <button type="button" className="enrol-back-button" onClick={previousStep} disabled={busy}><ArrowLeft size={16} /> Back</button>}{step < 2 ? <button type="button" className="enrol-next-button" onClick={nextStep} disabled={busy}>{step === 0 ? 'Continue with this program' : 'Continue'} <ArrowRight size={16} /></button> : <><button type="button" className="enrol-next-button" onClick={savedSession && paymentReady ? !canStartPayment(paymentOutcome, paymentAttempt) ? () => checkPaymentStatus(savedSession) : () => launchPayment(savedSession, true) : saveAndPay} disabled={busy || !program?.enrolmentOpen || !policiesApproved || paymentOutcome === 'needs_review'}><LockKeyhole size={16} />{busy ? (paymentReady ? 'Preparing secure checkout…' : 'Submitting enrolment…') : savedSession && paymentReady ? !canStartPayment(paymentOutcome, paymentAttempt) ? 'Check payment status' : 'Retry secure payment' : paymentReady ? 'Pay securely' : 'Submit enrolment' }<ArrowRight size={16} /></button>{program && !program.enrolmentOpen && <p className="enrol-config-caption">Enrolment for this program is closed. <Link to="/contact">Contact the team</Link>.</p>}</>}</div>
      </form>
    </div><aside className="enrolment-aside"><span className="enrol-aside-icon"><ShieldCheck size={23} /></span><small>YOUR ENROLMENT</small><h2>A clear next step.</h2><ul><li><Check size={15} />75-day preparation program</li><li><Check size={15} />Student details reviewed</li><li><Check size={15} />Payment status shown accurately</li><li><Check size={15} />No card details stored on this site</li></ul>{program && <div className="enrol-aside-fee"><span>SELECTED PROGRAM</span><strong>{program.name}</strong><small>{program.durationDays} days{program.discountPercent !== null ? ` · ${program.discountPercent}% verified offer` : ''}</small><b>{formatINR(program.payablePaise)}</b></div>}<p><LockKeyhole size={14} />{paymentReady ? 'Checkout opens securely with Razorpay after server validation.' : 'Payment remains pending until the team provides the approved payment step.'}</p></aside></div>
  </div></section>
}

type ConfirmationResponse = {
  status: 'confirmed' | 'pending' | 'failed' | 'needs_review'
  checkoutReady: boolean
  enrolmentReference: string
  studentName: string
  program: { code: ProgramCode; name: string; duration_days: number; learning_mode_label: string }
  subjects: string[]
  price: { payable_paise: number; currency: string }
  payment: { reference: string | null; amountPaise: number; currency: string; status: string; capturedAt: string | null } | null
  refundRequest: {reference:string;status:string;requestedAt:string;cutoffAt:string;decision:string|null;decidedAt:string|null;approvedAmountPaise:number|null;providerStatus:string|null}|null
  support: { whatsappPhone: string; telegramUrl: string }
}

export function EnrolmentConfirmationPage() {
  const [status, setStatus] = useState<ConfirmationResponse | null>(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  const [sessionInfo,setSessionInfo]=useState<EnrolmentSession|null>(null)
  const [refundReason,setRefundReason]=useState('')
  const [refundBusy,setRefundBusy]=useState(false)
  const [refundMessage,setRefundMessage]=useState('')
  const [checkoutBusy,setCheckoutBusy]=useState(false)
  const [checkoutMessage,setCheckoutMessage]=useState('')
  const [submittedRecovery,setSubmittedRecovery]=useState(()=>loadEnrolmentRecovery(browserStorage('localStorage'),browserStorage('sessionStorage')).recovery)
  const displayReference = visibleEnrolmentReference(status?.enrolmentReference, sessionInfo?.reference)
  const refreshStatus=async(session:EnrolmentSession)=>{const result=await api<ConfirmationResponse>(`/enrolments/${session.reference}/status`);setStatus(result);if(result.status==='failed')setSubmittedRecovery(current=>{const next={...current,paymentIdempotencyKey:makeIdempotencyKey()};saveEnrolmentRecovery(browserStorage('localStorage'),next);return next});return result}
  const submitRefundRequest=async()=>{
    if(!sessionInfo)return
    setRefundBusy(true);setRefundMessage('')
    try{
      const result=await api<{requestReference:string;status:string;message:string}>(`/enrolments/${sessionInfo.reference}/refunds`,{method:'POST',headers:{'Idempotency-Key':makeIdempotencyKey()},body:JSON.stringify({reason:refundReason})})
      setRefundMessage(`${result.message} Reference: ${result.requestReference}`);setRefundReason('');await refreshStatus(sessionInfo)
    }catch(cause){setRefundMessage(cause instanceof Error?cause.message:'The request could not be submitted. Contact Radix Minds.')}
    finally{setRefundBusy(false)}
  }
  const retrySecurePayment=async()=>{
    if(!sessionInfo||!status?.checkoutReady||!canStartPayment(status.status,status.payment)||checkoutBusy)return
    setCheckoutBusy(true);setCheckoutMessage('')
    try{
      const order=await api<CheckoutOrder>(`/enrolments/${sessionInfo.reference}/payment-orders`,{method:'POST',headers:{'Idempotency-Key':submittedRecovery.paymentIdempotencyKey},body:'{}'})
      await loadRazorpayCheckout()
      const RazorpayConstructor=(window as WindowWithRazorpay).Razorpay
      if(!RazorpayConstructor)throw new Error('Secure checkout could not start. Please try again.')
      const reconcile=async(event:CheckoutEvent,verify?:()=>Promise<{status:PaymentOutcome}>)=>{
        try{
          let statusRefreshed=false
          const fetchStatus=async()=>{statusRefreshed=true;return refreshStatus(sessionInfo)}
          const result=await resolveCheckoutOutcome(event,verify??(async()=>({status:'pending' as const})),fetchStatus)
          const currentOutcome=statusRefreshed?result.status:(await fetchStatus()).status
          setCheckoutMessage(currentOutcome==='failed'?'The server verified that payment failed. Your enrolment remains unpaid; you can retry secure payment.':currentOutcome==='pending'?'Payment is still pending verification. Refresh or check the status again before retrying.':currentOutcome==='needs_review'?'Payment needs a manual review. Do not retry until Radix Minds has checked it.':'Payment has been verified. Your admission status has been updated.')
        }catch(cause){setCheckoutMessage(cause instanceof Error?cause.message:'Payment status is still being checked. Refresh the status before retrying.')}
        finally{setCheckoutBusy(false)}
      }
      const checkout=new RazorpayConstructor({key:order.keyId,order_id:order.orderId,amount:order.amount,currency:order.currency,name:order.name,description:order.description,theme:{color:'#142B49'},modal:{ondismiss:()=>{void reconcile('dismissed')}},handler:async(result:CheckoutResult)=>{
        await reconcile('handler',()=>api<{status:PaymentOutcome}>('/payments/verify',{method:'POST',body:JSON.stringify({enrolmentReference:sessionInfo.reference,razorpayOrderId:result.razorpay_order_id,razorpayPaymentId:result.razorpay_payment_id,razorpaySignature:result.razorpay_signature})}))
      }})
      checkout.on('payment.failed',()=>{void reconcile('payment.failed')})
      checkout.open()
    }catch(cause){setCheckoutBusy(false);setCheckoutMessage(cause instanceof Error?cause.message:'Secure checkout could not be prepared. Please retry shortly.')}
  }
  const checkConfirmationStatus=async()=>{
    if(!sessionInfo||checkoutBusy)return
    setCheckoutBusy(true);setCheckoutMessage('Checking payment status with the server…')
    try{
      const latest=await refreshStatus(sessionInfo)
      setCheckoutMessage(latest.status==='failed'?'The server verified that payment failed. Your enrolment remains unpaid; you can retry secure payment.':latest.status==='confirmed'?'Payment is verified. Your admission status has been updated.':latest.status==='needs_review'?'Payment needs a manual review. Do not retry until Radix Minds has checked it.':'Payment is still pending verification. Check again shortly before retrying.')
    }catch(cause){setCheckoutMessage(cause instanceof Error?cause.message:'Could not check payment status. Please try again shortly.')}
    finally{setCheckoutBusy(false)}
  }
  useEffect(() => {
    const knownReference=submittedRecovery.enrolmentReference
    const knownSession=knownReference&&submittedRecovery.programCode?{reference:knownReference,programCode:submittedRecovery.programCode as ProgramCode}:null
    if(knownSession)setSessionInfo(knownSession)
    let active = true
    const check = async () => {
      for (let attempt = 0; attempt < 5 && active; attempt++) {
        try {
          const result = await api<ConfirmationResponse>(knownSession?`/enrolments/${knownSession.reference}/status`:'/enrolments/recover')
          if (!active) return
          const recoveredSession={reference:result.enrolmentReference,programCode:result.program.code}
          setSessionInfo(recoveredSession)
          setSubmittedRecovery(current=>{const next={...current,programCode:result.program.code,enrolmentReference:result.enrolmentReference,step:2 as const};saveEnrolmentRecovery(browserStorage('localStorage'),next);return next})
          setStatus(result)
          if (result.status === 'failed') setSubmittedRecovery(current => { const next = { ...current, paymentIdempotencyKey: makeIdempotencyKey() }; saveEnrolmentRecovery(browserStorage('localStorage'), next); return next })
          if (result.status === 'confirmed' || result.status === 'failed' || result.status === 'needs_review' || (result.status === 'pending' && !result.payment?.reference)) { setChecking(false); return }
        } catch (requestError) {
          if (active) {
            setError(requestError instanceof Error ? requestError.message : 'Could not check payment status.')
            if ((requestError as ApiError).code === 'ENROLMENT_NOT_FOUND') { setChecking(false); return }
          }
        }
        await new Promise(resolve => setTimeout(resolve, 2500))
      }
      if (active) setChecking(false)
    }
    void check()
    return () => { active = false }
  }, [])

  if (error && !status) return <section className="enrol-confirm-page"><div className="enrol-confirm-card"><span className="enrol-confirm-symbol is-pending"><CircleAlert size={28} /></span><span className="public-card-eyebrow">PAYMENT STATUS</span><h1>We’re checking your payment.</h1><p>{error}</p>{displayReference && <span className="enrol-confirm-reference">Enrolment reference: {displayReference}</span>}<Link className="button button-gold" to="/contact">Contact Radix Minds</Link></div></section>
  if (status?.status === 'pending' && !status.payment?.reference && !checking) {
    const waPhone = status.support.whatsappPhone.replace(/\D/g, '')
    return <section className="enrol-confirm-page"><div className="enrol-confirm-card"><span className="enrol-confirm-symbol is-pending"><Clock3 size={28} /></span><span className="public-card-eyebrow">ENROLMENT RECEIVED · PAYMENT PENDING</span><h1>We’ve received your enrolment request.</h1><p>Your request is saved as pending payment. This is not payment confirmation or a confirmed paid enrolment. The Radix Minds team will share the next step.</p><div className="enrol-receipt"><div><small>ENROLMENT REFERENCE</small><b>{status.enrolmentReference}</b></div><div><small>STUDENT</small><b>{status.studentName}</b></div><div><small>PROGRAM</small><b>{status.program.name} · {status.program.duration_days} days</b></div><div><small>SUBJECTS</small><b>{status.subjects.join(' · ')}</b></div><div><small>LEARNING MODE</small><b>{status.program.learning_mode_label}</b></div><div><small>PROGRAM START</small><b>{bootcampDates.start}</b></div><div className="enrol-receipt-total"><small>AMOUNT DUE · PAYMENT NOT RECEIVED</small><strong>{formatINR(status.price.payable_paise)}</strong></div></div>{status.checkoutReady&&<button className="button button-gold" type="button" disabled={checkoutBusy} onClick={()=>void retrySecurePayment()}>{checkoutBusy?'Preparing secure checkout…':'Continue to secure payment'}</button>}{checkoutMessage&&<p role="status">{checkoutMessage}</p>}<div className="enrol-next-instructions"><span><MessageCircle size={17} /> NEXT STEP</span><p>Contact the team with your enrolment reference for payment instructions. Do not send card details by message.</p><div><a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer">WhatsApp the team <ArrowRight size={14} /></a><Link to="/contact">Contact options <ArrowRight size={14} /></Link></div></div></div></section>
  }
  if (!status || (checking && status.status !== 'confirmed' && status.status !== 'failed' && status.status !== 'needs_review')) return <section className="enrol-confirm-page"><div className="enrol-confirm-card"><span className="enrol-confirm-symbol is-pending"><Clock3 size={28} /></span><span className="public-card-eyebrow">PAYMENT VERIFICATION</span><h1>Checking with Razorpay…</h1><p>Your enrolment is confirmed only after our server verifies the captured payment. Please keep this page open.</p>{displayReference && <small>Enrolment reference: {displayReference}</small>}</div></section>
  if (status.status !== 'confirmed') { return <section className="enrol-confirm-page"><div className="enrol-confirm-card"><span className="enrol-confirm-symbol is-pending"><CircleAlert size={28} /></span><span className="public-card-eyebrow">PAYMENT NOT CONFIRMED</span><h1>{status.status === 'failed' ? 'Payment wasn’t completed.' : 'We need to check this payment.'}</h1><p>{status.status === 'failed' ? 'Your registration details are saved. You can retry secure checkout or contact the team.' : 'Please don’t submit another payment until the Radix Minds team has checked this transaction.'}</p><span className="enrol-confirm-reference">{status.enrolmentReference}</span>{canStartPayment(status.status,status.payment)&&status.checkoutReady&&<button className="button button-gold" type="button" disabled={checkoutBusy} onClick={()=>void retrySecurePayment()}>{checkoutBusy?'Preparing secure checkout…':status.status==='failed'?'Retry secure payment':'Continue to secure payment'}</button>}{status.status==='pending'&&status.payment?.reference&&<button className="button button-gold" type="button" disabled={checkoutBusy} onClick={()=>void checkConfirmationStatus()}>{checkoutBusy?'Checking payment…':'Check payment status'}</button>}{checkoutMessage&&<p role="status">{checkoutMessage}</p>}<Link to="/contact">Contact Radix Minds</Link></div></section> }
  const amount = status.payment?.amountPaise ?? status.price.payable_paise
  const waPhone = status.support.whatsappPhone.replace(/\D/g, '')
  return <section className="enrol-confirm-page"><div className="enrol-confirm-card is-success"><span className="enrol-confirm-symbol"><BadgeCheck size={32} /></span><span className="public-card-eyebrow">PAID ENROLMENT · VERIFIED</span><h1>You’re enrolled, {status.studentName.split(' ')[0]}.</h1><p>Your payment has been verified by our server. The Radix Minds team will share batch details and next steps through the contact channels below.</p><div className="enrol-receipt"><span className="enrol-receipt-title"><CreditCard size={17} /> PAYMENT ACKNOWLEDGEMENT</span><div><small>ENROLMENT ID</small><b>{status.enrolmentReference}</b></div><div><small>PROGRAM</small><b>{status.program.name} · {status.program.duration_days} days</b></div><div><small>SUBJECTS</small><b>{status.subjects.join(' · ')}</b></div><div><small>LEARNING MODE</small><b>{status.program.learning_mode_label}</b></div><div><small>PAYMENT REFERENCE</small><b>{status.payment?.reference ?? 'Verified by Razorpay'}</b></div><div className="enrol-receipt-total"><small>AMOUNT PAID</small><strong>{formatINR(amount)}</strong></div></div><div className="enrol-next-instructions"><span><MessageCircle size={17} /> BATCH JOINING DETAILS</span><p>Message Radix Minds on WhatsApp or Telegram to receive the batch communication instructions. You will not be added to a private group without your consent.</p><div><a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer">WhatsApp the team <ArrowRight size={14} /></a><a href={status.support.telegramUrl} target="_blank" rel="noreferrer">Open Telegram <ArrowRight size={14} /></a></div></div><section className="student-refund-request"><strong>REFUND POLICY</strong><p>Students may submit refund requests within 7 calendar days from the date of successful payment. Submission of a refund request does not guarantee approval. All requests are subject to review by RadixMinds management. The administration will determine the eligibility and approved refund amount on a case-by-case basis, subject to applicable laws and the published terms and conditions.</p>{status.refundRequest?<div className="student-refund-status"><b>Request {status.refundRequest.reference}</b><span>Status: {status.refundRequest.status.replace(/_/g,' ')}</span>{status.refundRequest.approvedAmountPaise!==null&&<span>Approved amount: {formatINR(status.refundRequest.approvedAmountPaise)}</span>}<small>Submission does not guarantee approval. Radix Minds will communicate its decision directly.</small></div>:<><label>Reason for request<textarea value={refundReason} onChange={event=>setRefundReason(event.target.value)} minLength={4} maxLength={2000} rows={3} placeholder="Tell us why you are requesting a refund" /></label><button type="button" disabled={refundBusy||refundReason.trim().length<4} onClick={()=>void submitRefundRequest()}>{refundBusy?'Submitting request…':'Submit refund request for review'}</button></>}{refundMessage&&<p role="status">{refundMessage}</p>}</section><button className="enrol-print-button" type="button" onClick={() => window.print()}>Print payment acknowledgement</button><p className="enrol-receipt-footnote">Keep this page or save it as PDF for your records. This acknowledgement is generated from the verified payment details.</p></div></section>
}
