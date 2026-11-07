import { BookOpenCheck, CalendarDays, Clock3, MessageCircleQuestion, PencilRuler, Target } from 'lucide-react'
import { bootcampDates, timetable, type ProgramCode } from '../data/bootcampSchedule'

const sundayIcons = [PencilRuler, BookOpenCheck, MessageCircleQuestion, Target, CalendarDays, Clock3]

export function WeeklyTimetable({ programCode }: { programCode: ProgramCode }) {
  const schedule = timetable[programCode]
  const grade = programCode === 'class-10' ? 'Class 10' : 'Class 12'
  return <section className="weekly-timetable-section" aria-labelledby={`${programCode}-timetable-title`}>
    <div className="weekly-timetable-heading">
      <span className="public-card-eyebrow">A WEEK WITH PURPOSE · {grade.toUpperCase()}</span>
      <h2 id={`${programCode}-timetable-title`}>A clear rhythm for the week.</h2>
      <p>Planned from {bootcampDates.start} to {bootcampDates.completion}. Exact weekday allocation will be confirmed by the faculty team.</p>
    </div>
    <div className="weekly-timetable-grid">
      <section className="weekday-schedule" aria-label={`${grade} weekday timetable`}>
        <div className="timetable-block-heading"><span>MONDAY – SATURDAY</span><small>WEEKDAY CLASSES</small></div>
        <div className="timetable-sessions">{schedule.weekdays.map((session, index) => <article className={`timetable-session timetable-${session.accent}`} key={`${session.detail}-${index}`}>
          <span className="timetable-session-time"><Clock3 size={15} />{session.time}</span>
          <div><small>{session.title}</small><strong>{session.detail}</strong></div>
        </article>)}</div>
        <p className="timetable-cadence">Subjects meet on alternate days within the stated weekly frequency. Specific weekdays are not assigned here.</p>
      </section>
      <section className="sunday-schedule" aria-label={`${grade} Sunday practice and revision timetable`}>
        <div className="sunday-schedule-top"><span className="sunday-day-number">SUN</span><div><small>DEDICATED PRACTICE DAY</small><h3>Sunday revision & practice</h3></div></div>
        <div className="sunday-time"><Clock3 size={16} /><strong>10:00 AM – 4:00 PM</strong></div>
        <ul>{schedule.sunday.map((activity, index) => { const Icon = sundayIcons[index]; return <li key={activity}><Icon size={15} />{activity}</li> })}</ul>
      </section>
    </div>
  </section>
}
