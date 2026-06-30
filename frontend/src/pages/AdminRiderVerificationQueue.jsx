import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, PauseCircle, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2, UserCheck, UserX, X } from 'lucide-react'
import { adminAPI, resolveMediaUrl } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './WorkerPages.css'

const statuses = ['all', 'pending', 'approved', 'rejected', 'suspended', 'deactivated', 'deleted']
const stages = ['all', 'account_created', 'identity_submitted', 'address_uploaded', 'emergency_contact_added', 'admin_review', 'approved', 'rejected', 'suspended', 'deactivated', 'deleted']

function label(value) {
  return String(value || '').replace(/_/g, ' ') || 'N/A'
}

function chip(value) {
  const text = String(value || '').toLowerCase()
  if (text.includes('approved') || text.includes('verified')) return 'APPROVED'
  if (text.includes('rejected')) return 'REJECTED'
  if (text.includes('suspended')) return 'SUSPENDED'
  if (text.includes('deleted') || text.includes('deactivated')) return 'REJECTED'
  return 'KYC_PENDING'
}

function formatNairaBalance(balance) {
  if (balance?.formatted_balance) return balance.formatted_balance
  const raw = typeof balance === 'number' ? balance : balance?.balance
  if (raw === null || raw === undefined || raw === '') return 'Balance unavailable'
  const value = Number(raw)
  if (Number.isNaN(value)) return String(raw)
  return `NGN ${value.toLocaleString('en-NG', { maximumFractionDigits: 0 })} remaining`
}

function riskLevel(item) {
  const flags = item?.kyc?.fraud_flags || {}
  const blockers = item?.approval_blockers || []
  if (flags.duplicate_nin || flags.duplicate_selfie || flags.identity_mismatch) return 'High'
  if (blockers.length || !item?.kyc?.nin_verified) return 'Medium'
  return 'Low'
}

function riderPhotoUrl(worker = {}) {
  return String(worker.profile_photo_url || worker.rider_photo_url || worker.selfie_url || worker.photo_url || '').trim()
}

function profilePhotoUrl(worker = {}) {
  return String(worker.profile_photo_url || '').trim()
}

function selfiePhotoUrl(worker = {}) {
  return String(worker.selfie_url || '').trim()
}

function riderInitial(worker = {}) {
  return String(worker.full_name || worker.name || 'R').trim().slice(0, 1).toUpperCase() || 'R'
}

export default function AdminRiderVerificationQueue() {
  const { isAdmin, admin } = useAuthStore()
  const [riders, setRiders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState({ status: 'all', stage: 'all', search: '' })
  const [reviewAction, setReviewAction] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [detailTab, setDetailTab] = useState('information')
  const [actionSaving, setActionSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [balance, setBalance] = useState(null)
  const [providerHealth, setProviderHealth] = useState(null)
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, suspended: 0, deleted: 0 })

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
      setCounts({
        pending: Number(response.counts?.pending || 0),
        approved: Number(response.counts?.approved || 0),
        rejected: Number(response.counts?.rejected || 0),
        suspended: Number(response.counts?.suspended || 0),
        deleted: Number(response.counts?.deleted || 0),
      })
      try {
        const statusResponse = await adminAPI.getNinProviderStatus()
        setBalance({
          balance: statusResponse.balance,
          status: statusResponse.balance_request_status,
          raw: statusResponse.provider_response_body,
        })
        setProviderHealth({
          providerReachable: Boolean(statusResponse.authenticated),
          apiKeyLoaded: Boolean(statusResponse.api_key_loaded),
          authenticated: Boolean(statusResponse.authenticated),
          providerStatus: statusResponse.http_status_code,
          providerMessage: statusResponse.last_error || statusResponse.balance_request_status || '',
          lastVerificationAttempt: statusResponse.last_verification_attempt,
          lastVerificationError: statusResponse.last_verification_error,
          providerUrl: statusResponse.provider_url,
        })
      } catch {
        setBalance({ available: false, message: 'Provider wallet balance unavailable' })
        setProviderHealth({ providerReachable: false, lastStatus: 'unavailable' })
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

  const runReviewAction = async (action, note = reviewNote) => {
    if (!selected || !action || !canManage) return
    try {
      setActionSaving(true)
      const response = await adminAPI.reviewRiderVerification(selected.worker.id, action, { status: action, review_note: note })
      setSelected(response.rider || response.data)
      setReviewAction('')
      setReviewNote('')
      toast.success(`Rider ${label(action)}`)
      await loadQueue()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to update rider verification')
    } finally {
      setActionSaving(false)
    }
  }

  const submitReview = async () => runReviewAction(reviewAction)

  const updateSelectedWorkerType = async (workerType) => {
    if (!selected?.worker?.id || !canManage) return
    try {
      setActionSaving(true)
      const response = await adminAPI.updateRider(selected.worker.id, { worker_type: workerType })
      setSelected((current) => current ? { ...current, worker: { ...current.worker, ...(response.rider || response.data || {}), worker_type: workerType } } : current)
      toast.success('Worker type updated')
      await loadQueue()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to update worker type')
    } finally {
      setActionSaving(false)
    }
  }

  const deleteRider = async () => {
    if (!deleteTarget || !canManage) return
    try {
      setActionSaving(true)
      console.info('ADMIN_DELETE_RIDER_REQUEST', {
        endpoint: `/admin/rider-verification-queue/${deleteTarget.worker.id}`,
        worker_id: deleteTarget.worker.id,
        worker_name: deleteTarget.worker?.full_name || '',
      })
      await adminAPI.permanentlyDeleteRiderVerification(deleteTarget.worker.id)
      toast.success('Rider permanently deleted')
      setDeleteTarget(null)
      if (selected?.worker?.id === deleteTarget.worker.id) setSelected(null)
      await loadQueue()
    } catch (error) {
      console.error('ADMIN_DELETE_RIDER_REQUEST failed', error?.response?.data || error)
      toast.error(error?.response?.data?.detail || error?.response?.data?.error || 'Failed to delete rider')
    } finally {
      setActionSaving(false)
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
          <span>Operations - Verification Health</span>
          <strong>NIN Verification Balance</strong>
        </div>
        <div className="verification-wallet-balance">{balance ? formatNairaBalance(balance) : 'Checking balance...'}</div>
        <div className={`verification-api-health ${providerHealth?.providerReachable ? 'healthy' : 'down'}`}>
          <span>Verification API Health</span>
          <strong>{providerHealth?.authenticated ? 'Authenticated' : providerHealth?.providerReachable ? 'Reachable' : 'Unavailable'}</strong>
          <small>API key {providerHealth?.apiKeyLoaded ? 'loaded' : 'missing'} - status {providerHealth?.providerStatus || 'N/A'} - last verification {providerHealth?.lastVerificationAttempt?.created_at ? new Date(providerHealth.lastVerificationAttempt.created_at).toLocaleString() : 'none yet'}</small>
        </div>
        {balance?.is_low && (
          <div className="verification-wallet-warning">
            <AlertTriangle size={18} />
            <span>Low verification balance</span>
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
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Worker Type</th>
                  <th>NIN Status</th>
                  <th>Approval Status</th>
                  <th>Submission Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {riders.map((item) => {
                  const worker = item.worker || {}
                  const riderType = worker.worker_type === 'messenger' ? 'Messenger' : 'Delivery Rider'
                  return (
                    <tr key={worker.id} className={selected?.worker?.id === worker.id ? 'selected' : ''}>
                      <td>
                        <div className="rider-cell">
                          <span className="rider-avatar">{riderPhotoUrl(worker) ? <img src={resolveMediaUrl(riderPhotoUrl(worker))} alt="" /> : riderInitial(worker)}</span>
                          <div><strong>{worker.full_name}</strong><small>{worker.email || 'No email'}</small></div>
                        </div>
                      </td>
                      <td>{worker.phone}</td>
                      <td>{worker.email || 'No email'}</td>
                      <td>{riderType}</td>
                      <td>
                        <div className="verification-result-cell">
                          <span className={`worker-status ${item.kyc?.nin_verified ? 'approved' : chip(item.kyc?.identity_status)}`}>{item.kyc?.nin_verified ? 'Verified' : label(item.kyc?.identity_status || 'not_started')}</span>
                          <small>{item.kyc?.provider_report_id || worker.nin_report_id || 'No report yet'}</small>
                        </div>
                      </td>
                      <td><span className={`worker-status ${chip(worker.kyc_status)}`}>{label(worker.kyc_status || item.rider?.status || 'KYC_PENDING')}</span></td>
                      <td>{worker.created_at ? new Date(worker.created_at).toLocaleDateString() : 'N/A'}</td>
                      <td><button type="button" onClick={() => { setSelected(item); setDetailTab('information') }}>Review</button></td>
                    </tr>
                  )
                })}
                {!riders.length && <tr><td colSpan="8" className="verification-empty">No riders match this queue.</td></tr>}
              </tbody>
            </table>
          )}
        </section>

        <aside className="verification-detail-panel">
          {!selected ? (
            <div className="empty-detail"><ShieldCheck size={28} /><p>Select a rider to review profile, NIN result, documents, selfie, and activity history.</p></div>
          ) : (
            <>
              <div className="rider-detail-hero-card">
                <span className="rider-detail-photo">{riderPhotoUrl(selected.worker) ? <img src={resolveMediaUrl(riderPhotoUrl(selected.worker))} alt="" /> : riderInitial(selected.worker)}</span>
                <div className="rider-detail-identity">
                  <h2>{selected.worker.full_name}</h2>
                  <span className="rider-type-pill">{selected.worker.worker_type === 'messenger' ? 'Messenger' : 'Delivery Rider'}</span>
                  <p>Rider ID: {selected.worker.rider_id || `FN-RDR-${selected.worker.id}`}</p>
                  <p>{selected.worker.email || 'No email'}</p>
                  <p>{selected.worker.phone || 'No phone'}</p>
                  <p>Joined: {selected.worker.created_at ? new Date(selected.worker.created_at).toLocaleDateString() : 'N/A'}</p>
                  <p className={`approval-line ${chip(selected.worker.kyc_status).toLowerCase()}`}>● {label(selected.worker.kyc_status || selected.rider?.status || 'pending_review')}</p>
                  {canManage && (
                    <div className="rider-detail-actions">
                      <button type="button" disabled={actionSaving} onClick={() => runReviewAction('approve')}><UserCheck size={16} /> Approve</button>
                      <button type="button" disabled={actionSaving} onClick={() => runReviewAction('reject')}><UserX size={16} /> Reject</button>
                      <button type="button" disabled={actionSaving} onClick={() => runReviewAction('suspend')}><PauseCircle size={16} /> Suspend</button>
                      <button type="button" disabled={actionSaving} onClick={() => runReviewAction('reactivate')}><RotateCcw size={16} /> Reactivate</button>
                      <button type="button" className="danger-worker-button" disabled={actionSaving} onClick={() => setDeleteTarget(selected)}><Trash2 size={16} /> Delete Rider</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="rider-detail-tabs">
                {['information', 'documents', 'activity', 'earnings'].map((tab) => (
                  <button key={tab} type="button" className={detailTab === tab ? 'active' : ''} onClick={() => setDetailTab(tab)}>{label(tab)}</button>
                ))}
              </div>
              {detailTab === 'information' && (
                <>
                  <div className="rider-photo-compare">
                    <div>
                      <span>Profile Photo</span>
                      {profilePhotoUrl(selected.worker) ? <img src={resolveMediaUrl(profilePhotoUrl(selected.worker))} alt="Rider profile" /> : <strong>{riderInitial(selected.worker)}</strong>}
                      <p>Editable public rider photo.</p>
                    </div>
                    <div>
                      <span>Verified Selfie</span>
                      {selfiePhotoUrl(selected.worker) ? <img src={resolveMediaUrl(selfiePhotoUrl(selected.worker))} alt="Verified selfie" /> : <strong>Pending</strong>}
                      <p>KYC selfie from onboarding.</p>
                    </div>
                  </div>
                  <div className="rider-information-table">
                    <div><strong>Worker Type</strong><span>{selected.worker.worker_type === 'messenger' ? 'Messenger' : 'Delivery Rider'}</span></div>
                    {canManage && (
                      <label>
                        <strong>Edit Worker Type</strong>
                        <select value={selected.worker.worker_type === 'messenger' ? 'messenger' : 'rider'} onChange={(event) => updateSelectedWorkerType(event.target.value)} disabled={actionSaving}>
                          <option value="rider">Delivery Rider</option>
                          <option value="messenger">Messenger</option>
                        </select>
                      </label>
                    )}
                    <div><strong>Vehicle Type</strong><span>{selected.worker.vehicle_type || 'Not applicable'}</span></div>
                    <div><strong>Plate Number</strong><span>{selected.worker.plate_number || 'Not applicable'}</span></div>
                    <div><strong>Status</strong><span className="soft-success">{label(selected.worker.kyc_status || selected.rider?.status || 'pending_review')}</span></div>
                    <div><strong>NIN Status</strong><span>{selected.kyc?.nin_verified ? `****${selected.kyc?.nin_last4 || selected.worker.nin_last4 || ''}` : label(selected.kyc?.identity_status || 'not_started')}</span></div>
                    <div><strong>Selfie Verification Status</strong><span>{selfiePhotoUrl(selected.worker) ? '✓ Verified' : 'Pending'}</span></div>
                    <div><strong>Government ID Verification Status</strong><span>{selected.worker.id_document_url ? '✓ Verified' : 'Pending'}</span></div>
                    <div><strong>Address</strong><span>{selected.worker.home_address || label(selected.kyc?.address_status)}</span></div>
                    <div><strong>Risk</strong><span>{riskLevel(selected)}</span></div>
                  </div>
                </>
              )}
              {detailTab === 'documents' && (
                <>
                  {selected.worker.verified_photo_url && (
                    <div className="verified-photo-strip">
                      <img src={resolveMediaUrl(selected.worker.verified_photo_url)} alt="" />
                      <div><strong>Provider profile photo</strong><span>Returned by NINBVNPORTAL after successful verification.</span></div>
                    </div>
                  )}
                  <div className="document-link-row">
                    {(selected.documents || []).map((doc) => <a key={doc.id} href={resolveMediaUrl(doc.url)} target="_blank" rel="noopener noreferrer">{label(doc.type)}</a>)}
                    {!selected.documents?.length && <p>No uploaded documents yet.</p>}
                  </div>
                </>
              )}
              {detailTab === 'activity' && (
                <>
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
                </>
              )}
              {detailTab === 'earnings' && <p className="verification-warning">FoodNova riders are paid directly by customers. No platform wallet or payout balance is tracked here.</p>}
              {selected.approval_blockers?.length > 0 && <p className="verification-warning"><strong>Blockers:</strong> {selected.approval_blockers.join(' ')}</p>}
              {canManage && (
                <div className="worker-review-actions">
                  <select value={reviewAction} onChange={(event) => setReviewAction(event.target.value)}>
                    <option value="">Select action</option>
                    <option value="approve">Approve</option>
                    <option value="reactivate">Reactivate</option>
                    <option value="request_resubmission">Request resubmission</option>
                    <option value="reject">Reject</option>
                    <option value="suspend">Suspend</option>
                    <option value="deactivate">Deactivate</option>
                    <option value="force_logout">Force logout</option>
                    <option value="reset_onboarding">Reset onboarding</option>
                  </select>
                  <textarea rows="3" placeholder="Reason or resubmission instructions" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
                  <button type="button" disabled={!reviewAction || actionSaving} onClick={submitReview}>{actionSaving ? 'Saving...' : 'Submit review'}</button>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
      {deleteTarget && (
        <div className="rider-delete-modal">
          <div className="rider-delete-dialog">
            <button type="button" className="rider-delete-close" onClick={() => setDeleteTarget(null)} aria-label="Close"><X size={18} /></button>
            <Trash2 size={28} />
            <h2>Delete rider permanently?</h2>
            <p>This removes {deleteTarget.worker?.full_name || 'this rider'} from rider login, KYC, onboarding, active offers, and admin rider lists. This cannot be undone.</p>
            <div>
              <button type="button" className="secondary-worker-button" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" className="danger-worker-button" disabled={actionSaving} onClick={deleteRider}>{actionSaving ? 'Deleting...' : 'Delete Rider'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
