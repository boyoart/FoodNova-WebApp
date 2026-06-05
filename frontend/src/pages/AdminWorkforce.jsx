import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Copy, RefreshCw, Trash2 } from 'lucide-react'
import { adminAPI, resolveMediaUrl } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './WorkerPages.css'

const statusOptions = ['KYC_PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']

function workerTypeLabel(worker) {
  if (worker.worker_type === 'messenger') return 'Walking Messenger'
  if (worker.rider_type === 'bicycle') return 'Bicycle Rider'
  return 'Motorcycle Rider'
}

function locationHref(worker) {
  if (!worker.latest_latitude || !worker.latest_longitude) return ''
  return `https://www.google.com/maps?q=${worker.latest_latitude},${worker.latest_longitude}`
}

export default function AdminWorkforce() {
  const { isAdmin, admin } = useAuthStore()
  const [workers, setWorkers] = useState([])
  const [offers, setOffers] = useState([])
  const [assignmentMode, setAssignmentMode] = useState('automatic')
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

  const loadOffers = async () => {
    try {
      const response = await adminAPI.getDeliveryOffers()
      setOffers(response.data || [])
    } catch (error) {
      if (![401, 403].includes(error?.response?.status)) console.error(error)
      setOffers([])
    }
  }

  const loadAssignmentMode = async () => {
    try {
      const response = await adminAPI.getDeliveryAssignmentMode()
      setAssignmentMode(response.mode || response.data?.mode || 'automatic')
    } catch (error) {
      if (![401, 403].includes(error?.response?.status)) console.error(error)
    }
  }

  useEffect(() => {
    if (isAdmin && canView) {
      loadWorkers()
      loadOffers()
      loadAssignmentMode()
    }
  }, [isAdmin, canView, filters.worker_type, filters.status, filters.operational_status, filters.zone])

  useEffect(() => {
    if (!isAdmin || !canView) return undefined
    const interval = window.setInterval(() => {
      loadWorkers()
      loadOffers()
    }, 20000)
    return () => window.clearInterval(interval)
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

  const deleteWorker = async (worker) => {
    if (!canManage) return
    if (worker.worker_type !== 'rider') {
      toast.error('Permanent delete is available for rider profiles only.')
      return
    }
    const confirmed = window.confirm(`Delete ${worker.full_name || 'this rider'} permanently? This removes login access and the rider profile.`)
    if (!confirmed) return
    try {
      await adminAPI.deleteWorker(worker.id)
      toast.success('Rider deleted')
      await loadWorkers()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to delete rider')
    }
  }

  const copyLink = async (path) => {
    const url = `${window.location.origin}${path}`
    await navigator.clipboard.writeText(url)
    toast.success('Private signup link copied')
  }

  const assignOffer = async (offer) => {
    try {
      await adminAPI.assignDeliveryOffer(offer.id)
      toast.success('Delivery assigned')
      await Promise.all([loadOffers(), loadWorkers()])
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to assign delivery')
    }
  }

  const rejectOffer = async (offer) => {
    try {
      await adminAPI.rejectDeliveryOffer(offer.id)
      toast.success('Offer rejected. Searching another worker if available.')
      await loadOffers()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to reject offer')
    }
  }

  const updateAssignmentMode = async (mode) => {
    if (!canManage) return
    try {
      await adminAPI.updateDeliveryAssignmentMode(mode)
      setAssignmentMode(mode)
      toast.success('Delivery assignment mode updated')
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to update assignment mode')
    }
  }

  const visibleWorkers = useMemo(() => workers, [workers])

  if (!isAdmin) return <div className="admin-page"><p>Access denied.</p></div>
  if (!canView) return <div className="admin-page"><p>You do not have permission to view delivery workforce.</p></div>

  return (
    <div className="admin-page workforce-admin-page">
      <div className="workforce-header">
        <div>
          <h1>Active Delivery Workforce</h1>
          <p>Review live riders/messengers, pending assignments, KYC status, location, and dispatch readiness.</p>
        </div>
        <button type="button" onClick={() => { loadWorkers(); loadOffers() }}><RefreshCw size={16} /> Refresh</button>
      </div>

      <section className="invite-links-panel">
        <h2>Delivery Assignment Mode</h2>
        <div className="assignment-mode-control">
          <button type="button" className={assignmentMode === 'automatic' ? 'active' : ''} onClick={() => updateAssignmentMode('automatic')} disabled={!canManage}>Automatic Assignment</button>
          <button type="button" className={assignmentMode === 'manual' ? 'active' : ''} onClick={() => updateAssignmentMode('manual')} disabled={!canManage}>Manual Approval</button>
        </div>
        <p className="muted">{assignmentMode === 'automatic' ? 'Workers are assigned automatically after accepting a valid offer.' : 'Admins confirm every accepted delivery offer before assignment.'}</p>
      </section>

      <section className="invite-links-panel">
        <h2>Delivery Requests / Pending Assignments</h2>
        {offers.length ? (
          <div className="pending-assignment-list">
            {offers.map((offer) => (
              <article className="delivery-offer-card" key={offer.id}>
                <div className="workforce-card-head">
                  <div>
                    <h3>{offer.order_code || `Order #${offer.order_id}`}</h3>
                    <p>{offer.delivery_type?.replace(/_/g, ' ') || 'delivery request'} - {offer.status}</p>
                  </div>
                  <span className="worker-status">{offer.worker_type || 'worker'}</span>
                </div>
                <div className="worker-detail-grid">
                  <div><strong>Suggested Worker</strong><span>{offer.worker_name || `Worker #${offer.worker_id}`}</span></div>
                  <div><strong>Worker Status</strong><span>{offer.worker_status || 'N/A'}</span></div>
                  <div><strong>Accepted Time</strong><span>{offer.accepted_at ? new Date(offer.accepted_at).toLocaleString() : 'Not accepted yet'}</span></div>
                  <div><strong>Distance</strong><span>{offer.estimated_distance_meters ? `${(offer.estimated_distance_meters / 1000).toFixed(1)} km` : 'N/A'}</span></div>
                </div>
                <div className="delivery-offer-actions">
                  <button type="button" onClick={() => assignOffer(offer)} disabled={offer.status !== 'ACCEPTED'}>Assign</button>
                  <button type="button" className="secondary-worker-button" onClick={() => rejectOffer(offer)}>Reject</button>
                  <button type="button" className="secondary-worker-button" onClick={() => window.location.assign('/admin/orders')}>Manual Assign</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">No pending delivery requests.</p>
        )}
      </section>

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
                <div><strong>Name</strong><span>{worker.full_name || 'N/A'}</span></div>
                <div><strong>Phone</strong><span>{worker.phone || 'N/A'}</span></div>
                <div><strong>Email</strong><span>{worker.email || 'N/A'}</span></div>
                <div><strong>Rider Type</strong><span>{workerTypeLabel(worker)}</span></div>
                <div><strong>NIN Status</strong><span>{worker.nin_verified ? 'Verified' : 'Not verified'}</span></div>
                <div><strong>Approval Status</strong><span>{worker.kyc_status || 'KYC_PENDING'}</span></div>
                <div><strong>Registration Date</strong><span>{worker.created_at ? new Date(worker.created_at).toLocaleString() : 'N/A'}</span></div>
                <div><strong>Operating City</strong><span>{worker.operating_city || worker.home_address || 'N/A'}</span></div>
              </div>
              <p><strong>Emergency:</strong> {worker.emergency_contact_name || 'N/A'} - {worker.emergency_contact_phone || 'N/A'}{worker.emergency_contact_relationship ? ` (${worker.emergency_contact_relationship})` : ''}</p>
              <p><strong>NIN:</strong> {worker.masked_nin || 'Not verified'} - {worker.nin_verified ? 'Verified' : 'Not verified'}</p>
              {worker.nin_verified && (
                <p><strong>Verified Identity:</strong> {[worker.verified_first_name, worker.verified_middle_name, worker.verified_surname].filter(Boolean).join(' ') || 'N/A'}</p>
              )}
              {worker.nin_report_id && <p><strong>NIN Report:</strong> {worker.nin_report_id}</p>}
              {worker.worker_type === 'rider' && <p><strong>Motorcycle:</strong> {[worker.vehicle_type, worker.plate_number].filter(Boolean).join(' - ') || 'Not required'}</p>}
              <p><strong>Operational:</strong> {worker.operational_status} - {worker.assignment_eligibility_reason || 'N/A'}</p>
              {locationHref(worker) && <a href={locationHref(worker)} target="_blank" rel="noopener noreferrer">View live GPS location</a>}
              {canViewKycDocuments && worker.selfie_url && <a href={resolveMediaUrl(worker.selfie_url)} target="_blank" rel="noopener noreferrer">View selfie</a>}
              {canViewKycDocuments && worker.vehicle_photo_url && <a href={resolveMediaUrl(worker.vehicle_photo_url)} target="_blank" rel="noopener noreferrer">View vehicle photo</a>}
              {canManage && (
                <div className="worker-review-actions">
                  <input placeholder="Admin note optional" value={reviewNotes[worker.id] || ''} onChange={(event) => setReviewNotes({ ...reviewNotes, [worker.id]: event.target.value })} />
                  <div>
                    <button type="button" onClick={() => updateWorkerStatus(worker, 'APPROVED')}>Approve</button>
                    <button type="button" onClick={() => updateWorkerStatus(worker, 'REJECTED')}>Reject</button>
                    <button type="button" onClick={() => updateWorkerStatus(worker, 'SUSPENDED')}>Suspend</button>
                    <button type="button" onClick={() => updateWorkerStatus(worker, 'APPROVED')}>Reactivate</button>
                    <button type="button" className="danger-worker-button" onClick={() => deleteWorker(worker)}><Trash2 size={14} /> Delete</button>
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
