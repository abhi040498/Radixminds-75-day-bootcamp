import { ArrowRight, BookOpenCheck, Check, ClipboardCheck, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SectionHeading } from '../SectionHeading'

const phases = [
  { name: 'BUILD', days: 'Days 1–25', tone: 'build', Icon: BookOpenCheck, focus: 'Find a clear starting point and strengthen the foundation.', outcomes: ['Review preparation and set priorities', 'Revisit foundational concepts', 'Begin structured subject-wise learning'] },
  { name: 'MASTER', days: 'Days 26–50', tone: 'master', Icon: Target, focus: 'Keep learning moving through focused practice and review.', outcomes: ['Continue topic coverage', 'Practise subject-wise questions', 'Identify topics to revisit'] },
  { name: 'PERFORM', days: 'Days 51–75', tone: 'perform', Icon: ClipboardCheck, focus: 'Bring learning together through revision and board-style practice.', outcomes: ['Strengthen revision', 'Attempt full-syllabus mock tests', 'Review mistakes and refine exam readiness'] },
]

export function Roadmap() {
  return <section className="roadmap-section section-pad" id="roadmap" aria-labelledby="home-roadmap-title"><div className="page-wrap">
    <div className="roadmap-head"><SectionHeading eyebrow="THE 75-DAY ROADMAP" title="75 days. One clear roadmap. A more confident you." titleId="home-roadmap-title" intro="Three focused phases bring preparation from a clear starting point to more confident board-style practice." /><div className="roadmap-number"><span>75</span><small>days of<br />focused preparation</small></div></div>
    <div className="home-phase-grid">{phases.map(({ name, days, tone, Icon, focus, outcomes }, index) => <article className={`home-phase-card phase-${tone}`} key={name}>
      <div className="home-phase-top"><span className="home-phase-icon"><Icon size={22} /></span><span>PHASE 0{index + 1}</span></div>
      <p className="home-phase-days">{days}</p><h3>{name}</h3><p className="home-phase-focus">{focus}</p>
      <ul>{outcomes.map(item => <li key={item}><Check size={14} />{item}</li>)}</ul>
    </article>)}</div>
    <div className="home-roadmap-foot"><p>Phase focus is a homepage-level guide. The academic timetable and subject allocation follow the finalized programme schedule.</p><Link to="/programs">Explore programme details <ArrowRight size={16} /></Link></div>
  </div></section>
}
