import { Blend, MonitorPlay, School, ArrowRight, CircleCheck, CircleX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SectionHeading } from '../SectionHeading'
import { useProgramCatalog } from '../../lib/useProgramCatalog'
import type { LearningMode } from '../../lib/enrolmentApi'
import { deliveryOptions } from '../../data/bootcampSchedule'

const modes: { mode: LearningMode['mode']; description: string; Icon: typeof MonitorPlay }[] = [
  { mode: 'online', description: 'Live interactive classes and online participation, with the same academic plan and support.', Icon: MonitorPlay },
  { mode: 'hybrid', description: 'Flexible online and classroom participation. Classroom arrangements are coordinated by Radix Minds.', Icon: Blend },
  { mode: 'offline', description: 'Classroom-based learning and participation, with the same academic plan and support.', Icon: School },
]

export function LearningModesOverview() {
  const { programs, loading, error, retry } = useProgramCatalog()
  return <section className="home-modes-section section-pad" id="learning-modes" aria-label="Choose a learning mode">
    <div className="page-wrap">
      <div className="home-modes-heading"><SectionHeading eyebrow="THREE WAYS TO LEARN" title="Your learning style. Your choice." intro="Choose how you participate in a consistent 75-day academic programme." /></div>
      <div className="home-modes-grid">{modes.map(({ mode, description, Icon }) => {
        const available = programs.some(program => program.modes.some(item => item.mode === mode))
        return <article className={`home-mode-card home-mode-${mode}${!available && !loading ? ' is-unavailable' : ''}`} key={mode}>
          <div className="home-mode-top"><span className="home-mode-icon"><Icon size={22} /></span>{!loading && <span className={`home-mode-status${available ? ' is-open' : error ? ' is-unverified' : ''}`}>{available ? <><CircleCheck size={14} /> Available by program</> : error ? <><CircleX size={14} /> Availability unverified</> : <><CircleX size={14} /> Not currently open</>}</span>}</div>
          <h3>{deliveryOptions[mode].label}</h3>
          <p>{description}</p>
          <Link to="/programs">View program options <ArrowRight size={15} /></Link>
        </article>
      })}</div>
      {error && <div className="program-catalog-status home-mode-retry" role="status"><span>Live learning-mode availability could not be loaded.</span><button type="button" onClick={retry}>Try again</button></div>}
      <p className="home-modes-assurance"><span><CircleCheck size={18} /></span><strong>Same academic experience across all three modes.</strong><small>Subjects, timetable, curriculum, materials, assessments and academic support stay consistent. Only the method of participation differs.</small></p>
    </div>
  </section>
}
