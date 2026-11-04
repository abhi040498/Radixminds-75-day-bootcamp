import { useState } from 'react'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { Brand } from './Brand'

const links = [
  ['Home', '/'], ['Programs', '/programs'], ['Contact', '/contact'],
]

export function Header() {
  const [open, setOpen] = useState(false)
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <button className="menu-toggle" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav className={`main-nav ${open ? 'is-open' : ''}`} aria-label="Main navigation">
          {links.map(([label, href]) => <NavLink key={label} to={href} end={href === '/'} onClick={() => setOpen(false)}>{label}</NavLink>)}
          <Link className="nav-cta" to="/enrol" onClick={() => setOpen(false)}>Enrol Now <ArrowUpRight size={15} /></Link>
        </nav>
      </div>
    </header>
  )
}
