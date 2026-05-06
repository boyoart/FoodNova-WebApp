import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { adminAPI } from '../services/api'
import { formatPrice } from '../utils/formatters'
import toast from 'react-hot-toast'
import { BarChart3, Package, ShoppingBag, DollarSign } from 'lucide-react'
import './AdminDashboard.css'

const adminTools = [
  { href: '/admin/orders', title: 'Manage Orders', description: 'View and update customer orders.' },
  { href: '/admin/stock', title: 'Stock Management', description: 'Add, edit, and manage products and food packs.' },
  { href: '/admin/payments', title: 'Payment Approvals', description: 'Review customer payment receipts.' },
  { href: '/admin/broadcasts', title: 'Broadcasts', description: 'Send announcements to customers.' },
  { href: '/admin/customers', title: 'Customers', description: 'View customer data and order history.' },
  { href: '/admin/audit-logs', title: 'Activity Logs', description: 'Track admin actions and system activity.' },
  { href: '/admin/users', title: 'Admin Users', description: 'Create and manage admin accounts.' },
]

export default function AdminDashboard() {
  const { isAdmin } = useAuthStore()
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

  return (
    <div className="admin-page">
      <h1>Admin Dashboard</h1>

      <div className="stats-grid">
        <div className="stat-card"><ShoppingBag size={32} /><div><p className="stat-label">Total Orders</p><p className="stat-value">{stats?.total_orders || 0}</p></div></div>
        <div className="stat-card"><DollarSign size={32} /><div><p className="stat-label">Revenue</p><p className="stat-value">{formatPrice(stats?.total_revenue || 0)}</p></div></div>
        <div className="stat-card"><Package size={32} /><div><p className="stat-label">Total Products</p><p className="stat-value">{stats?.total_products || 0}</p></div></div>
        <div className="stat-card"><BarChart3 size={32} /><div><p className="stat-label">Pending Payments</p><p className="stat-value">{stats?.pending_payments || 0}</p></div></div>
      </div>

      <div className="admin-tools-section">
        <div className="admin-tools-heading">
          <h2>Admin Tools</h2>
          <p>Quick access to FoodNova management workflows.</p>
        </div>
        <div className="dashboard-nav">
          {adminTools.map((tool) => (
            <a href={tool.href} className="nav-link" key={tool.href}>
              <strong>{tool.title}</strong>
              <span>{tool.description}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
