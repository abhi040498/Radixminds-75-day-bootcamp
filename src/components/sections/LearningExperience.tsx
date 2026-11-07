import { ArrowUpRight, BookOpenText, ClipboardCheck, FileText, Laptop2, UsersRound, ListChecks, NotebookTabs, MonitorCheck } from 'lucide-react'
import { SectionHeading } from '../SectionHeading'
import { campaign } from '../../data/campaign'
import { Link } from 'react-router-dom'

const experiences = [
  { Icon: BookOpenText, label: 'Learn', text: 'Structured, comprehensive lectures' },
  { Icon: FileText, label: 'Revise', text: 'Study notes for revision and practice' },
  { Icon: ClipboardCheck, label: 'Practise', text: 'Topic-wise and full-subject mock tests' },
  { Icon: Laptop2, label: 'Choose your mode', text: 'Live online or classroom learning' },
]

const practiceHighlights = [
  { Icon: ListChecks, title: 'Topic-wise tests', text: 'Practise as you work through each topic.' },
  { Icon: NotebookTabs, title: 'Complete subject mocks', text: 'Bring a full subject together in board-style practice.' },
  { Icon: MonitorCheck, title: 'Online or offline testing', text: 'Testing formats depend on the arrangements confirmed for the selected batch.' },
]

export function LearningExperience() {
  return <><section className="method-section section-pad" id="methodology"><div className="page-wrap method-layout">
      <div className="method-copy"><SectionHeading eyebrow="TEACHING METHODOLOGY" title="Learn with clarity. Practise with purpose." intro="A considered rhythm brings structured teaching, revision and testing together—so students know what to focus on next." />
        <div className="method-quote"><span>OUR APPROACH</span><p>Learn with intent.<br /><em>Practise with purpose.</em></p></div>
      </div>
      <div className="experience-list">{experiences.map(({ Icon, label, text }, i) => <article className={`experience-row${i === 0 ? ' experience-row-featured' : ''}`} key={label}><span className="experience-number">0{i + 1}</span><span className="experience-icon"><Icon size={19} strokeWidth={1.6} /></span><div>{i === 0 && <span className="experience-kicker">THE FOUNDATION</span>}<h3>{label}</h3><p>{text}</p></div><ArrowUpRight size={17} className="experience-arrow" /></article>)}</div>
    </div></section><PracticeSection /></>
}

export function PracticeSection() {
  return <section className="practice-section"><div className="page-wrap practice-layout"><div className="practice-art" aria-hidden="true"><div className="test-sheet"><span>MOCK TEST</span><b>Mathematics</b><div className="test-line"/><div className="test-line short"/><div className="test-choices"><i>A</i><i>B</i><i>C</i><i>D</i></div><div className="test-line"/><div className="test-line short"/><div className="test-check">✓</div></div><div className="practice-seal">PRACTICE<br /><b>REPEAT</b><br />REFINE</div></div><div className="practice-copy"><span className="eyebrow eyebrow-gold"><i />PRACTICE & MOCK TESTS</span><h2>A mock test<br />is a starting point,<br /><em>not a verdict.</em></h2><p>Practise the board format, notice what feels familiar and choose what to revisit. Every test is another opportunity to prepare.</p><div className="practice-highlights">{practiceHighlights.map(({ Icon, title, text }) => <article className="practice-highlight" key={title}><span><Icon size={17} /></span><div><strong>{title}</strong><small>{text}</small></div></article>)}</div><div className="practice-actions"><Link className="button button-gold" to="/enrol?program=class-10">Enrol Class 10 <ArrowUpRight size={16} /></Link><Link className="button button-gold" to="/enrol?program=class-12">Enrol Class 12 <ArrowUpRight size={16} /></Link><Link className="button button-outline-light" to="/programs">Explore Programs <ArrowUpRight size={16} /></Link></div></div></div></section>
}

export function FacultyIntro() {
  return <section className="faculty-section section-pad" id="faculty"><div className="page-wrap faculty-layout">
    <div className="faculty-art" aria-hidden="true"><div className="faculty-orbit orbit-one"/><div className="faculty-orbit orbit-two"/><div className="faculty-sigil">R<span>M</span></div><div className="faculty-vertical">GUIDANCE, WITH PURPOSE</div></div>
    <div className="faculty-copy"><span className="eyebrow"><span />FACULTY INFORMATION</span><h2>Thoughtful teaching.<br /><em>A shared focus.</em></h2><p>Subject-focused teaching and timely guidance bring structure to the final stretch before board exams.</p><p className="faculty-note">Teacher names, subject assignments and verified profiles will be shared by Radix Minds once confirmed.</p><a href="#contact" className="text-link">Talk to our team <ArrowUpRight size={15} /></a></div>
  </div></section>
}

export function ExperienceStrip() {
  const features = [
    { Icon: BookOpenText, title: 'Structured lectures' },
    { Icon: FileText, title: 'Study notes for revision' },
    { Icon: ClipboardCheck, title: 'Topic-wise & complete mock tests' },
    { Icon: UsersRound, title: 'Subject-focused guidance' },
    { Icon: Laptop2, title: 'Choose an available learning mode' },
  ]
  return <section className="experience-strip" aria-label="Bootcamp features"><div className="page-wrap experience-strip-inner">{features.map(({ Icon, title }, i) => <article className={`experience-feature experience-feature-${i + 1}`} key={title}><span className="experience-feature-icon"><Icon size={21} strokeWidth={1.8} /></span><span className="experience-feature-copy"><small>0{i + 1} <i /> BOOTCAMP FEATURE</small><strong>{title}</strong></span></article>)}</div></section>
}

export function SmartStrategy() {
  return <section className="smart-section section-pad"><div className="page-wrap smart-layout"><div className="smart-intro"><span className="eyebrow"><span />A SMARTER WAY TO PREPARE</span><h2>SMART strategy<br /><em>for board success.</em></h2><p>Five practical parts of preparation, brought into one focused program.</p></div><div className="smart-list">{campaign.smartMethod.map((item, i) => <div className="smart-item" key={item.letter}><span className="smart-check"><span>{item.letter}</span></span><div className="smart-item-copy"><strong>{item.title}</strong><small>{item.description}</small></div><small className="smart-item-index">0{i + 1}</small></div>)}</div>{campaign.batchCapacity > 0 && <div className="batch-ribbon" role="group" aria-label={`Maximum cohort capacity: ${campaign.batchCapacity} students`}><span className="batch-icon"><UsersRound size={23} /></span><div className="capacity-copy"><span>DEFINED COHORT CAPACITY</span><strong>Limited to {campaign.batchCapacity} students per cohort</strong><small>Ask the team about current availability</small></div><div className="batch-capacity-stat"><strong>{campaign.batchCapacity}</strong><span>STUDENTS / COHORT</span></div></div>}</div></section>
}
