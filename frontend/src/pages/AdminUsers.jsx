import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, ShieldPlus, X } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { adminAPI } from '../services/api'
import './AdminUsers.css'

const emptyForm = {
  full_name: '',
  email: '',
  phone: '',
  password: '',
  confirm_password: '',
  admin_role: 'viewer',
  permissions: [],
  is_active: true,
}

const ROLE_OPTIONS = [
  ['super_admin', 'Super Admin'],
  ['orders_manager', 'Orders Manager'],
  ['stock_manager', 'Stock Manager'],
  ['payment_manager', 'Payment Manager'],
  ['broadcast_manager', 'Broadcast Manager'],
  ['customer_support', 'Customer Support'],
  ['viewer', 'Viewer'],
  ['custom', 'Custom'],
]

const ROLE_PERMISSIONS = {
  super_admin: ['dashboard:view', 'orders:view', 'orders:update', 'orders:delivery', 'payments:view', 'payments:approve', 'stock:view', 'stock:manage', 'broadcasts:view', 'broadcasts:send', 'customers:view', 'audit:view', 'admins:view', 'admins:manage'],
  orders_manager: ['dashboard:view', 'orders:view', 'orders:update', 'orders:delivery', 'customers:view'],
  stock_manager: ['dashboard:view', 'stock:view', 'stock:manage'],
  payment_manager: ['dashboard:view', 'orders:view', 'payments:view', 'payments:approve', 'customers:view'],
  broadcast_manager: ['dashboard:view', 'broadcasts:view', 'broadcasts:send'],
  customer_support: ['dashboard:view', 'orders:view', 'orders:update', 'customers:view'],
  viewer: ['dashboard:view', 'orders:view', 'stock:view', 'customers:view'],
}

const PERMISSION_OPTIONS = [
  ['dashboard:view', 'Dashboard View'],
  ['orders:view', 'Orders View'],
  ['orders:update', 'Orders Update'],
  ['orders:delivery', 'Delivery Management'],
  ['payments:view', 'Payments View'],
  ['payments:approve', 'Payment Approval'],
  ['stock:view', 'Stock View'],
  ['stock:manage', 'Stock Management'],
  ['broadcasts:view', 'Broadcast View'],
  ['broadcasts:send', 'Broadcast Send'],
  ['customers:view', 'Customers View'],
  ['audit:view', 'Audit Logs View'],
  ['admins:view', 'Admin Users View'],
  ['admins:manage', 'Admin Users Manage'],
]

const roleLabel = (value) => ROLE_OPTIONS.find(([role]) => role === value)?.[1] || 'Custom'

const formatDate = (value) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

export default function AdminUsers() {
  const { isAdmin, admin } = useAuthStore()
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalMode, setModalMode] = useState('')
  const [selectedAdmin, setSelectedAdmin] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const loadAdmins = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getAdminUsers()
      setAdmins(response.data || [])
    } catch (error) {
      toast.error(error?.response?.status === 401 || error?.response?.status === 403
        ? 'Session expired. Please log in again.'
        : 'Failed to load admin users')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) loadAdmins()
  }, [isAdmin])

  const currentAdminId = admin?.id
  const sortedAdmins = useMemo(() => [...admins].sort((a, b) => Number(b.is_active) - Number(a.is_active)), [admins])

  const openCreate = () => {
    setSelectedAdmin(null)
    setForm(emptyForm)
    setModalMode('create')
  }

  const openEdit = (item) => {
    const adminRole = item.admin_role || 'viewer'
    setSelectedAdmin(item)
    setForm({
      full_name: item.full_name || item.name || '',
      email: item.email || '',
      phone: item.phone || '',
      password: '',
      confirm_password: '',
      admin_role: adminRole,
      permissions: item.permissions || ROLE_PERMISSIONS[adminRole] || [],
      is_active: item.is_active !== false,
    })
    setModalMode('edit')
  }

  const openPassword = (item) => {
    setSelectedAdmin(item)
    setForm({ ...emptyForm, email: item.email || '', full_name: item.full_name || item.name || '' })
    setModalMode('password')
  }

  const closeModal = () => {
    setModalMode('')
    setSelectedAdmin(null)
    setForm(emptyForm)
  }

  const submitForm = async (event) => {
    event.preventDefault()
    try {
      if (modalMode === 'create') {
        await adminAPI.createAdminUser({
          ...form,
          permissions: form.admin_role === 'custom' ? form.permissions : ROLE_PERMISSIONS[form.admin_role],
        })
        toast.success('Admin user created')
      } else if (modalMode === 'edit') {
        await adminAPI.updateAdminUser(selectedAdmin.id, {
          full_name: form.full_name,
          phone: form.phone,
          admin_role: form.admin_role,
          permissions: form.admin_role === 'custom' ? form.permissions : ROLE_PERMISSIONS[form.admin_role],
          is_active: form.is_active,
        })
        toast.success('Admin user updated')
      } else if (modalMode === 'password') {
        await adminAPI.resetAdminPassword(selectedAdmin.id, {
          new_password: form.password,
          confirm_password: form.confirm_password,
        })
        toast.success('Admin password reset')
      }
      closeModal()
      loadAdmins()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Admin user action failed')
    }
  }

  const deactivateAdmin = async (item) => {
    if (item.id === currentAdminId) {
      toast.error('You cannot deactivate your own admin account')
      return
    }
    if (!window.confirm(`Deactivate ${item.email}?`)) return
    try {
      await adminAPI.deactivateAdminUser(item.id)
      toast.success('Admin user deactivated')
      loadAdmins()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to deactivate admin user')
    }
  }

  if (!isAdmin) return <div className="admin-page"><p>Access denied. Admin login required.</p></div>
  const canManageAdmins = admin?.admin_role === 'super_admin' || admin?.permissions?.includes('admins:manage')
  const activePermissions = form.admin_role === 'custom' ? form.permissions : (ROLE_PERMISSIONS[form.admin_role] || [])

  return (
    <div className="admin-page admin-users-page">
      <div className="admin-users-header">
        <div>
          <h1>Admin Users</h1>
          <p>Create and manage separate admin login accounts.</p>
        </div>
        <div className="admin-users-actions">
          <button type="button" className="admin-users-secondary" onClick={loadAdmins} disabled={loading}>
            <RefreshCw size={18} /> Refresh
          </button>
          <button type="button" className="admin-users-primary" onClick={openCreate} disabled={!canManageAdmins}>
            <ShieldPlus size={18} /> Create Admin
          </button>
        </div>
      </div>
      <div className="admin-users-warning">Only Super Admins or admins with Admin Users Manage permission can create or edit admin accounts.</div>

      <div className="admin-users-table-wrap">
        <table className="admin-users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Admin Role</th>
              <th>Status</th>
              <th>Created At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="admin-users-empty">Loading admin users...</td></tr>
            ) : sortedAdmins.length ? (
              sortedAdmins.map((item) => (
                <tr key={item.id}>
                  <td>{item.full_name || item.name || 'Admin'}</td>
                  <td>{item.email}</td>
                  <td>{item.phone || 'N/A'}</td>
                  <td>{roleLabel(item.admin_role)}</td>
                  <td><span className={`admin-user-status ${item.is_active === false ? 'inactive' : 'active'}`}>{item.is_active === false ? 'Inactive' : 'Active'}</span></td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>
                    <div className="admin-user-row-actions">
                      <button type="button" disabled={!canManageAdmins} onClick={() => openEdit(item)}>Edit</button>
                      <button type="button" disabled={!canManageAdmins} onClick={() => openPassword(item)}>Reset Password</button>
                      <button type="button" className="danger" disabled={!canManageAdmins || item.id === currentAdminId || item.is_active === false} onClick={() => deactivateAdmin(item)}>Deactivate</button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="7" className="admin-users-empty">No admin users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalMode && (
        <div className="admin-user-modal-backdrop">
          <div className="admin-user-modal">
            <div className="admin-user-modal-header">
              <div>
                <h2>{modalMode === 'create' ? 'Create Admin User' : modalMode === 'edit' ? 'Edit Admin User' : 'Reset Admin Password'}</h2>
                <p>{selectedAdmin?.email || 'Set up a separate admin login account.'}</p>
              </div>
              <button type="button" onClick={closeModal} aria-label="Close"><X size={20} /></button>
            </div>
            <form onSubmit={submitForm} className="admin-user-form">
              {modalMode !== 'password' && (
                <>
                  <label>Full Name<input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required /></label>
                  <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required disabled={modalMode === 'edit'} /></label>
                  <label>Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
                  <label>Admin Role<select value={form.admin_role} onChange={(event) => setForm({ ...form, admin_role: event.target.value, permissions: ROLE_PERMISSIONS[event.target.value] || form.permissions })}>{ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  {modalMode === 'create' && (
                    <>
                      <label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength="6" /></label>
                      <label>Confirm Password<input type="password" value={form.confirm_password} onChange={(event) => setForm({ ...form, confirm_password: event.target.value })} required minLength="6" /></label>
                    </>
                  )}
                  <div className="admin-user-permissions">
                    <strong>{form.admin_role === 'custom' ? 'Custom Permissions' : 'Permission Preview'}</strong>
                    <div className="admin-user-permission-grid">
                      {PERMISSION_OPTIONS.map(([value, label]) => (
                        <label key={value} className="admin-user-check">
                          <input
                            type="checkbox"
                            checked={activePermissions.includes(value)}
                            disabled={form.admin_role !== 'custom'}
                            onChange={(event) => setForm({
                              ...form,
                              permissions: event.target.checked
                                ? [...new Set([...form.permissions, value])]
                                : form.permissions.filter((permission) => permission !== value),
                            })}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className="admin-user-check"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Active admin account</label>
                </>
              )}
              {modalMode === 'password' && (
                <>
                  <label>New Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength="6" /></label>
                  <label>Confirm Password<input type="password" value={form.confirm_password} onChange={(event) => setForm({ ...form, confirm_password: event.target.value })} required minLength="6" /></label>
                </>
              )}
              <div className="admin-user-modal-footer">
                <button type="button" className="admin-users-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="admin-users-primary">{modalMode === 'password' ? 'Reset Password' : 'Save Admin'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
