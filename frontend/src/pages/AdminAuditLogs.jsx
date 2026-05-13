import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, Search } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { adminAPI } from '../services/api'
import './AdminAuditLogs.css'

const PAGE_LIMIT = 10

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

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const dateHeading = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown Date'
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const formatted = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  if (sameDay(date, today)) return `Today — ${formatted}`
  if (sameDay(date, yesterday)) return `Yesterday — ${formatted}`
  return formatted
}

function groupLogsByDate(logs) {
  return logs.reduce((groups, log) => {
    const key = dateHeading(log.created_at)
    if (!groups[key]) groups[key] = []
    groups[key].push(log)
    return groups
  }, {})
}

export default function AdminAuditLogs() {
  const { isAdmin } = useAuthStore()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [appliedRange, setAppliedRange] = useState({ start_date: '', end_date: '' })
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)

  const fetchLogs = async (nextPage = page, range = appliedRange) => {
    try {
      setLoading(true)
      const params = {
        page: nextPage,
        limit: PAGE_LIMIT,
      }
      if (range.start_date) params.start_date = range.start_date
      if (range.end_date) params.end_date = range.end_date
      if (actionFilter) params.action = actionFilter
      const response = await adminAPI.getAuditLogs(params)
      setLogs(response.data || [])
      setPage(response.raw?.page || nextPage)
      setTotalPages(response.raw?.total_pages || 0)
      setTotal(response.raw?.total || 0)
    } catch (error) {
      toast.error(error?.response?.status === 401 || error?.response?.status === 403
        ? 'Session expired. Please log in again.'
        : (error?.response?.data?.detail || 'Failed to load admin activity logs'))
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) fetchLogs(1)
  }, [isAdmin, actionFilter])

  const applyDateRange = () => {
    if (startDate && endDate && startDate > endDate) {
      toast.error('Start date cannot be after end date')
      return
    }
    const nextRange = { start_date: startDate, end_date: endDate }
    setAppliedRange(nextRange)
    fetchLogs(1, nextRange)
  }

  const clearDateRange = () => {
    const emptyRange = { start_date: '', end_date: '' }
    setStartDate('')
    setEndDate('')
    setAppliedRange(emptyRange)
    fetchLogs(1, emptyRange)
  }

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return logs
    return logs.filter((log) => {
      const haystack = [
        log.admin_name,
        log.admin_email,
        log.action,
        log.entity_type,
        log.entity_id,
        log.description,
        log.ip_address,
      ].join(' ').toLowerCase()
      return haystack.includes(term)
    })
  }, [logs, search])

  const groupedLogs = useMemo(() => groupLogsByDate(filteredLogs), [filteredLogs])
  const groupEntries = Object.entries(groupedLogs)

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
        <button type="button" className="audit-refresh" onClick={() => fetchLogs(page)} disabled={loading}>
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
            placeholder="Search current page"
          />
        </label>
        <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
          <option value="">All actions</option>
          {['admin_login', 'order_deleted', 'payment_confirmed', 'payment_rejected', 'announcement_created', 'announcement_updated', 'worker_approved', 'worker_rejected', 'worker_suspended'].map((action) => (
            <option key={action} value={action}>{formatAction(action)}</option>
          ))}
        </select>
        <label className="audit-date-filter">
          <span>Start date</span>
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="audit-date-filter">
          <span>End date</span>
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <button type="button" className="audit-filter-button" onClick={applyDateRange} disabled={loading}>Apply</button>
        <button type="button" className="audit-clear-button" onClick={clearDateRange} disabled={loading || (!appliedRange.start_date && !appliedRange.end_date && !startDate && !endDate)}>Clear</button>
      </div>

      <div className="audit-summary">
        <span>{total} log{total === 1 ? '' : 's'} found</span>
        {(appliedRange.start_date || appliedRange.end_date) && (
          <span>
            Period: {appliedRange.start_date || 'Beginning'} to {appliedRange.end_date || 'Today'}
          </span>
        )}
      </div>

      <div className="audit-log-list">
        {loading ? (
          <div className="audit-empty">Loading activity logs...</div>
        ) : groupEntries.length ? (
          groupEntries.map(([heading, items]) => (
            <section className="audit-date-group" key={heading}>
              <h2>{heading}</h2>
              <div className="audit-table-wrap">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Admin</th>
                      <th>Action</th>
                      <th>Entity</th>
                      <th>Description</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((log) => (
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
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        ) : (
          <div className="audit-empty">No activity logs found for this period.</div>
        )}
      </div>

      <div className="audit-pagination">
        <button type="button" onClick={() => fetchLogs(Math.max(1, page - 1))} disabled={loading || page <= 1}>Previous</button>
        <span>Page {totalPages ? page : 0} of {totalPages}</span>
        <button type="button" onClick={() => fetchLogs(Math.min(totalPages, page + 1))} disabled={loading || !totalPages || page >= totalPages}>Next</button>
      </div>
    </div>
  )
}
