import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import './AuthPages.css'

const ONBOARDING_KEY = 'foodnova_onboarding_complete'
const LEGACY_ONBOARDING_KEY = 'onboardingCompleted'

const slides = [
  {
    title: 'Fresh Groceries Delivered',
    subtitle: 'Shop quality rice, beans, garri, oil, egusi, and everyday essentials with ease.',
  },
  {
    title: 'Fast & Reliable Ordering',
    subtitle: 'Order anytime and get your foodstuff delivered quickly and securely.',
  },
  {
    title: 'Simple Payments & Tracking',
    subtitle: 'Upload receipts, track orders, and manage deliveries all in one place.',
  },
]

export default function OnboardingPage() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const navigate = useNavigate()

  const isLastSlide = useMemo(() => currentIndex === slides.length - 1, [currentIndex])

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    localStorage.setItem(LEGACY_ONBOARDING_KEY, 'true')
    navigate('/auth', { replace: true })
  }

  const handleNext = () => {
    if (isLastSlide) {
      completeOnboarding()
      return
    }

    setCurrentIndex((prev) => prev + 1)
  }

  return (
    <div className="auth-page onboarding-page">
      <div className="auth-container">
        <div className="auth-card onboarding-card">
          <div className="onboarding-progress">
            {slides.map((_, idx) => (
              <span key={idx} className={`onboarding-dot ${idx === currentIndex ? 'active' : ''}`} />
            ))}
          </div>

          <h1>{slides[currentIndex].title}</h1>
          <p className="auth-subtitle">{slides[currentIndex].subtitle}</p>
          <p className="onboarding-brand-line">Quality Foodstuff. Reliable Supply.</p>

          <div className="onboarding-actions">
            {!isLastSlide && (
              <button className="btn btn-secondary" onClick={completeOnboarding}>
                Skip
              </button>
            )}
            <button className="btn btn-primary" onClick={handleNext}>
              {isLastSlide ? 'Get Started' : 'Next'} <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
