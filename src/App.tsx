import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Header } from './components/Header'
import { SiteFooter } from './components/sections/ContactCTA'
import { ContactCTA } from './components/sections/ContactCTA'
import { Hero } from './components/sections/Hero'
import { ProgramSelection } from './components/sections/ProgramSelection'
import { FirstViewportBenefits } from './components/sections/FirstViewportBenefits'
import { SundayPractice } from './components/sections/SundayPractice'
import { LearningModesOverview } from './components/sections/LearningModesOverview'
import { Roadmap } from './components/sections/Roadmap'
import { FAQs } from './components/sections/FAQs'
import { LearningHours, PreparationSystem, ProgramValue, StudentChallenges } from './components/sections/HomepageEditorial'
import { ParentTrust } from './components/sections/ParentTrust'
import {
  AboutPage, Class10Page, Class12Page, ContactPage, FAQsPage, FacultyPage,
  MethodologyPage, MockTestsPage, NotFoundPage, ProgramsPage,
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
  return <div className="homepage-redesign">
    <Hero />
    <ProgramSelection homepage title="Choose Your Programme" intro="Focused preparation for Class 10 and Class 12 board examinations with a clear plan and guided support." eyebrow="" />
    <FirstViewportBenefits />
    <StudentChallenges />
    <PreparationSystem />
    <Roadmap />
    <LearningHours />
    <LearningModesOverview />
    <SundayPractice />
    <ProgramValue />
    <ParentTrust />
    <FAQs />
    <ContactCTA />
  </div>
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
        <Route path="/teaching-methodology" element={<MethodologyPage />} />
        <Route path="/mock-tests" element={<MockTestsPage />} />
        <Route path="/faculty" element={<FacultyPage />} />
        <Route path="/faqs" element={<FAQsPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/enrol" element={<EnrolmentPage />} />
        <Route path="/enrol/confirmation" element={<EnrolmentConfirmationPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/terms-and-conditions" element={<LegalPage kind="terms" />} />
        <Route path="/privacy-policy" element={<LegalPage kind="privacy" />} />
        <Route path="/refund-policy" element={<LegalPage kind="refund" />} />
        <Route path="/terms" element={<Navigate to="/terms-and-conditions" replace />} />
        <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </main>
    <SiteFooter />
  </>
}
