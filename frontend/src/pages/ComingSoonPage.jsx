import { useEffect, useMemo, useState } from 'react'
import { Instagram, Mail, MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import FoodNovaLogo from '../components/FoodNovaLogo'
import { websiteSettingsAPI } from '../services/api'
import { WEBSITE_SETTINGS_EVENT, fetchWebsiteSettings, getWebsiteSettings } from '../utils/websiteSettings'
import './ComingSoonPage.css'

function getRemaining(launchDate) {
  const target = new Date(launchDate).getTime()
  const diff = Math.max(0, target - Date.now())
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff / 3600000) % 24),
    minutes: Math.floor((diff / 60000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

export default function ComingSoonPage() {
  const [settings, setSettings] = useState(getWebsiteSettings)
  const [remaining, setRemaining] = useState(() => getRemaining(settings.launchDate))
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const countdown = useMemo(() => [
    ['Days', remaining.days],
    ['Hours', remaining.hours],
    ['Minutes', remaining.minutes],
    ['Seconds', remaining.seconds],
  ], [remaining])

  useEffect(() => {
    fetchWebsiteSettings().then((next) => {
      setSettings(next)
      setRemaining(getRemaining(next.launchDate))
    })
    const timer = setInterval(() => {
      const next = getWebsiteSettings()
      setSettings(next)
      setRemaining(getRemaining(next.launchDate))
    }, 1000)
    const syncSettings = (event) => {
      const next = event.detail || getWebsiteSettings()
      setSettings(next)
      setRemaining(getRemaining(next.launchDate))
    }
    window.addEventListener(WEBSITE_SETTINGS_EVENT, syncSettings)
    return () => {
      clearInterval(timer)
      window.removeEventListener(WEBSITE_SETTINGS_EVENT, syncSettings)
    }
  }, [])

  const subscribe = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      await websiteSettingsAPI.subscribeComingSoon(email)
      toast.success("You're on the FoodNova launch list.")
      setEmail('')
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not save email. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="coming-soon-page">
      <div className="coming-soon-bg" aria-hidden="true" />
      <section className="coming-soon-panel">
        <FoodNovaLogo variant="coming-soon" className="coming-soon-logo" />
        <p className="coming-soon-kicker">Premium grocery commerce</p>
        <h1>{settings.headline}</h1>
        <p className="coming-soon-copy">{settings.subtext}</p>
        <div className="coming-soon-countdown" aria-label="Launch countdown">
          {countdown.map(([label, value]) => (
            <div key={label}>
              <strong>{String(value).padStart(2, '0')}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <form className="coming-soon-form" onSubmit={subscribe}>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email for launch updates" required />
          <button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Notify Me'}</button>
        </form>
        <div className="coming-soon-socials">
          <a href="mailto:support@foodnova.com.ng"><Mail size={18} /> Email</a>
          <a href="https://wa.me/2348025801125" target="_blank" rel="noopener noreferrer"><MessageCircle size={18} /> WhatsApp</a>
          <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer"><Instagram size={18} /> Instagram</a>
        </div>
      </section>
    </main>
  )
}
