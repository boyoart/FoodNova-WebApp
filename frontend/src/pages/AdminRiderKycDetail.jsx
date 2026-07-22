import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { adminAPI, resolveMediaUrl } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './AdminRiders.css'

const normalizeRole = (value) => String(value || '').toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
const safe = (value) => value || 'Not provided'
const mask = (value) => value ? `••••${String(value).slice(-4)}` : 'Not provided'

export default function AdminRiderKycDetail() {
  const { riderId } = useParams(); const navigate = useNavigate(); const { isAdmin, admin } = useAuthStore()
  const [record, setRecord] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [working, setWorking] = useState(false); const [reason, setReason] = useState('')
  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const superAdmin = normalizeRole(admin?.admin_role) === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || !permissions.length))
  const canView = superAdmin || ['rider_kyc:view', 'rider_kyc:review', 'workforce:view', 'workforce:manage', 'delivery:manage', 'riders:manage'].some((item) => permissions.includes(item))
  const canReview = superAdmin || ['rider_kyc:review', 'workforce:manage', 'delivery:manage', 'riders:manage'].some((item) => permissions.includes(item))
  const canEditType = superAdmin || ['riders:worker_type', 'workforce:manage', 'riders:manage'].some((item) => permissions.includes(item))
  const canDelete = superAdmin || ['riders:delete', 'workforce:manage', 'riders:manage'].some((item) => permissions.includes(item))

  const load = async () => { try { setLoading(true); setError(''); const body = await adminAPI.getRiderVerificationDetail(riderId); setRecord(body?.rider || body?.data) } catch (requestError) { setError(requestError?.response?.data?.detail || 'Unable to load this KYC record.') } finally { setLoading(false) } }
  useEffect(() => { if (isAdmin && canView) load(); else setLoading(false) }, [isAdmin, canView, riderId])
  const review = async (action) => {
    if (['reject', 'manual_approve'].includes(action) && !reason.trim()) { toast.error('Enter an Admin decision reason.'); return }
    const promptText = action === 'manual_approve' ? 'Manually approve this rider without changing the external NIN verification result?' : `${action.replaceAll('_', ' ')} this rider?`
    if (!window.confirm(promptText)) return
    try { setWorking(true); const body = await adminAPI.reviewRiderVerification(riderId, action, { review_note: reason.trim() }); setRecord(body?.rider || body?.data); setReason(''); toast.success('Rider review saved.') } catch (requestError) { toast.error(requestError?.response?.data?.detail || 'Unable to save this rider decision.') } finally { setWorking(false) }
  }
  const updateType = async (event) => { try { setWorking(true); await adminAPI.updateRider(riderId, { worker_type: event.target.value }); toast.success('Worker type updated.'); await load() } catch (requestError) { toast.error(requestError?.response?.data?.detail || 'Unable to update worker type.') } finally { setWorking(false) } }
  const remove = async () => { if (!window.confirm('Delete this rider through the safe rider-deletion workflow?')) return; try { setWorking(true); await adminAPI.deactivateRider(riderId); toast.success('Rider deleted safely.'); navigate('/admin/riders') } catch (requestError) { toast.error(requestError?.response?.data?.detail || 'Unable to delete rider.') } finally { setWorking(false) } }

  if (!isAdmin) return <div className="admin-page"><div className="rider-state">Admin login is required.</div></div>
  if (!canView) return <div className="admin-page"><div className="rider-state error">You do not have permission to view rider KYC records.</div></div>
  if (loading) return <div className="admin-page"><div className="rider-state">Loading KYC record…</div></div>
  if (error || !record) return <div className="admin-page"><div className="rider-state error"><p>{error || 'KYC record not found.'}</p><button className="btn-primary" onClick={load}>Retry</button></div></div>
  const { worker = {}, rider = {}, kyc = {}, documents = [], admin_reviews = [], approval_blockers = [] } = record
  const image = (url, label) => url ? <a href={resolveMediaUrl(url)} target="_blank" rel="noreferrer"><img className="kyc-image" src={resolveMediaUrl(url)} alt={label} /></a> : <span>Not submitted</span>
  return <div className="admin-page admin-riders-page kyc-detail"><div className="admin-riders-header"><div><Link to="/admin/riders" className="kyc-back">← Delivery Riders</Link><h1>{worker.full_name || 'Rider'} — KYC Review</h1><p>Provider verification and FoodNova Admin approval are recorded separately.</p></div><span className={`rider-status ${String(worker.status || '').toLowerCase()}`}>{worker.kyc_status || worker.status}</span></div>
    <div className="kyc-grid"><section className="kyc-section"><h2>Identity</h2><dl><dt>Email</dt><dd>{safe(worker.email)}</dd><dt>Phone</dt><dd>{safe(worker.phone)}</dd><dt>ID type</dt><dd>{safe(worker.id_type)}</dd><dt>ID number</dt><dd>{mask(worker.id_number)}</dd><dt>Verified name</dt><dd>{safe(kyc.verified_full_name)}</dd><dt>Date of birth</dt><dd>{safe(kyc.verified_dob)}</dd></dl></section>
    <section className="kyc-section"><h2>NIN Verification</h2><dl><dt>Provider status</dt><dd>{safe(kyc.verification_status)}</dd><dt>NIN</dt><dd>{kyc.nin_last4 ? `••••${kyc.nin_last4}` : 'Not provided'}</dd><dt>Provider verified</dt><dd>{kyc.nin_verified ? 'Yes' : 'No'}</dd><dt>Admin approval</dt><dd>{safe(kyc.admin_approval_status || kyc.admin_review_status)}</dd><dt>Provider message</dt><dd>{safe(kyc.provider_message)}</dd></dl></section>
    <section className="kyc-section"><h2>Selfie</h2>{image(worker.selfie_url, 'Rider selfie')}</section><section className="kyc-section"><h2>Address</h2><p>{safe(kyc.verified_address || worker.home_address)}</p><p>Status: {safe(kyc.address_status)}</p></section>
    <section className="kyc-section"><h2>Emergency Contact</h2><dl><dt>Name</dt><dd>{safe(worker.emergency_contact_name)}</dd><dt>Phone</dt><dd>{safe(worker.emergency_contact_phone)}</dd><dt>Relationship</dt><dd>{safe(worker.emergency_contact_relationship)}</dd></dl></section>
    <section className="kyc-section"><h2>Vehicle Information</h2><dl><dt>Worker type</dt><dd>{canEditType ? <select value={worker.worker_type || 'rider'} disabled={working} onChange={updateType}><option value="rider">Rider</option><option value="messenger">Messenger</option></select> : safe(worker.worker_type)}</dd><dt>Vehicle</dt><dd>{safe([worker.vehicle_make, worker.vehicle_model, worker.vehicle_type].filter(Boolean).join(' '))}</dd><dt>Plate</dt><dd>{safe(worker.plate_number)}</dd><dt>Driver licence</dt><dd>{mask(worker.driver_license_number)}</dd></dl></section>
    <section className="kyc-section"><h2>Documents</h2>{worker.id_document_url && <div><strong>ID document</strong>{image(worker.id_document_url, 'ID document')}</div>}{documents.map((document) => <div key={document.id}><strong>{document.type}</strong>{image(document.url, document.type)}</div>)}{!worker.id_document_url && !documents.length && <p>No documents submitted.</p>}</section>
    <section className="kyc-section"><h2>Application Progress</h2><p>{kyc.progress_percent || 0}% complete · Step {kyc.current_step || 1} of {kyc.step_total || 1}</p><p>Stage: {safe(kyc.onboarding_stage)}</p><p>Can go online: {rider.can_go_online ? 'Yes' : 'No'}</p>{approval_blockers.length > 0 && <ul>{approval_blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}</section>
    <section className="kyc-section kyc-wide"><h2>Approval History</h2>{admin_reviews.length ? <ul className="kyc-history">{admin_reviews.map((review) => <li key={review.id}><strong>{review.action}</strong> by {review.admin_name} · {review.created_at ? new Date(review.created_at).toLocaleString() : ''}<p>{review.reason}</p></li>)}</ul> : <p>No Admin decisions recorded.</p>}</section></div>
    {canReview && <section className="kyc-section kyc-decision"><h2>Admin Decision</h2><label>Decision reason<textarea rows="3" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for rejection and manual approval" /></label><div className="rider-actions"><button disabled={working || approval_blockers.length > 0} className="btn-approve" onClick={() => review('approve')}>Approve (provider verified)</button><button disabled={working} className="btn-view" onClick={() => review('manual_approve')}>Manual approval</button><button disabled={working} className="btn-delete" onClick={() => review('reject')}>Reject</button><button disabled={working} className="btn-view" onClick={() => review('request_resubmission')}>Request resubmission</button>{canDelete && <button disabled={working} className="btn-delete" onClick={remove}>Delete rider</button>}</div><small>Manual approval does not change or claim success for the external NIN verification.</small></section>}
  </div>
}
