import { ArrowUpRight, BookOpenCheck, CalendarDays, CircleHelp, ClipboardCheck, CreditCard, HeartHandshake } from 'lucide-react'
import { SectionHeading } from '../SectionHeading'

export function ParentTrust() {
  const points = [
    { Icon: BookOpenCheck, text: 'Clear programme and subject information.' },
    { Icon: CalendarDays, text: 'A published class timetable and defined preparation roadmap.' },
    { Icon: ClipboardCheck, text: 'Practice and assessment structure explained before you decide.' },
    { Icon: CreditCard, text: 'Transparent programme fees and three learning modes.' },
    { Icon: CircleHelp, text: 'A team available for programme-related questions.' },
  ]
  return <section className="parent-section section-pad"><div className="page-wrap parent-layout"><div className="parent-mark"><div className="parent-mark-circle"><HeartHandshake size={33} strokeWidth={1.3} /></div><span>CLARITY FOR<br />THE WHOLE FAMILY</span></div>
    <div className="parent-copy"><SectionHeading eyebrow="FOR PARENTS & FAMILIES" title="A more structured preparation journey. Greater clarity for you as a parent." intro="We understand that board examinations matter to the entire family. You want your child to prepare sincerely, understand their subjects and approach examinations with confidence." />
      <div className="parent-points">{points.map(({ Icon, text }) => <div key={text}><Icon size={18} /><span>{text}</span></div>)}</div>
      <a href="/contact" className="text-link">Questions? Speak with us <ArrowUpRight size={15} /></a>
    </div></div></section>
}
