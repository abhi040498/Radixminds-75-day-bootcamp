import { ArrowRight, BookOpenCheck, Check, ClipboardCheck, FileSearch, Lightbulb, NotebookPen, RefreshCw, Target, TimerReset, Waypoints } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SectionHeading } from '../SectionHeading'

const challenges = [
  { Icon: FileSearch, concern: 'The syllabus feels unfinished', response: 'A structured, subject-wise plan helps make the next steps easier to see.' },
  { Icon: Lightbulb, concern: 'Some concepts still feel unclear', response: 'Comprehensive lessons and guided explanations help revisit the ideas that need attention.' },
  { Icon: NotebookPen, concern: 'There has not been enough practice', response: 'Topic-wise questions and mock tests bring regular practice into the routine.' },
  { Icon: RefreshCw, concern: 'Earlier topics are getting harder to recall', response: 'Revision resources and repeated practice support a steadier review habit.' },
  { Icon: TimerReset, concern: 'It is difficult to plan study time', response: 'A defined 75-day timetable gives preparation a clearer rhythm.' },
]

export function StudentChallenges() {
  return <section className="home-challenges-section section-pad" aria-labelledby="home-challenges-title">
    <div className="page-wrap">
      <SectionHeading eyebrow="A PLACE TO BEGIN AGAIN" title="It’s not that you can’t do it. You may just need the right direction." titleId="home-challenges-title" intro="Board preparation can feel like a lot to carry. A clearer plan can help you take the next step without feeling judged for where you are today." />
      <div className="home-challenges-grid">{challenges.map(({ Icon, concern, response }, index) => <article className="home-challenge-card" key={concern}>
        <span className="home-challenge-index">0{index + 1}</span><span className={`home-challenge-icon challenge-icon-${index + 1}`}><Icon size={27} strokeWidth={1.9} /></span>
        <h3>{concern}</h3><p>{response}</p>
      </article>)}</div>
    </div>
  </section>
}

const pillars = [
  { Icon: BookOpenCheck, number: '01', title: 'Learn with clarity', text: 'Structured lessons, concept explanations and topic-wise coverage.' },
  { Icon: Target, number: '02', title: 'Practise with purpose', text: 'Guided questions, written practice and problem-solving.' },
  { Icon: ClipboardCheck, number: '03', title: 'Assess your progress', text: 'Topic-wise tests and mock tests help identify learning gaps.' },
  { Icon: RefreshCw, number: '04', title: 'Revise with confidence', text: 'Revision resources, doubt support and repeated practice.' },
]

export function PreparationSystem() {
  return <section className="home-system-section section-pad" aria-labelledby="home-system-title">
    <div className="page-wrap">
      <SectionHeading eyebrow="THE RADIX MINDS PREPARATION SYSTEM" title="Not just more classes. A complete preparation system." titleId="home-system-title" intro="Learning, practice, assessment and revision work together throughout the program." />
      <ol className="home-system-grid">{pillars.map(({ Icon, number, title, text }) => <li className="home-system-pillar" key={number}>
        <span className="home-system-number">{number}</span><span className="home-system-icon"><Icon size={23} strokeWidth={1.7} /></span>
        <h3>{title}</h3><p>{text}</p><span className="home-system-link"><Check size={14} /> Part of the 75-day plan</span>
      </li>)}</ol>
      <div className="home-system-loop"><Waypoints size={17} /><span>Learn</span><i /><span>Practise</span><i /><span>Review</span><i /><span>Return stronger</span></div>
    </div>
  </section>
}

export function LearningHours() {
  return <section className="home-hours-section" aria-labelledby="home-hours-title">
    <div className="page-wrap home-hours-layout">
      <div><span className="eyebrow"><span />A COMMITTED LEARNING JOURNEY</span><h2 id="home-hours-title">300 Hours Dedicated to <em>Better Preparation.</em></h2><p>A planned learning journey combining lessons, practice, assessments and revision support across your 75-day programme.</p></div>
      <div className="home-hours-metrics" aria-label="75 days and 300 hours"><div><strong>75</strong><span>DAYS</span></div><i aria-hidden="true" /><div><strong>300</strong><span>HOURS</span></div></div>
    </div>
  </section>
}

const valueItems = [
  'Structured and comprehensive lectures', 'Subject-wise learning plan', 'Topic-wise practice and mock tests',
  'Study notes for revision', 'Regular assessments', 'Doubt-resolution support',
  'Online, Hybrid and Offline options', 'A defined 75-day preparation journey',
]

export function ProgramValue() {
  return <section className="home-value-section section-pad" aria-labelledby="home-value-title">
    <div className="page-wrap home-value-layout">
      <div className="home-value-intro"><SectionHeading eyebrow="WHAT THE PROGRAM BRINGS TOGETHER" title="Everything you need to prepare with a clear direction." titleId="home-value-title" intro="A focused mix of teaching, practice and revision, organised around the needs of Class 10 and Class 12 board preparation." /><Link className="home-inline-link" to="/programs">Compare the programs <ArrowRight size={16} /></Link></div>
      <ul className="home-value-list">{valueItems.map(item => <li key={item}><span><Check size={15} /></span>{item}</li>)}</ul>
    </div>
  </section>
}
