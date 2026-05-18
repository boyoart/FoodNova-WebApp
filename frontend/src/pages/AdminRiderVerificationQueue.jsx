import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { adminAPI, resolveMediaUrl } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './WorkerPages.css'

const statuses = ['all', 'pending', 'approved', 'rejected', 'suspended']
const stages = ['all', 'account_created', 'identity_submitted', 'address_uploaded', 'emergency_contact_added', 'admin_review', 'approved', 'rejected', 'suspended']

function label(value) {
  return String(value || '').replace(/_/g, ' ') || 'N/A'
}

function chip(value) {
  const text = String(value || '').toLowerCase()
  if (text.includes('approved') || text.includes('verified')) return 'APPROVED'
  if (text.includes('rejected')) return 'REJECTED'
  if (text.includes('suspended')) return 'SUSPENDED'
  return 'KYC_PENDING'
}

function formatNairaBalance(balance) {
  if (balance?.formatted_balance) return balance.formatted_balance
  const value = Number(balance?.balance ?? 0)
  return `₦${value.toLocaleString('en-NG', { maximumFractionDigits: 0 })} remaining`
}

function riskLevel(item) {
  const flags = item?.kyc?.fraud_flags || {}
  const blockers = item?.approval_blockers || []
  if (flags.duplicate_nin || flags.duplicate_selfie || flags.identity_mismatch) return 'High'
  if (blockers.length || !item?.kyc?.nin_verified) return 'Medium'
  return 'Low'
}

export default function AdminRiderVerificationQueue() {
  const { isAdmin, admin } = useAuthStore()
  const [riders, setRiders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState({ status: 'pending', stage: 'all', search: '' })
  const [reviewAction, setReviewAction] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [balance, setBalance] = useState(null)

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
      try {
        const balanceResponse = await adminAPI.getNinProviderBalance()
        setBalance(balanceResponse.balance || balanceResponse.data || null)
      } catch {
        setBalance({ available: false, message: 'Provider wallet balance unavailable' })
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

  const counts = useMemo(() => ({
    pending: riders.filter((item) => !['APPROVED', 'REJECTED', 'SUSPENDED'].includes(item.worker?.kyc_status)).length,
    approved: riders.filter((item) => item.worker?.kyc_status === 'APPROVED').length,
    rejected: riders.filter((item) => item.worker?.kyc_status === 'REJECTED').length,
    suspended: riders.filter((item) => item.worker?.kyc_status === 'SUSPENDED').length,
  }), [riders])

  const submitReview = async () => {
    if (!selected || !reviewAction || !canManage) return
    try {
      const response = await adminAPI.reviewRiderVerification(selected.worker.id, reviewAction, { status: reviewAction, review_note: reviewNote })
      setSelected(response.rider || response.data)
      setReviewAction('')
      setReviewNote('')
      toast.success(`Rider ${label(reviewAction)}`)
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
          <p>Operations review for KYC, fraud checks, documents, and activation readiness.</p>
        </div>
        <button type="button" onClick={loadQueue}><RefreshCw size={16} /> Refresh</button>
      </div>

      <section className="verification-summary-strip">
        {Object.entries(counts).map(([key, value]) => <div key={key}><strong>{value}</strong><span>{label(key)}</span></div>)}
      </section>
      <section className={`verification-wallet-monitor ${balance?.is_low ? 'low' : ''}`}>
        <div>
          <span>Verification Wallet Monitor</span>
          <strong>NIN Verification Balance</strong>
        </div>
        <div className="verification-wallet-balance">{balance ? formatNairaBalance(balance) : 'Checking balance...'}</div>
        {balance?.is_low && (
          <div className="verification-wallet-warning">
            <AlertTriangle size={18} />
            <span>⚠ Low verification balance</span>
          </div>
        )}
      </section>

      <div className="workforce-filters">
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          {statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
        </select>
        <select value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value })}>
          {stages.map((stage) => <option key={stage} value={stage}>{label(stage)}</option>)}
        </select>
        <div className="worker-search-box">
          <Search size={16} />
          <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') loadQueue() }} placeholder="Search rider, phone, plate" />
        </div>
        <button type="button" onClick={loadQueue}>Search</button>
      </div>

      <div className="verification-workbench">
        <section className="verification-table-panel">
          {loading ? <div className="worker-panel">Loading rider queue...</div> : (
            <table className="verification-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Phone</th>
                  <th>Registered</th>
                  <th>KYC</th>
                  <th>Verification</th>
                  <th>Risk</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {riders.map((item) => {
                  const worker = item.worker || {}
                  const risk = riskLevel(item)
                  return (
                    <tr key={worker.id} className={selected?.worker?.id === worker.id ? 'selected' : ''}>
                      <td>
                        <div className="rider-cell">
                          <span className="rider-avatar">{worker.profile_photo_url ? <img src={resolveMediaUrl(worker.profile_photo_url)} alt="" /> : (worker.full_name || 'R').slice(0, 1)}</span>
                          <div><strong>{worker.full_name}</strong><small>{worker.plate_number || 'No plate'}</small></div>
                        </div>
                      </td>
                      <td>{worker.phone}</td>
                      <td>{worker.created_at ? new Date(worker.created_at).toLocaleDateString() : 'N/A'}</td>
                      <td><span className={`worker-status ${chip(worker.kyc_status)}`}>{label(item.kyc?.onboarding_stage)}</span></td>
                      <td>
                        <div className="verification-result-cell">
                          <span className={`worker-status ${item.kyc?.nin_verified ? 'approved' : chip(item.kyc?.identity_status)}`}>{item.kyc?.nin_verified ? 'Verified' : label(item.kyc?.identity_status || 'not_started')}</span>
                          <small>{item.kyc?.failed_verification_attempts ? `${item.kyc.failed_verification_attempts} failed attempt${item.kyc.failed_verification_attempts === 1 ? '' : 's'}` : item.kyc?.provider_report_id || 'No report yet'}</small>
                        </div>
                      </td>
                      <td><span className={`risk-chip risk-${risk.toLowerCase()}`}>{risk}</span></td>
                      <td><button type="button" onClick={() => setSelected(item)}>Review</button></td>
                    </tr>
                  )
                })}
                {!riders.length && <tr><td colSpan="7" className="verification-empty">No riders match this queue.</td></tr>}
              </tbody>
            </table>
          )}
        </section>

        <aside className="verification-detail-panel">
          {!selected ? (
            <div className="empty-detail"><ShieldCheck size={28} /><p>Select a rider to review profile, NIN result, documents, selfie, and activity history.</p></div>
          ) : (
            <>
              <div className="workforce-card-head">
                <div>
                  <h2>{selected.worker.full_name}</h2>
                  <p>{label(selected.kyc?.onboarding_stage)} - {selected.worker.phone}</p>
                </div>
                <span className={`worker-status ${chip(selected.worker.kyc_status)}`}>{selected.worker.kyc_status}</span>
              </div>
              <div className="worker-detail-grid">
                <div><strong>Submitted NIN</strong><span>{selected.kyc.submitted_nin || (selected.kyc.nin_last4 ? `*******${selected.kyc.nin_last4}` : 'Not submitted')}</span></div>
                <div><strong>Verification</strong><span>{selected.kyc.nin_verified ? 'Verified' : label(selected.kyc.identity_status)} {selected.kyc.provider_report_id || selected.worker.nin_report_id || 'No report'}</span></div>
                <div><strong>Verified name</strong><span>{[selected.worker.verified_first_name, selected.worker.verified_middle_name, selected.worker.verified_surname].filter(Boolean).join(' ') || 'No provider name'}</span></div>
                <div><strong>Provider phone</strong><span>{selected.worker.verified_phone || 'No provider phone'}</span></div>
                <div><strong>Verified at</strong><span>{selected.kyc.timestamps?.identity_verified_at ? new Date(selected.kyc.timestamps.identity_verified_at).toLocaleString() : selected.kyc.timestamps?.last_verification_at ? new Date(selected.kyc.timestamps.last_verification_at).toLocaleString() : 'No verification timestamp'}</span></div>
                <div><strong>Failed attempts</strong><span>{selected.kyc.failed_verification_attempts || 0}</span></div>
                <div><strong>Address</strong><span>{label(selected.kyc.address_status)}</span></div>
                <div><strong>Emergency</strong><span>{selected.worker.emergency_contact_name || 'Missing'}</span></div>
                <div><strong>GPS</strong><span>{selected.worker.latest_latitude ? `${selected.worker.latest_latitude}, ${selected.worker.latest_longitude}` : 'No GPS ping'}</span></div>
                <div><strong>Risk</strong><span>{riskLevel(selected)}</span></div>
              </div>
              {selected.worker.verified_photo_url && (
                <div className="verified-photo-strip">
                  <img src={resolveMediaUrl(selected.worker.verified_photo_url)} alt="" />
                  <div><strong>Provider profile photo</strong><span>Returned by CheckMyNINBVN after successful verification.</span></div>
                </div>
              )}
              {selected.approval_blockers?.length > 0 && <p className="verification-warning"><strong>Blockers:</strong> {selected.approval_blockers.join(' ')}</p>}
              <div className="document-link-row">
                {(selected.documents || []).map((doc) => <a key={doc.id} href={resolveMediaUrl(doc.url)} target="_blank" rel="noopener noreferrer">{label(doc.type)}</a>)}
              </div>
              <h3>Verification response</h3>
              <div className="status-log-list">
                {(selected.verification_logs || []).slice(0, 4).map((log) => <p key={log.id}><strong>{log.provider}</strong> {log.success ? 'verified' : log.error_code || log.status} - {log.message || 'No message'}</p>)}
                {!selected.verification_logs?.length && <p>No provider log yet.</p>}
              </div>
              <h3>Activity history</h3>
              <div className="status-log-list">
                {(selected.status_logs || []).slice(0, 5).map((log) => <p key={log.id}><strong>{label(log.new_stage)}</strong> by {log.actor_name} - {log.created_at ? new Date(log.created_at).toLocaleString() : ''}</p>)}
              </div>
              <h3>Login history</h3>
              <div className="status-log-list">
                {(selected.login_history || []).slice(0, 4).map((session) => <p key={session.id}><strong>{session.active ? 'Active' : 'Revoked'}</strong> {session.device?.device_type || 'Device'} - {session.ip_address || 'No IP'} - {session.created_at ? new Date(session.created_at).toLocaleString() : ''}</p>)}
                {!selected.login_history?.length && <p>No rider session history yet.</p>}
              </div>
              {canManage && (
                <div className="worker-review-actions">
                  <select value={reviewAction} onChange={(event) => setReviewAction(event.target.value)}>
                    <option value="">Select action</option>
                    <option value="approve">Approve</option>
                    <option value="request_resubmission">Request resubmission</option>
                    <option value="reject">Reject</option>
                    <option value="suspend">Suspend</option>
                    <option value="deactivate">Deactivate</option>
                    <option value="force_logout">Force logout</option>
                    <option value="reset_onboarding">Reset onboarding</option>
                    <option value="delete">Delete rider</option>
                  </select>
                  <textarea rows="3" placeholder="Reason or resubmission instructions" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
                  <button type="button" disabled={!reviewAction} onClick={submitReview}>Submit review</button>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
