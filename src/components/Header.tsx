import { useState } from 'react'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { Brand } from './Brand'

const links = [
  ['Home', '/'],
  ['Class 10', '/programs/class-10'],
  ['Class 12', '/programs/class-12'],
  ['Learning Modes', '/#learning-modes'],
  ['About', '/about'],
  ['FAQs', '/faqs'],
  ['Contact', '/contact'],
]

export function Header() {
  const [open, setOpen] = useState(false)
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <button className="menu-toggle" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-controls="main-navigation" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav id="main-navigation" className={`main-nav ${open ? 'is-open' : ''}`} aria-label="Main navigation">
          {links.map(([label, href]) => <NavLink key={label} to={href} end={href === '/'} onClick={() => setOpen(false)}>{label}</NavLink>)}
        </nav>
        <Link className="nav-cta header-cta" to="/programs" onClick={() => setOpen(false)}>Explore Programmes <ArrowUpRight size={15} /></Link>
      </div>
    </header>
  )
}
