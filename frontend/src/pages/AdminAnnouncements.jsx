import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Edit3, Eye, Megaphone, Plus, Trash2, X } from 'lucide-react'
import { adminAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './AdminAnnouncements.css'

const emptyForm = {
  title: '',
  message: '',
  display_type: 'top_bar',
  button_text: '',
  button_link: '',
  image_url: '',
  theme: 'green',
  priority: 0,
  is_active: true,
  start_date: '',
  end_date: '',
}

const displayTypes = [
  { value: 'top_bar', label: 'Top Bar' },
  { value: 'hero_banner', label: 'Hero Banner' },
  { value: 'popup', label: 'Popup' },
]

const themes = ['green', 'yellow', 'dark', 'light', 'promo', 'urgent']

function toInputDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function toApiDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function formatDate(value) {
  if (!value) return 'Anytime'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Anytime' : date.toLocaleString()
}

function AnnouncementPreview({ announcement }) {
  const type = announcement.display_type || 'top_bar'
  const theme = announcement.theme || 'green'
  return (
    <div className={`announcement-preview ${type} ${theme}`}>
      {type === 'hero_banner' && announcement.image_url ? (
        <img src={announcement.image_url} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} />
      ) : null}
      <div>
        <strong>{announcement.title || 'Announcement title'}</strong>
        <p>{announcement.message || 'Announcement message preview appears here.'}</p>
      </div>
      {announcement.button_text ? <span>{announcement.button_text}</span> : null}
    </div>
  )
}

export default function AdminAnnouncements() {
  const { isAdmin, admin } = useAuthStore()
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filters, setFilters] = useState({ status: 'all', display_type: 'all' })
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const isSuperAdmin = admin?.admin_role === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || permissions.length === 0))
  const canManage = isSuperAdmin || permissions.includes('announcements:manage')
  const canView = canManage || isSuperAdmin || permissions.includes('announcements:view')

  useEffect(() => {
    if (isAdmin && canView) loadAnnouncements()
  }, [isAdmin, canView])

  const filteredAnnouncements = useMemo(() => {
    return announcements.filter((announcement) => {
      const statusMatch = filters.status === 'all' || (filters.status === 'active' ? announcement.is_active : !announcement.is_active)
      const typeMatch = filters.display_type === 'all' || announcement.display_type === filters.display_type
      return statusMatch && typeMatch
    })
  }, [announcements, filters])

  const loadAnnouncements = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getAnnouncements()
      setAnnouncements(response.data || [])
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to load announcements')
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (announcement) => {
    setEditing(announcement)
    setForm({
      title: announcement.title || '',
      message: announcement.message || '',
      display_type: announcement.display_type || 'top_bar',
      button_text: announcement.button_text || '',
      button_link: announcement.button_link || '',
      image_url: announcement.image_url || '',
      theme: announcement.theme || 'green',
      priority: announcement.priority || 0,
      is_active: announcement.is_active !== false,
      start_date: toInputDate(announcement.start_date),
      end_date: toInputDate(announcement.end_date),
    })
    setModalOpen(true)
  }

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const submitForm = async (event) => {
    event.preventDefault()
    if (!canManage) return
    const payload = {
      ...form,
      priority: Number(form.priority || 0),
      start_date: toApiDate(form.start_date),
      end_date: toApiDate(form.end_date),
    }

    try {
      setSaving(true)
      if (editing) {
        await adminAPI.updateAnnouncement(editing.id, payload)
        toast.success('Announcement updated')
      } else {
        await adminAPI.createAnnouncement(payload)
        toast.success('Announcement created')
      }
      setModalOpen(false)
      await loadAnnouncements()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to save announcement')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (announcement) => {
    if (!canManage) return
    try {
      await adminAPI.updateAnnouncement(announcement.id, { is_active: !announcement.is_active })
      toast.success(!announcement.is_active ? 'Announcement activated' : 'Announcement deactivated')
      await loadAnnouncements()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to update announcement')
    }
  }

  const deactivateAnnouncement = async (announcement) => {
    if (!canManage) return
    try {
      await adminAPI.deleteAnnouncement(announcement.id)
      toast.success('Announcement deactivated')
      await loadAnnouncements()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to deactivate announcement')
    }
  }

  if (!isAdmin) {
    return <div className="admin-page"><p>Access denied. Admin login required.</p></div>
  }

  if (!canView) {
    return <div className="admin-page"><p>You do not have permission to view homepage announcements.</p></div>
  }

  return (
    <div className="admin-page announcements-admin-page">
      <div className="announcements-admin-header">
        <div>
          <p className="admin-kicker">Website messaging</p>
          <h1>Homepage Announcements</h1>
          <p>Manage top bars, hero banners, and one-time popup messages shown on the public homepage.</p>
        </div>
        {canManage ? (
          <button type="button" className="announcement-primary-button" onClick={openCreate}>
            <Plus size={18} /> New Announcement
          </button>
        ) : null}
      </div>

      <div className="announcements-filter-row">
        <label>
          Status
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label>
          Display Type
          <select value={filters.display_type} onChange={(event) => setFilters((current) => ({ ...current, display_type: event.target.value }))}>
            <option value="all">All</option>
            {displayTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="admin-loading-card">Loading announcements...</div>
      ) : filteredAnnouncements.length ? (
        <div className="announcements-table-wrap">
          <table className="announcements-table">
            <thead>
              <tr>
                <th>Announcement</th>
                <th>Type</th>
                <th>Theme</th>
                <th>Schedule</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAnnouncements.map((announcement) => (
                <tr key={announcement.id}>
                  <td>
                    <div className="announcement-title-cell">
                      <Megaphone size={18} />
                      <div>
                        <strong>{announcement.title}</strong>
                        <p>{announcement.message}</p>
                      </div>
                    </div>
                  </td>
                  <td>{displayTypes.find((type) => type.value === announcement.display_type)?.label || announcement.display_type}</td>
                  <td><span className={`theme-pill ${announcement.theme}`}>{announcement.theme}</span></td>
                  <td>
                    <span>{formatDate(announcement.start_date)}</span>
                    <small>to {formatDate(announcement.end_date)}</small>
                  </td>
                  <td>{announcement.priority || 0}</td>
                  <td><span className={`status-pill ${announcement.is_active ? 'active' : 'inactive'}`}>{announcement.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div className="announcement-actions">
                      <button type="button" onClick={() => openEdit(announcement)} aria-label="Edit announcement"><Edit3 size={16} /></button>
                      {canManage ? (
                        <>
                          <button type="button" onClick={() => toggleActive(announcement)} aria-label="Toggle active"><Eye size={16} /></button>
                          <button type="button" onClick={() => deactivateAnnouncement(announcement)} aria-label="Deactivate announcement"><Trash2 size={16} /></button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="admin-empty-card">
          <Megaphone size={28} />
          <h2>No announcements found</h2>
          <p>Create a homepage announcement to promote delivery updates, offers, or important service messages.</p>
        </div>
      )}

      {modalOpen ? (
        <div className="announcement-modal-backdrop" role="dialog" aria-modal="true">
          <form className="announcement-modal" onSubmit={submitForm}>
            <div className="announcement-modal-header">
              <div>
                <h2>{editing ? 'Edit Announcement' : 'Create Announcement'}</h2>
                <p>{canManage ? 'Changes appear on the homepage after saving.' : 'Preview announcement details.'}</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="Close modal"><X size={18} /></button>
            </div>

            <div className="announcement-form-grid">
              <label>
                Title
                <input value={form.title} onChange={(event) => updateField('title', event.target.value)} required disabled={!canManage} />
              </label>
              <label>
                Display Type
                <select value={form.display_type} onChange={(event) => updateField('display_type', event.target.value)} disabled={!canManage}>
                  {displayTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label className="span-2">
                Message
                <textarea value={form.message} onChange={(event) => updateField('message', event.target.value)} rows={4} required disabled={!canManage} />
              </label>
              <label>
                Button Text
                <input value={form.button_text} onChange={(event) => updateField('button_text', event.target.value)} disabled={!canManage} />
              </label>
              <label>
                Button Link
                <input value={form.button_link} onChange={(event) => updateField('button_link', event.target.value)} placeholder="/products" disabled={!canManage} />
              </label>
              <label className="span-2">
                Image URL
                <input value={form.image_url} onChange={(event) => updateField('image_url', event.target.value)} placeholder="Optional hero/banner image URL" disabled={!canManage} />
              </label>
              <label>
                Theme
                <select value={form.theme} onChange={(event) => updateField('theme', event.target.value)} disabled={!canManage}>
                  {themes.map((theme) => <option key={theme} value={theme}>{theme}</option>)}
                </select>
              </label>
              <label>
                Priority
                <input type="number" value={form.priority} onChange={(event) => updateField('priority', event.target.value)} disabled={!canManage} />
              </label>
              <label>
                Start Date
                <input type="datetime-local" value={form.start_date} onChange={(event) => updateField('start_date', event.target.value)} disabled={!canManage} />
              </label>
              <label>
                End Date
                <input type="datetime-local" value={form.end_date} onChange={(event) => updateField('end_date', event.target.value)} disabled={!canManage} />
              </label>
              <label className="checkbox-row span-2">
                <input type="checkbox" checked={form.is_active} onChange={(event) => updateField('is_active', event.target.checked)} disabled={!canManage} />
                Active
              </label>
            </div>

            <div className="announcement-preview-panel">
              <h3>Preview</h3>
              <AnnouncementPreview announcement={form} />
            </div>

            <div className="announcement-modal-actions">
              <button type="button" className="announcement-secondary-button" onClick={() => setModalOpen(false)}>Cancel</button>
              {canManage ? <button type="submit" className="announcement-primary-button" disabled={saving}>{saving ? 'Saving...' : 'Save Announcement'}</button> : null}
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
