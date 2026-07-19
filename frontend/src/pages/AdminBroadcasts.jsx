import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import api, { adminAPI } from '../services/api'
import { saveBroadcastForCustomers } from '../utils/notifications'
import toast from 'react-hot-toast'
import './AdminPages.css'

const TYPE_OPTIONS = [
  { value: 'broadcast', label: 'Broadcast' },
  { value: 'service', label: 'Service' },
  { value: 'promo', label: 'Promo' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
]

const AUDIENCE_OPTIONS = [{ value: 'all', label: 'All Customers' }]
const LOCAL_BROADCAST_KEY = 'foodnova_admin_broadcasts'

const getLocalBroadcasts = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_BROADCAST_KEY) || '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

const setLocalBroadcasts = (items) => {
  localStorage.setItem(LOCAL_BROADCAST_KEY, JSON.stringify(Array.isArray(items) ? items : []))
}

const normalizeBroadcasts = (body) => {
  if (Array.isArray(body)) return body
  if (Array.isArray(body?.data)) return body.data
  if (Array.isArray(body?.broadcasts)) return body.broadcasts
  if (Array.isArray(body?.items)) return body.items
  return []
}

const getErrorText = (error, fallback) => {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((item) => item?.msg || String(item)).join(' | ')
  return error?.response?.data?.message || error?.message || fallback
}

export default function AdminBroadcasts() {
  const { isAdmin } = useAuthStore()
  const [broadcasts, setBroadcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [usingLocalFallback, setUsingLocalFallback] = useState(false)
  const [formData, setFormData] = useState({ title: '', message: '', type: 'broadcast', audience: 'all' })

  useEffect(() => {
    if (isAdmin) fetchBroadcasts()
  }, [isAdmin])

  const fetchBroadcasts = async () => {
    try {
      setLoading(true)
      setUsingLocalFallback(false)
      const res = adminAPI.getBroadcasts ? await adminAPI.getBroadcasts() : await api.get('/admin/broadcasts')
      setBroadcasts(normalizeBroadcasts(res?.data || res))
    } catch (error) {
      console.warn('Broadcast endpoint unavailable. Showing local saved broadcasts.', error)
      setBroadcasts(getLocalBroadcasts())
      setUsingLocalFallback(true)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const pushLocalBroadcastToCustomerSide = (broadcast) => {
    const customerBroadcast = saveBroadcastForCustomers({
      ...broadcast,
      local_key: `broadcast-${broadcast.id}`,
      category: 'broadcast',
      type: broadcast.type || 'broadcast',
    })
    return customerBroadcast
  }

  const handleSendBroadcast = async (e) => {
    e.preventDefault()
    if (!formData.title.trim()) return toast.error('Please enter a title')
    if (!formData.message.trim()) return toast.error('Please enter a message')

    const payload = {
      title: formData.title.trim(),
      message: formData.message.trim(),
      type: formData.type,
      audience: formData.audience,
    }

    try {
      setSending(true)
      const created = adminAPI.createBroadcast ? await adminAPI.createBroadcast(payload) : (await api.post('/admin/broadcasts', payload)).data
      const createdBroadcast = created?.broadcast || created?.data || created || {
        ...payload,
        id: Date.now(),
        created_at: new Date().toISOString(),
        created_by: 'Admin',
        is_active: true,
      }

      const recipientCount = created?.recipient_count ?? createdBroadcast?.recipient_count
      toast.success(`Broadcast sent successfully${recipientCount !== undefined ? ` (${recipientCount} recipients)` : ''}`)
      setFormData({ title: '', message: '', type: 'broadcast', audience: 'all' })
      setBroadcasts((current) => [createdBroadcast, ...current])
      await fetchBroadcasts()
    } catch (error) {
      console.warn('Broadcast send endpoint failed. Saving broadcast locally.', error)
      const localBroadcast = {
        ...payload,
        id: `local-${Date.now()}`,
        created_at: new Date().toISOString(),
        created_by: 'Admin',
        is_active: true,
        local_only: true,
        recipient_count: 0,
      }
      const next = [localBroadcast, ...getLocalBroadcasts()]
      setLocalBroadcasts(next)
      pushLocalBroadcastToCustomerSide(localBroadcast)
      setBroadcasts(next)
      setUsingLocalFallback(true)
      toast.error(getErrorText(error, 'Backend broadcast endpoint is not available. Broadcast saved locally only, but it will show in this browser customer inbox for testing.'))
    } finally {
      setSending(false)
    }
  }

  const handleDeleteBroadcast = async (id) => {
    if (!window.confirm('Are you sure you want to delete this broadcast?')) return
    try {
      if (adminAPI.deleteBroadcast && !String(id).startsWith('local-')) await adminAPI.deleteBroadcast(id)
      else if (!String(id).startsWith('local-')) await api.delete(`/admin/broadcasts/${id}`)
      const next = broadcasts.filter((broadcast) => String(broadcast.id) !== String(id))
      setBroadcasts(next)
      setLocalBroadcasts(getLocalBroadcasts().filter((broadcast) => String(broadcast.id) !== String(id)))
      toast.success('Broadcast deleted')
    } catch (error) {
      toast.error(getErrorText(error, 'Failed to delete broadcast'))
      console.error(error)
    }
  }

  const getTypeColor = (type) => ({ broadcast: '#FF9800', service: '#2196F3', promo: '#4CAF50', warning: '#F44336', info: '#9C27B0' }[type] || '#FF9800')

  if (!isAdmin) return <div className="admin-page"><p>Access denied. Admin login required.</p></div>

  return (
    <div className="admin-page">
      <h1>Broadcast Messages</h1>
      {usingLocalFallback && <div className="form-notice warning" style={{ marginBottom: '1rem' }}><p>Backend broadcast endpoint is not responding yet. Broadcasts are saved locally and will show in this browser customer inbox for testing. Production-wide broadcast needs the backend endpoint.</p></div>}

      <form onSubmit={handleSendBroadcast} className="broadcast-form">
        <h2>Create New Broadcast</h2>
        <div className="form-group"><label htmlFor="title">Title</label><input type="text" id="title" name="title" value={formData.title} onChange={handleInputChange} placeholder="Enter broadcast title" className="form-input" /></div>
        <div className="form-group"><label htmlFor="message">Message</label><textarea id="message" name="message" value={formData.message} onChange={handleInputChange} placeholder="Enter broadcast message" className="form-input" rows="4" /></div>
        <div className="form-row"><div className="form-group"><label htmlFor="type">Type</label><select id="type" name="type" value={formData.type} onChange={handleInputChange} className="form-input">{TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div className="form-group"><label htmlFor="audience">Audience</label><select id="audience" name="audience" value={formData.audience} onChange={handleInputChange} className="form-input" disabled>{AUDIENCE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></div>
        <button type="submit" disabled={sending} className="btn-primary">{sending ? 'Sending...' : 'Send Broadcast'}</button>
      </form>

      <div className="broadcasts-section"><h2>Broadcast History</h2>{loading ? <div className="loading">Loading broadcasts...</div> : broadcasts.length === 0 ? <div className="empty-state">No broadcasts sent yet</div> : <div className="broadcasts-list">{broadcasts.map(broadcast => <div key={broadcast.id} className="broadcast-card"><div className="broadcast-header"><div><h3>{broadcast.title}</h3><span className="type-badge" style={{ backgroundColor: getTypeColor(broadcast.type), color: 'white', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', display: 'inline-block', marginTop: '8px' }}>{broadcast.type}{broadcast.local_only ? ' • local only' : ''}</span></div><div className="broadcast-status">{broadcast.is_active ? <span className="status-active">Active</span> : <span className="status-inactive">Inactive</span>}</div></div><p className="broadcast-message">{broadcast.message}</p><div className="broadcast-meta"><p><strong>Created:</strong> {broadcast.created_at ? new Date(broadcast.created_at).toLocaleString() : 'Unknown'}</p><p><strong>Created By:</strong> {broadcast.created_by || 'Admin'}</p><p><strong>Audience:</strong> {broadcast.audience || 'all'}</p>{'recipient_count' in broadcast && <p><strong>Recipients:</strong> {broadcast.recipient_count}</p>}</div><div className="broadcast-actions"><button type="button" onClick={() => handleDeleteBroadcast(broadcast.id)} className="btn-danger">Delete</button></div></div>)}</div>}</div>
    </div>
  )
}
