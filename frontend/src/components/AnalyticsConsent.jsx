import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { websiteAnalytics } from '../utils/websiteAnalytics'
import { useAuthStore } from '../store/authStore'
import { useCartStore } from '../store/cartStore'
import './AnalyticsConsent.css'

export default function AnalyticsConsent() {
  const location = useLocation()
  const { isAdmin } = useAuthStore()
  const [choice, setChoice] = useState(websiteAnalytics.getConsent())
  const [open, setOpen] = useState(choice === 'unknown')
  useEffect(() => {
    const visible = websiteAnalytics.enabled && !isAdmin && !location.pathname.startsWith('/admin') && open
    document.documentElement.dataset.analyticsConsentOpen = String(visible)
    return () => { delete document.documentElement.dataset.analyticsConsentOpen }
  }, [open, isAdmin, location.pathname])
  useEffect(() => {
    websiteAnalytics.exclude(isAdmin || location.pathname.startsWith('/admin'))
    if (isAdmin || location.pathname.startsWith('/admin')) return
    websiteAnalytics.initialize()
    websiteAnalytics.page(location.pathname)
    if (location.pathname === '/products') websiteAnalytics.search(new URLSearchParams(location.search).get('search'))
    if (location.pathname === '/checkout') websiteAnalytics.commerce('begin_checkout', useCartStore.getState().items)
  }, [location.pathname, location.search, choice, isAdmin])
  if (!websiteAnalytics.enabled || isAdmin || location.pathname.startsWith('/admin')) return null
  const choose = (value) => { websiteAnalytics.setConsent(value); setChoice(value); setOpen(false) }
  return <aside className="analytics-consent" aria-label="Analytics privacy preferences">
    {open ? <div className="analytics-consent-panel"><h2>Help improve FoodNova</h2><p>With your permission, Google Analytics measures page visits and shopping activity using cookies and approximate device/location data. We exclude names, contact details, addresses and free-text searches. Shopping works without analytics.</p><Link to="/privacy">Read our privacy notice</Link><div><button type="button" onClick={() => choose('denied')}>Reject analytics</button><button type="button" onClick={() => choose('granted')}>Accept analytics</button></div></div>
      : <button type="button" className="analytics-preferences" onClick={() => setOpen(true)}>Privacy choices</button>}
  </aside>
}
