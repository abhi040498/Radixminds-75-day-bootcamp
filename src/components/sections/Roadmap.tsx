import { ArrowRight, BookOpenCheck, Check, ClipboardCheck, Target, Trophy, ChartNoAxesCombined } from 'lucide-react'
import { SectionHeading } from '../SectionHeading'
import { campaign } from '../../data/campaign'

const icons = [ClipboardCheck, BookOpenCheck, Target, ChartNoAxesCombined, Trophy]
const phasePointers = [
  ['Review current understanding', 'Set subject priorities'],
  ['Build concepts through guided lessons', 'Revisit key learning'],
  ['Apply concepts in board-style practice', 'Use revision to address gaps'],
  ['Practise complete subject papers', 'Review timing and responses'],
  ['Attempt full-syllabus mocks', 'Focus final revision'],
]

export function Roadmap() {
  return <section className="roadmap-section section-pad" id="roadmap"><div className="page-wrap">
    <div className="roadmap-head"><SectionHeading eyebrow="THE 75-DAY ROADMAP" title="A clear path from revision to readiness." intro="Five focused phases build toward 10 days of full-syllabus mock tests." /><div className="roadmap-number"><span>75</span><small>days of<br />focused prep</small></div></div>
    <div className="roadmap-journey-labels"><span><b>DAYS 1–60</b><small>Learn, practise and revise</small></span><i /><span><b>DAYS 61–75</b><small>Subject and full-syllabus mocks</small></span></div>
    <div className="roadmap-track">{campaign.roadmap.map(({ phase, days, title, tone }, index) => { const Icon = icons[index]; return <article className={`roadmap-step ${tone}`} key={phase}><div className="phase-card"><span className="phase-index">0{index + 1}</span><div className="phase-top"><span>{phase}</span><small>{days}</small></div><Icon size={25} strokeWidth={1.7} /><h3>{title}</h3><ul className="phase-pointers">{phasePointers[index].map(point => <li key={point}><Check size={13} />{point}</li>)}</ul></div></article> })}</div>
    <div className="roadmap-finale"><div className="finale-days"><span>15</span><small>MOCK<br />DAYS</small></div><div><span className="step-label">DAYS 61–75 · MOCK TESTS & FINAL PREPARATION</span><h3>Bring the whole syllabus together.</h3><p>Subject-wise and full-syllabus practice help students review pacing, responses and revision priorities.</p></div><a href="#programs" aria-label="Explore programs"><ArrowRight size={18} /></a></div>
    <div className="roadmap-note"><span>75 DAYS · A PROPOSED PREPARATION FRAMEWORK</span><p>Subject allocation and academic schedule follow the finalized faculty timetable.</p></div>
  </div></section>
}
