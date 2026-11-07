export type ProgramCode = 'class-10' | 'class-12'

export const bootcampDates = {
  start: '30 November 2026',
  completion: '12 February 2027',
} as const

export const timetable = {
  'class-10': {
    weekdays: [
      { time: '4:00 PM – 6:30 PM', title: 'Main subject sessions', detail: 'Mathematics · 3 days / week', accent: 'navy' },
      { time: '4:00 PM – 6:30 PM', title: 'Main subject sessions', detail: 'Science · 3 days / week', accent: 'teal' },
      { time: '6:30 PM – 8:00 PM', title: 'Secondary subject sessions', detail: 'Social Science (SST) · 4 days / week', accent: 'gold' },
      { time: '6:30 PM – 8:00 PM', title: 'Secondary subject sessions', detail: 'English · 2 days / week', accent: 'lilac' },
    ],
    sunday: ['Weekly revision', 'Question-solving', 'Doubt clearing', 'Subject-wise practice', 'Weekly assessments', 'Performance review'],
  },
  'class-12': {
    weekdays: [
      { time: '4:00 PM – 8:00 PM', title: 'Alternate-day subject sessions', detail: 'Physics · 2 days / week', accent: 'navy' },
      { time: '4:00 PM – 8:00 PM', title: 'Alternate-day subject sessions', detail: 'Chemistry · 2 days / week', accent: 'teal' },
      { time: '4:00 PM – 8:00 PM', title: 'Alternate-day subject sessions', detail: 'Mathematics or Biology · 2 days / week', accent: 'gold' },
    ],
    sunday: ['Question-solving', 'Weekly revision', 'Doubt clearing', 'Subject-wise practice', 'Practice assessments', 'Performance review'],
  },
} as const

export const deliveryOptions = {
  online: {
    label: 'Online — Live Interactive Classes',
    title: 'Live interactive online classes',
    detail: 'Structured subject sessions with interactive doubt-solving and Sunday revision.',
    features: ['Live instructor-led classes', 'Interactive doubt clearing', 'Sunday revision and question sessions'],
  },
  hybrid: {
    label: 'Hybrid — Flexible Online + Classroom Learning',
    title: 'Hybrid learning experience',
    schedulePlaceholder: 'Starts 30 November 2026, on the same published timetable as Online and Offline. Classroom participation details are coordinated by Radix Minds.',
    detail: 'A flexible way to participate in the same 75-day academic program. Subjects, timetable, lessons, materials, practice, assessments, revision and doubt-clearing support remain consistent across all three modes.',
    features: ['Same subjects and academic plan', 'Same published timetable and assessments', 'Online and classroom participation'],
  },
  offline: {
    label: 'Offline — Classroom Training',
    title: 'Classroom training',
    detail: 'Classroom-based teaching, direct instructor interaction and in-person practice.',
    features: ['Classroom-based teaching', 'Direct instructor interaction', 'Sunday revision and question sessions'],
  },
} as const

export type LearningMode = keyof typeof deliveryOptions
