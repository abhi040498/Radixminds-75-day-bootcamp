import { ArrowRight, Facebook, Instagram, Linkedin, Mail, MapPin, MessageCircle, Phone, Send, Youtube, ArrowUpRight } from 'lucide-react'
import { Brand } from '../Brand'
import { campaign } from '../../data/campaign'
import { Link, useLocation } from 'react-router-dom'

export function ContactCTA() {
  return <section className="final-cta home-final-cta" id="contact"><div className="cta-decor"/><div className="page-wrap cta-layout"><div className="cta-inner"><span className="eyebrow eyebrow-gold"><i />YOUR NEXT STEP STARTS HERE</span><h2>Your board exam journey<br /><em>starts with one decision.</em></h2><p className="home-cta-punchline">Prepare with purpose. Believe in your potential.</p><p>You don’t need to have everything figured out today. Start with a clear plan and take your preparation one step at a time.</p><div className="home-final-actions"><Link className="button button-gold" to="/programs">Explore Your Programme <ArrowRight size={17} /></Link><Link className="button button-outline-light" to="/contact">Talk to the Radix Minds Team <ArrowUpRight size={16} /></Link></div><span className="cta-location"><MapPin size={14} /> NOW IN {campaign.location.toUpperCase()}</span></div>
      <div className="contact-panel"><span className="contact-panel-label">TALK TO OUR TEAM</span>{campaign.contact.phones.map(phone => <a key={phone} href={`tel:${phone.replace(/\s/g, '')}`}><Phone size={16} /><strong>{phone}</strong></a>)}<a href={`mailto:${campaign.contact.email}`}><Mail size={16} /><strong>{campaign.contact.email}</strong></a></div></div></section>
}

export function SiteFooter() {
  const { pathname } = useLocation()
  const showRefundPolicyLink = pathname !== '/enrol/confirmation'
  const socialLinks = [
    { label: 'Instagram', href: 'https://www.instagram.com/radixminds/', Icon: Instagram },
    { label: 'Facebook', href: 'https://www.facebook.com/radixminds', Icon: Facebook },
    { label: 'YouTube', href: 'https://www.youtube.com/@radixminds', Icon: Youtube },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/company/radixminds', Icon: Linkedin },
    { label: 'Telegram', href: 'https://t.me/radixminds', Icon: Send },
    { label: 'WhatsApp', href: `https://wa.me/${campaign.contact.whatsappPhone.replace(/\D/g, '')}`, Icon: MessageCircle },
  ]
  return <footer className="site-footer"><div className="page-wrap footer-main"><div className="footer-brand"><Brand /><p>A focused 75-day board preparation program for Class 10 and Class 12 students. Now in {campaign.location}.</p><div className="footer-social-block"><span className="footer-social-handle">FIND US <b>@radixminds</b></span><div className="footer-socials">{socialLinks.map(({ label, href, Icon }) => <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={`Visit Radix Minds on ${label}`} title={label}><Icon size={17} strokeWidth={1.8} /></a>)}</div></div></div><div className="footer-links"><div><span>EXPLORE</span><a href="/about">About the Bootcamp</a><a href="/programs">Programs</a><a href="/programs/class-10">Class 10</a><a href="/programs/class-12">Class 12</a></div><div><span>LEARNING & SUPPORT</span><a href="/#learning-modes">Learning Modes</a><a href="/teaching-methodology">Teaching Methodology</a><a href="/mock-tests">Mock Tests & Assessment</a><a href="/faculty">Faculty</a><a href="/faqs">FAQs</a><a href="/contact">Contact Radix Minds</a></div><div><span>POLICIES</span><Link to="/terms-and-conditions">Terms & Conditions</Link><Link to="/privacy-policy">Privacy Policy</Link>{showRefundPolicyLink && <Link to="/refund-policy">Refund & Cancellation Policy</Link>}</div><div><span>GET IN TOUCH</span>{campaign.contact.phones.map(phone => <a key={phone} href={`tel:${phone.replace(/\s/g, '')}`}><Phone size={13} />{phone}</a>)}<a href={`mailto:${campaign.contact.email}`}><Mail size={13} />{campaign.contact.email}</a><span className="footer-city"><MapPin size={14} /> {campaign.businessAddress}</span></div></div></div><div className="page-wrap footer-bottom"><span>© {new Date().getFullYear()} Radix Minds. All rights reserved.</span><span>75 DAYS. ONE FOCUSED MISSION.</span></div></footer>
}
