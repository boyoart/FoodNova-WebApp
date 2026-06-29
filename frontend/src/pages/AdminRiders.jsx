import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Search, ShieldCheck, X } from 'lucide-react'
import { adminAPI, resolveMediaUrl } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './AdminRiders.css'

const emptyForm = {
  full_name: '',
  phone: '',
  email: '',
  worker_type: 'rider',
  vehicle_type: '',
  vehicle_number: '',
  status: 'ONBOARDING',
  notes: '',
}

const lifecycleStatuses = ['active', 'inactive', 'onboarding', 'suspended']

const displayStatus = (status = '') => String(status || 'ONBOARDING').toUpperCase()

const statusClass = (status = '') => displayStatus(status).toLowerCase()

const riderPhotoUrl = (rider = {}) => String(rider.rider_photo_url || rider.profile_photo_url || rider.selfie_url || rider.photo_url || '').trim()

const riderInitial = (rider = {}) => String(rider.full_name || rider.name || 'R').trim().slice(0, 1).toUpperCase() || 'R'

export default function AdminRiders() {
  const { isAdmin, admin } = useAuthStore()
  const [riders, setRiders] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedRider, setSelectedRider] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const isSuperAdmin = admin?.admin_role === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || permissions.length === 0))
  const canManageDelivery = isSuperAdmin || ['delivery:manage', 'orders:delivery', 'riders:manage', 'workforce:view', 'workforce:manage'].some((permission) => permissions.includes(permission))

  const loadRiders = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getRiders(statusFilter === 'deleted' ? { include_deleted: true } : {})
      setRiders(response.data || [])
    } catch (error) {
      toast.error([401, 403].includes(error?.response?.status) ? 'Access denied for rider management.' : 'Failed to load riders')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin && canManageDelivery) loadRiders()
    else setLoading(false)
  }, [isAdmin, canManageDelivery, statusFilter])

  const filteredRiders = useMemo(() => {
    const term = search.trim().toLowerCase()
    return riders.filter((rider) => {
      const matchesStatus = statusFilter === 'all' || statusClass(rider.status) === statusFilter
      const matchesSearch = !term || [rider.full_name, rider.name, rider.phone, rider.email, rider.worker_type, rider.vehicle_type, rider.vehicle_number]
        .some((value) => String(value || '').toLowerCase().includes(term))
      return matchesStatus && matchesSearch
    })
  }, [riders, search, statusFilter])

  const openCreate = () => {
    setSelectedRider(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (rider) => {
    setSelectedRider(rider)
    setForm({
      full_name: rider.full_name || rider.name || '',
      phone: rider.phone || '',
      email: rider.email || '',
      worker_type: rider.worker_type === 'messenger' ? 'messenger' : 'rider',
      vehicle_type: rider.vehicle_type || '',
      vehicle_number: rider.vehicle_number || '',
      status: displayStatus(rider.status || 'ONBOARDING'),
      notes: rider.notes || '',
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setSelectedRider(null)
    setForm(emptyForm)
  }

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const submitForm = async (event) => {
    event.preventDefault()
    if (!form.full_name.trim() || !form.phone.trim()) {
      toast.error('Rider name and phone are required')
      return
    }
    try {
      setSaving(true)
      if (selectedRider?.id) {
        await adminAPI.updateRider(selectedRider.id, form)
        toast.success('Rider updated')
      } else {
        await adminAPI.createRider(form)
        toast.success('Rider created')
      }
      closeModal()
      await loadRiders()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to save rider')
    } finally {
      setSaving(false)
    }
  }

  const deactivateRider = async (rider) => {
    if (!window.confirm(`Delete ${rider.full_name || rider.name}? This will move the rider to the deleted archive.`)) return
    try {
      await adminAPI.deactivateRider(rider.id)
      toast.success('Rider deleted')
      await loadRiders()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to deactivate rider')
    }
  }

  const deleteRider = async (rider) => {
    // Stronger confirmation for permanent deletion
    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete this rider?\n\nName: ${rider.full_name || rider.name}\nPhone: ${rider.phone}\n\nThis action will:\n- Delete rider account\n- Delete rider documents\n- Delete rider KYC records\n- Delete rider sessions\n\nThis cannot be undone.`
    );
    if (!confirmDelete) return;

    // Second confirmation to prevent accidents
    const secureConfirm = window.confirm(
      'FINAL CONFIRMATION: Permanently delete this rider? This action cannot be undone.'
    );
    if (!secureConfirm) return;

    try {
      console.info('ADMIN_DELETE_RIDER_REQUEST', {
        endpoint: `/admin/riders/${rider.id}`,
        worker_id: rider.id,
        worker_name: rider.full_name || rider.name || '',
      })
      await adminAPI.deleteRider(rider.id);
      toast.success('Rider permanently deleted');
      await loadRiders();
    } catch (error) {
      console.error('ADMIN_DELETE_RIDER_REQUEST failed', error?.response?.data || error);
      toast.error(error?.response?.data?.detail || error?.response?.data?.error || 'Failed to delete rider permanently');
    }
  }

  if (!isAdmin) return <div className="admin-page"><p>Access denied.</p></div>
  if (!canManageDelivery) return <div className="admin-page"><p>You do not have permission to manage delivery riders.</p></div>

  return (
    <div className="admin-page admin-riders-page">
      <div className="admin-riders-header">
        <div>
          <h1>Delivery Riders</h1>
          <p>Manage riders and assign deliveries across FoodNova orders.</p>
        </div>
        <div className="rider-header-actions">
          <button type="button" className="btn-view" onClick={() => window.location.assign('/admin/rider-verification')}><ShieldCheck size={18} /> Verification Queue</button>
          <button type="button" className="btn-primary" onClick={openCreate}><Plus size={18} /> Add Rider</button>
        </div>
      </div>

      <div className="rider-toolbar">
        <label className="rider-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, vehicle" /></label>
        <div className="rider-status-tabs">
          {['all', ...lifecycleStatuses, 'deleted'].map((status) => (
            <button key={status} type="button" className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>
              {status.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading riders...</div>
      ) : filteredRiders.length ? (
        <div className="rider-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Rider ID</th>
                <th>Phone</th>
                <th>Type</th>
                <th>Vehicle</th>
                <th>NIN</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRiders.map((rider) => (
                <tr key={rider.id}>
                  <td>
                    <div className="rider-identity-cell">
                      <span className="rider-photo-avatar">
                        {riderPhotoUrl(rider) ? <img src={resolveMediaUrl(riderPhotoUrl(rider))} alt="" /> : riderInitial(rider)}
                      </span>
                      <span><strong>{rider.full_name || rider.name}</strong><small>{rider.email || 'No email'}</small></span>
                    </div>
                  </td>
                  <td>#{rider.rider_id || rider.id}</td>
                  <td>{rider.phone}</td>
                  <td>{rider.worker_type === 'messenger' ? 'Messenger' : 'Delivery Rider'}</td>
                  <td>{[rider.vehicle_type, rider.vehicle_number || rider.plate_number].filter(Boolean).join(' - ') || 'N/A'}</td>
                  <td><span className={`rider-status ${rider.nin_verified ? 'active' : 'inactive'}`}>{rider.nin_status || (rider.nin_verified ? 'verified' : 'not verified')}</span></td>
                  <td><span className={`rider-status ${statusClass(rider.status)}`}>{displayStatus(rider.approval_status || rider.status)}</span></td>
                  <td>
                    <div className="rider-actions">
                      <button type="button" className="btn-view" onClick={() => openEdit(rider)}>Edit</button>
                      {statusClass(rider.status) !== 'deleted' && <button type="button" className="btn-delete" onClick={() => deactivateRider(rider)}>Soft Delete</button>}
                      {statusClass(rider.status) === 'deleted' && <button type="button" className="btn-delete" onClick={() => deleteRider(rider)} style={{ background: '#dc3545' }}>Permanent Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">No riders found.</div>
      )}

      {modalOpen && (
        <div className="rider-modal-overlay">
          <div className="rider-modal">
            <div className="rider-modal-header">
              <div>
                <h2>{selectedRider ? 'Edit Rider' : 'Add Rider'}</h2>
                <p>Keep delivery rider details accurate for order assignments.</p>
              </div>
              <button type="button" onClick={closeModal} aria-label="Close"><X size={20} /></button>
            </div>
            <form className="rider-modal-form" onSubmit={submitForm}>
              <div className="rider-form-grid">
                <label>Full Name<input value={form.full_name} onChange={(event) => updateForm('full_name', event.target.value)} required /></label>
                <label>Phone<input value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} required /></label>
                <label>Email<input type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} /></label>
                <label>Worker Type<select value={form.worker_type} onChange={(event) => updateForm('worker_type', event.target.value)}>
                  <option value="rider">Delivery Rider</option>
                  <option value="messenger">Messenger</option>
                </select></label>
                <label>Vehicle Type<input placeholder="Bike, Van, Car" value={form.vehicle_type} onChange={(event) => updateForm('vehicle_type', event.target.value)} /></label>
                <label>Vehicle Number<input value={form.vehicle_number} onChange={(event) => updateForm('vehicle_number', event.target.value)} /></label>
                <label>Status<select value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="ONBOARDING">ONBOARDING</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select></label>
                <label className="rider-form-wide">Notes<textarea rows="3" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} /></label>
              </div>
              <div className="rider-modal-footer">
                <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : selectedRider ? 'Update Rider' : 'Create Rider'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
