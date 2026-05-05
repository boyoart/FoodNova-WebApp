import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { adminAPI } from '../services/api'
import toast from 'react-hot-toast'
import './AdminPages.css'

const TYPE_OPTIONS = [
  { value: 'broadcast', label: 'Broadcast' },
  { value: 'service', label: 'Service' },
  { value: 'promo', label: 'Promo' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
]

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'All Customers' },
]

export default function AdminBroadcasts() {
  const { isAdmin } = useAuthStore()
  const [broadcasts, setBroadcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'broadcast',
    audience: 'all',
  })

  useEffect(() => {
    if (isAdmin) {
      fetchBroadcasts()
    }
  }, [isAdmin])

  const fetchBroadcasts = async () => {
    try {
      setLoading(true)
      const res = await adminAPI.getBroadcasts()
      const broadcasts = Array.isArray(res?.data) ? res.data : Array.isArray(res?.broadcasts) ? res.broadcasts : []
      setBroadcasts(broadcasts)
    } catch (error) {
      toast.error('Failed to load broadcasts')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSendBroadcast = async (e) => {
    e.preventDefault()

    if (!formData.title.trim()) {
      toast.error('Please enter a title')
      return
    }

    if (!formData.message.trim()) {
      toast.error('Please enter a message')
      return
    }

    try {
      setSending(true)
      await adminAPI.createBroadcast({
        title: formData.title,
        message: formData.message,
        type: formData.type,
        audience: formData.audience,
      })
      
      toast.success('Broadcast sent to customers')
      setFormData({
        title: '',
        message: '',
        type: 'broadcast',
        audience: 'all',
      })
      
      await fetchBroadcasts()
    } catch (error) {
      toast.error('Failed to send broadcast')
      console.error(error)
    } finally {
      setSending(false)
    }
  }

  const handleDeleteBroadcast = async (id) => {
    if (!window.confirm('Are you sure you want to delete this broadcast?')) {
      return
    }

    try {
      await adminAPI.deleteBroadcast(id)
      toast.success('Broadcast deleted')
      await fetchBroadcasts()
    } catch (error) {
      toast.error('Failed to delete broadcast')
      console.error(error)
    }
  }

  const getTypeColor = (type) => {
    const colors = {
      broadcast: '#FF9800',
      service: '#2196F3',
      promo: '#4CAF50',
      warning: '#F44336',
      info: '#9C27B0',
    }
    return colors[type] || '#FF9800'
  }

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <p>Access denied. Admin login required.</p>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <h1>Broadcast Messages</h1>

      <form onSubmit={handleSendBroadcast} className="broadcast-form">
        <h2>Create New Broadcast</h2>

        <div className="form-group">
          <label htmlFor="title">Title</label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            placeholder="Enter broadcast title"
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="message">Message</label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleInputChange}
            placeholder="Enter broadcast message"
            className="form-input"
            rows="4"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="type">Type</label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleInputChange}
              className="form-input"
            >
              {TYPE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="audience">Audience</label>
            <select
              id="audience"
              name="audience"
              value={formData.audience}
              onChange={handleInputChange}
              className="form-input"
              disabled
            >
              {AUDIENCE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button type="submit" disabled={sending} className="btn-primary">
          {sending ? 'Sending...' : 'Send Broadcast'}
        </button>
      </form>

      <div className="broadcasts-section">
        <h2>Broadcast History</h2>

        {loading ? (
          <div className="loading">Loading broadcasts...</div>
        ) : broadcasts.length === 0 ? (
          <div className="empty-state">No broadcasts sent yet</div>
        ) : (
          <div className="broadcasts-list">
            {broadcasts.map(broadcast => (
              <div key={broadcast.id} className="broadcast-card">
                <div className="broadcast-header">
                  <div>
                    <h3>{broadcast.title}</h3>
                    <span
                      className="type-badge"
                      style={{
                        backgroundColor: getTypeColor(broadcast.type),
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        display: 'inline-block',
                        marginTop: '8px',
                      }}
                    >
                      {broadcast.type}
                    </span>
                  </div>
                  <div className="broadcast-status">
                    {broadcast.is_active ? (
                      <span className="status-active">Active</span>
                    ) : (
                      <span className="status-inactive">Inactive</span>
                    )}
                  </div>
                </div>

                <p className="broadcast-message">{broadcast.message}</p>

                <div className="broadcast-meta">
                  <p>
                    <strong>Created:</strong> {broadcast.created_at ? new Date(broadcast.created_at).toLocaleString() : 'Unknown'}
                  </p>
                  <p>
                    <strong>Created By:</strong> {broadcast.created_by || 'Admin'}
                  </p>
                  {broadcast.audience && (
                    <p>
                      <strong>Audience:</strong> {broadcast.audience}
                    </p>
                  )}
                </div>

                <div className="broadcast-actions">
                  <button
                    type="button"
                    onClick={() => handleDeleteBroadcast(broadcast.id)}
                    className="btn-danger"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
