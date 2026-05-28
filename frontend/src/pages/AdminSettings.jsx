import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarClock, Image, Megaphone, Sparkles, ToggleLeft } from 'lucide-react'
import { adminAPI } from '../services/api'
import { WEBSITE_SETTINGS_EVENT, fetchWebsiteSettings, getWebsiteSettings, saveWebsiteSettings } from '../utils/websiteSettings'
import { useAuthStore } from '../store/authStore'
import './AdminPages.css'
import './AdminSettings.css'

export default function AdminSettings() {
  const { isAdmin } = useAuthStore()
  const [settings, setSettings] = useState(getWebsiteSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const update = () => setSettings(getWebsiteSettings())
    window.addEventListener(WEBSITE_SETTINGS_EVENT, update)
    adminAPI.getWebsiteSettings()
      .then((remote) => setSettings(saveWebsiteSettings(remote)))
      .catch(() => fetchWebsiteSettings().then(setSettings))
      .finally(() => setLoading(false))
    return () => window.removeEventListener(WEBSITE_SETTINGS_EVENT, update)
  }, [])

  const update = async (patch) => {
    const optimistic = saveWebsiteSettings(patch)
    setSettings(optimistic)
    setSaving(true)
    try {
      const remote = await adminAPI.updateWebsiteSettings(patch)
      const next = saveWebsiteSettings(remote)
      setSettings(next)
      toast.success('Website settings updated')
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to update website settings')
      const refreshed = await fetchWebsiteSettings()
      setSettings(refreshed)
    } finally {
      setSaving(false)
    }
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

      {(loading || saving) && (
        <div className="settings-status">
          {loading ? 'Loading live website settings...' : 'Applying website mode across the app...'}
        </div>
      )}

      <section className="settings-grid">
        <article className="settings-card">
          <ToggleLeft size={24} />
          <div>
            <h2>Coming Soon Mode</h2>
            <p>Redirects public pages to a cinematic countdown page. Admin remains accessible.</p>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={settings.comingSoonEnabled} onChange={(event) => update({ comingSoonEnabled: event.target.checked })} disabled={saving} />
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
            <input type="checkbox" checked={settings.splashEnabled} onChange={(event) => update({ splashEnabled: event.target.checked })} disabled={saving} />
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
            disabled={saving}
          />
        </label>
        <label>
          Coming soon headline
          <input value={settings.headline} onChange={(event) => update({ headline: event.target.value })} disabled={saving} />
        </label>
        <label>
          Coming soon subtext
          <textarea value={settings.subtext} onChange={(event) => update({ subtext: event.target.value })} rows={3} disabled={saving} />
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
          <textarea value={settings.homepageAnnouncement} onChange={(event) => update({ homepageAnnouncement: event.target.value })} rows={3} placeholder="Seasonal offer, delivery note, or investor-ready campaign message" disabled={saving} />
        </label>
        <label>
          Homepage banner ideas
          <textarea value={settings.homepageBanners} onChange={(event) => update({ homepageBanners: event.target.value })} rows={4} placeholder="Fresh Groceries Delivered Fast&#10;Premium Food Packs For Every Home" disabled={saving} />
        </label>
        <label>
          Featured packs
          <textarea value={settings.featuredPacks} onChange={(event) => update({ featuredPacks: event.target.value })} rows={4} placeholder="Starter pack, Family pack, Bulk restock pack" disabled={saving} />
        </label>
      </section>
    </div>
  )
}
