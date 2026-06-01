import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { BarChart3, CreditCard, FileText, Package, RefreshCw, ShoppingBag, Truck, Users } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { adminAPI } from '../services/api'
import { formatPrice } from '../utils/formatters'
import CopyButton from '../components/ui/CopyButton'
import './AdminReports.css'

const toInputDate = (date) => date.toISOString().slice(0, 10)

const statusLabel = (value) => String(value || 'unknown')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase())

const dateLabel = (value) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

const canViewReports = (admin) => {
  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const isSuperAdmin = admin?.admin_role === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || permissions.length === 0))
  return isSuperAdmin || permissions.includes('reports:view')
}

const canViewExports = (admin) => {
  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const isSuperAdmin = admin?.admin_role === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || permissions.length === 0))
  return isSuperAdmin || permissions.includes('exports:view') || permissions.includes('exports:download')
}

const presetRange = (preset) => {
  const today = new Date()
  const start = new Date(today)
  if (preset === '7') start.setDate(today.getDate() - 6)
  if (preset === '30') start.setDate(today.getDate() - 29)
  if (preset === 'month') start.setDate(1)
  return { start_date: toInputDate(start), end_date: toInputDate(today) }
}

export default function AdminReports() {
  const { isAdmin, admin } = useAuthStore()
  const [range, setRange] = useState(() => presetRange('30'))
  const [activePreset, setActivePreset] = useState('30')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  const hasAccess = isAdmin && canViewReports(admin)

  const loadReport = async (nextRange = range) => {
    try {
      setLoading(true)
      const response = await adminAPI.getReportsSummary(nextRange)
      setReport(response)
    } catch (error) {
      console.error('Failed to load reports', error)
      toast.error(error?.response?.status === 403 ? 'You do not have permission to view reports.' : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (hasAccess) loadReport()
  }, [hasAccess])

  const summary = report?.summary || {}
  const revenueByDay = report?.revenue_by_day || []
  const topProducts = report?.top_products || []
  const lowStock = report?.low_stock || []
  const recentOrders = report?.recent_orders || []
  const ordersByStatus = report?.orders_by_status || []
  const paymentsByStatus = report?.payments_by_status || []
  const maxRevenue = useMemo(() => Math.max(1, ...revenueByDay.map((item) => Number(item.confirmed_revenue || item.revenue || 0))), [revenueByDay])
  const hasReportData = Boolean(summary.total_orders || topProducts.length || lowStock.length || recentOrders.length)

  const applyPreset = (preset) => {
    const nextRange = presetRange(preset)
    setActivePreset(preset)
    setRange(nextRange)
    loadReport(nextRange)
  }

  const applyCustomRange = () => {
    setActivePreset('custom')
    loadReport(range)
  }

  if (!isAdmin) {
    return <div className="admin-page reports-page"><div className="reports-access-card">Access denied. Admin login required.</div></div>
  }

  if (!hasAccess) {
    return (
      <div className="admin-page reports-page">
        <div className="reports-access-card">
          <h1>Sales & Business Reports</h1>
          <p>You do not have permission to view FoodNova reports.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page reports-page">
      <section className="reports-hero">
        <div>
          <p className="reports-kicker">FoodNova Analytics</p>
          <h1>Sales & Business Reports</h1>
          <p>Monitor FoodNova orders, revenue, stock, customers, and delivery performance.</p>
        </div>
        {canViewExports(admin) && (
          <Link to="/admin/exports" className="reports-export-link">
            <FileText size={18} />
            <span>Export Data</span>
          </Link>
        )}
      </section>

      <section className="reports-filter-card">
        <div className="reports-presets" aria-label="Report date presets">
          {[
            ['7', 'Last 7 days'],
            ['30', 'Last 30 days'],
            ['month', 'This Month'],
          ].map(([value, label]) => (
            <button key={value} type="button" className={activePreset === value ? 'active' : ''} onClick={() => applyPreset(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="reports-custom-range">
          <label>
            Start
            <input type="date" value={range.start_date} onChange={(event) => setRange({ ...range, start_date: event.target.value })} />
          </label>
          <label>
            End
            <input type="date" value={range.end_date} onChange={(event) => setRange({ ...range, end_date: event.target.value })} />
          </label>
          <button type="button" onClick={applyCustomRange} disabled={loading}>
            {loading ? <RefreshCw size={16} className="reports-spin" /> : <BarChart3 size={16} />}
            <span>Apply</span>
          </button>
        </div>
      </section>

      {loading ? (
        <div className="reports-loading">Loading reports...</div>
      ) : (
        <>
          <section className="reports-summary-grid">
            <div className="reports-stat-card"><ShoppingBag size={24} /><span>Total Orders</span><strong>{summary.total_orders || 0}</strong></div>
            <div className="reports-stat-card"><CreditCard size={24} /><span>Confirmed Revenue</span><strong>{formatPrice(summary.confirmed_revenue || summary.total_revenue || 0)}</strong></div>
            <div className="reports-stat-card"><BarChart3 size={24} /><span>Total Order Value</span><strong>{formatPrice(summary.total_order_value || 0)}</strong></div>
            <div className="reports-stat-card"><CreditCard size={24} /><span>Pending Payments</span><strong>{summary.pending_payments || 0}</strong></div>
            <div className="reports-stat-card"><Truck size={24} /><span>Delivered Orders</span><strong>{summary.delivered_orders || 0}</strong></div>
            <div className="reports-stat-card"><Users size={24} /><span>Active Customers</span><strong>{summary.active_customers || 0}</strong></div>
            <div className="reports-stat-card"><Package size={24} /><span>Low Stock</span><strong>{summary.low_stock_products || 0}</strong></div>
            <div className="reports-stat-card"><Package size={24} /><span>Out of Stock</span><strong>{summary.out_of_stock_products || 0}</strong></div>
          </section>

          {!hasReportData && <div className="reports-empty">No report data available for this period.</div>}

          <section className="reports-grid">
            <div className="reports-card reports-wide">
              <div className="reports-card-header">
                <h2>Revenue by Day</h2>
                <p>Confirmed revenue where available, with order volume.</p>
              </div>
              <div className="reports-bars">
                {revenueByDay.length ? revenueByDay.map((item) => {
                  const value = Number(item.confirmed_revenue || item.revenue || 0)
                  return (
                    <div key={item.date} className="reports-bar-row">
                      <span>{dateLabel(item.date)}</span>
                      <div className="reports-bar-track"><div style={{ width: `${Math.max(4, (value / maxRevenue) * 100)}%` }} /></div>
                      <strong>{formatPrice(value)}</strong>
                      <em>{item.orders || 0} orders</em>
                    </div>
                  )
                }) : <p className="reports-muted">No revenue in this period.</p>}
              </div>
            </div>

            <div className="reports-card">
              <div className="reports-card-header"><h2>Orders by Status</h2></div>
              <div className="reports-status-list">
                {ordersByStatus.map((item) => <div key={item.status}><span>{statusLabel(item.status)}</span><strong>{item.count}</strong></div>)}
              </div>
            </div>

            <div className="reports-card">
              <div className="reports-card-header"><h2>Payment Status</h2></div>
              <div className="reports-status-list">
                {paymentsByStatus.map((item) => <div key={item.status}><span>{statusLabel(item.status)}</span><strong>{item.count}</strong></div>)}
              </div>
            </div>
          </section>

          <section className="reports-table-grid">
            <div className="reports-card">
              <div className="reports-card-header"><h2>Top Products</h2></div>
              <div className="reports-table-wrap">
                <table className="reports-table">
                  <thead><tr><th>Product</th><th>Qty</th><th>Revenue</th></tr></thead>
                  <tbody>
                    {topProducts.length ? topProducts.map((item) => (
                      <tr key={`${item.product_id || item.name}`}><td>{item.name}</td><td>{item.quantity_sold}</td><td>{formatPrice(item.revenue || 0)}</td></tr>
                    )) : <tr><td colSpan="3">No product sales in this period.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="reports-card">
              <div className="reports-card-header"><h2>Low Stock Products</h2></div>
              <div className="reports-table-wrap">
                <table className="reports-table">
                  <thead><tr><th>Product</th><th>Stock</th><th>Category</th></tr></thead>
                  <tbody>
                    {lowStock.length ? lowStock.map((item) => (
                      <tr key={item.id}><td>{item.name}</td><td>{item.stock_qty}</td><td>{item.category || 'General'}</td></tr>
                    )) : <tr><td colSpan="3">No low-stock products.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="reports-card">
            <div className="reports-card-header"><h2>Recent Orders</h2></div>
            <div className="reports-table-wrap">
              <table className="reports-table">
                <thead><tr><th>Order Code</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {recentOrders.length ? recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td><span className="copyable-value">{order.order_code}<CopyButton value={order.order_code} label="Copy" /></span></td>
                      <td>{order.customer_name || 'Customer'}</td>
                      <td>{formatPrice(order.total_amount || 0)}</td>
                      <td>{statusLabel(order.payment_status)}</td>
                      <td>{statusLabel(order.order_status)}</td>
                      <td>{dateLabel(order.created_at)}</td>
                    </tr>
                  )) : <tr><td colSpan="6">No recent orders in this period.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
