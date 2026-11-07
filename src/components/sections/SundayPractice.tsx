import { BookOpenCheck, CalendarDays, ChartNoAxesColumnIncreasing, CircleHelp, Clock3, PencilLine } from 'lucide-react'

const highlights = [
  { Icon: BookOpenCheck, title: 'Weekly revision' },
  { Icon: PencilLine, title: 'Question practice' },
  { Icon: CircleHelp, title: 'Dedicated doubt clearing' },
  { Icon: ChartNoAxesColumnIncreasing, title: 'Performance review' },
]

export function SundayPractice() {
  return <section className="sunday-practice-section" id="sunday" aria-labelledby="sunday-title">
    <div className="page-wrap sunday-practice-layout">
      <div className="sunday-practice-copy">
        <span className="eyebrow eyebrow-gold"><i />A WEEKLY SPACE TO RESET AND REFINE</span>
        <h2 id="sunday-title">Every Sunday.<br /><em>A step closer to greater confidence.</em></h2>
        <p>Use your Sundays to strengthen understanding, solve important questions, clarify doubts and review your learning progress.</p>
        <p className="sunday-learning-note">A dedicated weekly session to revisit key ideas, work through questions and decide what to practise next.</p>
        <div className="sunday-highlights">{highlights.map(({ Icon, title }) => <div key={title}><Icon size={17} /><span>{title}</span></div>)}</div>
      </div>
      <aside className="sunday-time-card" aria-label="Sunday session time">
        <CalendarDays size={22} />
        <span>SUNDAY</span>
        <strong><Clock3 size={20} />10:00 AM <i>—</i> 4:00 PM</strong>
        <small>Dedicated practice, revision &amp; doubt clearing</small>
      </aside>
    </div>
  </section>
}
