import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import './BackToTopButton.css'

const VISIBILITY_OFFSET = 500

export default function BackToTopButton() {
  const [visible, setVisible] = useState(() => window.scrollY > VISIBILITY_OFFSET)

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > VISIBILITY_OFFSET)
    window.addEventListener('scroll', updateVisibility, { passive: true })
    updateVisibility()
    return () => window.removeEventListener('scroll', updateVisibility)
  }, [])

  if (!visible) return null

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  return (
    <button type="button" className="back-to-top-button" onClick={scrollToTop} aria-label="Back to top" title="Back to top">
      <ArrowUp size={21} aria-hidden="true" />
      <span>Top</span>
    </button>
  )
}
