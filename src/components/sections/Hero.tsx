import { ArrowDown, ArrowRight, UsersRound } from 'lucide-react'
import { StudyIllustration } from '../StudyIllustration'
import { campaign } from '../../data/campaign'

export function Hero() {
  return <section className="hero" id="home">
    <div className="hero-grain" />
    <div className="hero-inner page-wrap">
      <div className="hero-copy">
        <p className="hero-kicker">“Worried about your Class 10 or 12 board exams? With us, you don’t have to face them alone.”</p>
        <h1><span className="hero-dayline">Make Your</span><br /><span>Next 75 Days</span><br /><i>Count.</i></h1>
        <p className="hero-subtitle">Prepare with clarity. Practise with purpose. Move towards your best performance.</p>
        <p className="hero-description">A structured 75-day board preparation program designed to help Class 10 and Class 12 students strengthen concepts, revise strategically and practise with confidence.</p>
        <div className="hero-actions">
          <a className="button button-gold" href="#programs">Explore Programs <ArrowRight size={17} /></a>
          <a className="button button-text-light" href="#roadmap">Discover the 75-Day Roadmap <ArrowDown size={16} /></a>
        </div>
        <div className="hero-tags"><span>CLASS 10</span><b>·</b><span>CLASS 12</span><b>·</b><span>75-DAY PROGRAM</span></div>
        <div className="hero-cohort-note"><span><UsersRound size={15} /> Maximum {campaign.batchCapacity} students per cohort</span><i /><span>Ask the team about current availability</span></div>
      </div>
      <div className="hero-art-wrap"><StudyIllustration /></div>
    </div>
    <div className="hero-bottomline"><span>RADIX MINDS</span><span>BOARD BOOTCAMP <i>—</i> BOKARO</span><a href="#about" aria-label="Scroll to learn about the bootcamp"><ArrowDown size={15} /></a></div>
  </section>
}
