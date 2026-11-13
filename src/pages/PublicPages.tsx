import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowRight, ArrowUpRight, Atom, BookOpenCheck, Calculator, Check, ClipboardCheck,
  Clock3, FileText, FlaskConical, GraduationCap, Languages, Landmark, Mail,
  MapPin, MessageCircle, NotebookPen, Phone, Send, ShieldCheck, Target, Trophy,
  UsersRound, CircleHelp, CalendarDays, RefreshCw,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { SectionHeading } from '../components/SectionHeading'
import { About } from '../components/sections/About'
import { FAQs } from '../components/sections/FAQs'
import { ParentTrust } from '../components/sections/ParentTrust'
import { ProgramEnrollmentOptions } from '../components/ProgramEnrollmentOptions'
import { ProgramSelection } from '../components/sections/ProgramSelection'
import { WeeklyTimetable } from '../components/WeeklyTimetable'
import { bootcampDates, type ProgramCode } from '../data/bootcampSchedule'
import { campaign } from '../data/campaign'
import { api } from '../lib/enrolmentApi'
import { formatINR, type PublicProgram } from '../lib/enrolmentApi'
import { useProgramCatalog } from '../lib/useProgramCatalog'

function PageMeta({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    document.title = `${title} | Radix Minds 75-Day Board Bootcamp`
    const canonicalUrl = `https://bootcamp.radixminds.in${window.location.pathname}`
    const upsert = (selector: string, attribute: string, key: string, value: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(selector)
      if (!element) {
        element = document.createElement('meta')
        element.setAttribute(attribute, key)
        document.head.appendChild(element)
      }
      element.content = value
    }
    upsert('meta[name="description"]', 'name', 'description', description)
    upsert('meta[property="og:title"]', 'property', 'og:title', document.title)
    upsert('meta[property="og:description"]', 'property', 'og:description', description)
    upsert('meta[property="og:type"]', 'property', 'og:type', 'website')
    upsert('meta[property="og:url"]', 'property', 'og:url', canonicalUrl)
    upsert('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image')
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical) }
    canonical.href = canonicalUrl
  }, [title, description])
  return null
}

function PageIntro({ eyebrow, title, lead, crumb }: { eyebrow: string; title: string; lead: string; crumb: string }) {
  const programHighlights = crumb === 'Class 10 Program'
    ? ['CLASS 10 PROGRAM', '75 DAYS', '300 HOURS', '4 CORE SUBJECTS']
    : crumb === 'Class 12 Program'
      ? ['CLASS 12 PROGRAM', '75 DAYS', '300 HOURS', 'CHOOSE YOUR PATHWAY']
      : null
  return <section className="public-hero"><div className="page-wrap public-hero-inner">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span aria-current="page">{crumb}</span></nav>
    <span className="public-eyebrow"><i />{eyebrow}</span><h1>{title}</h1>{programHighlights && <div className="program-hero-highlights" aria-label={`${crumb} highlights`}><span><GraduationCap size={16} />{programHighlights[0]}</span><span><Clock3 size={16} />{programHighlights[1]}</span><span><BookOpenCheck size={16} />{programHighlights[2]}</span><span><BookOpenCheck size={16} />{programHighlights[3]}</span></div>}<p>{lead}</p>
  </div><span className="public-hero-mark" aria-hidden="true">RM</span></section>
}

function PageCTA({ eyebrow = 'TAKE YOUR NEXT STEP', title = 'Find the program that fits your class.' }: { eyebrow?: string; title?: string }) {
  return <section className="public-cta page-wrap"><div><span>{eyebrow}</span><h2>{title}</h2><p>Speak with the Radix Minds team about the program, schedule and enrolment.</p></div><div className="public-cta-actions"><Link className="button button-gold" to="/programs">Explore programs <ArrowRight size={16} /></Link><Link className="button button-outline-light" to="/contact">Contact the team <ArrowUpRight size={15} /></Link></div></section>
}

function ProgramNextStep() {
  return <section className="public-cta page-wrap"><div><span>YOUR NEXT CHAPTER STARTS HERE</span><h2>Take the next step with a clear plan.</h2><p>Choose your class to review the program details, or speak with our team about getting started.</p></div><div className="public-cta-actions"><Link className="button button-gold" to="/programs/class-10">Class 10 program <ArrowRight size={16} /></Link><Link className="button button-outline-light" to="/programs/class-12">Class 12 program <ArrowUpRight size={15} /></Link><Link className="button button-outline-light" to="/contact">Contact the team</Link></div></section>
}

function InteriorPage({ title, description, eyebrow, headline, lead, crumb, children, cta = true }: {
  title: string; description: string; eyebrow: string; headline: string; lead: string; crumb: string; children: React.ReactNode; cta?: boolean
}) {
  return <>
    <PageMeta title={title} description={description} />
    <PageIntro eyebrow={eyebrow} title={headline} lead={lead} crumb={crumb} />
    {children}
    {cta && <PageCTA />}
  </>
}

function FeatureCard({ icon: Icon, eyebrow, title, text }: { icon: typeof Check; eyebrow: string; title: string; text: string }) {
  return <article className="public-feature-card"><span className="public-feature-icon"><Icon size={21} strokeWidth={1.7} /></span><span className="public-card-eyebrow">{eyebrow}</span><h3>{title}</h3><p>{text}</p></article>
}

export function AboutPage() {
  return <InteriorPage title="About the Bootcamp" description="Learn how Radix Minds structures a focused 75-day board preparation program for Class 10 and Class 12 students in Bokaro." eyebrow="ABOUT THE BOOTCAMP" headline="A clearer plan for the final stretch." lead="A 75-day preparation experience built around structured learning, purposeful practice and steady revision." crumb="About the Bootcamp">
    <About />
    <section className="public-section about-story-section"><div className="page-wrap about-story-layout"><div className="about-story-copy"><span className="public-card-eyebrow">THE RADIX MINDS APPROACH</span><h2>Preparation should feel organised, purposeful and human.</h2><p>Board preparation can bring a lot of competing priorities. The bootcamp brings subject learning, focused practice and revision into one connected experience, so students can see what to work on next and families can understand how the program is designed.</p><Link className="text-link" to="/programs">Explore the programs <ArrowUpRight size={15} /></Link></div><div className="about-story-points"><article><span>01</span><div><h3>Start with a clear focus</h3><p>Build preparation around the selected class, subjects and confirmed academic timetable.</p></div></article><article><span>02</span><div><h3>Learn, then apply</h3><p>Connect structured lessons with topic practice, question-solving and subject assessments.</p></div></article><article><span>03</span><div><h3>Review and refine</h3><p>Use revision and mock-test review to identify useful next steps throughout the preparation period.</p></div></article></div></div></section>
    <section className="public-section public-section-ivory"><div className="page-wrap"><SectionHeading eyebrow="THE PREPARATION IN THREE PARTS" title="Understand. Practise. Refine." intro="Each part supports the next, helping students use the remaining preparation time with greater clarity." /><div className="public-feature-grid public-feature-grid-3"><FeatureCard icon={BookOpenCheck} eyebrow="01 · LEARN" title="Build understanding" text="Structured lessons bring key concepts into focus across the selected subjects." /><FeatureCard icon={ClipboardCheck} eyebrow="02 · PRACTISE" title="Apply what you learn" text="Topic-wise and subject-wise tests create regular opportunities to practise board-style questions." /><FeatureCard icon={NotebookPen} eyebrow="03 · REVISE" title="Return to what matters" text="Study notes and revision help students revisit concepts throughout the preparation period." /></div></div></section>
    <section className="about-family-band"><div className="page-wrap about-family-inner"><span className="about-family-icon"><UsersRound size={23} /></span><div><span className="public-card-eyebrow">FOR STUDENTS & FAMILIES</span><h2>A thoughtful plan you can understand before you begin.</h2><p>Explore subjects, timetable, learning-mode availability and fee details. If you have questions, Radix Minds can help you understand the current batch before you enrol.</p></div><Link className="button button-gold" to="/contact">Talk to our team <ArrowRight size={15} /></Link></div></section>
    <ParentTrust />
  </InteriorPage>
}

export function ProgramsPage() {
  return <InteriorPage title="Board Bootcamp Programs" description="Compare the Radix Minds 75-day Class 10 and Class 12 board bootcamp programs and explore each subject pathway." eyebrow="CLASS 10 & CLASS 12" headline="Choose your class. Start with a clear plan." lead="Two focused 75-day programs, designed around the subjects students need to prepare." crumb="Programs" cta={false}>
    <ProgramSelection sectionId="program-listing" eyebrow="CLASS 10 & CLASS 12" title="Choose your board program." intro="Compare subjects and the current program fee—then enroll or explore the pathway that fits your class." compactListings />
    <FAQs variant="programs" />
    <ProgramNextStep />
  </InteriorPage>
}

type SubjectContent = { icon: typeof Check; subject: string; weightageBasis: string; weightages: { label: string; percentage: string; chapters: string[] }[]; objectives: string; approach: string; practice: string; assessment: string; outcomes: string }

function SubjectSection({ item, index }: { item: SubjectContent; index: number }) {
  const Icon = item.icon
  return <article className={`subject-section subject-theme-${index % 4}`} id={item.subject.toLowerCase().replace(/\s+/g, '-') }>
    <div className="subject-heading"><span className="subject-index">0{index + 1}</span><span className="subject-icon"><Icon size={23} /></span><div><h2>{item.subject}</h2></div></div>
    <div className="subject-weightage"><div className="subject-weightage-heading"><small>{item.weightageBasis}</small></div><div className="subject-weightage-list">{item.weightages.map(({ label, percentage, chapters }) => <article key={label}><div className="subject-weightage-top"><strong>{percentage}%</strong><h3>{label.replace(/\s*·\s*[\d.]+%$/, '')}</h3></div><div className="subject-weightage-chapters">{chapters.map(chapter => <span key={chapter}><Check size={11} aria-hidden="true" />{chapter}</span>)}</div></article>)}</div></div>
  </article>
}

const preparationPillars = [
  { icon: Target, title: 'Preparation objectives', text: 'Set clear subject priorities and know what each study block is working towards.' },
  { icon: BookOpenCheck, title: 'Learning approach', text: 'Build concepts with structured explanations, examples and focused revision.' },
  { icon: NotebookPen, title: 'Practice strategy', text: 'Move from topic practice to board-style questions and complete papers.' },
  { icon: ClipboardCheck, title: 'Assessment methodology', text: 'Use regular checks and mock tests to spot what needs another look.' },
  { icon: Trophy, title: 'Learning outcomes', text: 'Develop clearer recall, stronger exam habits and a more confident approach.' },
]

function PreparationFramework() {
  return <section className="preparation-framework" aria-labelledby="preparation-framework-title">
    <div className="preparation-framework-heading"><span className="public-card-eyebrow">ONE FRAMEWORK · EVERY SUBJECT</span><h2 id="preparation-framework-title">How preparation moves forward.</h2><p>Each subject follows the same thoughtful rhythm, with the examples, practice and revision tailored to its syllabus.</p></div>
    <div className="preparation-framework-grid">{preparationPillars.map(({ icon: Icon, title, text }, index) => <article className="preparation-pillar" key={title}><span className="preparation-pillar-icon"><Icon size={19} /></span><span className="preparation-pillar-index">0{index + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
  </section>
}

const coursePhases = [
  { phase: 'Foundation', title: 'Diagnostic Assessment & Planning', icon: ClipboardCheck, detail: 'Understand the starting point and set subject priorities for a focused preparation period.', checkpoints: ['Review current understanding', 'Set subject priorities', 'Plan around the finalized timetable'] },
  { phase: 'Learn', title: 'Structured Learning & Concept Building', icon: BookOpenCheck, detail: 'Build concepts through structured lessons, examples and purposeful revision.', checkpoints: ['Learn through clear explanations', 'Revisit key ideas', 'Build a steady subject-wise rhythm'] },
  { phase: 'Practise', title: 'Practice, Application & Revision', icon: RefreshCw, detail: 'Apply learning in board-style practice and use revision to address areas that need attention.', checkpoints: ['Practise topic by topic', 'Review errors and misconceptions', 'Choose focused revision priorities'] },
  { phase: 'Assess', title: 'Subject-wise Mock Tests', icon: FileText, detail: 'Bring each subject together in complete-paper practice and review pacing and responses.', checkpoints: ['Practise complete subject papers', 'Review response structure', 'Identify what to consolidate'] },
  { phase: 'Refine', title: 'Full-syllabus Mocks & Final Preparation', icon: Trophy, detail: 'Use full-syllabus practice to bring topics together and guide final revision.', checkpoints: ['Attempt full-syllabus mocks', 'Review timing and question choices', 'Keep final revision focused'] },
]

function CourseEnrollmentBand({ grade }: { grade: 'CLASS 10' | 'CLASS 12' }) {
  return <section className="course-enrol-band"><div className="page-wrap course-enrol-inner"><div className="course-enrol-copy"><span className="course-enrol-kicker"><i /> {grade} · 75-DAY PROGRAM</span><h2>A focused cohort for your next 75 days.</h2><p>Planned for {bootcampDates.start} through {bootcampDates.completion}. Review the weekly timetable and current learning-mode availability below.</p><div className="course-enrol-actions"><Link className="button button-gold" to={`/enrol?program=${grade === 'CLASS 10' ? 'class-10' : 'class-12'}`}>Enrol Now <ArrowRight size={16} /></Link><a className="course-enrol-secondary" href="#course-roadmap">Explore the roadmap <ArrowUpRight size={15} /></a></div></div>{campaign.batchCapacity > 0 && <div className="course-seat-card"><div className="course-seat-orbit"><span>COHORT</span><strong>{campaign.batchCapacity}</strong><small>MAX</small></div><div className="course-seat-detail"><span>BATCH CAPACITY</span><strong>Maximum {campaign.batchCapacity} students</strong><small>Ask about current availability</small></div></div>}</div></section>
}

function CourseRoadmap({ grade }: { grade: 'CLASS 10' | 'CLASS 12' }) {
  const pathway = grade === 'CLASS 10' ? 'Mathematics, Science, Social Science and English' : 'Physics and Chemistry, plus the selected Mathematics or Biology pathway'
  return <section id="course-roadmap" className="public-section course-roadmap-section"><div className="page-wrap"><div className="course-section-heading"><span className="public-card-eyebrow">THE 75-DAY PLAN · {grade}</span><h2>Every phase has a purpose.</h2><p>Across {pathway}, the preparation framework moves from clarity to practice and full-paper readiness. The subject allocation and academic schedule will follow the finalized faculty timetable.</p></div><div className="course-roadmap-grid">{coursePhases.map(({ phase, title, icon: Icon, detail, checkpoints }, index) => <article className={`course-phase-card course-phase-${index + 1}`} key={phase}><div className="course-phase-top"><span>PHASE 0{index + 1}</span><span>{phase}</span></div><span className="course-phase-icon"><Icon size={20} /></span><h3>{title}</h3><p>{detail}</p><ul>{checkpoints.map(item => <li key={item}><Check size={14} />{item}</li>)}</ul></article>)}</div><article className="roadmap-success-card"><span className="roadmap-success-icon"><Trophy size={24} /></span><div><span className="roadmap-success-kicker">THE FINAL PREPARATION STAGE</span><h3>Practise the full paper with a plan.</h3><p>Bring learning, revision and mock-test practice together for a calmer, more considered final preparation.</p></div><span className="roadmap-success-mark"><Check size={22} /></span></article><div className="schedule-note"><CalendarDays size={19} /><p><strong>Timetable note</strong>The phase sequence is a preparation framework; the academic schedule follows the finalized faculty timetable.</p></div></div></section>
}

function CourseMethodology({ grade }: { grade: 'CLASS 10' | 'CLASS 12' }) {
  const steps = grade === 'CLASS 10' ? [
    { icon: BookOpenCheck, name: 'Make each subject concrete', text: 'Move from worked Mathematics and Science examples to clear timelines, maps, source work and structured English responses.' },
    { icon: RefreshCw, name: 'Recall across four subjects', text: 'Use short retrieval checks and planned revisits to keep concepts active beyond a single lesson.' },
    { icon: Target, name: 'Progress from topic to mixed practice', text: 'Start with focused questions, then combine topics and practise showing working, reasoning and answer structure.' },
    { icon: ClipboardCheck, name: 'Review the paper, then refine', text: 'Topic tests and complete-subject mocks help students identify what to revisit and practise pacing.' },
  ] : [
    { icon: BookOpenCheck, name: 'Connect concepts to application', text: 'Build from Physics principles and Chemistry concepts into worked examples, equations, calculations and explanations.' },
    { icon: RefreshCw, name: 'Keep the chosen pathway active', text: 'Revisit Mathematics methods or Biology terminology, processes and diagrams alongside the shared Physics and Chemistry subjects.' },
    { icon: Target, name: 'Practise the subject’s thinking', text: 'Use numerical and conceptual problem solving for Physics, equation and application practice for Chemistry, then pathway-specific questions.' },
    { icon: ClipboardCheck, name: 'Use mocks to direct revision', text: 'Topic checks and complete-subject mocks help students review accuracy, working, response structure and time use.' },
  ]
  return <section className="public-section course-method-section"><div className="page-wrap"><div className="course-method-layout"><div className="course-method-intro"><span className="public-card-eyebrow">STRATEGY & METHODOLOGY</span><h2>Make each study session move preparation forward.</h2><p>For {grade}, the aim is to pair clear teaching with deliberate practice, spaced review and useful reflection—without promising a particular score or outcome.</p><span className="method-principle-note"><ShieldCheck size={18} /> Preparation is adapted to each subject and the confirmed board syllabus.</span></div><div className="course-method-steps">{steps.map(({ icon: Icon, name, text }, i) => <article className="course-method-step" key={name}><span className="course-method-number">0{i + 1}</span><span className="course-method-icon"><Icon size={19} /></span><div><h3>{name}</h3><p>{text}</p></div></article>)}</div></div></div></section>
}

const courseEvidence = [
  { icon: FileText, title: 'Sample notes & worksheets', detail: 'Add a representative, faculty-approved sample so families can preview the learning materials.' },
  { icon: ClipboardCheck, title: 'Sample mock test', detail: 'Add a board-style sample paper and answer guidance supplied by Radix Minds.' },
  { icon: MessageCircle, title: 'Parent communication', detail: 'Confirm how families receive program updates and who they can contact.' },
  { icon: RefreshCw, title: 'Student progress updates', detail: 'Confirm what assessment feedback is shared with students and parents, and how often.' },
]

function CourseEvidenceSection({ grade }: { grade: 'CLASS 10' | 'CLASS 12' }) {
  return <section className="public-section course-evidence-section"><div className="page-wrap"><div className="course-section-heading"><span className="public-card-eyebrow">PROGRAM MATERIALS & FAMILY UPDATES</span><h2>See what preparation looks like.</h2><p>Radix Minds can add approved samples and confirm the communication process here as those details are finalized.</p></div><div className="public-feature-grid public-feature-grid-2">{courseEvidence.map(({ icon: Icon, title, detail }) => <article className="public-feature-card course-evidence-card" key={title}><span className="public-feature-icon"><Icon size={20} /></span><span className="public-card-eyebrow">RADIX MINDS CONTENT NEEDED · {grade}</span><h3>{title}</h3><p>{detail}</p></article>)}</div></div></section>
}

const courseFaqs: Record<'CLASS 10' | 'CLASS 12', [string, string][]> = {
  'CLASS 10': [
    ['I feel behind in one or more subjects. Where do I start?', 'The proposed first phase begins with a diagnostic assessment and planning. It is intended to help students and teachers identify priorities before moving through the remaining preparation phases.'],
    ['How are the four Class 10 subjects handled?', 'Mathematics, Science, Social Science and English each have subject objectives, guided learning, topic-wise practice and assessment. The exact subject timetable will be shared after faculty allocations are finalized.'],
    ['Will I only revise notes?', 'No. Notes support revision, while the program also includes structured lectures, topic-wise practice, subject mock tests and full-syllabus mock tests.'],
    ['What if a mock test shows that I need more work?', 'A mock is a checkpoint, not a verdict. Reviewing the responses can help students choose the next topic, concept or exam skill to revisit. Outcomes vary by student; results are not guaranteed.'],
    ['Can my parent ask about the plan before I enrol?', 'Yes. Students and parents can contact the Radix Minds team to discuss the timetable, learning arrangements, fees, offer terms and current seat availability.'],
    ['What is the Class 10 weekly class schedule?', 'Monday to Saturday, Mathematics and Science meet in the 4:00–6:30 PM block on alternate days, with SST and English in the 6:30–8:00 PM block. Sunday practice and revision runs 10:00 AM–4:00 PM. Exact weekday assignments will be shared by the faculty team.'],
    ['Which learning modes are offered?', 'Online, hybrid and offline modes are shown only when configured as available for your selected batch. The exact hybrid classroom arrangement and offline venue are confirmed directly by Radix Minds.'],
    ['What happens after I enrol?', 'The team will contact you directly and share the academic communication details through WhatsApp or Telegram. Lectures, notes, schedules and other academic interactions are managed outside this website.'],
    ['Will I receive notes for all four subjects?', 'Study notes and revision materials are included as part of preparation. Ask the team to confirm the format, subject coverage and how materials will be shared for your batch.'],
    ['Do I need to finish the syllabus before joining?', 'The proposed roadmap starts with an assessment and planning phase. It is designed to help identify priorities, but the team should confirm current syllabus coverage and the finalized timetable for your batch.'],
    ['Is the chapter and marks information right for my board?', 'The subject pointers on this page refer to CBSE curriculum information. If you follow another board or session, contact the team to confirm the syllabus coverage before enrolling.'],
    ['How do I confirm the fee, offer and payment process?', 'The program fee is shown near the end of this page. The 80% offer and its validity are subject to confirmation. Contact Radix Minds to confirm the current fee, payment instructions and seat availability before paying.'],
  ],
  'CLASS 12': [
    ['How do I choose between Mathematics and Biology?', 'Physics and Chemistry are common to both options. Choose either Mathematics or Biology as the third subject pathway, matching your current Class 12 subjects. Contact the team if you need help confirming the selection.'],
    ['Will the preparation be specific to my chosen pathway?', 'Yes. The subject preparation sections describe separate learning and practice focuses for Mathematics and Biology. The timetable and final subject allocation will be confirmed by the faculty team.'],
    ['I am concerned about balancing concepts and numericals.', 'The proposed method moves from structured explanations and worked examples into topic-wise problem practice, followed by subject mock tests and review. The emphasis and practice formats vary by subject.'],
    ['How do mock tests help me prepare for the complete paper?', 'Topic-wise tests build practice in smaller parts, subject-wise mocks bring a subject together, and full-syllabus mocks provide a longer final practice run. Students should review attempts and use feedback to guide revision.'],
    ['Can parents confirm the pathway, fee and schedule first?', 'Yes. Contact the team before payment to confirm the selected Mathematics or Biology pathway, finalized timetable, current program fee, offer validity and seat availability.'],
    ['Can I switch from Mathematics to Biology after enrolling?', 'Please confirm your pathway before enrolment. Any pathway change depends on the batch timetable and faculty arrangements, so ask the team before making a selection or payment.'],
    ['What is the Class 12 weekly class schedule?', 'Weekday subject sessions run 4:00–8:00 PM, with Physics, Chemistry and the chosen Mathematics or Biology pathway planned for two days each. Sunday practice and revision runs 10:00 AM–4:00 PM. Exact weekday assignments will be shared by the faculty team.'],
    ['Which learning modes are offered?', 'Online, hybrid and offline modes are shown only when configured as available for your selected batch. The exact hybrid classroom arrangement and offline venue are confirmed directly by Radix Minds.'],
    ['What happens after I enrol?', 'The team will contact you directly and share academic communication details through WhatsApp or Telegram. Lectures, notes, schedules and other academic interactions are managed outside this website.'],
    ['Are revision notes included for Physics, Chemistry and my pathway?', 'Study notes and revision materials are part of the program. Ask the team to confirm the subject coverage, format and how resources will be shared with your batch.'],
    ['Does the program include practical or lab preparation?', 'This page describes theory preparation, practice and mock tests. Please contact the team to confirm whether practical or lab preparation is included for your subjects and board.'],
    ['Is this syllabus information suitable for my board and session?', 'The chapter and weighting pointers shown here refer to CBSE curriculum information. If you follow another board or session, ask the team to verify the syllabus alignment before enrolling.'],
    ['How do I confirm the fee, 80% offer and payment details?', 'The program fee is shown near the end of this page. Offer validity and payment instructions should be confirmed with Radix Minds before you pay. The team can also confirm current seat availability.'],
  ],
}

function CourseFAQs({ grade }: { grade: 'CLASS 10' | 'CLASS 12' }) {
  const questions = courseFaqs[grade]
  return <section className="faq-section section-pad course-faq-section"><div className="page-wrap faq-layout"><div className="faq-intro"><div className="faq-intro-panel"><span className="faq-panel-mark"><CircleHelp size={17} /> {grade} · GOOD TO KNOW</span><span className="faq-answer-count">PROGRAM GUIDE <b>{questions.length} answers</b></span><h2>Questions, answered<br /><em>with care.</em></h2><p>Understand the program details and talk with us about the parts that matter to you.</p><Link className="faq-cta" to="/contact">Ask the team <ArrowRight size={16} /></Link><span className="faq-panel-index">RADIX MINDS <i>·</i> BOARD BOOTCAMP</span></div></div><div className="faq-list">{questions.map(([question, answer], i) => <details className="faq-item" key={question} open={i === 0}><summary><span className="faq-number">{String(i + 1).padStart(2, '0')}</span><span>{question}</span><i /></summary><p>{answer}</p></details>)}</div></div></section>
}

function ProgramPriceFinale({ grade, index, program }: { grade: 'CLASS 10' | 'CLASS 12'; index: 0 | 1; program?: PublicProgram }) {
  const code: ProgramCode = index === 0 ? 'class-10' : 'class-12'
  return <section className="course-price-section"><div className="page-wrap"><div className="course-price-card"><div className="course-price-copy"><span><i /> YOUR NEXT STEP · {grade}</span><h2>Ready to begin with a clear plan?</h2><p>Review the program details, choose an available learning mode and confirm any remaining questions with Radix Minds before enrolment.</p><div className="course-price-badges"><span><Clock3 size={15} /> 75-day program</span>{campaign.batchCapacity > 0 && <span><UsersRound size={15} /> Maximum {campaign.batchCapacity} students per cohort</span>}{program?.discountPercent !== null && program?.discountPercent !== undefined && <span>{program.discountPercent}% OFF configured offer</span>}</div></div><div className="course-price-panel">{program?.discountPercent !== null && program?.discountPercent !== undefined && <span className="course-price-offer">{program.discountPercent}% OFF</span>}{program ? <><strong>{formatINR(program.payablePaise)}</strong><small>program fee · from current program configuration</small></> : <><strong>Fee details unavailable</strong><small>Contact the Radix Minds team to confirm current pricing.</small></>}<Link className="button button-gold" to={`/enrol?program=${code}`}>Enrol Now <ArrowRight size={16} /></Link></div></div></div></section>
}

const class10Subjects: SubjectContent[] = [
  { icon: Calculator, subject: 'Mathematics', weightageBasis: 'CLASS 10 MATHEMATICS · UNIT MARKS / 80 THEORY', weightages: [
    { label: 'Number Systems · 7.5%', percentage: '7.5', chapters: ['Real Numbers'] },
    { label: 'Algebra · 25%', percentage: '25', chapters: ['Polynomials', 'Pair of Linear Equations', 'Quadratic Equations', 'Arithmetic Progressions'] },
    { label: 'Coordinate Geometry · 7.5%', percentage: '7.5', chapters: ['Distance Formula', 'Section Formula'] },
    { label: 'Geometry · 18.75%', percentage: '18.75', chapters: ['Triangles', 'Circles'] },
    { label: 'Trigonometry · 15%', percentage: '15', chapters: ['Trigonometric Ratios', 'Heights & Distances'] },
    { label: 'Mensuration · 12.5%', percentage: '12.5', chapters: ['Areas Related to Circles', 'Surface Areas & Volumes'] },
    { label: 'Statistics & Probability · 13.75%', percentage: '13.75', chapters: ['Statistics', 'Probability'] },
  ], objectives: 'Revisit core concepts, methods, formula use and common board-style question types.', approach: 'Move from concept refreshers and worked examples into guided, independent problem solving.', practice: 'Build from topic-wise questions to mixed practice, showing clear steps and checking calculations.', assessment: 'Use topic-wise tests and complete-subject mock tests to practise timing and identify topics to revisit.', outcomes: 'Students should be better prepared to select an approach, show working clearly and review mistakes productively.' },
  { icon: FlaskConical, subject: 'Science', weightageBasis: 'CLASS 10 SCIENCE · UNIT MARKS / 80 THEORY', weightages: [
    { label: 'Chemical Substances · 31.25%', percentage: '31.25', chapters: ['Chemical Reactions & Equations', 'Acids, Bases & Salts', 'Metals & Non-metals', 'Carbon Compounds'] },
    { label: 'World of Living · 31.25%', percentage: '31.25', chapters: ['Life Processes', 'Control & Coordination', 'Reproduction'] },
    { label: 'Natural Phenomena · 15%', percentage: '15', chapters: ['Light', 'Reflection & Refraction', 'Human Eye'] },
    { label: 'Effects of Current · 16.25%', percentage: '16.25', chapters: ['Electricity', 'Magnetic Effects of Electric Current'] },
    { label: 'Natural Resources · 6.25%', percentage: '6.25', chapters: ['Our Environment'] },
  ], objectives: 'Strengthen understanding of key ideas, terminology, diagrams, formulas and applications across the sciences.', approach: 'Use structured explanations, examples and revision prompts to connect concepts with board-style questions.', practice: 'Practise definitions, explanations, diagrams, numerical questions and application questions as relevant to each topic.', assessment: 'Combine topic-wise tests with complete-subject mocks and use the results to guide further revision.', outcomes: 'Students should be able to explain concepts more clearly and practise applying them to varied question formats.' },
  { icon: Landmark, subject: 'Social Science', weightageBasis: 'CLASS 10 SOCIAL SCIENCE · AREA MARKS / 80 THEORY', weightages: [
    { label: 'History · 25%', percentage: '25', chapters: ['The Rise of Nationalism in Europe', 'Nationalism in India', 'The Making of a Global World', 'Print Culture'] },
    { label: 'Geography · 25%', percentage: '25', chapters: ['Resources & Development', 'Water Resources', 'Agriculture', 'Manufacturing Industries'] },
    { label: 'Political Science · 25%', percentage: '25', chapters: ['Power-sharing', 'Federalism', 'Political Parties', 'Outcomes of Democracy'] },
    { label: 'Economics · 25%', percentage: '25', chapters: ['Development', 'Sectors of the Indian Economy', 'Money & Credit', 'Globalisation · selected subtopics'] },
  ], objectives: 'Organise important themes, terms, events, processes and connections across the subject areas.', approach: 'Break content into clear themes and use concise notes, timelines and structured answer examples.', practice: 'Practise short and extended responses, source or data interpretation, and map work where relevant to the syllabus.', assessment: 'Use topic-wise checks and complete-subject mock tests to practise recall, structure and time allocation.', outcomes: 'Students should be better equipped to organise information and write focused, well-structured answers.' },
  { icon: Languages, subject: 'English', weightageBasis: 'CLASS 10 ENGLISH · SKILL MARKS / 80 THEORY', weightages: [
    { label: 'Reading Comprehension · 25%', percentage: '25', chapters: ['Comprehension', 'Inference', 'Interpretation', 'Vocabulary'] },
    { label: 'Writing Skills & Grammar · 25%', percentage: '25', chapters: ['Written Expression', 'Grammar in Context', 'Style & Format'] },
    { label: 'Language Through Literature · 50%', percentage: '50', chapters: ['Literary Understanding', 'Theme & Sub-theme', 'Reasoning', 'Text-based Responses'] },
  ], objectives: 'Strengthen reading comprehension, language use, literary understanding and written expression.', approach: 'Review question expectations and model clear responses, with attention to evidence, structure and accuracy.', practice: 'Practise reading tasks, grammar and writing formats alongside literature responses and revision.', assessment: 'Assess practice through topic exercises and complete-subject mocks, with time for review and refinement.', outcomes: 'Students should approach reading and writing tasks with clearer structure and more deliberate expression.' },
]

export function Class10Page() {
  const { programs, retry: retryProgramData } = useProgramCatalog()
  const program = programs.find(item => item.code === 'class-10')
  return <InteriorPage title="Class 10 Board Bootcamp" description="Explore the 75-day Class 10 program with a detailed subject plan, preparation roadmap, evidence-informed methodology, FAQs and fee details." eyebrow="CLASS 10 · 75 DAYS" headline="A focused final stretch, subject by subject." lead="Structured board preparation for Mathematics, Science, Social Science and English—with lessons, revision and practice brought into one plan." crumb="Class 10 Program" cta={false}>
    <CourseEnrollmentBand grade="CLASS 10" />
    <ProgramSelection onlyProgram="class-10" sectionId="class-10-program-comparison" eyebrow="YOUR CLASS 10 PROGRAM" title="Your preparation, built around Class 10." intro="Review the Class 10 subjects, current fee and available learning modes before continuing." />
    <section className="public-section public-course-summary"><div className="page-wrap course-summary-grid"><div><span className="public-card-eyebrow">WHY STRUCTURE MATTERS</span><h2>When time feels short, a clear sequence helps.</h2><p>Last-minute preparation can feel overwhelming when every subject competes for attention. A structured plan helps students move through learning, practice and revision in manageable steps. It supports preparation; it does not guarantee a particular exam result.</p><div className="course-summary-rhythm"><span>Learn with clarity</span><i /><span>Practise with purpose</span><i /><span>Revise with direction</span></div></div><div className="course-summary-stats course-summary-stats-2"><div><Clock3 /><b>75 days</b><span>A focused runway for board preparation</span></div><div><GraduationCap /><b>4 subjects</b><span>Mathematics · Science · Social Science · English</span></div><div><Target /><b>One clear rhythm</b><span>Lessons · Revision · Practice · Mock tests</span></div></div></div></section>
    <section className="public-section public-section-ivory"><div className="page-wrap"><div className="subject-intro"><SectionHeading eyebrow="CLASS 10 SUBJECTS" title="See the chapters. Understand the weighting." intro="Official unit and skill-section percentages show where the theory-paper marks sit; the chapter pointers make the coverage tangible." /></div><PreparationFramework /><div className="subject-sections">{class10Subjects.map((item, index) => <SubjectSection key={item.subject} item={item} index={index} />)}</div></div></section>
    <CourseRoadmap grade="CLASS 10" />
    <section className="public-section public-section-ivory"><div className="page-wrap"><WeeklyTimetable programCode="class-10" /><ProgramEnrollmentOptions programCode="class-10" program={program} onRetry={retryProgramData} /></div></section>
    <CourseMethodology grade="CLASS 10" />
    <CourseEvidenceSection grade="CLASS 10" />
    <CourseFAQs grade="CLASS 10" />
    <ProgramPriceFinale grade="CLASS 10" index={0} program={program} />
  </InteriorPage>
}

const class12Subjects: SubjectContent[] = [
  { icon: Atom, subject: 'Physics', weightageBasis: 'CLASS 12 PHYSICS · GROUPED UNIT MARKS / 70 THEORY', weightages: [
    { label: 'Electrostatics & Current Electricity · 22.9%', percentage: '22.9', chapters: ['Electric Charges & Fields', 'Electrostatic Potential & Capacitance', 'Current Electricity'] },
    { label: 'Magnetism & Electromagnetic Induction · 24.3%', percentage: '24.3', chapters: ['Moving Charges & Magnetism', 'Magnetism & Matter', 'Electromagnetic Induction', 'Alternating Current'] },
    { label: 'EM Waves & Optics · 25.7%', percentage: '25.7', chapters: ['Electromagnetic Waves', 'Ray Optics', 'Wave Optics'] },
    { label: 'Dual Nature, Atoms & Nuclei · 17.1%', percentage: '17.1', chapters: ['Dual Nature of Radiation & Matter', 'Atoms', 'Nuclei'] },
    { label: 'Electronic Devices · 10%', percentage: '10', chapters: ['Semiconductor Electronics'] },
  ], objectives: 'Strengthen conceptual understanding, formula use, units, diagrams and problem-solving across the selected syllabus.', approach: 'Connect core ideas to worked examples, then practise applying the relevant principles to new questions.', practice: 'Use topic-wise numerical and conceptual questions, followed by mixed board-style practice.', assessment: 'Topic-wise tests and subject-wise mock tests provide structured opportunities to practise and review.', outcomes: 'Students should be better prepared to choose relevant principles, show working and explain their reasoning.' },
  { icon: FlaskConical, subject: 'Chemistry', weightageBasis: 'CLASS 12 CHEMISTRY · OFFICIAL CHAPTER MARKS / 70 THEORY', weightages: [
    { label: 'Solutions · 10%', percentage: '10', chapters: ['Concentration', 'Solubility', 'Colligative Properties'] },
    { label: 'Electrochemistry · 12.9%', percentage: '12.9', chapters: ['Electrochemical Cells', 'Nernst Equation', 'Conductance'] },
    { label: 'Chemical Kinetics · 10%', percentage: '10', chapters: ['Reaction Rates', 'Rate Equations', 'Temperature Dependence'] },
    { label: 'd- and f-Block Elements · 10%', percentage: '10', chapters: ['Electronic Configuration', 'Transition Elements', 'Lanthanoids & Actinoids'] },
    { label: 'Coordination Compounds · 10%', percentage: '10', chapters: ['Nomenclature', 'Isomerism', 'Bonding'] },
    { label: 'Haloalkanes & Haloarenes · 8.6%', percentage: '8.6', chapters: ['Classification', 'C–X Bond', 'Chemical Reactions'] },
    { label: 'Alcohols, Phenols & Ethers · 8.6%', percentage: '8.6', chapters: ['Functional Groups', 'Properties', 'Reactions'] },
    { label: 'Aldehydes, Ketones & Carboxylic Acids · 11.4%', percentage: '11.4', chapters: ['Carbonyl Group', 'Preparation', 'Properties & Reactions'] },
    { label: 'Amines · 8.6%', percentage: '8.6', chapters: ['Classification', 'Structure', 'Reactions'] },
    { label: 'Biomolecules · 10%', percentage: '10', chapters: ['Carbohydrates', 'Proteins', 'Nucleic Acids'] },
  ], objectives: 'Revisit key concepts, equations, terminology, processes and calculation methods across the syllabus.', approach: 'Use clear explanations, worked examples and focused revision to connect related ideas.', practice: 'Practise balanced equations, numerical problems, explanations and application questions where relevant.', assessment: 'Topic-wise checks and subject-wise mocks help students rehearse question formats and identify revision priorities.', outcomes: 'Students should be able to organise concepts and present clearer, more complete responses.' },
  { icon: Calculator, subject: 'Mathematics', weightageBasis: 'CLASS 12 MATHEMATICS · UNIT MARKS / 80 THEORY', weightages: [
    { label: 'Relations & Functions · 10%', percentage: '10', chapters: ['Relations & Functions', 'Inverse Trigonometric Functions'] },
    { label: 'Algebra · 12.5%', percentage: '12.5', chapters: ['Matrices', 'Determinants'] },
    { label: 'Calculus · 43.75%', percentage: '43.75', chapters: ['Continuity & Differentiability', 'Applications of Derivatives', 'Integrals', 'Differential Equations'] },
    { label: 'Vectors & 3D Geometry · 17.5%', percentage: '17.5', chapters: ['Vector Algebra', 'Three-dimensional Geometry'] },
    { label: 'Linear Programming · 6.25%', percentage: '6.25', chapters: ['Linear Programming'] },
    { label: 'Probability · 10%', percentage: '10', chapters: ['Probability'] },
  ], objectives: 'Refresh core methods, formula application, multi-step reasoning and question selection.', approach: 'Move from guided examples to independent, timed problem solving and reflective review.', practice: 'Practise topic by topic, then combine concepts through mixed and board-style questions.', assessment: 'Use topic-wise tests and complete-subject mocks to practise accuracy, working and time allocation.', outcomes: 'Students should develop a more deliberate approach to solving and checking varied problems.' },
  { icon: BookOpenCheck, subject: 'Biology', weightageBasis: 'CLASS 12 BIOLOGY · UNIT MARKS / 70 THEORY', weightages: [
    { label: 'Reproduction · 22.9%', percentage: '22.9', chapters: ['Sexual Reproduction in Flowering Plants', 'Human Reproduction', 'Reproductive Health'] },
    { label: 'Genetics & Evolution · 28.6%', percentage: '28.6', chapters: ['Principles of Inheritance & Variation', 'Molecular Basis of Inheritance', 'Evolution'] },
    { label: 'Biology & Human Welfare · 17.1%', percentage: '17.1', chapters: ['Human Health & Disease', 'Microbes in Human Welfare'] },
    { label: 'Biotechnology · 17.1%', percentage: '17.1', chapters: ['Biotechnology: Principles & Processes', 'Biotechnology & its Applications'] },
    { label: 'Ecology & Environment · 14.3%', percentage: '14.3', chapters: ['Organisms & Populations', 'Ecosystem', 'Biodiversity & Conservation'] },
  ], objectives: 'Strengthen key concepts, scientific terminology, processes, diagrams and relationships between topics.', approach: 'Use structured explanations, labelled diagrams and concise revision prompts to organise learning.', practice: 'Practise diagram-based, explanatory and application questions, returning to topics that need more review.', assessment: 'Topic-wise tests and complete-subject mocks support practice across different question types.', outcomes: 'Students should be better prepared to recall concepts and explain biological processes with clearer structure.' },
]

export function Class12Page() {
  const { programs, retry: retryProgramData } = useProgramCatalog()
  const program = programs.find(item => item.code === 'class-12')
  const physicsChemistry = class12Subjects.slice(0, 2)
  const pathways = class12Subjects.slice(2)
  return <InteriorPage title="Class 12 Board Bootcamp" description="Explore the 75-day Class 12 board preparation program, choose a Mathematics or Biology pathway, and review its roadmap, methodology, FAQs and fee." eyebrow="CLASS 12 · 75 DAYS" headline="A focused plan for your chosen pathway." lead="Structured preparation in Physics and Chemistry, with a choice of Mathematics or Biology for the final subject pathway." crumb="Class 12 Program" cta={false}>
    <CourseEnrollmentBand grade="CLASS 12" />
    <ProgramSelection onlyProgram="class-12" sectionId="class-12-program-comparison" eyebrow="YOUR CLASS 12 PROGRAM" title="Your preparation, built around Class 12." intro="Review the Class 12 pathways, current fee and available learning modes before continuing." />
    <section className="public-section public-course-summary"><div className="page-wrap course-summary-grid"><div><span className="public-card-eyebrow">CHOOSE YOUR SUBJECT PATHWAY</span><h2>Physics + Chemistry + Mathematics or Biology.</h2><p>Class 12 students select either Mathematics or Biology as their pathway. The 75-day plan brings structured lessons, revision materials, topic-wise practice and subject-wise mocks together.</p><div className="pathway-choice"><Link to="#mathematics">Choose Mathematics <ArrowRight size={15} /></Link><Link to="#biology">Choose Biology <ArrowRight size={15} /></Link></div><div className="course-summary-rhythm"><span>Learn with clarity</span><i /><span>Practise with purpose</span><i /><span>Revise with direction</span></div></div><div className="course-summary-stats course-summary-stats-2"><div><Clock3 /><b>75 days</b><span>A focused runway for board preparation</span></div><div><GraduationCap /><b>3 subjects</b><span>Physics · Chemistry · selected pathway</span></div><div><Target /><b>One clear rhythm</b><span>Lessons · Revision · Practice · Mock tests</span></div></div></div></section>
    <section className="public-section public-section-ivory"><div className="page-wrap"><SectionHeading eyebrow="SHARED SUBJECTS" title="Build a strong foundation." intro="Physics and Chemistry are included in both Class 12 pathways. See the official weighting alongside the chapters they cover." /><PreparationFramework /><div className="subject-sections subject-sections-compact">{physicsChemistry.map((item, index) => <SubjectSection key={item.subject} item={item} index={index} />)}</div><div className="pathway-divider"><span>THEN SELECT ONE PATHWAY</span><i /></div><div className="subject-sections">{pathways.map((item, index) => <SubjectSection key={item.subject} item={item} index={index + 2} />)}</div></div></section>
    <CourseRoadmap grade="CLASS 12" />
    <section className="public-section public-section-ivory"><div className="page-wrap"><WeeklyTimetable programCode="class-12" /><ProgramEnrollmentOptions programCode="class-12" program={program} onRetry={retryProgramData} /></div></section>
    <CourseMethodology grade="CLASS 12" />
    <CourseEvidenceSection grade="CLASS 12" />
    <CourseFAQs grade="CLASS 12" />
    <ProgramPriceFinale grade="CLASS 12" index={1} program={program} />
  </InteriorPage>
}

const methodSteps = [
  { icon: BookOpenCheck, number: '01', name: 'Learn', title: 'Structured teaching', text: 'Build a clear understanding of selected subject concepts through structured, comprehensive lectures.' },
  { icon: Target, number: '02', name: 'Practise', title: 'Use what you learn', text: 'Apply concepts through guided questions and topic-wise practice in a board-focused format.' },
  { icon: NotebookPen, number: '03', name: 'Revise', title: 'Return to key ideas', text: 'Use study notes and revision materials to revisit concepts and strengthen recall.' },
  { icon: ClipboardCheck, number: '04', name: 'Assess', title: 'Practise under exam conditions', text: 'Topic-wise, subject-wise and full-syllabus mock tests offer structured assessment opportunities.' },
  { icon: Trophy, number: '05', name: 'Improve', title: 'Choose the next revision step', text: 'Use test review to notice strengths, identify areas to revisit and guide the next stage of preparation.' },
]

export function MethodologyPage() {
  return <InteriorPage title="Teaching Methodology" description="Learn how the Radix Minds bootcamp combines structured teaching, practice, revision, mock tests and performance improvement." eyebrow="TEACHING METHODOLOGY" headline="Learn with clarity. Practise with purpose." lead="A considered preparation rhythm brings learning, practice, revision and assessment into one connected approach." crumb="Teaching Methodology">
    <section className="public-section public-section-ivory"><div className="page-wrap"><div className="methodology-page-grid"><div className="methodology-side-note"><span className="public-card-eyebrow">OUR PREPARATION CYCLE</span><h2>Every step gives the next one direction.</h2><p>Practice is part of preparation. Assessment is a guide for what to revisit. Learning remains the focus throughout.</p><Link className="text-link" to="/mock-tests">Explore mock tests <ArrowUpRight size={15} /></Link></div><div className="methodology-steps">{methodSteps.map(({ icon: Icon, number, name, title, text }) => <article className="methodology-step" key={number}><span className="methodology-step-number">{number}</span><span className="methodology-step-icon"><Icon size={19} /></span><div><span className="public-card-eyebrow">{name}</span><h3>{title}</h3><p>{text}</p></div></article>)}</div></div></div></section>
  </InteriorPage>
}

const assessmentTypes = [
  { icon: Target, title: 'Topic-wise tests', text: 'Shorter practice checkpoints help students apply learning topic by topic and notice what may need another review.' },
  { icon: ClipboardCheck, title: 'Subject-wise tests', text: 'Complete-subject mock tests bring the subject together and help students practise a longer board-style paper.' },
  { icon: Trophy, title: 'Full-syllabus mock tests', text: 'Full-syllabus practice brings topics together across the complete subject for final preparation.' },
  { icon: FileText, title: 'Online and offline options', text: 'Available testing formats can include online and offline options. The team will confirm the format and arrangements for each cohort.' },
]

export function MockTestsPage() {
  return <InteriorPage title="Mock Tests & Assessment" description="Learn about topic-wise, subject-wise and full-syllabus mock tests, assessment and online or offline testing options." eyebrow="PRACTICE & ASSESSMENT" headline="A mock test is a starting point, not a verdict." lead="Practice helps students become familiar with board-style questions and decide what to revisit next." crumb="Mock Tests & Assessment">
    <section className="public-section public-assessment"><div className="page-wrap"><div className="assessment-note"><span><ClipboardCheck size={21} /></span><div><b>Practice. Review. Refine.</b><p>Assessment is used as a preparation tool to guide revision—not as a guarantee of exam results.</p></div></div><div className="public-feature-grid public-feature-grid-2">{assessmentTypes.map(({ icon, title, text }, i) => <FeatureCard key={title} icon={icon} eyebrow={`ASSESSMENT FORMAT 0${i + 1}`} title={title} text={text} />)}</div></div></section>
    <section className="public-section public-section-ivory"><div className="page-wrap assessment-flow"><SectionHeading eyebrow="HOW TO USE A PRACTICE TEST" title="Let the result guide your next step." intro="A useful mock test creates a clear moment to pause and reflect." /><ol className="assessment-flow-items"><li><b>01</b>Attempt the test</li><li><b>02</b>Review performance</li><li><b>03</b>Identify mistakes and weak topics</li><li><b>04</b>Practise targeted questions</li><li><b>05</b>Track improvement</li></ol></div></section>
  </InteriorPage>
}

const facultyPlaceholders = [
  { subject: 'Mathematics', line: 'Subject faculty profile' },
  { subject: 'Science · Physics · Chemistry', line: 'Subject faculty profile' },
  { subject: 'Social Science · Biology', line: 'Subject faculty profile' },
  { subject: 'English', line: 'Subject faculty profile' },
]

export function FacultyPage() {
  return <InteriorPage title="Faculty" description="Faculty profiles will be published after Radix Minds confirms names, subject responsibilities and qualifications." eyebrow="FACULTY INFORMATION" headline="Meet the teachers behind your preparation." lead="Faculty names, subject responsibilities and verified qualifications will be added when confirmed by Radix Minds." crumb="Faculty">
    <section className="public-section public-faculty"><div className="page-wrap"><div className="faculty-page-note"><span><UsersRound size={24} /></span><div><span className="public-card-eyebrow">FACULTY PROFILES</span><h2>Profiles will be shared once confirmed.</h2><p>We will publish each teacher’s name, subject responsibilities and verified qualifications after the faculty timetable is finalized.</p></div></div><div className="faculty-placeholder-grid">{facultyPlaceholders.map((item, i) => <article className="faculty-placeholder" key={item.subject}><span className="faculty-placeholder-number">0{i + 1}</span><span className="faculty-placeholder-icon"><GraduationCap size={21} /></span><span className="public-card-eyebrow">{item.line}</span><h3>{item.subject}</h3><p>Teacher profile to be confirmed</p></article>)}</div></div></section>
  </InteriorPage>
}

export function FAQsPage() {
  return <InteriorPage title="FAQs" description="Find answers about the 75-day program, subjects, fees, learning mode, materials, mock tests, enrolment, payment and student communication." eyebrow="BEFORE YOU BEGIN" headline="Good questions make clear decisions." lead="Explore answers for students and families planning the final stretch before board exams." crumb="FAQs" cta={false}>
    <FAQs />
    <section className="public-section public-faq-note"><div className="page-wrap"><div><MessageCircle size={22} /><p>Still deciding what is right for your student?</p></div><Link to="/contact">Talk to the Radix Minds team <ArrowRight size={16} /></Link></div></section>
  </InteriorPage>
}

export function ContactPage() {
  const whatsapp = campaign.contact.whatsappPhone.replace(/\D/g, '')
  return <InteriorPage title="Contact Radix Minds" description="Contact the Radix Minds 75-Day Board Bootcamp team in Bokaro by phone, WhatsApp, Telegram or email." eyebrow="CONTACT & ENROLMENT" headline="Let’s make the next step clear." lead="Talk with the team about the program, current availability, the academic timetable and enrolment." crumb="Contact" cta={false}>
    <section className="public-section public-contact"><div className="page-wrap public-contact-grid"><div className="public-contact-copy"><span className="public-card-eyebrow">NOW IN BOKARO</span><h2>Speak with the team before you decide.</h2><p>Ask about the right class program, subjects, program fee, schedule or how communication works after enrolment.</p><div className="contact-location-card"><MapPin size={19} /><div><b>{campaign.businessAddress}</b><span>Radix Minds 75-Day Board Bootcamp</span></div></div><p className="contact-config-note">Current contact details are managed by Radix Minds and can be updated in the campaign configuration.</p></div><div className="public-contact-card"><span className="contact-panel-label">CONTACT OPTIONS</span>{campaign.contact.phones.map(phone => <a key={phone} href={`tel:${phone.replace(/\s/g, '')}`}><span><Phone size={17} /></span><div><small>CALL US</small><strong>{phone}</strong></div><ArrowUpRight size={15} /></a>)}<a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer"><span><MessageCircle size={17} /></span><div><small>WHATSAPP</small><strong>Message our team</strong></div><ArrowUpRight size={15} /></a><a href={campaign.contact.telegramUrl} target="_blank" rel="noreferrer"><span><Send size={17} /></span><div><small>TELEGRAM</small><strong>Connect with Radix Minds</strong></div><ArrowUpRight size={15} /></a><a href={`mailto:${campaign.contact.email}`}><span><Mail size={17} /></span><div><small>EMAIL</small><strong>{campaign.contact.email}</strong></div><ArrowUpRight size={15} /></a></div></div></section>
    <EnquiryForm />
  </InteriorPage>
}

function EnquiryForm() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    const formElement = event.currentTarget
    const data = new FormData(formElement)
    try {
      await api('/enquiries', { method: 'POST', body: JSON.stringify({ fullName: data.get('fullName'), mobile: data.get('mobile'), email: data.get('email') || '', programCode: data.get('programCode') || null, message: data.get('message'), consent: data.get('consent') === 'on' }) })
      setSuccess(true); setMessage('Thank you. Your enquiry is with Radix Minds. The team will follow up using the contact details you shared.'); formElement.reset()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'We could not send the enquiry. Please try again or contact the team directly.') }
    finally { setBusy(false) }
  }
  return <section className="public-section public-enquiry"><div className="page-wrap enquiry-layout"><div><span className="public-card-eyebrow">A QUESTION BEFORE YOU DECIDE?</span><h2>We’re here to help you choose with clarity.</h2><p>Leave your details and the Radix Minds team can follow up about program fit, availability and enrolment.</p></div><form onSubmit={submit} className="enquiry-form"><div className="enquiry-fields"><label>Student or parent name<input name="fullName" required minLength={2} maxLength={120} autoComplete="name" /></label><label>Mobile number<input name="mobile" type="tel" inputMode="tel" required pattern="(?:\\+91[ -]?)?[6-9][0-9]{9}" title="Enter a valid Indian mobile number, with or without +91." placeholder="10-digit Indian number" autoComplete="tel" /></label><label>Email address <small>Optional</small><input name="email" type="email" maxLength={180} autoComplete="email" /></label><label>Program <small>Optional</small><select name="programCode" defaultValue=""><option value="">Select a class</option><option value="class-10">Class 10</option><option value="class-12">Class 12</option></select></label><label className="enquiry-message-field">How can we help?<textarea name="message" minLength={4} maxLength={2000} required rows={3} /></label></div><label className="enquiry-consent"><input name="consent" type="checkbox" required />I agree that Radix Minds may contact me about this enquiry.</label>{error && <p role="alert" className="enquiry-error">{error}</p>}{success && <p role="status" className="enquiry-success">{message}</p>}<button className="button button-gold" disabled={busy}>{busy ? 'Sending…' : 'Send enquiry'} <ArrowRight size={16} /></button></form></div></section>
}

export function NotFoundPage() {
  return <InteriorPage title="Page not found" description="This Radix Minds page could not be found." eyebrow="PAGE NOT FOUND" headline="Let’s find your way back." lead="The page may have moved. Continue from the homepage or explore the bootcamp programs." crumb="Not found"><section className="public-section"><div className="page-wrap"><Link className="button button-gold" to="/">Back to home <ArrowRight size={16} /></Link></div></section></InteriorPage>
}
