import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BadgeCheck, Check, CircleAlert, Clock3, CreditCard, GraduationCap, LockKeyhole, MessageCircle, ShieldCheck } from 'lucide-react'
import { campaign } from '../data/campaign'
import { api, formatINR, type ApiError, type PublicProgram } from '../lib/enrolmentApi'

type ProgramCode = 'class-10' | 'class-12'
type FormState = {
  programCode: ProgramCode | ''
  fullName: string; mobile: string; email: string; dateOfBirth: string
  board: string; schoolName: string; preferredLanguage: string
  guardianName: string; guardianMobile: string; guardianEmail: string
  subjectChoice: 'Mathematics' | 'Biology' | ''
  learningMode: 'online' | 'offline' | 'hybrid' | ''
  termsAccepted: boolean; privacyConsent: boolean; guardianConsent: boolean; communicationConsent: boolean
}
type EnrolmentSession = { reference: string; token: string; programCode: ProgramCode }
type CheckoutOrder = { enrolmentReference: string; orderId: string; keyId: string; amount: number; currency: string; name: string; description: string }
type CheckoutResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
type WindowWithRazorpay = Window & { Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (event: { error?: { description?: string } }) => void) => void } }

const initialForm: FormState = { programCode: '', fullName: '', mobile: '', email: '', dateOfBirth: '', board: '', schoolName: '', preferredLanguage: '', guardianName: '', guardianMobile: '', guardianEmail: '', subjectChoice: '', learningMode: '', termsAccepted: false, privacyConsent: false, guardianConsent: false, communicationConsent: false }
const SESSION_KEY = 'radixminds:enrolment-session'
const REGISTRATION_KEY = 'radixminds:registration-idempotency-key'

function makeIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = window.crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
}

function fallbackProgram(code: ProgramCode): PublicProgram {
  const program = campaign.programs.find(item => item.code === code)!
  return { code, name: `${code === 'class-10' ? 'Class 10' : 'Class 12'} Board Bootcamp`, durationDays: 75, subjects: program.subjects, payablePaise: program.programFee * 100, standardPaise: null, discountPercent: campaign.discountPercent, offerValidThrough: campaign.offerValidThrough, currency: 'INR', enrolmentOpen: true, modes: [], checkoutReady: false }
}

function Field({ label, name, value, onChange, error, ...props }: { label: string; name: string; value: string; onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void; error?: string; type?: string; placeholder?: string; inputMode?: 'text' | 'tel' | 'email' | 'numeric'; optional?: boolean; autoComplete?: string; min?: string; max?: string; children?: React.ReactNode }) {
  const id = `enrol-${name}`
  return <label className={`enrol-field${error ? ' has-error' : ''}`} htmlFor={id}><span>{label}{props.optional && <small> · Optional</small>}</span>{props.children ? <select id={id} name={name} value={value} onChange={onChange} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}>{props.children}</select> : <input id={id} name={name} value={value} onChange={onChange} type={props.type ?? 'text'} placeholder={props.placeholder} inputMode={props.inputMode} autoComplete={props.autoComplete} min={props.min} max={props.max} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />}{error && <small id={`${id}-error`} className="enrol-field-error">{error}</small>}</label>
}

function CheckField({ name, checked, onChange, error, children }: { name: keyof FormState; checked: boolean; onChange: (event: ChangeEvent<HTMLInputElement>) => void; error?: string; children: React.ReactNode }) {
  return <label className={`enrol-consent${error ? ' has-error' : ''}`}><input name={name} type="checkbox" checked={checked} onChange={onChange} /><span className="enrol-consent-box"><Check size={13} /></span><span className="enrol-consent-copy">{children}{error && <small className="enrol-field-error">{error}</small>}</span></label>
}

function stepErrors(step: number, form: FormState, eligibleBoards: string[]) {
  const errors: Record<string, string> = {}
  const phone = (value: string) => /^(?:[6-9]\d{9}|91[6-9]\d{9})$/.test(value.replace(/\D/g, ''))
  if (step === 1) {
    if (form.fullName.trim().length < 2) errors.fullName = 'Enter the student’s full name.'
    if (!phone(form.mobile)) errors.mobile = 'Enter a valid Indian mobile number.'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = 'Enter a valid email address.'
    if (!form.board || !eligibleBoards.includes(form.board)) errors.board = 'Choose a board.'
    if (form.schoolName.trim().length < 2) errors.schoolName = 'Enter the school name.'
  }
  if (step === 2) {
    if (!form.termsAccepted) errors.termsAccepted = 'Accept the program terms to continue.'
    if (!form.privacyConsent) errors.privacyConsent = 'Confirm the privacy notice.'
    if (!form.guardianConsent) errors.guardianConsent = 'Confirm parent or guardian consent.'
    if (!form.communicationConsent) errors.communicationConsent = 'Confirm enrolment communication consent.'
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
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>(initialForm)
  const [programs, setPrograms] = useState<PublicProgram[]>([])
  const [boards, setBoards] = useState(['CBSE', 'ICSE', 'State Board', 'Other'])
  const [setupError, setSetupError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [savedSession, setSavedSession] = useState<EnrolmentSession | null>(null)
  const [registrationKey] = useState(() => {
    const saved = sessionStorage.getItem(REGISTRATION_KEY)
    if (saved) return saved
    const key = makeIdempotencyKey()
    sessionStorage.setItem(REGISTRATION_KEY, key)
    return key
  })

  useEffect(() => {
    const requested = searchParams.get('program')
    if (requested === 'class-10' || requested === 'class-12') {
      setForm(current => ({ ...current, programCode: requested }))
      setStep(1)
    }
    Promise.all([api<{ programs: PublicProgram[] }>('/programs'), api<{ boards: string[]; languages: string[] }>('/config')])
      .then(([programData, options]) => { setPrograms(programData.programs); setBoards(options.boards) })
      .catch(error => { setSetupError(error instanceof Error ? error.message : 'Enrolment details are not available.'); setPrograms([fallbackProgram('class-10'), fallbackProgram('class-12')]) })
  }, [searchParams])

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
    setErrors({})
  }
  const validate = () => {
    const next = stepErrors(step, form, boards)
    setErrors(next)
    return Object.keys(next).length === 0
  }
  const nextStep = () => {
    if (step === 0 && !form.programCode) { setErrors({ programCode: 'Choose a program to continue.' }); return }
    if (!validate()) return
    setErrors({}); setMessage(''); setStep(current => Math.min(2, current + 1))
  }
  const previousStep = () => { setErrors({}); setMessage(''); setStep(current => Math.max(0, current - 1)) }

  const launchPayment = async (session: EnrolmentSession, retry = false) => {
    setBusy(true); setMessage('')
    try {
      const order = await api<CheckoutOrder>(`/enrolments/${session.reference}/payment-orders`, { method: 'POST', headers: { 'X-Enrolment-Token': session.token, 'Idempotency-Key': makeIdempotencyKey() }, body: '{}' })
      await loadRazorpayCheckout()
      const RazorpayConstructor = (window as WindowWithRazorpay).Razorpay
      if (!RazorpayConstructor) throw new Error('Secure checkout could not start. Please try again.')
      const checkout = new RazorpayConstructor({
        key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency,
        name: order.name, description: order.description,
        prefill: { name: form.fullName, email: form.email, contact: form.mobile },
        theme: { color: '#142B49' },
        modal: { ondismiss: () => { setBusy(false); setMessage('Checkout was closed before completion. If you completed payment, check your enrolment status before trying again.') } },
        handler: async (result: CheckoutResult) => {
          try {
            const verification = await api<{ status: 'confirmed' | 'pending' | 'failed'; paymentReference?: string }>(`/payments/verify`, { method: 'POST', headers: { 'X-Enrolment-Token': session.token }, body: JSON.stringify({ enrolmentReference: session.reference, razorpayOrderId: result.razorpay_order_id, razorpayPaymentId: result.razorpay_payment_id, razorpaySignature: result.razorpay_signature }) })
            if (verification.status === 'confirmed' || verification.status === 'pending') navigate('/enrol/confirmation')
            else { setBusy(false); setMessage('Payment was not completed. You may retry secure checkout.') }
          } catch (error) {
            if ((error as ApiError).code === 'PAYMENT_MISMATCH') { setBusy(false); setMessage('Payment needs a manual check. Please contact Radix Minds before trying again.'); return }
            navigate('/enrol/confirmation')
          }
        },
      })
      checkout.on('payment.failed', () => { setBusy(false); setMessage('Payment was not completed. Your registration is saved; you can safely retry.') })
      setBusy(false)
      checkout.open()
    } catch (error) {
      setBusy(false)
      setMessage(`${retry ? 'Checkout could not be retried. ' : ''}${error instanceof Error ? error.message : 'Please try again.'}`)
    }
  }

  const saveAndPay = async () => {
    if (!validate() || !program) return
    if (!program.checkoutReady || !program.enrolmentOpen) { setMessage('Online enrolment is not configured for this batch yet. Contact the team to confirm available modes and payment details.'); return }
    setBusy(true); setMessage('')
    try {
      const result = await api<{ enrolmentReference: string; statusToken: string }>('/enrolments', { method: 'POST', headers: { 'Idempotency-Key': registrationKey }, body: JSON.stringify({ ...form, programCode: form.programCode, subjectChoice: form.subjectChoice || null, learningMode: form.learningMode || null, dateOfBirth: form.dateOfBirth || '', guardianEmail: form.guardianEmail || '' }) })
      const session: EnrolmentSession = { reference: result.enrolmentReference, token: result.statusToken, programCode: form.programCode as ProgramCode }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
      setSavedSession(session)
      setBusy(false)
      await launchPayment(session)
    } catch (error) {
      setBusy(false)
      const apiError = error as ApiError
      setErrors(apiError.fields ?? {})
      setMessage(error instanceof Error ? error.message : 'We could not save your registration. Please retry.')
    }
  }

  const programName = form.programCode === 'class-10' ? 'Class 10' : form.programCode === 'class-12' ? 'Class 12' : ''
  const stepLabels = ['Program', 'Student details', 'Review & pay']

  return <section className="enrolment-page"><div className="page-wrap enrolment-wrap">
    <div className="enrolment-heading"><span className="public-card-eyebrow">SECURE PROGRAM ENROLMENT</span><h1>Let’s make the next<br /><em>75 days count.</em></h1><p>Choose a program, enter student details, then review the full amount before secure checkout.</p></div>
    {setupError && <div className="enrol-setup-note" role="status"><CircleAlert size={18} /><span>{setupError} Registration is in preview mode until the database, batch learning modes, approved policy pages and Razorpay test credentials are configured.</span></div>}
    <div className="enrolment-layout"><div className="enrolment-main">
      <ol className="enrolment-progress" aria-label="Registration steps">{stepLabels.map((label, index) => <li key={label} className={`${index === step ? 'is-current' : ''}${index < step ? ' is-complete' : ''}`}><span>{index < step ? <Check size={13} /> : index + 1}</span><small>{label}</small></li>)}</ol>
      <form className="enrolment-form" onSubmit={event => event.preventDefault()} noValidate>
        {step === 0 && <div className="enrolment-step-content"><div className="enrolment-step-heading"><span>STEP 01</span><h2>Choose your program</h2><p>Choose Class 10 or Class 12 for your 75-day board preparation program.</p></div><div className="enrol-program-options">{(['class-10', 'class-12'] as ProgramCode[]).map(code => {
          const item = programs.find(entry => entry.code === code) ?? fallbackProgram(code)
          const active = form.programCode === code
          const subjects = code === 'class-10' ? ['Mathematics', 'Science', 'Social Science', 'English'] : ['Physics', 'Chemistry', 'Mathematics or Biology']
          return <button type="button" key={code} className={`enrol-program-card ${active ? 'is-selected' : ''}`} aria-pressed={active} onClick={() => chooseProgram(code)}><span className="enrol-program-card-top"><i>{active && <Check size={14} />}</i><small>75-DAY BOARD BOOTCAMP</small></span><strong>{code === 'class-10' ? 'Class 10' : 'Class 12'}</strong><span className="enrol-program-subjects">{subjects.join(' · ')}</span><span className="enrol-program-price">{formatINR(item.payablePaise)} <small>program fee</small></span><span className="enrol-program-offer">{item.discountPercent ?? 0}% OFF</span></button>
        })}</div>{errors.programCode && <p className="enrol-field-error">{errors.programCode}</p>}</div>}

        {step === 1 && <div className="enrolment-step-content"><div className="enrolment-step-heading"><span>STEP 02 · {programName.toUpperCase()}</span><h2>Student details</h2><p>Tell us who is joining the bootcamp and which school board they follow.</p></div><div className="enrol-fields-grid"><Field label="Student name" name="fullName" value={form.fullName} onChange={setField} error={errors.fullName} autoComplete="name" placeholder="Full name" /><Field label="Mobile number" name="mobile" value={form.mobile} onChange={setField} error={errors.mobile} type="tel" inputMode="tel" autoComplete="tel" placeholder="10-digit mobile number" /><Field label="Email ID" name="email" value={form.email} onChange={setField} error={errors.email} type="email" inputMode="email" autoComplete="email" placeholder="student@example.com" /><Field label="School" name="schoolName" value={form.schoolName} onChange={setField} error={errors.schoolName} autoComplete="organization" placeholder="School name" /><Field label="Board" name="board" value={form.board} onChange={setField} error={errors.board}><option value="">Choose a board</option>{boards.map(board => <option value={board} key={board}>{board}</option>)}</Field></div></div>}

        {step === 2 && <div className="enrolment-step-content"><div className="enrolment-step-heading"><span>STEP 03</span><h2>Review & pay</h2><p>Review the selected program, student details, terms and final payable amount.</p></div><div className="enrol-review-card"><div className="enrol-review-head"><span><GraduationCap size={18} /> {program?.name}</span><button type="button" className="enrol-review-edit" onClick={() => setStep(0)}>Change program</button></div><div className="enrol-review-grid"><div><small>STUDENT</small><b>{form.fullName}</b></div><div><small>PROGRAM DURATION</small><b>{programName} · {program?.durationDays ?? 75} days</b></div><div><small>MOBILE</small><b>{form.mobile}</b></div><div><small>EMAIL</small><b>{form.email}</b></div><div><small>BOARD</small><b>{form.board}</b></div><div><small>SCHOOL</small><b>{form.schoolName}</b></div></div>{fee}</div><div className="enrol-consent-list"><CheckField name="termsAccepted" checked={form.termsAccepted} onChange={setField} error={errors.termsAccepted}>I accept the <Link to="/terms" target="_blank" rel="noreferrer">program terms and conditions</Link>.</CheckField><CheckField name="privacyConsent" checked={form.privacyConsent} onChange={setField} error={errors.privacyConsent}>I have read the <Link to="/privacy" target="_blank" rel="noreferrer">privacy notice</Link> and consent to the stated use of these details.</CheckField><CheckField name="guardianConsent" checked={form.guardianConsent} onChange={setField} error={errors.guardianConsent}>If the student is under 18, I confirm a parent or guardian has reviewed and approved this enrolment.</CheckField><CheckField name="communicationConsent" checked={form.communicationConsent} onChange={setField} error={errors.communicationConsent}>I consent to necessary enrolment and payment-related communication from Radix Minds.</CheckField></div>{setupError && <div className="enrol-inline-warning"><LockKeyhole size={17} /><span>Checkout is disabled until approved policy content, Supabase, batch configuration and Razorpay test credentials are configured.</span></div>}</div>}
        {message && <div className="enrol-message" role="alert"><CircleAlert size={17} />{message}</div>}
        <div className="enrol-form-actions">{step > 0 && <button type="button" className="enrol-back-button" onClick={previousStep} disabled={busy}><ArrowLeft size={16} /> Back</button>}{step < 2 ? <button type="button" className="enrol-next-button" onClick={nextStep} disabled={busy}>{step === 0 ? 'Continue with this program' : 'Continue'} <ArrowRight size={16} /></button> : <><button type="button" className="enrol-next-button" onClick={savedSession ? () => launchPayment(savedSession, true) : saveAndPay} disabled={busy || !program?.checkoutReady || !program.enrolmentOpen}><LockKeyhole size={16} />{busy ? 'Preparing secure checkout…' : savedSession ? 'Retry secure payment' : 'Pay securely'}<ArrowRight size={16} /></button>{program && (!program.checkoutReady || !program.enrolmentOpen) && <p className="enrol-config-caption">Online payment is not available until this batch is configured. <Link to="/contact">Contact the team</Link>.</p>}</>}</div>
      </form>
    </div><aside className="enrolment-aside"><span className="enrol-aside-icon"><ShieldCheck size={23} /></span><small>YOUR ENROLMENT</small><h2>A clear next step.</h2><ul><li><Check size={15} />75-day preparation program</li><li><Check size={15} />Student details reviewed</li><li><Check size={15} />Server-verified Razorpay payment</li><li><Check size={15} />No card details stored on this site</li></ul>{program && <div className="enrol-aside-fee"><span>SELECTED PROGRAM</span><strong>{program.name}</strong><small>{program.durationDays} days · {program.discountPercent ?? 0}% configured offer</small><b>{formatINR(program.payablePaise)}</b></div>}<p><LockKeyhole size={14} /> Checkout opens securely with Razorpay after server validation.</p></aside></div>
  </div></section>
}

type ConfirmationResponse = {
  status: 'confirmed' | 'pending' | 'failed' | 'needs_review'
  enrolmentReference: string
  studentName: string
  program: { code: ProgramCode; name: string; duration_days: number; learning_mode_label: string }
  subjects: string[]
  price: { payable_paise: number; currency: string }
  payment: { reference: string | null; amountPaise: number; currency: string; status: string; capturedAt: string | null } | null
  support: { whatsappPhone: string; telegramUrl: string }
}

export function EnrolmentConfirmationPage() {
  const [status, setStatus] = useState<ConfirmationResponse | null>(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) { setError('This confirmation session is not available in this browser. Contact Radix Minds with your Razorpay payment reference if money was debited.'); setChecking(false); return }
    let session: EnrolmentSession
    try { session = JSON.parse(raw) as EnrolmentSession } catch { setError('This confirmation session is invalid. Please contact Radix Minds.'); setChecking(false); return }
    let active = true
    const check = async () => {
      for (let attempt = 0; attempt < 5 && active; attempt++) {
        try {
          const result = await api<ConfirmationResponse>(`/enrolments/${session.reference}/status`, { headers: { 'X-Enrolment-Token': session.token } })
          if (!active) return
          setStatus(result)
          if (result.status === 'confirmed' || result.status === 'failed' || result.status === 'needs_review') { setChecking(false); return }
        } catch (requestError) { if (active) setError(requestError instanceof Error ? requestError.message : 'Could not check payment status.') }
        await new Promise(resolve => setTimeout(resolve, 2500))
      }
      if (active) setChecking(false)
    }
    void check()
    return () => { active = false }
  }, [])

  if (error && !status) return <section className="enrol-confirm-page"><div className="enrol-confirm-card"><span className="enrol-confirm-symbol is-pending"><CircleAlert size={28} /></span><span className="public-card-eyebrow">PAYMENT STATUS</span><h1>We’re checking your payment.</h1><p>{error}</p><Link className="button button-gold" to="/contact">Contact Radix Minds</Link></div></section>
  if (!status || (checking && status.status !== 'confirmed' && status.status !== 'failed' && status.status !== 'needs_review')) return <section className="enrol-confirm-page"><div className="enrol-confirm-card"><span className="enrol-confirm-symbol is-pending"><Clock3 size={28} /></span><span className="public-card-eyebrow">PAYMENT VERIFICATION</span><h1>Checking with Razorpay…</h1><p>Your enrolment is confirmed only after our server verifies the captured payment. Please keep this page open.</p>{status && <small>Enrolment reference: {status.enrolmentReference}</small>}</div></section>
  if (status.status !== 'confirmed') { sessionStorage.removeItem(REGISTRATION_KEY); return <section className="enrol-confirm-page"><div className="enrol-confirm-card"><span className="enrol-confirm-symbol is-pending"><CircleAlert size={28} /></span><span className="public-card-eyebrow">PAYMENT NOT CONFIRMED</span><h1>{status.status === 'failed' ? 'Payment wasn’t completed.' : 'We need to check this payment.'}</h1><p>{status.status === 'failed' ? 'Your registration details are saved. You can return to the program page or contact the team before retrying.' : 'Please don’t submit another payment until the Radix Minds team has checked this transaction.'}</p><span className="enrol-confirm-reference">{status.enrolmentReference}</span><Link className="button button-gold" to={`/enrol?program=${status.program.code}`}>Return to enrolment</Link></div></section> }
  sessionStorage.removeItem(REGISTRATION_KEY)
  const amount = status.payment?.amountPaise ?? status.price.payable_paise
  const waPhone = status.support.whatsappPhone.replace(/\D/g, '')
  return <section className="enrol-confirm-page"><div className="enrol-confirm-card is-success"><span className="enrol-confirm-symbol"><BadgeCheck size={32} /></span><span className="public-card-eyebrow">PAID ENROLMENT · VERIFIED</span><h1>You’re enrolled, {status.studentName.split(' ')[0]}.</h1><p>Your payment has been verified by our server. The Radix Minds team will share batch details and next steps through the contact channels below.</p><div className="enrol-receipt"><span className="enrol-receipt-title"><CreditCard size={17} /> PAYMENT ACKNOWLEDGEMENT</span><div><small>ENROLMENT ID</small><b>{status.enrolmentReference}</b></div><div><small>PROGRAM</small><b>{status.program.name} · {status.program.duration_days} days</b></div><div><small>SUBJECTS</small><b>{status.subjects.join(' · ')}</b></div><div><small>LEARNING MODE</small><b>{status.program.learning_mode_label}</b></div><div><small>PAYMENT REFERENCE</small><b>{status.payment?.reference ?? 'Verified by Razorpay'}</b></div><div className="enrol-receipt-total"><small>AMOUNT PAID</small><strong>{formatINR(amount)}</strong></div></div><div className="enrol-next-instructions"><span><MessageCircle size={17} /> BATCH JOINING DETAILS</span><p>Message Radix Minds on WhatsApp or Telegram to receive the batch communication instructions. You will not be added to a private group without your consent.</p><div><a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer">WhatsApp the team <ArrowRight size={14} /></a><a href={status.support.telegramUrl} target="_blank" rel="noreferrer">Open Telegram <ArrowRight size={14} /></a></div></div><button className="enrol-print-button" type="button" onClick={() => window.print()}>Print payment acknowledgement</button><p className="enrol-receipt-footnote">Keep this page or save it as PDF for your records. This acknowledgement is generated from the verified payment details.</p></div></section>
}
