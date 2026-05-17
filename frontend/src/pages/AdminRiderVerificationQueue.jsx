import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, Search } from 'lucide-react'
import { adminAPI, resolveMediaUrl } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './WorkerPages.css'

const statuses = ['all', 'pending', 'approved', 'rejected', 'suspended']
const stages = ['all', 'account_created', 'identity_submitted', 'address_uploaded', 'emergency_contact_added', 'selfie_verified', 'admin_review', 'approved', 'rejected', 'suspended']

function chipClass(status) {
  const value = String(status || 'pending').toLowerCase()
  if (value.includes('approved') || value.includes('verified')) return 'APPROVED'
  if (value.includes('rejected')) return 'REJECTED'
  if (value.includes('suspended')) return 'SUSPENDED'
  return 'KYC_PENDING'
}

function stageLabel(value) {
  return String(value || 'account_created').replace(/_/g, ' ')
}

export default function AdminRiderVerificationQueue() {
  const { isAdmin, admin } = useAuthStore()
  const [riders, setRiders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState({ status: 'pending', stage: 'all', search: '' })
  const [reviewNote, setReviewNote] = useState('')

  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const isSuperAdmin = admin?.admin_role === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || permissions.length === 0))
  const canView = isSuperAdmin || ['workforce:view', 'workforce:manage', 'delivery:manage', 'riders:manage'].some((permission) => permissions.includes(permission))
  const canManage = isSuperAdmin || ['workforce:manage', 'delivery:manage', 'riders:manage'].some((permission) => permissions.includes(permission))

  const loadQueue = async () => {
    try {
      setLoading(true)
      const params = {}
      if (filters.status !== 'all') params.status = filters.status
      if (filters.stage !== 'all') params.stage = filters.stage
      if (filters.search.trim()) params.search = filters.search.trim()
      const response = await adminAPI.getRiderVerificationQueue(params)
      setRiders(response.data || [])
      if (selected) {
        const fresh = (response.data || []).find((item) => item.worker?.id === selected.worker?.id)
        if (fresh) setSelected(fresh)
      }
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to load rider verification queue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin && canView) loadQueue()
  }, [isAdmin, canView, filters.status, filters.stage])

  const filteredRiders = useMemo(() => riders, [riders])

  const review = async (action) => {
    if (!selected || !canManage) return
    try {
      const response = await adminAPI.reviewRiderVerification(selected.worker.id, action, { status: action, review_note: reviewNote })
      setSelected(response.rider || response.data)
      setReviewNote('')
      toast.success(`Rider ${stageLabel(action)}`)
      await loadQueue()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to update rider verification')
    }
  }

  if (!isAdmin) return <div className="admin-page"><p>Access denied.</p></div>
  if (!canView) return <div className="admin-page"><p>You do not have permission to view rider verification.</p></div>

  return (
    <div className="admin-page workforce-admin-page">
      <div className="workforce-header">
        <div>
          <h1>Rider Verification Queue</h1>
          <p>Review identity, NIN checks, documents, selfie, GPS, device context, and admin decisions before unlocking delivery operations.</p>
        </div>
        <button type="button" onClick={loadQueue}><RefreshCw size={16} /> Refresh</button>
      </div>

      <div className="workforce-filters">
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          {statuses.map((status) => <option key={status} value={status}>{stageLabel(status)}</option>)}
        </select>
        <select value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value })}>
          {stages.map((stage) => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}
        </select>
        <div className="worker-search-box">
          <Search size={16} />
          <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') loadQueue() }} placeholder="Search rider, phone, plate" />
        </div>
        <button type="button" onClick={loadQueue}>Search</button>
      </div>

      {loading ? <div className="worker-panel">Loading rider verification queue...</div> : (
        <div className="workforce-grid">
          {filteredRiders.map((item) => {
            const worker = item.worker || {}
            const kyc = item.kyc || {}
            return (
              <article className="workforce-card" key={worker.id}>
                <div className="workforce-card-head">
                  <div>
                    <h2>{worker.full_name}</h2>
                    <p>{worker.phone} - {worker.plate_number || 'No plate yet'}</p>
                  </div>
                  <span className={`worker-status ${chipClass(worker.kyc_status)}`}>{stageLabel(kyc.onboarding_stage)}</span>
                </div>
                <div className="worker-detail-grid">
                  <div><strong>NIN</strong><span>{kyc.nin_verified ? 'Verified' : 'Not verified'} {kyc.nin_last4 ? `...${kyc.nin_last4}` : ''}</span></div>
                  <div><strong>Identity</strong><span>{stageLabel(kyc.identity_status)}</span></div>
                  <div><strong>Address</strong><span>{stageLabel(kyc.address_status)}</span></div>
                  <div><strong>Emergency</strong><span>{stageLabel(kyc.emergency_status)}</span></div>
                  <div><strong>Selfie</strong><span>{stageLabel(kyc.selfie_status)}</span></div>
                  <div><strong>GPS</strong><span>{worker.latest_latitude ? `${worker.latest_latitude}, ${worker.latest_longitude}` : 'No GPS yet'}</span></div>
                </div>
                {item.approval_blockers?.length > 0 && <p><strong>Blockers:</strong> {item.approval_blockers.join(' ')}</p>}
                <button type="button" onClick={() => setSelected(item)}>Open rider detail</button>
              </article>
            )
          })}
          {!filteredRiders.length && <div className="worker-panel">No riders match this queue.</div>}
        </div>
      )}

      {selected && (
        <div className="worker-detail-drawer">
          <div className="workforce-card">
            <div className="workforce-card-head">
              <div>
                <h2>{selected.worker.full_name}</h2>
                <p>{selected.worker.email || selected.worker.phone}</p>
              </div>
              <button type="button" className="secondary-worker-button" onClick={() => setSelected(null)}>Close</button>
            </div>
            <div className="worker-detail-grid">
              <div><strong>Registration</strong><span>{selected.worker.created_at ? new Date(selected.worker.created_at).toLocaleString() : 'N/A'}</span></div>
              <div><strong>Vehicle</strong><span>{selected.worker.vehicle_type || 'N/A'} - {selected.worker.plate_number || 'N/A'}</span></div>
              <div><strong>Emergency</strong><span>{selected.worker.emergency_contact_name || 'N/A'} - {selected.worker.emergency_contact_phone || 'N/A'}</span></div>
              <div><strong>Provider</strong><span>{selected.kyc.provider_report_id || selected.worker.nin_report_id || 'No report'}</span></div>
              <div><strong>Fraud Flags</strong><span>{Object.entries(selected.kyc.fraud_flags || {}).filter(([, value]) => value).map(([key]) => stageLabel(key)).join(', ') || 'Clear'}</span></div>
              <div><strong>Device/GPS</strong><span>{selected.worker.latest_latitude ? `${selected.worker.latest_latitude}, ${selected.worker.latest_longitude}` : 'No GPS ping'}</span></div>
            </div>
            <div className="document-link-row">
              {(selected.documents || []).map((doc) => <a key={doc.id} href={resolveMediaUrl(doc.url)} target="_blank" rel="noopener noreferrer">{stageLabel(doc.type)}</a>)}
            </div>
            {selected.kyc.rejection_reason && <p><strong>Rejected reason:</strong> {selected.kyc.rejection_reason}</p>}
            <h3>Activity logs</h3>
            <div className="status-log-list">
              {(selected.status_logs || []).map((log) => <p key={log.id}><strong>{stageLabel(log.new_stage)}</strong> by {log.actor_name} - {log.created_at ? new Date(log.created_at).toLocaleString() : ''}</p>)}
            </div>
            {canManage && (
              <div className="worker-review-actions">
                <textarea rows="3" placeholder="Reason or resubmission instructions" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
                <div>
                  <button type="button" onClick={() => review('approve')}>Approve</button>
                  <button type="button" onClick={() => review('request_resubmission')}>Request resubmission</button>
                  <button type="button" onClick={() => review('reject')}>Reject</button>
                  <button type="button" onClick={() => review('suspend')}>Suspend</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
