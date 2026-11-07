export const campaign = {
  brand: 'Radix Minds',
  programName: '75-Day Board Bootcamp',
  location: 'Bokaro',
  businessAddress: 'Bokaro, Jharkhand – 829301',
  batchCapacity: 30,
  contact: {
    phones: ['9304829718'],
    whatsappPhone: '9304829718',
    telegramUrl: 'https://t.me/radixminds',
    email: 'support@bootcamp.radixminds.in',
  },
  programs: [
    {
      code: 'class-10',
      grade: 'CLASS 10',
      subjects: ['Mathematics', 'Science', 'Social Science', 'English'],
      fallbackFeePaise: 249900,
      durationDays: 75,
    },
    {
      code: 'class-12',
      grade: 'CLASS 12',
      subjects: ['Physics', 'Chemistry', 'Mathematics or Biology'],
      fallbackFeePaise: 349900,
      durationDays: 75,
    },
  ],
  smartMethod: [
    { letter: 'S', title: 'Structured', description: 'A clear topic-wise plan.' },
    { letter: 'M', title: 'Measurable', description: 'Regular assessments and progress checks.' },
    { letter: 'A', title: 'Achievable', description: 'Focused learning targets.' },
    { letter: 'R', title: 'Relevant', description: 'Board-oriented preparation.' },
    { letter: 'T', title: 'Time-bound', description: 'A defined 75-day roadmap.' },
  ],
  roadmap: [
    { phase: 'Phase 1', title: 'Diagnostic Assessment & Planning', note: 'Understand the starting point and set priorities.', tone: 'phase-blue' },
    { phase: 'Phase 2', title: 'Structured Learning & Concept Building', note: 'Strengthen understanding with guided lessons.', tone: 'phase-teal' },
    { phase: 'Phase 3', title: 'Practice, Application & Revision', note: 'Apply learning and revisit key concepts.', tone: 'phase-gold' },
    { phase: 'Phase 4', title: 'Subject-wise Mock Tests', note: 'Practise complete subjects and review.', tone: 'phase-lilac' },
    { phase: 'Phase 5', title: 'Full-syllabus Mocks & Final Preparation', note: 'Bring learning together for full-paper practice.', tone: 'phase-rose' },
  ],
} as const
