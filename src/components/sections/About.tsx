import { ArrowUpRight, BookOpenCheck, Crosshair, Repeat2 } from 'lucide-react'
import { SectionHeading } from '../SectionHeading'

const pillars = [
  { icon: Crosshair, n: '01', title: 'Know what comes next', text: 'A proposed sequence helps students organise the final preparation stretch around clear subject priorities.' },
  { icon: BookOpenCheck, n: '02', title: 'Understand before moving on', text: 'Structured lessons and worked examples help bring key concepts into focus before practice.' },
  { icon: Repeat2, n: '03', title: 'Learn from each attempt', text: 'Topic practice and mock tests create useful checkpoints for review and further revision.' },
]

export function About() {
  return <section className="about-section section-pad" id="about">
    <div className="page-wrap about-layout">
      <div className="about-heading"><SectionHeading eyebrow="WHY 75 DAYS?" title="A clearer plan for the final stretch." intro="When board exams feel close, structure can help students decide what to learn, practise and revisit—one focused phase at a time." />
        <a className="text-link" href="/teaching-methodology">Our preparation philosophy <ArrowUpRight size={15} /></a>
      </div>
      <div className="pillars">{pillars.map(({ icon: Icon, n, title, text }) => <article className="pillar" key={n}><div className="pillar-top"><Icon size={20} strokeWidth={1.6} /><span>{n}</span></div><h3>{title}</h3><p>{text}</p></article>)}</div>
    </div>
    <div className="challenge-band"><div className="page-wrap challenge-inner"><span className="eyebrow eyebrow-gold"><i />THE PREPARATION CHALLENGE</span><p>More than studying more.<br /><em>It’s studying with direction.</em></p><div className="challenge-aside">Unclear priorities <b>→</b> a defined study sequence<br />Uneven practice <b>→</b> topic and subject checkpoints<br />Exam anxiety <b>→</b> familiar board-style practice</div></div></div>
  </section>
}
