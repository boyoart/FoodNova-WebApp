import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Copy, RefreshCw } from 'lucide-react'
import { adminAPI, resolveMediaUrl } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './WorkerPages.css'

const statusOptions = ['KYC_PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']

export default function AdminWorkforce() {
  const { isAdmin, admin } = useAuthStore()
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ worker_type: 'all', status: 'all', operational_status: 'all' })
  const [reviewNotes, setReviewNotes] = useState({})

  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const isSuperAdmin = admin?.admin_role === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || permissions.length === 0))
  const canView = isSuperAdmin || ['workforce:view', 'workforce:manage', 'delivery:manage', 'riders:manage'].some((permission) => permissions.includes(permission))
  const canManage = isSuperAdmin || ['workforce:manage', 'delivery:manage', 'riders:manage'].some((permission) => permissions.includes(permission))

  const loadWorkers = async () => {
    try {
      setLoading(true)
      const params = {}
      if (filters.worker_type !== 'all') params.worker_type = filters.worker_type
      if (filters.status !== 'all') params.status = filters.status
      if (filters.operational_status !== 'all') params.operational_status = filters.operational_status
      const response = await adminAPI.getWorkforce(params)
      setWorkers(response.data || [])
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to load delivery workforce')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin && canView) loadWorkers()
  }, [isAdmin, canView, filters.worker_type, filters.status, filters.operational_status])

  const updateWorkerStatus = async (worker, status) => {
    if (!canManage) return
    try {
      await adminAPI.updateWorkerStatus(worker.id, { status, review_note: reviewNotes[worker.id] || '' })
      toast.success(`Worker set to ${status}`)
      await loadWorkers()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to update worker')
    }
  }

  const copyLink = async (path) => {
    const url = `${window.location.origin}${path}`
    await navigator.clipboard.writeText(url)
    toast.success('Private signup link copied')
  }

  const visibleWorkers = useMemo(() => workers, [workers])

  if (!isAdmin) return <div className="admin-page"><p>Access denied.</p></div>
  if (!canView) return <div className="admin-page"><p>You do not have permission to view delivery workforce.</p></div>

  return (
    <div className="admin-page workforce-admin-page">
      <div className="workforce-header">
        <div>
          <h1>Delivery Workforce</h1>
          <p>Review private messenger and rider applications, KYC status, live location, and operational readiness.</p>
        </div>
        <button type="button" onClick={loadWorkers}><RefreshCw size={16} /> Refresh</button>
      </div>

      <section className="invite-links-panel">
        <h2>Private Invite Links</h2>
        <div>
          <button type="button" onClick={() => copyLink('/messenger/signup')}><Copy size={16} /> Messenger Signup Link</button>
          <button type="button" onClick={() => copyLink('/rider/signup')}><Copy size={16} /> Rider Signup Link</button>
        </div>
      </section>

      <div className="workforce-filters">
        <select value={filters.worker_type} onChange={(event) => setFilters({ ...filters, worker_type: event.target.value })}>
          <option value="all">All types</option>
          <option value="messenger">Messenger</option>
          <option value="rider">Rider</option>
        </select>
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="all">All KYC</option>
          {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select value={filters.operational_status} onChange={(event) => setFilters({ ...filters, operational_status: event.target.value })}>
          <option value="all">All operational</option>
          {['OFFLINE', 'ONLINE', 'ASSIGNED', 'ON_DELIVERY'].map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </div>

      {loading ? <div className="worker-panel">Loading workforce...</div> : (
        <div className="workforce-grid">
          {visibleWorkers.map((worker) => (
            <article className="workforce-card" key={worker.id}>
              <div className="workforce-card-head">
                <div>
                  <h2>{worker.full_name}</h2>
                  <p>{worker.worker_type} · {worker.phone}</p>
                </div>
                <span className={`worker-status ${worker.kyc_status}`}>{worker.kyc_status}</span>
              </div>
              <div className="worker-detail-grid">
                <div><strong>Operational</strong><span>{worker.operational_status}</span></div>
                <div><strong>Zone</strong><span>{worker.worker_type === 'messenger' ? (worker.inside_zone ? 'Inside' : 'Outside') : 'Rider coverage'}</span></div>
                <div><strong>Last Seen</strong><span>{worker.last_seen_at ? new Date(worker.last_seen_at).toLocaleString() : 'No GPS yet'}</span></div>
                <div><strong>Trust Score</strong><span>{worker.trust_score}</span></div>
              </div>
              <p><strong>Address:</strong> {worker.home_address || 'N/A'}</p>
              <p><strong>Emergency:</strong> {worker.emergency_contact_name} · {worker.emergency_contact_phone}</p>
              {worker.profile_photo_url && <a href={resolveMediaUrl(worker.profile_photo_url)} target="_blank" rel="noopener noreferrer">View profile photo</a>}
              {worker.id_document_url && <a href={resolveMediaUrl(worker.id_document_url)} target="_blank" rel="noopener noreferrer">View ID document</a>}
              {worker.vehicle_photo_url && <a href={resolveMediaUrl(worker.vehicle_photo_url)} target="_blank" rel="noopener noreferrer">View vehicle photo</a>}
              {canManage && (
                <div className="worker-review-actions">
                  <input placeholder="Admin note optional" value={reviewNotes[worker.id] || ''} onChange={(event) => setReviewNotes({ ...reviewNotes, [worker.id]: event.target.value })} />
                  <div>
                    <button type="button" onClick={() => updateWorkerStatus(worker, 'APPROVED')}>Approve</button>
                    <button type="button" onClick={() => updateWorkerStatus(worker, 'REJECTED')}>Reject</button>
                    <button type="button" onClick={() => updateWorkerStatus(worker, 'SUSPENDED')}>Suspend</button>
                    <button type="button" onClick={() => updateWorkerStatus(worker, 'APPROVED')}>Reactivate</button>
                  </div>
                </div>
              )}
            </article>
          ))}
          {!visibleWorkers.length && <div className="worker-panel">No delivery workers found.</div>}
        </div>
      )}
    </div>
  )
}
