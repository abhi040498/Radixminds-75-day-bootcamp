import { Clock3, Monitor, ShieldCheck, Target, UsersRound } from 'lucide-react'

const benefits = [
  { Icon: Target, label: 'Clear 75-Day Roadmap' },
  { Icon: Clock3, label: '300 Hours of Learning' },
  { Icon: Monitor, label: 'Online | Hybrid | Offline' },
  { Icon: UsersRound, label: 'Structured & Comprehensive' },
  { Icon: ShieldCheck, label: 'Practice, Assess & Revise' },
]

export function FirstViewportBenefits() {
  return <section className="first-viewport-benefits" aria-label="Bootcamp learning benefits">
    <div className="first-viewport-benefits-inner">
      {benefits.map(({ Icon, label }) => <div className="first-viewport-benefit" key={label}>
        <Icon aria-hidden="true" size={26} strokeWidth={2.15} />
        <span>{label}</span>
      </div>)}
    </div>
  </section>
}
