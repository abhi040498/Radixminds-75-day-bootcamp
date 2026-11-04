import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Header } from './components/Header'
import { SiteFooter } from './components/sections/ContactCTA'
import { About } from './components/sections/About'
import { ContactCTA } from './components/sections/ContactCTA'
import { FAQs } from './components/sections/FAQs'
import { Hero } from './components/sections/Hero'
import { ExperienceStrip, FacultyIntro, LearningExperience, SmartStrategy } from './components/sections/LearningExperience'
import { ParentTrust } from './components/sections/ParentTrust'
import { ProgramSelection } from './components/sections/ProgramSelection'
import { Roadmap } from './components/sections/Roadmap'
import {
  AboutPage, Class10Page, Class12Page, ContactPage, FAQsPage, FacultyPage,
  MethodologyPage, MockTestsPage, NotFoundPage, ProgramsPage, RoadmapPage,
} from './pages/PublicPages'
import { EnrolmentConfirmationPage, EnrolmentPage } from './pages/Enrolment'
import { AdminPage } from './pages/Admin'
import { LegalPage } from './pages/Legal'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }) }, [pathname])
  return null
}

function HomePage() {
  return <>
    <Hero />
    <ProgramSelection />
    <About />
    <SmartStrategy />
    <Roadmap />
    <LearningExperience />
    <ExperienceStrip />
    <FacultyIntro />
    <ParentTrust />
    <FAQs />
    <ContactCTA />
  </>
}

export default function App() {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <ScrollToTop />
    <Header />
    <main id="main">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/programs" element={<ProgramsPage />} />
        <Route path="/programs/class-10" element={<Class10Page />} />
        <Route path="/programs/class-12" element={<Class12Page />} />
        <Route path="/roadmap" element={<RoadmapPage />} />
        <Route path="/teaching-methodology" element={<MethodologyPage />} />
        <Route path="/mock-tests" element={<MockTestsPage />} />
        <Route path="/faculty" element={<FacultyPage />} />
        <Route path="/faqs" element={<FAQsPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/enrol" element={<EnrolmentPage />} />
        <Route path="/enrol/confirmation" element={<EnrolmentConfirmationPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
        <Route path="/privacy" element={<LegalPage kind="privacy" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </main>
    <SiteFooter />
  </>
}
