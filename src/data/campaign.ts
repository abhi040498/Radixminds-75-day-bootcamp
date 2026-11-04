export const campaign = {
  brand: 'Radix Minds',
  programName: '75-Day Board Bootcamp',
  location: 'Bokaro',
  discountPercent: 80,
  offerValidThrough: null as string | null,
  batchCapacity: 30,
  contact: {
    phones: ['+91 93048 29718', '+91 97091 97646'],
    whatsappPhone: '+91 93048 29718',
    telegramUrl: 'https://t.me/radixminds',
    email: 'support@bootcamp.radixminds.in',
  },
  programs: [
    {
      code: 'class-10',
      grade: 'CLASS 10',
      programFee: 2499,
      subjects: ['Mathematics', 'Science', 'Social Science', 'English'],
    },
    {
      code: 'class-12',
      grade: 'CLASS 12',
      programFee: 3499,
      subjects: ['Physics', 'Chemistry', 'Mathematics / Biology'],
    },
  ],
  smartMethod: [
    { letter: 'S', title: 'Structured Lectures' },
    { letter: 'M', title: 'Mock Tests & Practice' },
    { letter: 'A', title: 'Advanced Study Notes' },
    { letter: 'R', title: 'Result-Oriented Revision' },
    { letter: 'T', title: 'Time Management Tips' },
  ],
  roadmap: [
    { phase: 'Phase 1', days: 'Days 1–7', title: 'Diagnostic Assessment & Planning', note: 'Understand the starting point and set priorities.', tone: 'phase-blue' },
    { phase: 'Phase 2', days: 'Days 8–45', title: 'Structured Learning & Concept Building', note: 'Strengthen understanding with guided lessons.', tone: 'phase-teal' },
    { phase: 'Phase 3', days: 'Days 46–60', title: 'Practice, Application & Revision', note: 'Apply learning and revisit key concepts.', tone: 'phase-gold' },
    { phase: 'Phase 4', days: 'Days 61–68', title: 'Subject-wise Mock Tests', note: 'Practise complete subjects and review.', tone: 'phase-lilac' },
    { phase: 'Phase 5', days: 'Days 69–75', title: 'Full-syllabus Mocks & Final Preparation', note: 'Bring learning together for full-paper practice.', tone: 'phase-rose' },
  ],
} as const

export const money = (amount: number) => `₹${amount.toLocaleString('en-IN')}`
