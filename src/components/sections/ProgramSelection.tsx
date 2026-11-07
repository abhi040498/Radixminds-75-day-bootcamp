import { ArrowRight, ArrowUpRight, MonitorPlay, Laptop2, School, Blend, CalendarCheck, UsersRound, BookOpenText, Target, RotateCw, Calculator, FlaskConical, Atom, Sigma, ClipboardCheck, ChartNoAxesColumnIncreasing } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SectionHeading } from '../SectionHeading'
import { campaign } from '../../data/campaign'
import { useProgramCatalog } from '../../lib/useProgramCatalog'
import { formatINR, type PublicProgram } from '../../lib/enrolmentApi'
import type { ProgramCode } from '../../data/bootcampSchedule'

const subjectIcons = [Calculator, FlaskConical, BookOpenText, BookOpenText]
const gradeTenStrengths = [
  { Icon: BookOpenText, label: 'Structured lessons' }, { Icon: Target, label: 'Guided practice' },
  { Icon: ClipboardCheck, label: 'Topic-wise tests' }, { Icon: RotateCw, label: 'Revision resources' },
]
const gradeTwelveStrengths = [
  { Icon: BookOpenText, label: 'Structured lessons' }, { Icon: Sigma, label: 'Problem-solving' },
  { Icon: ClipboardCheck, label: 'Mock tests' }, { Icon: RotateCw, label: 'Revision resources' },
]
const legacyGradeTenStrengths = [
  { Icon: Target, label: 'Concept clarity' }, { Icon: ClipboardCheck, label: 'Regular practice' },
  { Icon: RotateCw, label: 'Systematic revision' }, { Icon: ChartNoAxesColumnIncreasing, label: 'Performance review' },
]
const legacyGradeTwelveStrengths = [
  { Icon: Atom, label: 'Concept mastery' }, { Icon: Sigma, label: 'Numerical practice' },
  { Icon: ClipboardCheck, label: 'Topic-wise tests' }, { Icon: ChartNoAxesColumnIncreasing, label: 'Performance review' },
]

function HomepageProgramCard({ program, index, tone, fallbackFeePaise, durationDays }: { program?: PublicProgram; index: number; tone: string; subjects?: readonly string[]; fallbackFeePaise?: number; durationDays?: number }) {
  const grade = index === 0 ? 'Class 10' : 'Class 12'
  const code = index === 0 ? 'class-10' : 'class-12'
  const title = index === 0 ? 'Build Your Strongest Foundation.' : 'Prepare for the Next Big Step.'
  const description = index === 0
    ? 'Prepare four core subjects with structured lessons and focused practice.'
    : 'Choose PCM or PCB for focused subject learning, practice and revision.'
  return <article className={`program-card home-program-card homepage-compact-card ${tone}`}>
    <div className="replica-program-copy">
      <div className="compact-card-top">
        <span>{grade.toUpperCase()} · CBSE</span>
        <span className="board-options" aria-label="ICSE and State Board batches">ICSE · STATE BOARD</span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
    <div className={`replica-program-art${index === 1 ? ' is-science' : ''}`} aria-hidden="true">
      {index === 0 ? <BookStackArtwork /> : <ScienceBooksArtwork />}
    </div>
    <div className="replica-program-footer">
      <Link to={`/programs/${code}`} className="program-view">Explore {grade} <ArrowRight size={18} /></Link>
      <div className="replica-fee-box">
        <strong>{formatINR(program?.payablePaise ?? fallbackFeePaise ?? 0)}</strong>
        <span>{(program?.durationDays ?? durationDays ?? 75)}-Day Programme</span>
      </div>
    </div>
  </article>
}

function BookStackArtwork() {
  return <svg viewBox="0 0 190 130" role="presentation">
    <defs><linearGradient id="book-pages" x1="0" x2="1"><stop stopColor="#fff" /><stop offset="1" stopColor="#e8edf4" /></linearGradient></defs>
    <ellipse cx="100" cy="119" rx="78" ry="8" fill="#18365d" opacity=".12" />
    <g transform="rotate(-5 100 98)">
      <path d="M27 91h128l14 14H39z" fill="#f4bf38" /><path d="M39 105h130v8H39z" fill="#d49c25" />
      <path d="M35 72h119l14 16H48z" fill="#fff" /><path d="M48 88h120v8H48z" fill="#2e6a9c" />
      <path d="M51 51h92l22 16H71z" fill="url(#book-pages)" /><path d="M71 67h94v7H71z" fill="#c5d7e6" />
      <path d="M51 51q26-22 46-10l20 15q-20-11-44 2z" fill="#ffffff" stroke="#c8d6e4" strokeWidth="2" />
      <path d="M97 41q24-14 47 3l-27 14q-11-10-20-6z" fill="#f8fbff" stroke="#c8d6e4" strokeWidth="2" />
      <path d="M98 42v21" stroke="#d1dbe5" strokeWidth="2" />
    </g>
  </svg>
}

function ScienceBooksArtwork() {
  return <svg viewBox="0 0 190 130" role="presentation">
    <ellipse cx="102" cy="119" rx="77" ry="8" fill="#18365d" opacity=".12" />
    <path d="M32 94h128l15 14H44z" fill="#f4bf38" /><path d="M44 108h131v7H44z" fill="#d49c25" />
    <path d="M42 76h113l16 14H57z" fill="#fff" /><path d="M57 90h114v7H57z" fill="#7192c7" />
    <path d="M80 70 106 41l28 26-28 27z" fill="none" stroke="#2a517f" strokeWidth="3" />
    <path d="m80 70 54-3M106 41l-7 39m35-13-28 27" stroke="#2a517f" strokeWidth="2" opacity=".8" />
    <circle cx="80" cy="70" r="7" fill="#287a8d" /><circle cx="106" cy="41" r="7" fill="#f2bd3f" />
    <circle cx="134" cy="67" r="7" fill="#8166ad" /><circle cx="106" cy="93" r="7" fill="#e47762" />
    <circle cx="99" cy="80" r="5" fill="#fff" stroke="#2a517f" strokeWidth="2" />
  </svg>
}

function ProgramCard({ program, index, subjects, tone, homepage }: { program: PublicProgram; index: number; subjects: readonly string[]; tone: string; homepage: boolean }) {
  if (homepage) return <HomepageProgramCard program={program} index={index} subjects={subjects} tone={tone} />
  const grade = index === 0 ? 'Class 10' : 'Class 12'
  const modes = new Set(program.modes.map(item => item.mode))
  const code = index === 0 ? 'class-10' : 'class-12'
  const strengths = homepage ? (index === 0 ? gradeTenStrengths : gradeTwelveStrengths) : (index === 0 ? legacyGradeTenStrengths : legacyGradeTwelveStrengths)
  return <article className={`program-card home-program-card ${tone}`}>
    <div className="home-program-hero">
      <div className="program-card-top"><span>{grade.toUpperCase()}</span><span className="program-index">75-DAY BOARD BOOTCAMP</span>{program.discountPercent !== null && <span className="offer-badge">{program.discountPercent}% OFF</span>}</div>
      {campaign.batchCapacity > 0 && <div className="home-program-capacity"><UsersRound size={14} /><span>COHORT LIMIT</span><strong>{campaign.batchCapacity}</strong><small>STUDENTS</small></div>}
      <h3>{homepage ? <span>{index === 0 ? 'Build Your Strongest Foundation.' : 'Prepare for the Next Big Step.'}</span> : <><span>{grade}</span><em>Board Bootcamp</em></>}</h3>
      <p className="program-card-description">{homepage ? (index === 0 ? 'Prepare for Mathematics, Science, Social Science and English with a focused 75-day preparation strategy.' : 'Choose PCM or PCB and strengthen your concepts, problem-solving and examination preparation.') : (index === 0 ? 'Build strong concepts, practise important questions and step into board exams with confidence.' : 'Strengthen subject understanding, sharpen problem-solving skills and prepare with purpose.')}</p>
      <div className="home-program-stats"><div><strong>{program.durationDays}</strong><span>Days</span><small>Focused preparation</small></div><div><strong>300</strong><span>Hours</span><small>Guided learning</small></div></div>
    </div>
    <div className="home-program-content">
      {index === 0 ? <div className="home-program-subjects"><div className="home-program-subject-heading"><strong>Covers 4 core subjects</strong><i /></div><div className="home-program-subject-grid">{subjects.map((subject, subjectIndex) => { const Icon = subjectIcons[subjectIndex] ?? BookOpenText; return <span key={subject}><Icon size={17} />{subject}</span> })}</div></div> : <div className="home-program-subjects home-pathways"><div className="home-program-subject-heading"><strong>Choose your subject pathway</strong><i /></div><div className="home-pathway-row"><b>PCM</b><span>Physics + Chemistry + Mathematics</span></div><div className="home-pathway-row"><b>PCB</b><span>Physics + Chemistry + Biology</span></div></div>}
      <div className="home-sunday-strip"><CalendarCheck size={22} /><div><strong>Every Sunday — Practice, Revision &amp; Doubt Clearing</strong><small>{homepage ? 'Weekly question practice and revision support.' : index === 0 ? 'Structured topic-wise preparation, guided practice and revision.' : 'Guided practice, revision and focused question-solving.'}</small></div></div>
      <div className="home-program-strengths">{strengths.map(({ Icon, label }) => <div key={label}><Icon size={19} /><strong>{label}</strong></div>)}</div>
      <div className="home-program-modes"><span><Laptop2 size={17} />Choose your learning mode</span>{(['online','hybrid','offline'] as const).map(mode => <span className={`home-mode-pill${modes.has(mode) ? ' is-available' : ' is-closed'}`} aria-label={`${mode[0].toUpperCase() + mode.slice(1)}: ${modes.has(mode) ? 'available' : 'not currently open'}`} key={mode}>{mode === 'online' ? <MonitorPlay size={14} /> : mode === 'hybrid' ? <Blend size={14} /> : <School size={14} />}{mode[0].toUpperCase() + mode.slice(1)}{!modes.has(mode) && ' · closed'}</span>)}</div>
      <div className={`home-program-footer${program.discountPercent !== null ? ' has-offer' : ''}`}><div className="home-program-price"><span>{homepage ? 'Programme fee' : 'Program fee'}</span><strong>{formatINR(program.payablePaise)}</strong>{program.discountPercent !== null && <div className="home-program-offer"><strong>{program.discountPercent}% OFF</strong><small>{homepage ? 'Current offer' : 'Offer shown from batch details'}</small></div>}</div><div className="home-program-ctas">{homepage ? <><Link to={index === 0 ? '/programs/class-10' : '/programs/class-12'} className="program-enrol">Explore {grade} <ArrowUpRight size={18} /></Link><Link to={`/contact?program=${code}`} className="program-view">Ask our team</Link></> : <><Link to={`/enrol?program=${code}`} className="program-enrol">Enrol Now <ArrowUpRight size={18} /></Link><Link to={index === 0 ? '/programs/class-10' : '/programs/class-12'} className="program-view">View Program Details</Link></>}</div></div>
    </div>
  </article>
}

export function ProgramSelection({
  title = 'Choose your board program.',
  intro = 'Choose your class and discover a structured preparation experience designed around your academic goals.',
  eyebrow = 'YOUR CLASS, YOUR PREPARATION JOURNEY',
  sectionId = 'programs',
  onlyProgram,
  homepage = false,
}: { title?: string; intro?: string; eyebrow?: string; sectionId?: string; onlyProgram?: ProgramCode; homepage?: boolean }) {
  const { programs, loading, retry } = useProgramCatalog()
  const displayPrograms = campaign.programs.map((content, index) => ({ content, program: programs.find(item => item.code === content.code), index })).filter(item => item.program && (!onlyProgram || item.content.code === onlyProgram))
  const expectedProgramCount = onlyProgram ? 1 : campaign.programs.length
  return <section className={`programs-section section-pad${homepage ? ' homepage-programs-section' : ''}`} id={sectionId}>
    <div className="page-wrap">
      <div className="programs-intro"><SectionHeading eyebrow={eyebrow} title={title} intro={intro} /></div>
      {loading && !homepage && <p className="program-catalog-status" role="status">Loading current program and fee details…</p>}
      <div className="program-grid">
      {loading && !homepage && !programs.length && <div className="program-catalog-status is-loading" role="status"><span>Loading live program, fee and learning-mode details…</span></div>}
        {!loading && !homepage && !programs.length && <div className="program-catalog-status" role="status">
          <span>{homepage ? 'Live fee and learning-mode details are temporarily unavailable. Please retry or contact Radix Minds to confirm before enrolling.' : 'Current program and fee details are temporarily unavailable. Please retry or contact Radix Minds.'}</span>
          <button type="button" onClick={retry}>Try again</button>
        </div>}
        {!loading && !homepage && programs.length > 0 && displayPrograms.length < expectedProgramCount && <div className="program-catalog-status" role="status"><span>Program details could not be loaded. Contact Radix Minds to confirm current details.</span><button type="button" onClick={retry}>Try again</button></div>}
        {homepage
          ? campaign.programs.map((content, index) => <HomepageProgramCard key={content.code} program={programs.find(item => item.code === content.code)} index={index} tone={index === 0 ? 'program-navy' : 'program-teal'} fallbackFeePaise={content.fallbackFeePaise} durationDays={content.durationDays} />)
          : displayPrograms.map(({ content, program, index }) => <ProgramCard key={content.code} program={program!} index={index} subjects={content.subjects} tone={index === 0 ? 'program-navy' : 'program-teal'} homepage={homepage} />)}</div>
    </div>
  </section>
}
