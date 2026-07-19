import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, Search } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { adminAPI } from '../services/api'
import './AdminAuditLogs.css'

const formatDateTime = (value) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

const formatAction = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

export default function AdminAuditLogs() {
  const { isAdmin } = useAuthStore()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  const fetchLogs = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getAuditLogs({ limit: 150 })
      setLogs(response.data || [])
    } catch (error) {
      toast.error(error?.response?.status === 401 || error?.response?.status === 403
        ? 'Session expired. Please log in again.'
        : 'Failed to load admin activity logs')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) fetchLogs()
  }, [isAdmin])

  const actionOptions = useMemo(() => (
    [...new Set(logs.map((log) => log.action).filter(Boolean))].sort()
  ), [logs])

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase()
    return logs.filter((log) => {
      const matchesAction = !actionFilter || log.action === actionFilter
      const haystack = [
        log.admin_name,
        log.admin_email,
        log.action,
        log.entity_type,
        log.entity_id,
        log.description,
        log.ip_address,
      ].join(' ').toLowerCase()
      return matchesAction && (!term || haystack.includes(term))
    })
  }, [logs, search, actionFilter])

  if (!isAdmin) {
    return <div className="admin-page"><p>Access denied. Admin login required.</p></div>
  }

  return (
    <div className="admin-page audit-page">
      <div className="audit-header">
        <div>
          <h1>Admin Activity Logs</h1>
          <p>Track important admin actions across FoodNova.</p>
        </div>
        <button type="button" className="audit-refresh" onClick={fetchLogs} disabled={loading}>
          <RefreshCw size={18} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="audit-filters">
        <label className="audit-search">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search logs"
          />
        </label>
        <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
          <option value="">All actions</option>
          {actionOptions.map((action) => (
            <option key={action} value={action}>{formatAction(action)}</option>
          ))}
        </select>
      </div>

      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Date/Time</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Description</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="audit-empty">Loading activity logs...</td></tr>
            ) : filteredLogs.length ? (
              filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.created_at)}</td>
                  <td>
                    <strong>{log.admin_name || 'Admin'}</strong>
                    <small>{log.admin_email}</small>
                  </td>
                  <td><span className="audit-action">{formatAction(log.action)}</span></td>
                  <td>{log.entity_type ? `${log.entity_type}${log.entity_id ? ` #${log.entity_id}` : ''}` : 'N/A'}</td>
                  <td>{log.description || 'N/A'}</td>
                  <td>{log.ip_address || 'N/A'}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="6" className="audit-empty">No admin activity logged yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
