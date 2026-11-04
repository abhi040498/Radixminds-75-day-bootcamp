import { ArrowRight, CircleHelp } from 'lucide-react'

const homeQuestions = [
  ['What is the 75-Day Board Bootcamp?', 'A focused preparation program for Class 10 and Class 12 that brings structured lectures, revision notes, practice and mock tests together in a 75-day plan.'],
  ['Who can join, and which subjects are covered?', 'Class 10 includes Mathematics, Science, Social Science and English. Class 12 includes Physics, Chemistry and a choice of Mathematics or Biology.'],
  ['I feel behind in my preparation. Is it too late to start?', 'The bootcamp is designed for focused board preparation in a short timeframe. The roadmap moves through concept revision, topic-wise practice and mock tests. Contact the team to discuss whether the timing suits your student.'],
  ['What is included in the program fee?', 'The program includes structured lectures, study notes for revision and practice, topic-wise mock tests, complete subject mock tests, and final examination preparation.'],
  ['How are the 75 days organised?', 'The proposed roadmap moves from diagnostic assessment and planning (Days 1–7), to structured learning (Days 8–45), practice and revision (Days 46–60), subject-wise mock tests (Days 61–68), and full-syllabus mocks with final preparation (Days 69–75). The academic schedule is subject to the finalized faculty timetable.'],
  ['How do the mock tests work?', 'The preparation plan includes topic-wise tests, subject-wise mock tests and full-syllabus mock tests. Online or offline options and the timetable will be confirmed by the team.'],
  ['Can students study online or offline?', 'Online and offline testing options are available. Contact the team to confirm the current learning arrangements and what works for your student.'],
  ['How will I know my child’s progress?', 'Mock tests are part of the preparation plan. Please ask the team how test feedback and next steps will be shared with families.'],
  ['Will students get study notes?', 'Yes. Study notes and revision materials are included for revision and practice.'],
  ['Why is the cohort limited to 30 seats?', 'The cohort has a defined maximum capacity of 30 students. Contact the team to check current availability before enrolling.'],
  ['How do I enrol?', 'Choose the relevant class program, then contact Radix Minds. The team will confirm current availability, the program details and the next steps.'],
  ['How does payment work?', 'The team will share the confirmed fee and available payment instructions during enrolment. Please confirm offer availability and the final amount before paying.'],
  ['How will communication work after enrolment?', 'The team will coordinate academic communication with enrolled students through WhatsApp and Telegram. Details will be shared during enrolment.'],
  ['Do students need to join WhatsApp or Telegram?', 'Students will be asked to use the WhatsApp and Telegram communication channels shared by the Radix Minds team after enrolment.'],
  ['Is the 80% OFF offer for a limited time?', 'The 80% offer is presented as a limited-time promotion. Offer availability and validity can change, so confirm the current terms with the team before enrolling.'],
]

const programQuestions = [
  ['How do I know which program is right for me?', 'Choose the program for your current class. Class 10 covers Mathematics, Science, Social Science and English. Class 12 includes Physics and Chemistry, with a choice of Mathematics or Biology. Each program page explains the subjects and pathway in more detail.'],
  ['I am worried that I have fallen behind. Can I still join?', 'The bootcamp is designed to bring structure to a focused preparation period. It starts with assessment and planning, then moves through concept building, practice and mock tests. Speak with the team about your current preparation and the schedule before enrolling.'],
  ['Will I know what to focus on during the 75 days?', 'The proposed roadmap sequences preparation into clear phases, from diagnostic planning to full-syllabus mock tests. The final academic schedule will follow the finalized faculty timetable.'],
  ['How will the program help me practise for board exams?', 'Students work through topic-wise practice, subject-wise tests and full-syllabus mock tests. These are intended to help students become familiar with question formats, practise time management and identify areas to revisit.'],
  ['Will I receive notes and revision support?', 'Study notes and revision materials are included to support practice and review. The team will share details about how these materials are provided during enrolment.'],
  ['Who teaches the classes?', 'Classes are guided by experienced teachers. Faculty introductions and subject allocations will be shared by Radix Minds once the timetable is finalized; we do not publish unconfirmed profiles.'],
  ['Can I choose online or offline learning?', 'Online and offline testing options are available. Contact the team to confirm the current learning arrangements and what is available for your cohort.'],
  ['How can my parent or guardian understand the program?', 'Parents are welcome to discuss the subjects, roadmap, learning arrangements, fee and offer terms with the team before making an enrolment decision.'],
  ['Where can I see the program fee?', 'The current fee is listed on the individual Class 10 and Class 12 program pages. Confirm the final amount and current 80% offer terms with Radix Minds before payment.'],
  ['What happens after I enrol?', 'The team will confirm the next steps and coordinate academic communication with enrolled students through WhatsApp and Telegram.'],
]

export function FAQs({ variant = 'home' }: { variant?: 'home' | 'programs' }) {
  const questions = variant === 'programs' ? programQuestions : homeQuestions
  const title = variant === 'programs' ? <>Choose with<br />confidence.</> : <>Feel clear<br />before you <em>begin.</em></>
  const description = variant === 'programs'
    ? 'A few useful answers to help you choose a class pathway and understand how preparation is organised.'
    : 'Find the details students and parents need to make an informed decision about the bootcamp.'
  return <section className="faq-section section-pad" id="faqs"><div className="page-wrap faq-layout"><div className="faq-intro"><div className="faq-intro-panel"><span className="faq-panel-mark"><CircleHelp size={17} /> BEFORE YOU BEGIN</span><span className="faq-answer-count">A QUICK GUIDE <b>{questions.length} answers</b></span><h2>{title}</h2><p>{description}</p><a className="faq-cta" href="/contact">Still have a question? <ArrowRight size={16} /></a><span className="faq-panel-index">RADIX MINDS <i>·</i> BOARD BOOTCAMP</span></div></div><div className="faq-list">{questions.map(([q, a], i) => <details className="faq-item" key={q} open={i === 0}><summary><span className="faq-number">{String(i + 1).padStart(2, '0')}</span><span>{q}</span><i /></summary><p>{a}</p></details>)}</div></div></section>
}
