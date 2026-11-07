import { Clock3 } from 'lucide-react'
import { timetable, type ProgramCode } from '../data/bootcampSchedule'

export function ProgramSchedulePreview({ programCode }: { programCode: ProgramCode }) {
  const schedule = timetable[programCode]
  const mainSlot = schedule.weekdays[0]?.time
  const secondarySlot = programCode === 'class-10' ? schedule.weekdays[2]?.time : null
  const mainLabel = programCode === 'class-10' ? 'Mathematics 3 days · Science 3 days / week' : 'Physics 2 days · Chemistry 2 days · selected pathway 2 days / week'
  return <div className="program-schedule-preview" aria-label={`${programCode === 'class-10' ? 'Class 10' : 'Class 12'} weekly timetable preview`}>
    <div className="program-schedule-preview-heading"><span>WEEKLY TIMETABLE</span><small>Exact weekday allocations to be confirmed</small></div>
    <div className="program-schedule-preview-row"><Clock3 size={15} /><span><b>WEEKDAYS · {mainSlot}</b><small>{mainLabel}</small></span></div>
    {secondarySlot && <div className="program-schedule-preview-row"><Clock3 size={15} /><span><b>WEEKDAYS · {secondarySlot}</b><small>SST 4 days · English 2 days / week</small></span></div>}
    <div className="program-schedule-preview-row is-sunday"><Clock3 size={15} /><span><b>SUNDAY · 10:00 AM – 4:00 PM</b><small>Question practice · revision · doubt clearing</small></span></div>
  </div>
}
