import { ArrowRight, CircleHelp } from 'lucide-react'

const homeQuestions = [
  ['Who can join the 75-day bootcamp?', 'The bootcamp offers separate preparation programmes for students in Class 10 and Class 12.'],
  ['Is this suitable if my syllabus is unfinished?', 'The programme brings structured lessons, practice and revision into a defined preparation period. Ask the Radix Minds team whether the current batch plan fits your subjects and preparation needs; syllabus coverage follows the finalized teaching plan.'],
  ['Which subjects are covered in Class 10?', 'Mathematics, Science, Social Science and English.'],
  ['What are the Class 12 PCM and PCB options?', 'PCM includes Physics, Chemistry and Mathematics. PCB includes Physics, Chemistry and Biology. Choose one pathway.'],
  ['How are the 75 days structured?', 'The preparation moves through three broad phases: Build, Master and Perform. The published programme timetable guides the actual subject sessions.'],
  ['What does the 300-hour learning commitment include?', 'The 300 hours describe the guided learning journey across the programme, combining lessons, practice, assessments and revision support. No hour-by-hour allocation is stated here.'],
  ['Are Online, Hybrid and Offline academically identical?', 'Yes. All three modes follow the same academic structure, subjects, timetable, curriculum, faculty standards, materials, assessments, support and programme benefits. Only the method of participation differs.'],
  ['What is the weekly timetable?', 'Class 10 weekday sessions are 4:00–6:30 PM for Mathematics and Science on alternate days, and 6:30–8:00 PM for Social Science and English. Class 12 weekday sessions are 4:00–8:00 PM for Physics, Chemistry and the selected Mathematics or Biology pathway on alternate days. Sunday sessions for both run 10:00 AM–4:00 PM for practice, revision and doubt clearing. Exact weekday subject allocation follows the finalized faculty timetable.'],
  ['Are mock tests and revision materials included?', 'The preparation includes topic-wise and subject/full-syllabus mock tests, along with study notes and revision materials for practice.'],
  ['How can I contact Radix Minds?', 'Call 9304829718 or email support@bootcamp.radixminds.in. You can also use the contact form to send a programme enquiry.'],
]

const programQuestions = [
  ['How do I know which program is right for me?', 'Choose the program for your current class. Class 10 covers Mathematics, Science, Social Science and English. Class 12 includes Physics and Chemistry, with a choice of Mathematics or Biology. Each program page explains the subjects and pathway in more detail.'],
  ['I am worried that I have fallen behind. Can I still join?', 'The bootcamp is designed to bring structure to a focused preparation period. It starts with assessment and planning, then moves through concept building, practice and mock tests. Speak with the team about your current preparation and the schedule before enrolling.'],
  ['Will I know what to focus on during the 75 days?', 'The proposed roadmap sequences preparation into clear phases, from diagnostic planning to full-syllabus mock tests. The final academic schedule will follow the finalized faculty timetable.'],
  ['How will the program help me practise for board exams?', 'Students work through topic-wise practice, subject-wise tests and full-syllabus mock tests. These are intended to help students become familiar with question formats, practise time management and identify areas to revisit.'],
  ['Will I receive notes and revision support?', 'Study notes and revision materials are included to support practice and review. The team will share details about how these materials are provided during enrolment.'],
  ['Who teaches the classes?', 'Classes are guided by experienced teachers. Faculty introductions and subject allocations will be shared by Radix Minds once the timetable is finalized; we do not publish unconfirmed profiles.'],
  ['Can I choose online, hybrid or offline learning?', 'All three options are available: Online live classes, Hybrid online and classroom participation, and Offline classroom training. They share the same academic program and published timetable. The team will coordinate Hybrid participation details.'],
  ['How can my parent or guardian understand the program?', 'Parents are welcome to discuss the subjects, roadmap, learning arrangements, fee and offer terms with the team before making an enrolment decision.'],
  ['Where can I see the program fee?', 'The current fee is listed on the individual Class 10 and Class 12 program pages. Confirm the final amount and current 80% offer terms with Radix Minds before payment.'],
  ['What happens after I enrol?', 'You receive an enrolment reference. Until payment is verified, the request remains pending payment and is not a confirmed paid enrolment. The team will share the next step and coordinate academic communication through official WhatsApp and Telegram channels.'],
]

export function FAQs({ variant = 'home' }: { variant?: 'home' | 'programs' }) {
  const questions = variant === 'programs' ? programQuestions : homeQuestions
  const title = variant === 'programs' ? <>Choose with<br />confidence.</> : <>Feel clear<br />before you <em>begin.</em></>
  const description = variant === 'programs'
    ? 'A few useful answers to help you choose a class pathway and understand how preparation is organised.'
    : 'Find the details students and parents need to make an informed decision about the bootcamp.'
  return <section className="faq-section section-pad" id="faqs"><div className="page-wrap faq-layout"><div className="faq-intro"><div className="faq-intro-panel"><span className="faq-panel-mark"><CircleHelp size={17} /> BEFORE YOU BEGIN</span><span className="faq-answer-count">A QUICK GUIDE <b>{questions.length} answers</b></span><h2>{title}</h2><p>{description}</p><a className="faq-cta" href="/contact">Still have a question? <ArrowRight size={16} /></a><span className="faq-panel-index">RADIX MINDS <i>·</i> BOARD BOOTCAMP</span></div></div><div className="faq-list">{questions.map(([q, a], i) => <details className="faq-item" key={q} open={i === 0}><summary><span className="faq-number">{String(i + 1).padStart(2, '0')}</span><span>{q}</span><i /></summary><p>{a}</p></details>)}</div></div></section>
}
