import { Link } from 'react-router-dom'
import { ShieldCheck, FileCheck2 } from 'lucide-react'

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const privacy = kind === 'privacy'
  return <section className="legal-page page-wrap"><div className="legal-card"><span className="public-card-eyebrow">RADIX MINDS · {privacy ? 'PRIVACY' : 'ENROLMENT'}</span><div className="legal-icon">{privacy ? <ShieldCheck /> : <FileCheck2 />}</div><h1>{privacy ? 'Privacy notice' : 'Program terms'}</h1><p className="legal-lead">{privacy ? 'Your registration details are used to process enrolment, confirm payment and communicate essential program information.' : 'Enrolment details and program arrangements are confirmed by Radix Minds for each active batch.'}</p><div className="legal-placeholder"><strong>Policy text requires owner approval before checkout can be enabled.</strong><p>This page is a launch placeholder. Radix Minds must publish and approve the complete privacy notice and program terms, including contact details, cancellation/refund arrangements, data retention and applicable business information. Online payment remains disabled until approval is recorded in the server configuration.</p></div><Link className="button button-outline-light legal-back" to="/enrol">Return to enrolment</Link></div></section>
}
