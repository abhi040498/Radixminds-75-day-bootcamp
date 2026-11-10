import { useEffect, useState, type FormEvent } from 'react'
import { BadgeCheck, BookOpenCheck, Download, FilePlus2, Filter, LockKeyhole, LogOut, RefreshCw, Search, ShieldCheck, UsersRound, WalletCards } from 'lucide-react'
import { api } from '../lib/enrolmentApi'
import { policyVersions } from '../data/policyVersions'

type AdminRole = 'owner' | 'operations' | 'finance'
type Metrics = { totalRegistrations: number; class10Enrolments: number; class12Enrolments: number; manualEnrolments: number; successfulPayments: number; pendingPayments: number; failedPayments: number; verifiedRevenuePaise: number }
type ProgramSnapshot = { code: 'class-10' | 'class-12'; name: string; duration_days: number; learning_mode_label?: string }
type EnrolmentRecord = {
  id: string; public_reference: string; status: string; created_at: string; source: 'online' | 'manual';
  program_snapshot: ProgramSnapshot; subjects_snapshot: string[]; pricing_snapshot: { payable_paise: number; currency: string };
  learning_mode: string | null; board: string | null; school_name: string | null; student_id?: string;
  student_name?: string; student_mobile?: string; student_email?: string; internal_remarks?: string | null;
  manual_payment_status: 'not_applicable' | 'unpaid' | 'recorded_paid'; manual_payment_reference: string | null;
  manual_payment_recorded_at: string | null; payment_status: string | null; provider_order_id: string | null;
  provider_payment_id: string | null; payment_amount_paise: number | null; payment_currency: string | null; payment_captured_at: string | null;
  whatsapp_updates_consented?: boolean;
  whatsapp_mobile_e164?: string | null;
}
type EnquiryRecord = { id: string; full_name: string; mobile_e164: string; email: string | null; program_code: string | null; message: string; status: 'new' | 'in_progress' | 'resolved' | 'closed'; internal_remarks: string | null; created_at: string }
type RefundRecord = { id:string; requestReference:string; requestedAt:string; cutoffAt:string; reason:string; status:string; approvedAmountPaise:number|null; providerRefundId:string|null; providerStatus:string|null; failureReason:string|null; internalNote:string|null; student:{name:string;mobile:string;email:string}|null; enrolment:{reference:string;program:{name?:string}|null}|null; payment:{reference:string|null;amountPaise:number;currency:string;status:string}|null }
type Filters = { search: string; program: string; status: string; paymentStatus: string; learningMode: string }
const emptyMetrics: Metrics = { totalRegistrations: 0, class10Enrolments: 0, class12Enrolments: 0, manualEnrolments: 0, successfulPayments: 0, pendingPayments: 0, failedPayments: 0, verifiedRevenuePaise: 0 }
const money = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount / 100)
const shortDate = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

function MetricCard({ label, value, icon: Icon, note, tone = '' }: { label: string; value: string | number; icon: typeof UsersRound; note?: string; tone?: string }) {
  return <article className={`admin-metric ${tone}`}><span className="admin-metric-icon"><Icon size={18} /></span><span className="admin-metric-label">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>
}

function EnquiryManager({ enquiry, onSaved }: { enquiry: EnquiryRecord; onSaved: () => void }) {
  const [status, setStatus] = useState(enquiry.status)
  const [remarks, setRemarks] = useState(enquiry.internal_remarks ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try { await api(`/admin/enquiries/${enquiry.id}`, { method: 'PATCH', body: JSON.stringify({ status, internalRemarks: remarks || null }) }); onSaved() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save enquiry updates.') }
    finally { setSaving(false) }
  }
  return <article className="admin-enquiry-card"><div className="admin-enquiry-card-head"><div><b>{enquiry.full_name}</b><small>{enquiry.mobile_e164}{enquiry.email ? ` · ${enquiry.email}` : ''} · {shortDate(enquiry.created_at)}</small></div><span className={`admin-status status-${enquiry.status}`}>{enquiry.status.replace('_',' ')}</span></div><p>{enquiry.message}</p><form onSubmit={save} className="admin-enquiry-edit"><label>Status<select value={status} onChange={event => setStatus(event.target.value as EnquiryRecord['status'])}><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label><label>Internal remarks<textarea value={remarks} onChange={event => setRemarks(event.target.value)} maxLength={4000} rows={2} placeholder="Visible to authorized staff only" /></label><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save enquiry'}</button>{error && <small className="admin-error">{error}</small>}</form></article>
}

export function AdminPage() {
  const [role, setRole] = useState<AdminRole | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics)
  const [rows, setRows] = useState<EnrolmentRecord[]>([])
  const [enquiries, setEnquiries] = useState<EnquiryRecord[]>([])
  const [refunds, setRefunds] = useState<RefundRecord[]>([])
  const [view, setView] = useState<'overview' | 'enrolments' | 'enquiries' | 'refunds'>('overview')
  const [filters, setFilters] = useState<Filters>({ search: '', program: '', status: '', paymentStatus: '', learningMode: '' })
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [selected, setSelected] = useState<EnrolmentRecord | null>(null)

  const loadMetrics = async () => {
    try { const result = await api<{ metrics: Metrics }>('/admin/dashboard'); setMetrics(result.metrics) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Dashboard totals could not be loaded.') }
  }
  const loadRows = async () => {
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '30' })
      Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value) })
      const result = await api<{ enrolments: EnrolmentRecord[]; total: number }>(`/admin/enrolments?${query.toString()}`)
      setRows(result.enrolments); setTotal(result.total); setError('')
      if (selected) setSelected(result.enrolments.find(row => row.id === selected.id) ?? null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Enrolments could not be loaded.') }
  }
  const loadEnquiries = async () => {
    try { const query = new URLSearchParams(); if (filters.status) query.set('status', filters.status); const result = await api<{ enquiries: EnquiryRecord[]; total: number }>(`/admin/enquiries?${query.toString()}`); setEnquiries(result.enquiries); setTotal(result.total); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Enquiries could not be loaded.') }
  }
  const loadRefunds = async () => {
    try { const result=await api<{refundRequests:RefundRecord[]}>('/admin/refunds');setRefunds(result.refundRequests);setError('') }
    catch(cause){setError(cause instanceof Error?cause.message:'Refund requests could not be loaded.')}
  }

  useEffect(() => { api<{ signedIn: boolean; role: AdminRole }>('/admin/session').then(data => setRole(data.role)).catch(() => undefined) }, [])
  useEffect(() => {
    if (!role) return
    void loadMetrics()
    if (view === 'enrolments') void loadRows()
    if (view === 'enquiries' && role !== 'finance') void loadEnquiries()
    if (view === 'refunds' && role !== 'finance') void loadRefunds()
  }, [role, view, page, filters])

  const signIn = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try { const data = await api<{ signedIn: boolean; admin: { role: AdminRole } }>('/admin/session', { method: 'POST', body: JSON.stringify({ email, password }) }); setRole(data.admin.role); setPassword('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign in failed.') }
    finally { setBusy(false) }
  }
  const signOut = async () => { await api('/admin/session/logout', { method: 'POST' }).catch(() => undefined); setRole(null); setRows([]); setEnquiries([]); setMetrics(emptyMetrics) }
  const refresh = () => { void loadMetrics(); if (view === 'enrolments') void loadRows(); if (view === 'enquiries') void loadEnquiries(); if(view==='refunds')void loadRefunds() }
  const decideRefund = async (refund:RefundRecord,decision:'approved'|'rejected',approvedAmountPaise?:number,internalNote?:string) => { await api(`/admin/refunds/${refund.id}/decision`,{method:'POST',body:JSON.stringify({decision,approvedAmountPaise,internalNote})});await loadRefunds() }
  const processRefund = async (refund:RefundRecord) => { await api(`/admin/refunds/${refund.id}/process`,{method:'POST',body:'{}'});await loadRefunds() }
  const updateRecord = async (id: string, data: Record<string, unknown>) => {
    await api(`/admin/enrolments/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
    await loadRows()
    await loadMetrics()
  }
  const changeManualPayment = async (row: EnrolmentRecord, status: 'unpaid' | 'recorded_paid', reference?: string) => {
    await api(`/admin/enrolments/${row.id}/manual-payment`, { method: 'PATCH', body: JSON.stringify({ status, reference }) })
    await loadRows(); await loadMetrics()
  }
  const submitManual = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('')
    const formData = new FormData(event.currentTarget)
    const payload = Object.fromEntries(formData.entries())
    payload.consentsRecorded = formData.get('consentsRecorded') === 'on' ? 'true' : 'false'
    const learningMode = formData.get('learningMode') || null
    try {
      await api('/admin/manual-enrolments', { method: 'POST', body: JSON.stringify({ ...payload, learningMode, consentsRecorded: payload.consentsRecorded === 'true', policyVersions }) })
      setManualOpen(false); setView('enrolments'); setFilters({ search: '', program: '', status: '', paymentStatus: '', learningMode: '' }); setPage(1)
      await loadMetrics(); await loadRows()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Manual enrolment could not be saved.') }
    finally { setBusy(false) }
  }

  if (!role) return <section className="admin-page page-wrap"><form className="admin-login" onSubmit={signIn}><span className="admin-icon"><LockKeyhole /></span><span className="public-card-eyebrow">RADIX MINDS · STAFF ACCESS</span><h1>Enrolment console</h1><p>Sign in with an active Supabase admin account.</p><label>Email address<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>{error && <p className="admin-error" role="alert">{error}</p>}<button className="button button-gold" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button></form></section>

  const applySearch = (event: FormEvent) => { event.preventDefault(); setPage(1); setFilters(current => ({ ...current, search: searchInput.trim() })) }
  const exportCsv = () => {
    const query = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value) })
    window.location.assign(`/api/v1/admin/enrolments/export?${query.toString()}`)
  }
  const totalPages = Math.max(1, Math.ceil(total / 30))

  return <section className="admin-page page-wrap"><div className="admin-dashboard">
    <header className="admin-topbar"><div><span className="public-card-eyebrow">RADIX MINDS · ADMINISTRATION</span><h1>{view === 'overview' ? 'Dashboard overview' : view === 'enrolments' ? 'Enrolment records' : view==='refunds'?'Refund review':'Enquiry inbox'}</h1><p>Signed in as <b>{role}</b> · Private staff workspace</p></div><div className="admin-actions"><button type="button" onClick={refresh}><RefreshCw size={15} /> Refresh</button><button type="button" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button></div></header>
    <nav className="admin-tabs" aria-label="Admin sections"><button type="button" className={view === 'overview' ? 'is-active' : ''} onClick={() => setView('overview')}>Overview</button><button type="button" className={view === 'enrolments' ? 'is-active' : ''} onClick={() => setView('enrolments')}>Enrolments</button>{role !== 'finance' && <><button type="button" className={view === 'enquiries' ? 'is-active' : ''} onClick={() => setView('enquiries')}>Enquiries</button><button type="button" className={view === 'refunds' ? 'is-active' : ''} onClick={() => setView('refunds')}>Refunds</button></>}</nav>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {view === 'overview' && <><div className="admin-metrics-grid"><MetricCard label="Total registrations" value={metrics.totalRegistrations} icon={UsersRound} /><MetricCard label="Class 10" value={metrics.class10Enrolments} icon={BookOpenCheck} /><MetricCard label="Class 12" value={metrics.class12Enrolments} icon={BookOpenCheck} /><MetricCard label="Successful payments" value={metrics.successfulPayments} icon={BadgeCheck} tone="metric-good" /><MetricCard label="Pending payments" value={metrics.pendingPayments} icon={WalletCards} tone="metric-wait" /><MetricCard label="Failed payment attempts" value={metrics.failedPayments} icon={ShieldCheck} tone="metric-alert" /><MetricCard label="Verified online revenue" value={money(metrics.verifiedRevenuePaise)} icon={WalletCards} note="Captured Razorpay payments only" tone="metric-revenue" /><MetricCard label="Manual enrolments" value={metrics.manualEnrolments} icon={FilePlus2} note="Not counted as verified online payments" /></div><div className="admin-overview-note"><ShieldCheck size={19} /><span>Verified revenue includes captured Razorpay payments only. Manual enrolment receipts are tracked separately and never included in online revenue.</span></div></>}

    {view === 'enrolments' && <><div className="admin-list-toolbar"><form className="admin-search" onSubmit={applySearch}><Search size={17} /><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search ID, student, email or mobile" aria-label="Search enrolments" /><button type="submit">Search</button></form><div className="admin-toolbar-actions">{role !== 'finance' && <><button type="button" onClick={exportCsv}><Download size={15} /> Export CSV</button><button type="button" className="admin-manual-button" onClick={() => setManualOpen(true)}><FilePlus2 size={15} /> Add manual enrolment</button></>}</div></div><div className="admin-filters"><span><Filter size={15} /> Filters</span><select aria-label="Filter by program" value={filters.program} onChange={event => { setPage(1); setFilters(current => ({ ...current, program: event.target.value })) }}><option value="">All programs</option><option value="class-10">Class 10</option><option value="class-12">Class 12</option></select><select aria-label="Filter by learning mode" value={filters.learningMode} onChange={event => { setPage(1); setFilters(current => ({ ...current, learningMode: event.target.value })) }}><option value="">All learning modes</option><option value="online">Online</option><option value="hybrid">Hybrid</option><option value="offline">Offline</option></select><select aria-label="Filter by enrolment status" value={filters.status} onChange={event => { setPage(1); setFilters(current => ({ ...current, status: event.target.value })) }}><option value="">All enrolment statuses</option><option value="confirmed">Confirmed</option><option value="pending_payment">Pending payment</option><option value="cancelled">Cancelled</option><option value="refunded">Refunded</option><option value="needs_review">Needs review</option></select><select aria-label="Filter by payment status" value={filters.paymentStatus} onChange={event => { setPage(1); setFilters(current => ({ ...current, paymentStatus: event.target.value })) }}><option value="">All payment statuses</option><option value="creating">Order processing</option><option value="created">Razorpay pending</option><option value="authorized">Authorized</option><option value="captured">Razorpay captured</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option><option value="needs_review">Needs review</option><option value="not_started">Not started</option><option value="unpaid">Manual unpaid</option><option value="recorded_paid">Manual recorded paid</option></select><button type="button" onClick={() => { setPage(1); setSearchInput(''); setFilters({ search: '', program: '', status: '', paymentStatus: '', learningMode: '' }) }}>Clear</button></div>
      <div className="admin-table-wrap"><table><thead><tr><th>Enrolment ID</th><th>Student</th><th>Mobile</th><th>Class & board</th><th>Selected program</th><th>Learning mode</th><th>Payment</th><th>Enrolment</th><th>Registered</th><th>Record</th><th>Action</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><b>{row.public_reference}</b></td><td>{role === 'finance' ? 'Restricted' : row.student_name}</td><td>{role === 'finance' ? '—' : row.student_mobile}</td><td>{role === 'finance' ? '—' : <>{row.program_snapshot.code === 'class-10' ? 'Class 10' : 'Class 12'}<small>{row.board ?? 'Board pending'}</small></>}</td><td>{row.program_snapshot.name}<small>{row.subjects_snapshot.join(' · ')}</small></td><td><span className="admin-learning-mode">{row.learning_mode === 'online' ? 'Online · Live' : row.learning_mode === 'hybrid' ? 'Hybrid · Flexible' : row.learning_mode === 'offline' ? 'Offline · Classroom' : row.learning_mode ?? 'Not set'}</span></td><td><span className={`admin-status ${row.payment_status === 'captured' || row.payment_status === 'recorded_paid' ? 'status-confirmed' : row.payment_status === 'failed' ? 'status-failed' : ''}`}>{row.source === 'manual' ? `Manual · ${row.manual_payment_status.replace('_',' ')}` : (row.payment_status ?? 'Not started').replace('_',' ')}</span><small>{row.source === 'online' ? row.provider_payment_id ?? 'No payment reference' : 'Not Razorpay verified'}</small></td><td><span className={`admin-status status-${row.status}`}>{row.status.replace('_',' ')}</span></td><td>{shortDate(row.created_at)}</td><td><span className={`admin-source source-${row.source}`}>{row.source === 'manual' ? 'Manual entry' : 'Online'}</span></td><td>{role === 'finance' ? '—' : <button className="admin-row-action" type="button" onClick={() => setSelected(selected?.id === row.id ? null : row)}>{selected?.id === row.id ? 'Close' : 'View / edit'}</button>}</td></tr>)}</tbody></table>{!rows.length && <p className="admin-empty"><ShieldCheck size={19} />No enrolments match these filters.</p>}</div><div className="admin-pagination"><span>{total} records · Page {page} of {totalPages}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button type="button" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
      {selected && role !== 'finance' && <EnrolmentDetails key={selected.id} row={selected} onSave={data => updateRecord(selected.id,data)} onManualPayment={(status,reference) => changeManualPayment(selected,status,reference)} />}
    </>}

    {view === 'enquiries' && role !== 'finance' && <><div className="admin-filters"><span><Filter size={15} /> Enquiry status</span><select value={filters.status} onChange={event => { setPage(1); setFilters(current => ({ ...current, status: event.target.value, program: '', paymentStatus: '' })) }}><option value="">All enquiries</option><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></div><div className="admin-enquiry-list">{enquiries.map(item => <EnquiryManager key={item.id} enquiry={item} onSaved={() => void loadEnquiries()} />)}{!enquiries.length && <p className="admin-empty">No enquiries in this view.</p>}</div></>}
    {view === 'refunds' && role !== 'finance' && <div className="admin-refund-list"><RefundExceptionForm onSubmitted={()=>void loadRefunds()}/>{refunds.map(item=><RefundManager key={item.id} refund={item} onDecision={decideRefund} onProcess={processRefund}/>)}{!refunds.length&&<p className="admin-empty">No refund requests are awaiting review.</p>}<p className="admin-footnote">Submitting a refund request never approves or processes it. Only an authorized staff action can record a decision; provider processing is a separate explicit action.</p></div>}
    <p className="admin-footnote">Student data is private. Access and write actions are checked by the server against the signed-in admin role.</p>
  </div>{manualOpen && <ManualEnrolmentModal busy={busy} onClose={() => setManualOpen(false)} onSubmit={submitManual} />}</section>
}

function RefundManager({refund,onDecision,onProcess}:{refund:RefundRecord;onDecision:(refund:RefundRecord,decision:'approved'|'rejected',amount?:number,note?:string)=>Promise<void>;onProcess:(refund:RefundRecord)=>Promise<void>}){
  const [amount,setAmount]=useState(refund.approvedAmountPaise?String(refund.approvedAmountPaise/100):'')
  const [note,setNote]=useState(refund.internalNote??'')
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('')
  const submit=async(decision:'approved'|'rejected')=>{setBusy(true);setMessage('');try{const paise=decision==='approved'?Math.round(Number(amount)*100):undefined;if(decision==='approved'&&(!Number.isSafeInteger(paise)||!paise||paise!>(refund.payment?.amountPaise??0)))throw new Error('Enter an amount within the captured payment.');await onDecision(refund,decision,paise,note||undefined);setMessage(`Request ${decision}.`)}catch(error){setMessage(error instanceof Error?error.message:'Decision could not be saved.')}finally{setBusy(false)}}
  const process=async()=>{setBusy(true);setMessage('');try{await onProcess(refund);setMessage('Provider status checked and recorded.')}catch(error){setMessage(error instanceof Error?error.message:'Refund processing did not complete.')}finally{setBusy(false)}}
  return <article className="admin-refund-card"><header><div><span className="public-card-eyebrow">{refund.requestReference} · {shortDate(refund.requestedAt)}</span><h2>{refund.student?.name??'Student record unavailable'}</h2><p>{refund.enrolment?.reference} · {refund.enrolment?.program?.name} · Payment {refund.payment?.reference??'reference unavailable'}</p></div><span className={`admin-status status-${refund.status}`}>{refund.status.replace(/_/g,' ')}</span></header><p className="admin-refund-reason">{refund.reason}</p><div className="admin-refund-facts"><span>Paid: {refund.payment?money(refund.payment.amountPaise):'Unavailable'}</span><span>Request cutoff: {new Date(refund.cutoffAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</span><span>Student contact: {refund.student?.mobile??'Unavailable'} · {refund.student?.email??''}</span>{refund.approvedAmountPaise!==null&&<span>Approved: {money(refund.approvedAmountPaise)}</span>}{refund.providerRefundId&&<span>Provider refund: {refund.providerRefundId} · {refund.providerStatus}</span>}{refund.failureReason&&<span>Provider issue: {refund.failureReason}</span>}</div>{['requested','under_review'].includes(refund.status)&&<div className="admin-refund-controls"><label>Approved amount (₹)<input type="number" min="0.01" step="0.01" max={refund.payment?refund.payment.amountPaise/100:undefined} value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Internal decision note<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={4000}/></label><button disabled={busy} onClick={()=>void submit('approved')}>Approve amount</button><button className="is-secondary" disabled={busy} onClick={()=>void submit('rejected')}>Reject request</button></div>}{['approved','refund_failed','refund_processing'].includes(refund.status)&&<button className="admin-refund-process" type="button" disabled={busy} onClick={()=>void process()}>{busy?'Processing…':refund.status==='refund_processing'?'Retry / reconcile provider refund':'Initiate approved refund'}</button>}{message&&<p role="status" className="admin-save-message">{message}</p>}</article>
}

function RefundExceptionForm({onSubmitted}:{onSubmitted:()=>void}){
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('')
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const formElement=event.currentTarget;setBusy(true);setMessage('');const form=new FormData(formElement);try{const result=await api<{requestReference:string}>('/admin/refunds/exception',{method:'POST',body:JSON.stringify({enrolmentReference:form.get('enrolmentReference'),reason:form.get('reason'),exceptionNote:form.get('exceptionNote')})});setMessage(`Exception request recorded: ${result.requestReference}. It still requires review and a separate decision.`);formElement.reset();onSubmitted()}catch(error){setMessage(error instanceof Error?error.message:'Exception request was not recorded.')}finally{setBusy(false)}}
  return <form className="admin-refund-exception" onSubmit={submit}><div><b>Authorized exception request</b><small>Owner or operations may record a legally required or approved late request; this does not approve a refund.</small></div><label>Enrolment reference<input name="enrolmentReference" required pattern="RM-[A-F0-9]{20}" placeholder="RM-…" /></label><label>Customer request reason<input name="reason" required minLength={4} maxLength={2000} /></label><label>Exception basis / authority<input name="exceptionNote" required minLength={4} maxLength={2000} /></label><button disabled={busy}>{busy?'Recording…':'Record exception request'}</button>{message&&<small role="status">{message}</small>}</form>
}

function EnrolmentDetails({ row, onSave, onManualPayment }: { row: EnrolmentRecord; onSave: (data: Record<string,unknown>) => Promise<void>; onManualPayment: (status:'unpaid'|'recorded_paid',reference?:string)=>Promise<void> }) {
  const [name,setName]=useState(row.student_name ?? '')
  const [mobile,setMobile]=useState(row.student_mobile ?? '')
  const [email,setEmail]=useState(row.student_email ?? '')
  const [remarks,setRemarks]=useState(row.internal_remarks ?? '')
  const [manualStatus,setManualStatus]=useState<'unpaid'|'recorded_paid'>(row.manual_payment_status==='recorded_paid'?'recorded_paid':'unpaid')
  const [manualReference,setManualReference]=useState(row.manual_payment_reference ?? '')
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')
  const [whatsappDraft,setWhatsappDraft]=useState<{url:string;message:string}|null>(null)
  const prepareWhatsAppDraft = async () => { setSaving(true);setMessage('');setWhatsappDraft(null);try{const result=await api<{url:string;message:string;sent:false}>(`/admin/enrolments/${row.id}/whatsapp-draft`,{method:'POST',body:'{}'});setWhatsappDraft(result);setMessage('Draft ready. It has not been sent. Review and send it in WhatsApp.')}catch(cause){setMessage(cause instanceof Error?cause.message:'Could not prepare a WhatsApp draft.')}finally{setSaving(false)} }
  const save = async (event:FormEvent) => { event.preventDefault();setSaving(true);setMessage('');try{await onSave({fullName:name,mobile,email,internalRemarks:remarks||null});setMessage('Student details and internal remarks saved.')}catch(cause){setMessage(cause instanceof Error?cause.message:'Could not save changes.')}finally{setSaving(false)} }
  const saveManualPayment = async () => { setSaving(true);setMessage('');try{await onManualPayment(manualStatus,manualReference||undefined);setMessage('Manual payment record updated. This is not a verified online payment.')}catch(cause){setMessage(cause instanceof Error?cause.message:'Could not update manual payment.')}finally{setSaving(false)} }
  return <section className="admin-detail-panel"><header><div><span className="public-card-eyebrow">RECORD DETAILS</span><h2>{row.public_reference}</h2></div><span className={`admin-source source-${row.source}`}>{row.source === 'manual' ? 'Manual entry' : 'Online enrolment'}</span></header><div className="admin-detail-summary"><div><small>PROGRAM & SUBJECTS</small><b>{row.program_snapshot.name}</b><span>{row.subjects_snapshot.join(' · ')}</span></div><div><small>LEARNING MODE</small><b>{row.learning_mode === 'online' ? 'Online · Live Interactive Classes' : row.learning_mode === 'hybrid' ? 'Hybrid · Flexible Learning' : row.learning_mode === 'offline' ? 'Offline · Classroom Training' : row.learning_mode ?? 'Not recorded'}</b><span>{row.program_snapshot.learning_mode_label ?? 'Batch mode'}</span></div><div><small>WHATSAPP CONTACT</small><b>{row.whatsapp_mobile_e164 ?? row.student_mobile ?? "Not recorded"}</b><span>{row.whatsapp_updates_consented ? "Opted in to WhatsApp updates" : "No WhatsApp updates consent"}</span></div><div><small>BOARD & SCHOOL</small><b>{row.board ?? 'Not recorded'}</b><span>{row.school_name ?? 'School not recorded'}</span></div><div><small>ENROLMENT STATUS</small><b>{row.status.replace('_',' ')}</b><span>{shortDate(row.created_at)}</span></div><div><small>PAYMENT STATUS</small><b>{row.source === 'manual' ? `Manual · ${row.manual_payment_status.replace('_',' ')}` : (row.payment_status ?? 'not started').replace('_',' ')}</b><span>{row.provider_order_id ? `Order ${row.provider_order_id}` : row.manual_payment_reference ?? 'No transaction reference'}</span><span>{row.provider_payment_id ? `Payment ${row.provider_payment_id}` : ''}</span><span>{row.payment_amount_paise ? money(row.payment_amount_paise) : row.source === 'manual' ? 'Manual record · excluded from verified revenue' : ''}</span><span>{row.payment_captured_at ? `Captured ${shortDate(row.payment_captured_at)}` : ''}</span></div></div>{row.source === 'manual' && <div className="admin-manual-payment-edit"><h3>Manual payment record</h3><p>Recording an in-person payment does not mark a Razorpay transaction as verified.</p><div><select value={manualStatus} onChange={event=>setManualStatus(event.target.value as 'unpaid'|'recorded_paid')}><option value="unpaid">Unpaid</option><option value="recorded_paid">Received in person · recorded</option></select><input value={manualReference} onChange={event=>setManualReference(event.target.value)} maxLength={160} placeholder="Cash/UPI receipt reference (optional)" /><button type="button" disabled={saving} onClick={()=>void saveManualPayment()}>Save manual payment</button></div></div>}{row.source === 'online' && row.status === 'confirmed' && row.payment_status === 'captured' && row.whatsapp_updates_consented && <div className="admin-whatsapp-draft"><div><b>WhatsApp confirmation</b><small>Only available for a captured payment with recorded WhatsApp consent.</small></div><button type="button" disabled={saving} onClick={()=>void prepareWhatsAppDraft()}>{saving?'Preparing…':'Prepare message draft'}</button>{whatsappDraft && <a href={whatsappDraft.url} target="_blank" rel="noreferrer">Review and send in WhatsApp</a>}</div>}<form className="admin-record-edit" onSubmit={save}><h3>Student contact & internal remarks</h3><div className="admin-record-fields"><label>Student name<input value={name} onChange={event=>setName(event.target.value)} required /></label><label>Mobile number<input value={mobile} onChange={event=>setMobile(event.target.value)} inputMode="tel" required /></label><label>Email<input value={email} onChange={event=>setEmail(event.target.value)} type="email" required /></label><label className="admin-remarks-field">Internal remarks<textarea value={remarks} onChange={event=>setRemarks(event.target.value)} maxLength={4000} rows={3} placeholder="Private note for authorized staff" /></label></div><div className="admin-edit-footer"><small>Contact edits apply to the student record. Remarks are staff-only.</small><button type="submit" disabled={saving}>{saving?'Saving…':'Save record'}</button></div>{message&&<p role="status" className="admin-save-message">{message}</p>}</form></section>
}

function ManualEnrolmentModal({ busy, onClose, onSubmit }: { busy: boolean; onClose:()=>void; onSubmit:(event:FormEvent<HTMLFormElement>)=>void }) {
  return <div className="admin-modal-backdrop" role="presentation"><form className="admin-manual-modal" onSubmit={onSubmit}><header><div><span className="public-card-eyebrow">AUTHORIZED STAFF ACTION</span><h2>Add manual enrolment</h2><p>This record will be labelled manual; it will not create a verified Razorpay payment.</p></div><button type="button" aria-label="Close" onClick={onClose}>×</button></header><div className="admin-manual-fields"><label>Student name<input name="fullName" required minLength={2} maxLength={120} /></label><label>Mobile number<input name="mobile" required inputMode="tel" /></label><label>Email<input name="email" type="email" required /></label><label>Program<select name="programCode"><option value="class-10">Class 10</option><option value="class-12">Class 12</option></select></label><label>Learning mode<select name="learningMode"><option value="">Not recorded</option><option value="online">Online</option><option value="hybrid">Hybrid</option><option value="offline">Offline</option></select></label><label>Board<input name="board" required maxLength={80} /></label><label>School<input name="schoolName" required maxLength={180} /></label><label>Manual payment status<select name="manualPaymentStatus"><option value="unpaid">Unpaid</option><option value="recorded_paid">Received in person · recorded</option></select></label><label>Receipt/reference<input name="manualPaymentReference" maxLength={160} /></label><label className="admin-remarks-field">Internal remarks<textarea name="internalRemarks" maxLength={4000} rows={2} /></label></div><label className="admin-attestation"><input name="consentsRecorded" type="checkbox" required />I confirm the current Terms, Privacy and Refund policy acknowledgements were obtained and recorded.</label><footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={busy}>{busy?'Saving…':'Create manual record'}</button></footer></form></div>
}
