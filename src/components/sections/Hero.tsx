import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, Clock3, GraduationCap, Layers, Phone, Rocket, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StudyIllustration } from '../StudyIllustration'

const heroPoints = [
  { Icon: BookOpen, first: 'Structured', second: 'Classes' },
  { Icon: Target, first: 'Guided', second: 'Practice' },
  { Icon: ClipboardCheck, first: 'Mock', second: 'Tests' },
  { Icon: Layers, first: 'Revision &', second: 'Doubt Support' },
]

export function Hero() {
  return <section className="hero home-hero" id="home">
    <div className="hero-grain" />
    <div className="hero-inner page-wrap">
      <div className="hero-copy">
        <p className="hero-location"><CalendarDays size={19} aria-hidden="true" /> RADIX MINDS | 75-DAY BOARD BOOTCAMP</p>
        <h1 className="home-hero-title"><span>You Don’t Have to Face</span><span>Your Boards Alone.</span></h1>
        <p className="hero-subtitle">Let’s Turn Your Preparation Into Confidence.</p>
        <p className="hero-description">Whether you need to strengthen your concepts, complete your syllabus, improve your answer-writing skills or become more confident before the examination, we provide a structured preparation journey to help you move forward.</p>
        <div className="hero-point-list" aria-label="Bootcamp features">{heroPoints.map(({ Icon, first, second }) => <span key={first}><Icon size={34} strokeWidth={2.1} /><span>{first}<br />{second}</span></span>)}</div>
        <div className="hero-actions">
          <Link className="button button-gold" to="/programs">Explore Class 10 &amp; 12 Programmes <ArrowRight size={19} /></Link>
          <Link className="button button-text-light" to="/contact">Talk to Our Team <Phone size={16} /></Link>
        </div>
        <p className="hero-punchline"><Rocket size={20} aria-hidden="true" /> Your potential is there. Let’s prepare to bring it out.</p>
      </div>
      <div className="hero-art-wrap">
        <StudyIllustration />
        <div className="hero-quick-facts" aria-label="Programs and guided learning">
          <div><GraduationCap aria-hidden="true" /><strong>Class 10</strong></div>
          <div><GraduationCap aria-hidden="true" /><strong>Class 12</strong></div>
          <div><CalendarDays aria-hidden="true" /><strong>75</strong><span>Days</span></div>
          <div><Clock3 aria-hidden="true" /><strong>300</strong><span>Hours</span></div>
        </div>
      </div>
    </div>
  </section>
}
