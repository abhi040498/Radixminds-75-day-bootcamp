import { useState } from 'react'
import { ArrowRight, Blend, BookOpenCheck, Check, CircleAlert, MonitorPlay, School } from 'lucide-react'
import { Link } from 'react-router-dom'
import { deliveryOptions, type LearningMode, type ProgramCode } from '../data/bootcampSchedule'
import type { PublicProgram } from '../lib/enrolmentApi'

const modeDetails: Record<LearningMode, { icon: typeof MonitorPlay; description: string; features: readonly string[] }> = {
  online: { icon: MonitorPlay, description: 'Learn from anywhere through structured live interactive classes.', features: deliveryOptions.online.features },
  hybrid: { icon: Blend, description: deliveryOptions.hybrid.detail, features: deliveryOptions.hybrid.features },
  offline: { icon: School, description: 'Learn through direct classroom interaction and structured instructor-led sessions.', features: deliveryOptions.offline.features },
}

export function ProgramEnrollmentOptions({ programCode, program, onRetry }: { programCode: ProgramCode; program?: PublicProgram; onRetry?: () => void }) {
  const [pathway, setPathway] = useState<'Mathematics' | 'Biology' | ''>('')
  const [mode, setMode] = useState<LearningMode | ''>('')
  const availableModes = new Set(program?.modes.map(item => item.mode) ?? [])
  const dataReady = Boolean(program)
  const selectedModeAvailable = mode !== '' && availableModes.has(mode) && (programCode === 'class-10' || pathway !== '')
  const query = new URLSearchParams({ program: programCode })
  if (programCode === 'class-12' && pathway) query.set('pathway', pathway)
  if (selectedModeAvailable) query.set('mode', mode)

  return <section className="program-enrollment-options" aria-labelledby={`${programCode}-delivery-title`}>
    <div className="program-options-heading"><span className="public-card-eyebrow">THREE EQUAL WAYS TO PARTICIPATE</span><h2 id={`${programCode}-delivery-title`}>Choose how you’ll join the same program.</h2><p>Online, Hybrid and Offline follow the same 75-day academic plan, subjects, published timetable, materials, assessments, revision and doubt-clearing support. Hybrid begins 30 November 2026 alongside the other modes; the classroom participation logistics are coordinated by Radix Minds.</p></div>
    {programCode === 'class-12' && <fieldset className="pathway-select-fieldset"><legend>First, choose your Class 12 pathway</legend><div className="pathway-select-options">{(['Mathematics', 'Biology'] as const).map(subject => <button type="button" className={pathway === subject ? 'is-selected' : ''} aria-pressed={pathway === subject} onClick={() => setPathway(subject)} key={subject}><span>{pathway === subject && <Check size={15} />}</span><b>{subject === 'Mathematics' ? 'PCM' : 'PCB'}</b><small>Physics + Chemistry + {subject}</small></button>)}</div></fieldset>}
    <div className="delivery-option-grid">{(['online', 'hybrid', 'offline'] as const).map(option => {
      const Icon = modeDetails[option].icon
      const available = availableModes.has(option)
      return <button type="button" key={option} className={`delivery-option-card${mode === option && available ? ' is-selected' : ''}${!available ? ' is-unavailable' : ''}`} aria-pressed={mode === option && available} aria-describedby={`${programCode}-${option}-availability`} disabled={!available} onClick={() => setMode(option)}>
        <span className="delivery-option-icon"><Icon size={20} /></span><span className="delivery-option-copy"><strong>{option.toUpperCase()}</strong><b>{deliveryOptions[option].label.split(' — ')[1]}</b><small>{modeDetails[option].description}</small><small className="delivery-option-features">{modeDetails[option].features.slice(0, 3).join(' · ')}</small></span><span className="delivery-option-check">{mode === option && available && <Check size={16} />}</span>
        <span id={`${programCode}-${option}-availability`} className="delivery-availability">{!dataReady ? 'Checking batch availability…' : available ? program?.modes.find(item => item.mode === option)?.batchLabel ?? 'Available for this batch' : 'Not currently open for this batch'}</span>
      </button>
    })}</div>
    {!dataReady && <div className="delivery-status-message" role="status"><CircleAlert size={16} /><span>Current program and mode availability could not be loaded. Please retry or contact the team to confirm before enrolling.</span>{onRetry && <button type="button" onClick={onRetry}>Try again</button>}</div>}
    {dataReady && !availableModes.size && <p className="delivery-status-message" role="status"><CircleAlert size={16} /> No learning mode is currently open for this program. Contact the team for batch availability.</p>}
    <Link className="button button-gold program-options-cta" to={`/enrol?${query.toString()}`} aria-disabled={!selectedModeAvailable} onClick={event => { if (!selectedModeAvailable) event.preventDefault() }}>Continue to enrolment <ArrowRight size={16} /></Link>
    <p className="delivery-options-note"><BookOpenCheck size={14} /> All three modes share the published weekly timetable. Specific weekday subject allocations will be shared by the faculty team.</p>
  </section>
}
