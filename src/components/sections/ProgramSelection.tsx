import { ArrowUpRight, Check, CircleCheck, MoveUpRight, Flame } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SectionHeading } from '../SectionHeading'
import { campaign } from '../../data/campaign'

const programs = campaign.programs.map((program, index) => ({
  ...program,
  title: index === 0 ? 'Class 10' : 'Class 12',
  description: index === 0 ? 'Build a steadier rhythm across core subjects, one topic at a time.' : 'Bring your chosen stream into focus with a clear revision plan.',
  tone: index === 0 ? 'program-navy' : 'program-teal',
}))

function ProgramCard({ program, index }: { program: typeof programs[number]; index: number }) {
  return <article className={`program-card ${program.tone}`}>
    <div className="program-card-top"><span>{program.grade}</span><span className="offer-badge">{campaign.discountPercent}% OFF</span><span className="program-index">PROGRAM 0{index + 1}</span></div>
    <h3>{program.title}</h3>
    <p className="program-card-description">{program.description}</p>
    <div className="program-subject-label">YOUR CORE SUBJECTS</div>
    <div className="program-subjects">{program.subjects.map(subject => <span key={subject}><Check size={14} />{subject}</span>)}</div>
    <div className="program-inclusions" aria-label="Included in this program">
      <span><CircleCheck size={16} />Structured lectures</span>
      <span><CircleCheck size={16} />Topic-wise mock tests</span>
      <span><CircleCheck size={16} />Revision notes</span>
    </div>
    <div className="program-card-bottom program-card-actions">
      <Link to={`/enrol?program=${index === 0 ? 'class-10' : 'class-12'}`} className="program-enrol transition-colors duration-200">Enrol Now <ArrowUpRight size={15} /></Link>
      <Link to={index === 0 ? '/programs/class-10' : '/programs/class-12'} className="program-view">View Program <ArrowUpRight size={15} /></Link>
    </div>
    <div className="program-duration"><span>75</span><small>DAYS</small><MoveUpRight size={15} /></div>
  </article>
}

export function ProgramSelection() {
  return <section className="programs-section section-pad" id="programs">
    <div className="page-wrap">
      <div className="programs-intro"><SectionHeading eyebrow="CHOOSE YOUR PREPARATION PATH" title="A clearer plan for your class." intro="Focused 75-day preparation pathways for Class 10 and Class 12 board students." /></div>
      <div className="offer-banner" role="note"><div className="offer-banner-copy"><span>ENROLMENT OFFER</span><strong><b>{campaign.discountPercent}% OFF</b> the configured program fee</strong></div><div className="offer-banner-capacity"><span className="offer-flame"><Flame size={17} /></span><strong>Maximum {campaign.batchCapacity} students per cohort</strong><small>Contact the team to check current availability</small></div><Link className="offer-banner-cta" to="/enrol">Enrol Now <ArrowUpRight size={16} /></Link></div>
      <div className="program-grid">{programs.map((program, index) => <ProgramCard key={program.grade} program={program} index={index} />)}</div>
    </div>
  </section>
}
