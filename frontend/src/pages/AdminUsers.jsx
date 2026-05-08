import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, Search, ShieldPlus, X } from 'lucide-react'
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
  super_admin: ['dashboard:view', 'orders:view', 'orders:update', 'orders:delivery', 'delivery:manage', 'cancellations:view', 'cancellations:manage', 'payments:view', 'payments:approve', 'stock:view', 'stock:manage', 'broadcasts:view', 'broadcasts:send', 'customers:view', 'audit:view', 'admins:view', 'admins:manage', 'exports:view', 'exports:download', 'reports:view'],
  orders_manager: ['dashboard:view', 'orders:view', 'orders:update', 'orders:delivery', 'delivery:manage', 'cancellations:view', 'cancellations:manage', 'customers:view'],
  stock_manager: ['dashboard:view', 'stock:view', 'stock:manage'],
  payment_manager: ['dashboard:view', 'orders:view', 'payments:view', 'payments:approve', 'cancellations:view', 'cancellations:manage', 'customers:view'],
  broadcast_manager: ['dashboard:view', 'broadcasts:view', 'broadcasts:send'],
  customer_support: ['dashboard:view', 'orders:view', 'orders:update', 'cancellations:view', 'customers:view'],
  viewer: ['dashboard:view', 'orders:view', 'stock:view', 'customers:view'],
}

const PERMISSION_OPTIONS = [
  ['dashboard:view', 'Dashboard View'],
  ['orders:view', 'Orders View'],
  ['orders:update', 'Orders Update'],
  ['orders:delivery', 'Delivery Management'],
  ['delivery:manage', 'Rider Management'],
  ['cancellations:view', 'Cancellation Requests View'],
  ['cancellations:manage', 'Cancellation Requests Manage'],
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
  ['exports:view', 'Data Exports View'],
  ['exports:download', 'Data Exports Download'],
  ['reports:view', 'Reports View'],
]

const PERMISSION_GROUPS = [
  { title: 'Dashboard', items: [['dashboard:view', 'View dashboard']] },
  { title: 'Orders', items: [['orders:view', 'View orders'], ['orders:update', 'Update orders'], ['orders:delivery', 'Manage delivery'], ['delivery:manage', 'Manage riders'], ['cancellations:view', 'View cancellations'], ['cancellations:manage', 'Manage cancellations']] },
  { title: 'Payments', items: [['payments:view', 'View payments'], ['payments:approve', 'Approve payments']] },
  { title: 'Stock', items: [['stock:view', 'View stock'], ['stock:manage', 'Manage stock']] },
  { title: 'Broadcasts', items: [['broadcasts:view', 'View broadcasts'], ['broadcasts:send', 'Send broadcasts']] },
  { title: 'Customers', items: [['customers:view', 'View customers']] },
  { title: 'Admins', items: [['admins:view', 'View admin users'], ['admins:manage', 'Manage admin users']] },
  { title: 'Audit Logs', items: [['audit:view', 'View audit logs']] },
  { title: 'Exports', items: [['exports:view', 'View data exports'], ['exports:download', 'Download CSV exports']] },
  { title: 'Reports', items: [['reports:view', 'View business reports']] },
]

const ALL_PERMISSIONS = PERMISSION_OPTIONS.map(([value]) => value)
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
  const [saving, setSaving] = useState(false)
  const [permissionSearch, setPermissionSearch] = useState('')

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
    setForm({ ...emptyForm, permissions: ROLE_PERMISSIONS.viewer })
    setPermissionSearch('')
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
    setPermissionSearch('')
    setModalMode('edit')
  }

  const openPassword = (item) => {
    setSelectedAdmin(item)
    setForm({ ...emptyForm, email: item.email || '', full_name: item.full_name || item.name || '' })
    setPermissionSearch('')
    setModalMode('password')
  }

  const closeModal = () => {
    setModalMode('')
    setSelectedAdmin(null)
    setForm(emptyForm)
    setPermissionSearch('')
  }

  const submitForm = async (event) => {
    event.preventDefault()
    if (modalMode === 'create' && (!form.full_name.trim() || !form.email.trim() || form.password.length < 6 || form.password !== form.confirm_password)) {
      toast.error('Please complete all required fields and confirm passwords match')
      return
    }
    if (modalMode === 'password' && (form.password.length < 6 || form.password !== form.confirm_password)) {
      toast.error('Password must be at least 6 characters and match confirmation')
      return
    }
    try {
      setSaving(true)
      if (modalMode === 'create') {
        await adminAPI.createAdminUser({
          ...form,
          permissions: form.permissions,
        })
        toast.success('Admin user created')
      } else if (modalMode === 'edit') {
        await adminAPI.updateAdminUser(selectedAdmin.id, {
          full_name: form.full_name,
          phone: form.phone,
          admin_role: form.admin_role,
          permissions: form.permissions,
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
    } finally {
      setSaving(false)
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
  const activePermissions = form.permissions || []
  const isCreateMode = modalMode === 'create'
  const isPasswordMode = modalMode === 'password'
  const modalTitle = isCreateMode ? 'Create Admin User' : modalMode === 'edit' ? 'Edit Admin User' : 'Reset Admin Password'
  const modalSubtitle = isCreateMode ? 'Add a new admin and assign permissions' : selectedAdmin?.email || 'Update admin account access.'
  const formInvalid = isPasswordMode
    ? form.password.length < 6 || form.password !== form.confirm_password
    : !form.full_name.trim() || !form.email.trim() || (isCreateMode && (form.password.length < 6 || form.password !== form.confirm_password))
  const setRolePreset = (role) => {
    setForm({ ...form, admin_role: role, permissions: ROLE_PERMISSIONS[role] || form.permissions })
  }
  const useRoleDefaults = () => setForm({ ...form, permissions: ROLE_PERMISSIONS[form.admin_role] || [] })
  const togglePermission = (permission) => {
    setForm({
      ...form,
      permissions: activePermissions.includes(permission)
        ? activePermissions.filter((item) => item !== permission)
        : [...new Set([...activePermissions, permission])],
    })
  }
  const searchTerm = permissionSearch.trim().toLowerCase()
  const filteredGroups = PERMISSION_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter(([value, label]) => !searchTerm || group.title.toLowerCase().includes(searchTerm) || value.toLowerCase().includes(searchTerm) || label.toLowerCase().includes(searchTerm)),
    }))
    .filter((group) => group.items.length)

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
                <h2>{modalTitle}</h2>
                <p>{modalSubtitle}</p>
              </div>
              <button type="button" onClick={closeModal} aria-label="Close"><X size={20} /></button>
            </div>
            <form onSubmit={submitForm} className="admin-user-form">
              <div className="admin-user-modal-body">
                {modalMode !== 'password' && (
                  <div className="admin-form-grid">
                    <div className="admin-form-column">
                      <section className="admin-form-card">
                        <h3>Basic Information</h3>
                        <label>Full Name<input placeholder="FoodNova Admin" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required /></label>
                        <label>Email<input type="email" placeholder="admin@foodnova.com.ng" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required disabled={modalMode === 'edit'} /></label>
                        <label>Phone<input placeholder="+2348000000000" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
                      </section>

                      {modalMode === 'create' && (
                        <section className="admin-form-card">
                          <h3>Security</h3>
                          <label>Password<input type="password" placeholder="Minimum 6 characters" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength="6" /></label>
                          <label>Confirm Password<input type="password" placeholder="Re-enter password" value={form.confirm_password} onChange={(event) => setForm({ ...form, confirm_password: event.target.value })} required minLength="6" /></label>
                          {form.password && form.confirm_password && form.password !== form.confirm_password && <p className="admin-inline-error">Passwords do not match.</p>}
                        </section>
                      )}
                    </div>

                    <div className="admin-form-column">
                      <section className="admin-form-card">
                        <h3>Role</h3>
                        <label>Admin Role<select value={form.admin_role} onChange={(event) => setRolePreset(event.target.value)}>{ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                        <label className="admin-user-toggle"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> <span>Active admin account</span></label>
                      </section>

                      <section className="admin-form-card permissions-section">
                        <div className="permissions-heading">
                          <div>
                            <h3>Permissions</h3>
                            <p>{activePermissions.length} selected</p>
                          </div>
                          <div className="permission-actions">
                            <button type="button" onClick={() => setForm({ ...form, permissions: ALL_PERMISSIONS })}>Select all</button>
                            <button type="button" onClick={() => setForm({ ...form, permissions: [] })}>Clear all</button>
                            <button type="button" onClick={useRoleDefaults}>Use role defaults</button>
                          </div>
                        </div>
                        <label className="permission-search"><Search size={16} /><input value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} placeholder="Search permissions" /></label>
                        <div className="permissions-list">
                          {filteredGroups.map((group) => (
                            <section key={group.title} className="permissions-group">
                              <h4>{group.title}</h4>
                              {group.items.map(([value, label]) => (
                                <label key={value} className="permission-row">
                                  <input type="checkbox" checked={activePermissions.includes(value)} onChange={() => togglePermission(value)} />
                                  <span>{label}</span>
                                </label>
                              ))}
                            </section>
                          ))}
                        </div>
                      </section>
                    </div>
                  </div>
                )}
                {modalMode === 'password' && (
                  <div className="admin-form-card admin-password-card">
                    <h3>Security</h3>
                    <label>New Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength="6" /></label>
                    <label>Confirm Password<input type="password" value={form.confirm_password} onChange={(event) => setForm({ ...form, confirm_password: event.target.value })} required minLength="6" /></label>
                    {form.password && form.confirm_password && form.password !== form.confirm_password && <p className="admin-inline-error">Passwords do not match.</p>}
                  </div>
                )}
              </div>
              <div className="admin-user-modal-footer">
                <button type="button" className="admin-users-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="admin-users-primary" disabled={saving || formInvalid}>{saving ? 'Saving...' : modalMode === 'password' ? 'Reset Password' : modalMode === 'create' ? 'Create Admin' : 'Save Admin'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
