import { ArrowRight, Blend, BookOpenCheck, CreditCard, FileCheck2, GraduationCap, UserRound } from 'lucide-react'
import { SectionHeading } from '../SectionHeading'

const steps = [
  { icon: GraduationCap, title: 'Choose your class', detail: 'Select Class 10 or Class 12.' },
  { icon: BookOpenCheck, title: 'Confirm your pathway', detail: 'Class 12 students choose PCM or PCB.' },
  { icon: Blend, title: 'Choose a learning mode', detail: 'Pick an available online, hybrid or offline batch.' },
  { icon: UserRound, title: 'Share student details', detail: 'Enter the information needed for enrolment.' },
  { icon: CreditCard, title: 'Review and pay', detail: 'Confirm the fee, consent and secure checkout.' },
  { icon: FileCheck2, title: 'Receive confirmation', detail: 'Get next steps after server verification.' },
]

export function EnrollmentJourney() {
  return <section className="enrollment-journey-section section-pad" aria-label="How enrolment works"><div className="page-wrap">
    <SectionHeading eyebrow="A CLEAR ENROLMENT JOURNEY" title="Six clear steps to get started." intro="Choose the right program and learning mode, review the details and complete secure payment." />
    <ol className="enrollment-journey-grid">{steps.map(({ icon: Icon, title, detail }, index) => <li className="enrollment-journey-step" key={title}><span className="journey-step-number">0{index + 1}</span><span className="journey-step-icon"><Icon size={20} /></span><h3>{title}</h3><p>{detail}</p></li>)}</ol>
    <a className="journey-detail-link" href="#programs">Explore the programs <ArrowRight size={16} /></a>
  </div></section>
}
