import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarClock, Image, Megaphone, Sparkles, ToggleLeft } from 'lucide-react'
import { WEBSITE_SETTINGS_EVENT, getWebsiteSettings, saveWebsiteSettings } from '../utils/websiteSettings'
import { useAuthStore } from '../store/authStore'
import './AdminPages.css'
import './AdminSettings.css'

export default function AdminSettings() {
  const { isAdmin } = useAuthStore()
  const [settings, setSettings] = useState(getWebsiteSettings)

  useEffect(() => {
    const update = () => setSettings(getWebsiteSettings())
    window.addEventListener(WEBSITE_SETTINGS_EVENT, update)
    return () => window.removeEventListener(WEBSITE_SETTINGS_EVENT, update)
  }, [])

  const update = (patch) => {
    const next = saveWebsiteSettings(patch)
    setSettings(next)
    toast.success('Website settings updated')
  }

  if (!isAdmin) return <div className="admin-page"><p>Access denied. Admin login required.</p></div>

  return (
    <div className="admin-page admin-settings-page">
      <div className="admin-settings-hero">
        <div>
          <p className="admin-eyebrow">Website Mode</p>
          <h1>FoodNova Experience Settings</h1>
          <p>Control the public storefront experience without touching APIs, admin tools, or customer app integrations.</p>
        </div>
        <Sparkles size={42} />
      </div>

      <section className="settings-grid">
        <article className="settings-card">
          <ToggleLeft size={24} />
          <div>
            <h2>Coming Soon Mode</h2>
            <p>Redirects public pages to a cinematic countdown page. Admin remains accessible.</p>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.comingSoonEnabled} onChange={(event) => update({ comingSoonEnabled: event.target.checked })} />
            <span />
          </label>
        </article>

        <article className="settings-card">
          <Image size={24} />
          <div>
            <h2>Splash Screen</h2>
            <p>Shows the premium FoodNova loading animation on first visit per session.</p>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.splashEnabled} onChange={(event) => update({ splashEnabled: event.target.checked })} />
            <span />
          </label>
        </article>
      </section>

      <section className="settings-form-card">
        <div className="settings-form-title">
          <CalendarClock size={24} />
          <div>
            <h2>Launch Countdown</h2>
            <p>Set the launch date used by the coming-soon page.</p>
          </div>
        </div>
        <label>
          Launch date and time
          <input
            type="datetime-local"
            value={settings.launchDate ? settings.launchDate.slice(0, 16) : ''}
            onChange={(event) => update({ launchDate: new Date(event.target.value).toISOString() })}
          />
        </label>
        <label>
          Coming soon headline
          <input value={settings.headline} onChange={(event) => update({ headline: event.target.value })} />
        </label>
        <label>
          Coming soon subtext
          <textarea value={settings.subtext} onChange={(event) => update({ subtext: event.target.value })} rows={3} />
        </label>
      </section>

      <section className="settings-form-card">
        <div className="settings-form-title">
          <Megaphone size={24} />
          <div>
            <h2>Homepage Content Controls</h2>
            <p>Use existing admin announcement tools for banners, popups, and top bars.</p>
          </div>
        </div>
        <a className="settings-link" href="/admin/announcements">Manage Homepage Announcements</a>
        <label>
          Homepage announcement note
          <textarea value={settings.homepageAnnouncement} onChange={(event) => update({ homepageAnnouncement: event.target.value })} rows={3} placeholder="Seasonal offer, delivery note, or investor-ready campaign message" />
        </label>
        <label>
          Homepage banner ideas
          <textarea value={settings.homepageBanners} onChange={(event) => update({ homepageBanners: event.target.value })} rows={4} placeholder="Fresh Groceries Delivered Fast&#10;Premium Food Packs For Every Home" />
        </label>
        <label>
          Featured packs
          <textarea value={settings.featuredPacks} onChange={(event) => update({ featuredPacks: event.target.value })} rows={4} placeholder="Starter pack, Family pack, Bulk restock pack" />
        </label>
      </section>
    </div>
  )
}
