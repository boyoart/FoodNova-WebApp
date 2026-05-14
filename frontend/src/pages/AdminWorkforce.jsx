import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Copy, RefreshCw } from 'lucide-react'
import { adminAPI, resolveMediaUrl } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './WorkerPages.css'

const statusOptions = ['KYC_PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']

function workerTypeLabel(worker) {
  return worker.worker_type === 'rider' ? 'Rider / Delivery Partner' : 'Walking Messenger'
}

function locationHref(worker) {
  if (!worker.latest_latitude || !worker.latest_longitude) return ''
  return `https://www.google.com/maps?q=${worker.latest_latitude},${worker.latest_longitude}`
}

export default function AdminWorkforce() {
  const { isAdmin, admin } = useAuthStore()
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ worker_type: 'all', status: 'all', operational_status: 'all', zone: 'all' })
  const [reviewNotes, setReviewNotes] = useState({})

  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const isSuperAdmin = admin?.admin_role === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || permissions.length === 0))
  const canView = isSuperAdmin || ['workforce:view', 'workforce:manage', 'delivery:manage', 'riders:manage'].some((permission) => permissions.includes(permission))
  const canManage = isSuperAdmin || ['workforce:manage', 'delivery:manage', 'riders:manage'].some((permission) => permissions.includes(permission))
  const canViewKycDocuments = isSuperAdmin || permissions.includes('workforce:manage')

  const loadWorkers = async () => {
    try {
      setLoading(true)
      const params = {}
      if (filters.worker_type !== 'all') params.worker_type = filters.worker_type
      if (filters.status !== 'all') params.status = filters.status
      if (filters.operational_status !== 'all') params.operational_status = filters.operational_status
      if (filters.zone === 'inside') params.inside_zone = true
      if (filters.zone === 'outside') params.inside_zone = false
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
  }, [isAdmin, canView, filters.worker_type, filters.status, filters.operational_status, filters.zone])

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
          <p>Review private walking messenger and rider applications, KYC status, live location, and dispatch readiness.</p>
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

      <section className="invite-links-panel assignment-rules-panel">
        <h2>Dispatch Rules</h2>
        <p><strong>Walking messengers</strong> are hyperlocal. They must be approved, online, inside the operational zone, and have GPS fresher than 60 seconds before notifications or assignment.</p>
        <p><strong>Riders / delivery partners</strong> are wide-area. They must be approved, online, and GPS-recent, but messenger geo-fencing does not block them.</p>
      </section>

      <div className="workforce-filters">
        <select value={filters.worker_type} onChange={(event) => setFilters({ ...filters, worker_type: event.target.value })}>
          <option value="all">All types</option>
          <option value="messenger">Walking Messengers</option>
          <option value="rider">Riders / Partners</option>
        </select>
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="all">All KYC</option>
          {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select value={filters.operational_status} onChange={(event) => setFilters({ ...filters, operational_status: event.target.value })}>
          <option value="all">All operational</option>
          {['OFFLINE', 'ONLINE', 'ASSIGNED', 'ON_DELIVERY'].map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select value={filters.zone} onChange={(event) => setFilters({ ...filters, zone: event.target.value })}>
          <option value="all">All zone states</option>
          <option value="inside">Inside messenger zone</option>
          <option value="outside">Outside messenger zone</option>
        </select>
      </div>

      {loading ? <div className="worker-panel">Loading workforce...</div> : (
        <div className="workforce-grid">
          {visibleWorkers.map((worker) => (
            <article className="workforce-card" key={worker.id}>
              <div className="workforce-card-head">
                <div>
                  <h2>{worker.full_name}</h2>
                  <p>{workerTypeLabel(worker)} - {worker.phone}</p>
                </div>
                <span className={`worker-status ${worker.kyc_status}`}>{worker.kyc_status}</span>
              </div>
              <div className="worker-detail-grid">
                <div><strong>Operational</strong><span>{worker.operational_status}</span></div>
                <div><strong>Coverage</strong><span>{worker.assignment_scope === 'wide_area' ? 'Wide area' : 'Hyperlocal'}</span></div>
                <div><strong>Geo-Fence</strong><span>{worker.geo_fence_enforced ? (worker.inside_zone ? 'Inside zone' : 'Outside zone') : 'Not enforced'}</span></div>
                <div><strong>Last Seen</strong><span>{worker.last_seen_at ? new Date(worker.last_seen_at).toLocaleString() : 'No GPS yet'}</span></div>
                <div><strong>GPS Fresh</strong><span>{worker.gps_recent ? 'Yes' : 'No'}</span></div>
                <div><strong>Assignment</strong><span>{worker.assignment_eligible ? 'Eligible' : 'Not eligible'}</span></div>
                <div><strong>Trust Score</strong><span>{worker.trust_score}</span></div>
              </div>
              <p><strong>Readiness:</strong> {worker.assignment_eligibility_reason || 'N/A'}</p>
              <p><strong>Address:</strong> {worker.home_address || 'N/A'}</p>
              <p><strong>Emergency:</strong> {worker.emergency_contact_name} - {worker.emergency_contact_phone}</p>
              <p><strong>NIN:</strong> {worker.masked_nin || 'Not verified'} - {worker.nin_verified ? 'Verified' : 'Not verified'}</p>
              {worker.nin_verified && (
                <p><strong>Verified Identity:</strong> {[worker.verified_first_name, worker.verified_middle_name, worker.verified_surname].filter(Boolean).join(' ') || 'N/A'}</p>
              )}
              {worker.nin_report_id && <p><strong>NIN Report:</strong> {worker.nin_report_id}</p>}
              {worker.worker_type === 'rider' && <p><strong>Partner Company:</strong> {worker.partner_company || 'Independent rider'}</p>}
              {locationHref(worker) && <a href={locationHref(worker)} target="_blank" rel="noopener noreferrer">View live GPS location</a>}
              {canViewKycDocuments && worker.selfie_url && <a href={resolveMediaUrl(worker.selfie_url)} target="_blank" rel="noopener noreferrer">View selfie</a>}
              {canViewKycDocuments && worker.id_document_url && <a href={resolveMediaUrl(worker.id_document_url)} target="_blank" rel="noopener noreferrer">View ID document</a>}
              {canViewKycDocuments && worker.vehicle_photo_url && <a href={resolveMediaUrl(worker.vehicle_photo_url)} target="_blank" rel="noopener noreferrer">View vehicle photo</a>}
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
