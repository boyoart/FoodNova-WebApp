import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Megaphone, Pause, Play } from 'lucide-react'
import api from '../services/api'
import { catalogueRows } from '../pages/cinematicCatalogue'
import { safeAnnouncementLink, tickerAnnouncements } from '../utils/homepageAnnouncements'
import './HomepageTicker.css'

export function useHomepageAnnouncements(enabled) {
  const [cms, setCMS] = useState({ announcements: [], tickerEnabled: false })
  useEffect(() => {
    if (!enabled) return undefined
    let stopped = false
    let pending = false
    let controller
    const load = async () => {
      if (pending || document.hidden) return
      pending = true
      controller = new AbortController()
      try {
        const { data } = await api.get('/announcements/active', { signal: controller.signal })
        if (!stopped) setCMS({ announcements: catalogueRows(data, 'announcements'), tickerEnabled: data.ticker_enabled !== false })
      } catch { /* Retain last known CMS state; local scheduling still removes expired notices. */ }
      finally { pending = false }
    }
    load()
    const interval = setInterval(load, 60000)
    document.addEventListener('visibilitychange', load)
    return () => { stopped = true; controller?.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', load) }
  }, [enabled])
  return cms
}

function TickerText({ items, duplicate = false }) {
  return <div className="homepage-ticker-group" aria-hidden={duplicate || undefined}>{items.map((item) => {
    const href = safeAnnouncementLink(item.button_link)
    return <span key={item.id}>{href && !duplicate ? <Link to={href}>{item.message}</Link> : item.message}<i aria-hidden="true">✦</i></span>
  })}</div>
}

export default function HomepageTicker({ announcements, enabled }) {
  const [paused, setPaused] = useState(false)
  const [now, setNow] = useState(Date.now)
  const root = useRef(null)
  const items = tickerAnnouncements(announcements, now)
  const visible = enabled && items.length > 0
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    if (!visible || !root.current) return undefined
    const element = root.current
    let stopped = false
    const style = document.documentElement.style
    const previous = style.getPropertyValue('--foodnova-ticker-height')
    const measure = () => {
      if (!stopped && element.isConnected) style.setProperty('--foodnova-ticker-height', `${Math.ceil(element.getBoundingClientRect().height)}px`)
    }
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(element)
    return () => { stopped = true; observer?.disconnect(); if (previous) style.setProperty('--foodnova-ticker-height', previous); else style.removeProperty('--foodnova-ticker-height') }
  }, [visible])
  if (!visible) return null
  return <aside ref={root} className={`homepage-ticker${paused ? ' is-paused' : ''}`} aria-label="FoodNova announcements">
    <Megaphone size={17} aria-hidden="true" />
    <div className="homepage-ticker-window"><div className="homepage-ticker-track"><TickerText items={items} /><TickerText items={items} duplicate /></div></div>
    <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? 'Resume announcements' : 'Pause announcements'} aria-pressed={paused}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
  </aside>
}
