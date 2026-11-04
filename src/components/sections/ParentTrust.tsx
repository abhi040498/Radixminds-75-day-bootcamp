import { ArrowUpRight, HeartHandshake, ShieldCheck, Waypoints } from 'lucide-react'
import { SectionHeading } from '../SectionHeading'

export function ParentTrust() {
  return <section className="parent-section section-pad"><div className="page-wrap parent-layout"><div className="parent-mark"><div className="parent-mark-circle"><HeartHandshake size={33} strokeWidth={1.3} /></div><span>BUILT AROUND<br />A CLEARER PLAN</span></div>
    <div className="parent-copy"><SectionHeading eyebrow="PEACE OF MIND FOR FAMILIES" title="Why parents trust Radix Minds." intro="A clear preparation plan, transparent program details and a team families can speak with before they decide." />
      <div className="parent-points"><div><ShieldCheck size={18} /><span>Know the subjects, duration and fee before enrolling.</span></div><div><Waypoints size={18} /><span>See how the 75-day plan moves from revision to mock tests.</span></div><div><HeartHandshake size={18} /><span>Speak with the team to ask questions and understand next steps.</span></div></div>
      <a href="/contact" className="text-link">Questions? Speak with us <ArrowUpRight size={15} /></a>
    </div></div></section>
}
