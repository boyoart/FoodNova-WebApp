import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Plus, Search, X } from 'lucide-react'
import { adminAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './AdminRiders.css'

const tabs = [
  ['all', 'All Riders'],
  ['pending', 'Pending KYC Review'],
  ['active', 'Approved Riders'],
  ['rejected', 'Rejected Riders'],
]

const normalizeRole = (value) => String(value || '').toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
const emptyForm = { full_name: '', phone: '', email: '', worker_type: 'rider', vehicle_type: '', vehicle_number: '', status: 'onboarding', notes: '' }

export default function AdminRiders() {
  const { isAdmin, admin } = useAuthStore()
  const [riders, setRiders] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')
  const [modalOpen, setModalOpen] = useState(false); const [selectedRider, setSelectedRider] = useState(null); const [form, setForm] = useState(emptyForm); const [saving, setSaving] = useState(false)
  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const superAdmin = normalizeRole(admin?.admin_role) === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || !permissions.length))
  const canView = superAdmin || ['rider_kyc:view', 'rider_kyc:review', 'workforce:view', 'workforce:manage', 'delivery:manage', 'riders:manage'].some((item) => permissions.includes(item))
  const canEdit = superAdmin || ['riders:worker_type', 'rider_kyc:review', 'workforce:manage', 'delivery:manage', 'riders:manage'].some((item) => permissions.includes(item))

  const load = async () => {
    if (!isAdmin || !canView) { setLoading(false); return }
    try {
      setLoading(true); setError('')
      const params = { ...(tab !== 'all' ? { status: tab } : {}), ...(search.trim() ? { search: search.trim() } : {}) }
      const body = await adminAPI.getRiderVerificationQueue(params)
      setRiders(Array.isArray(body?.riders) ? body.riders : Array.isArray(body?.data) ? body.data : [])
      setCounts(body?.counts || {})
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Unable to load rider KYC records.')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [isAdmin, canView, tab])
  const pendingCount = Number(counts.pending || 0)
  const rows = useMemo(() => riders.map((item) => ({ ...item, worker: item.worker || item })), [riders])
  const openForm = (worker = null) => { setSelectedRider(worker); setForm(worker ? { full_name: worker.full_name || '', phone: worker.phone || '', email: worker.email || '', worker_type: worker.worker_type || 'rider', vehicle_type: worker.vehicle_type || '', vehicle_number: worker.plate_number || '', status: worker.status || 'onboarding', notes: '' } : emptyForm); setModalOpen(true) }
  const saveRider = async (event) => { event.preventDefault(); try { setSaving(true); if (selectedRider) await adminAPI.updateRider(selectedRider.id, form); else await adminAPI.createRider(form); toast.success(selectedRider ? 'Rider updated.' : 'Rider created.'); setModalOpen(false); await load() } catch (requestError) { toast.error(requestError?.response?.data?.detail || 'Unable to save rider.') } finally { setSaving(false) } }

  if (!isAdmin) return <div className="admin-page"><div className="rider-state">Admin login is required.</div></div>
  if (!canView) return <div className="admin-page"><div className="rider-state error">You do not have permission to view rider KYC records.</div></div>

  return <div className="admin-page admin-riders-page">
    <div className="admin-riders-header"><div><h1>Delivery Riders</h1><p>Review KYC, approve riders, and manage deliveries.</p></div><div className="rider-actions">{pendingCount > 0 && <span className="rider-pending-badge">Pending KYC: {pendingCount}</span>}{canEdit && <button className="btn-primary" onClick={() => openForm()}><Plus size={18} /> Add Rider</button>}</div></div>
    <form className="rider-toolbar" onSubmit={(event) => { event.preventDefault(); load() }}>
      <label className="rider-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, phone, or vehicle" /></label>
      <button type="submit" className="btn-primary">Search</button>
    </form>
    <div className="rider-status-tabs" role="tablist">{tabs.map(([value, label]) => <button key={value} type="button" className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}{value !== 'all' && counts[value] !== undefined ? ` (${counts[value]})` : ''}</button>)}</div>
    {loading ? <div className="rider-state">Loading rider KYC records…</div> : error ? <div className="rider-state error"><p>{error}</p><button className="btn-primary" onClick={load}>Retry</button></div> : !rows.length ? <div className="rider-state">No riders match this view.</div> : <div className="rider-table-wrap"><table><thead><tr><th>Rider</th><th>Worker Type</th><th>KYC Status</th><th>Progress</th><th>NIN</th><th>Operational</th><th>Action</th></tr></thead><tbody>{rows.map(({ worker, kyc }) => <tr key={worker.id}><td><strong>{worker.full_name || 'Unnamed rider'}</strong><small>{worker.email || worker.phone || 'No contact details'}</small></td><td>{worker.worker_type || 'rider'}</td><td><span className={`rider-status ${String(worker.status || worker.kyc_status || '').toLowerCase()}`}>{worker.kyc_status || worker.status || 'Pending'}</span></td><td>{kyc?.progress_percent ?? worker.onboarding_progress_percent ?? 0}%</td><td>{worker.nin_verified || kyc?.nin_verified ? 'Provider verified' : kyc?.admin_approval_status === 'manually_approved' ? 'Manual approval' : 'Not verified'}</td><td>{worker.operational_status || 'OFFLINE'}</td><td><div className="rider-actions"><Link className="btn-view rider-review-link" to={`/admin/riders/${worker.id}`}>Review KYC</Link>{canEdit && <button className="btn-view" onClick={() => openForm(worker)}>Edit</button>}</div></td></tr>)}</tbody></table></div>}
    {modalOpen && <div className="rider-modal-overlay"><div className="rider-modal"><div className="rider-modal-header"><div><h2>{selectedRider ? 'Edit Rider' : 'Add Rider'}</h2><p>Maintain the existing rider profile without bypassing KYC review.</p></div><button onClick={() => setModalOpen(false)} aria-label="Close"><X size={20} /></button></div><form className="rider-modal-form" onSubmit={saveRider}><div className="rider-form-grid"><label>Full name<input required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label><label>Phone<input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Worker type<select value={form.worker_type} onChange={(event) => setForm({ ...form, worker_type: event.target.value })}><option value="rider">Rider</option><option value="messenger">Messenger</option></select></label><label>Vehicle type<input value={form.vehicle_type} onChange={(event) => setForm({ ...form, vehicle_type: event.target.value })} /></label><label>Vehicle number<input value={form.vehicle_number} onChange={(event) => setForm({ ...form, vehicle_number: event.target.value })} /></label><label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></label><label className="rider-form-wide">Notes<textarea rows="3" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label></div><div className="rider-modal-footer"><button type="button" className="btn-cancel" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Rider'}</button></div></form></div></div>}
  </div>
}
