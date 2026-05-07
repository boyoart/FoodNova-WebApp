import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { adminAPI } from '../services/api'
import { formatPrice } from '../utils/formatters'
import toast from 'react-hot-toast'
import { BarChart3, BellRing, ClipboardList, CreditCard, Package, ShieldCheck, ShoppingBag, Users, DollarSign, Truck, Undo2 } from 'lucide-react'
import './AdminDashboard.css'

const adminTools = [
  { path: '/admin/orders', title: 'Manage Orders', description: 'View and update customer orders.', icon: ClipboardList, permission: 'orders:view' },
  { path: '/admin/cancellations', title: 'Cancellation Requests', description: 'Review cancellation and refund requests.', icon: Undo2, permissions: ['cancellations:view', 'cancellations:manage'] },
  { path: '/admin/riders', title: 'Delivery Riders', description: 'Manage riders and assign deliveries.', icon: Truck, permissions: ['orders:delivery', 'delivery:manage'] },
  { path: '/admin/stock', title: 'Stock Management', description: 'Add, edit, and manage products and food packs.', icon: Package, permission: 'stock:view' },
  { path: '/admin/payments', title: 'Payment Approvals', description: 'Review customer payment receipts.', icon: CreditCard, permission: 'payments:view' },
  { path: '/admin/broadcasts', title: 'Broadcasts', description: 'Send announcements to customers.', icon: BellRing, permission: 'broadcasts:view' },
  { path: '/admin/customers', title: 'Customers', description: 'View customer data and order history.', icon: Users, permission: 'customers:view' },
  { path: '/admin/audit-logs', title: 'Activity Logs', description: 'Track admin actions and system changes.', icon: BarChart3, permission: 'audit:view' },
  { path: '/admin/users', title: 'Admin Users', description: 'Create and manage admin accounts.', icon: ShieldCheck, permission: 'admins:view' },
]

export default function AdminDashboard() {
  const { isAdmin, admin } = useAuthStore()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isAdmin) {
      fetchStats()
    }
  }, [isAdmin])

  const fetchStats = async () => {
    try {
      setLoading(true)
      const res = await adminAPI.getDashboardStats()
      setStats(res.data)
    } catch (error) {
      toast.error('Failed to load dashboard stats')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  if (!isAdmin) {
    return <div className="admin-page"><p>Access denied. Admin login required.</p></div>
  }

  if (loading) {
    return <div className="admin-page"><div className="loading">Loading dashboard...</div></div>
  }
  const adminPermissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const isSuperAdminDisplay = admin?.admin_role === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || adminPermissions.length === 0))
  const can = (permission) => {
    if (isSuperAdminDisplay) return true
    return adminPermissions.includes(permission)
  }
  const canAny = (permissions = []) => permissions.some((permission) => can(permission))
  const visibleTools = adminTools.filter((tool) => tool.permissions ? canAny(tool.permissions) : can(tool.permission))

  return (
    <div className="admin-page">
      <h1>Admin Dashboard</h1>

      <div className="stats-grid">
        <div className="stat-card"><ShoppingBag size={32} /><div><p className="stat-label">Total Orders</p><p className="stat-value">{stats?.total_orders || 0}</p></div></div>
        <div className="stat-card"><DollarSign size={32} /><div><p className="stat-label">Revenue</p><p className="stat-value">{formatPrice(stats?.total_revenue || 0)}</p></div></div>
        <div className="stat-card"><Package size={32} /><div><p className="stat-label">Total Products</p><p className="stat-value">{stats?.total_products || 0}</p></div></div>
        <div className="stat-card"><BarChart3 size={32} /><div><p className="stat-label">Pending Payments</p><p className="stat-value">{stats?.pending_payments || 0}</p></div></div>
        <div className="stat-card"><Package size={32} /><div><p className="stat-label">Inventory Alerts</p><p className="stat-value">{stats?.low_stock_products || 0} low, {stats?.out_of_stock_products || 0} out</p></div></div>
      </div>

      <section className="admin-tools-section">
        <div className="admin-section-header">
          <h2>Admin Tools</h2>
          <p>Quick access to FoodNova management workflows.</p>
        </div>
        {visibleTools.length ? (
          <div className="admin-tools-grid">
            {visibleTools.map((tool) => (
              <Link key={tool.path} to={tool.path} className="admin-tool-card">
                <div className="admin-tool-icon"><tool.icon size={22} /></div>
                <div className="admin-tool-content">
                  <h3>{tool.title}</h3>
                  <p>{tool.description}</p>
                </div>
                <span className="admin-tool-arrow">→</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="admin-tools-empty">No admin tools available for your role.</div>
        )}
      </section>
    </div>
  )
}
