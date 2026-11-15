import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { adminAPI } from '../services/api'
import { buildSmartOperationsSummary } from '../utils/adminDashboardMetrics'
import { formatPrice } from '../utils/formatters'
import toast from 'react-hot-toast'
import { AlertTriangle, ArrowUpRight, BarChart3, CircleDollarSign, Clock3, Package, RefreshCw, ShoppingBag, Truck } from 'lucide-react'
import { adminTools, isAdminToolAllowed } from './adminNavigation'
import './AdminDashboard.css'

const statusTone = (value) => {
  if (value >= 85) return 'tone-green'
  if (value >= 70) return 'tone-gold'
  if (value >= 60) return 'tone-blue'
  return 'tone-red'
}

export default function AdminDashboard() {
  const { isAdmin, admin } = useAuthStore()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const adminPermissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const role = String(admin?.admin_role || '').toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
  const isSuperAdminDisplay = role === 'super_admin' || (admin?.role === 'admin' && (!role || adminPermissions.length === 0))
  const can = (permission) => isSuperAdminDisplay || adminPermissions.includes(permission)
  const canViewOrders = can('orders:view')
  const canViewStock = can('stock:view')
  const visibleTools = adminTools.filter((tool) => isAdminToolAllowed(tool, can))
  const groups = visibleTools.reduce((result, tool) => { (result[tool.group] ||= []).push(tool); return result }, {})
  const adminName = admin?.full_name || admin?.fullName || admin?.name || 'there'

  const fetchStats = async () => {
    try {
      setLoading(true)
      setLoadError('')
      const response = await adminAPI.getDashboardStats({ includeOrders: canViewOrders, includeProducts: canViewStock })
      setStats(response.data)
    } catch (error) {
      setStats(null)
      setLoadError('Dashboard data could not be loaded. Your existing admin data was not replaced with estimates.')
      toast.error('Failed to load dashboard data')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const smartOperations = stats?.smart_operations || buildSmartOperationsSummary({ orders: stats?.recent_orders || [], products: [], riders: [] })

  useEffect(() => {
    if (isAdmin && (canViewOrders || canViewStock)) fetchStats()
    else setLoading(false)
  }, [isAdmin, canViewOrders, canViewStock])

  if (!isAdmin) return <div className="admin-page"><p>Access denied. Admin login required.</p></div>

  return <div className="admin-page admin-dashboard-page">
    <section className="admin-welcome">
      <div><p className="admin-welcome-kicker">FOODNOVA OPERATIONS</p><h2>Welcome, {adminName.split(/\s+/)[0]}</h2><p>Here is the latest operational snapshot from your authorized data.</p></div>
      {canViewOrders && <Link to="/admin/orders" className="admin-welcome-action">Open orders <ArrowUpRight size={17} /></Link>}
      {!canViewOrders && canViewStock && <Link to="/admin/stock" className="admin-welcome-action">Open inventory <ArrowUpRight size={17} /></Link>}
    </section>

    {loading && <div className="admin-stats-loading" role="status">Loading operational metrics...</div>}
    {loadError && <div className="admin-stats-error" role="alert"><p>{loadError}</p><button type="button" onClick={fetchStats}><RefreshCw size={16} /> Retry</button></div>}
    {!loading && !loadError && stats && (
      <div className="stats-grid admin-dashboard-stats">
        {canViewOrders && <div className="stat-card tone-green"><ShoppingBag size={22} /><div><p className="stat-label">Total Orders</p><p className="stat-value">{stats.total_orders}</p></div></div>}
        {canViewOrders && <div className="stat-card tone-gold"><CircleDollarSign size={22} /><div><p className="stat-label">Revenue</p><p className="stat-value">{formatPrice(stats.total_revenue)}</p></div></div>}
        {canViewOrders && <div className="stat-card tone-blue"><Truck size={22} /><div><p className="stat-label">Delivered Orders</p><p className="stat-value">{stats.delivered_orders}</p></div></div>}
        {canViewOrders && <div className="stat-card tone-orange"><BarChart3 size={22} /><div><p className="stat-label">Pending Payments</p><p className="stat-value">{stats.pending_payments}</p></div></div>}
        {canViewStock && <div className="stat-card tone-green"><Package size={22} /><div><p className="stat-label">Active Products</p><p className="stat-value">{stats.total_products}</p></div></div>}
        {canViewStock && <div className="stat-card tone-red"><Package size={22} /><div><p className="stat-label">Inventory Alerts</p><p className="stat-value">{stats.low_stock_products} low · {stats.out_of_stock_products} out</p></div></div>}
      </div>
    )}

    {!loading && !loadError && stats && smartOperations && (
      <div className="admin-smart-grid">
        <div className={`admin-smart-card ${statusTone(smartOperations.operational_health.score)}`}>
          <div className="admin-smart-header"><span>Smart Ops</span><strong>{smartOperations.operational_health.label}</strong></div>
          <p className="admin-smart-score">{smartOperations.operational_health.score}/100</p>
          <p className="admin-smart-detail">{smartOperations.operational_health.detail}</p>
        </div>
        <div className="admin-smart-card tone-blue">
          <div className="admin-smart-header"><span>Revenue</span><strong>Average order</strong></div>
          <p className="admin-smart-score">{formatPrice(smartOperations.revenue.average)}</p>
          <p className="admin-smart-detail">{smartOperations.revenue.paid_orders} paid orders tracked</p>
        </div>
        <div className="admin-smart-card tone-green">
          <div className="admin-smart-header"><span>Fulfilment</span><strong>Delivery rate</strong></div>
          <p className="admin-smart-score">{smartOperations.fulfillment.rate}%</p>
          <p className="admin-smart-detail">{smartOperations.fulfillment.delivered} completed / {smartOperations.fulfillment.total_orders} total</p>
        </div>
        <div className="admin-smart-card tone-gold">
          <div className="admin-smart-header"><span>Rider Plan</span><strong>Availability</strong></div>
          <p className="admin-smart-score">{smartOperations.riders.available}/{smartOperations.riders.total}</p>
          <p className="admin-smart-detail">{smartOperations.riders.utilization}% utilization</p>
        </div>
      </div>
    )}

    {!loading && !loadError && stats && smartOperations.alerts?.length > 0 && (
      <div className="admin-smart-alerts">
        <div className="admin-ops-heading"><div><p>BUSINESS INTELLIGENCE</p><h2>Priority alerts</h2></div><AlertTriangle size={18} /></div>
        {smartOperations.alerts.map((alert) => (
          <div className="admin-smart-alert" key={alert.type}>
            <div className={`admin-smart-pill ${alert.level === 'critical' ? 'pill-critical' : 'pill-warning'}`} />
            <div>
              <strong>{alert.title}</strong>
              <small>{alert.detail}</small>
            </div>
          </div>
        ))}
      </div>
    )}
    {!loading && !loadError && !canViewOrders && !canViewStock && <div className="admin-tools-empty">No dashboard metrics are available for your assigned permissions.</div>}

    {!loading && !loadError && stats && (
      <div className="admin-operations-grid">
        {canViewOrders && <section className="admin-ops-panel">
          <div className="admin-ops-heading"><div><p>ORDER FLOW</p><h2>Recent Orders</h2></div><Link to="/admin/orders" aria-label="View all orders"><ArrowUpRight size={18} /></Link></div>
          {stats.recent_orders?.length ? <div className="admin-recent-orders">
            {stats.recent_orders.map((order) => <Link className="admin-recent-order" key={order.id} to="/admin/orders">
              <span className="admin-order-dot" data-status={order.status} />
              <span className="admin-order-main"><strong>{order.order_code}</strong><small>{order.status.replaceAll('_', ' ') || 'Order placed'}</small></span>
              <span className="admin-order-meta"><strong>{formatPrice(order.total_amount)}</strong><small>{order.created_at ? new Date(order.created_at).toLocaleDateString() : 'Date unavailable'}</small></span>
            </Link>)}
          </div> : <p className="admin-ops-empty">No recent orders.</p>}
        </section>}

        {canViewOrders && <section className="admin-ops-panel">
          <div className="admin-ops-heading"><div><p>OPERATIONAL SNAPSHOT</p><h2>Order Status</h2></div><BarChart3 size={19} /></div>
          <div className="admin-status-chart" role="group" aria-label="Order status distribution">
            {(stats.status_distribution || []).map((status) => {
              const share = stats.total_orders ? Math.round((status.count / stats.total_orders) * 100) : 0
              return <div className="admin-status-row" key={status.label}>
                <div><span>{status.label}</span><strong>{status.count}</strong></div>
                <span className="admin-status-track"><span className={`status-fill status-${status.label.toLowerCase()}`} style={{ width: `${share}%` }} /></span>
              </div>
            })}
          </div>
          <div className="admin-attention-link"><Clock3 size={16} /><span>{stats.pending_payments + stats.receipt_submitted} payment reviews</span><Link to="/admin/orders">Review orders</Link></div>
        </section>}

        {canViewOrders && <section className="admin-ops-panel">
          <div className="admin-ops-heading"><div><p>NEEDS ATTENTION</p><h2>Payment Queue</h2></div><span className="admin-attention-count">{stats.pending_payments + stats.receipt_submitted}</span></div>
          {stats.attention_orders?.length ? <div className="admin-attention-list">
            {stats.attention_orders.map((order) => <Link key={order.id} to="/admin/orders" className="admin-attention-order">
              <span><strong>{order.order_code}</strong><small>{order.payment_status.replaceAll('_', ' ')}</small></span>
              <strong>{formatPrice(order.total_amount)}</strong>
            </Link>)}
          </div> : <p className="admin-ops-empty">No payment reviews are pending.</p>}
        </section>}

        {canViewStock && <section className="admin-ops-panel">
          <div className="admin-ops-heading"><div><p>INVENTORY WATCH</p><h2>Stock Alerts</h2></div><AlertTriangle size={19} /></div>
          {stats.stock_alerts?.length ? <div className="admin-stock-alerts">
            {stats.stock_alerts.map((product) => <div className="admin-stock-alert" key={product.id}>
              <span className={`admin-stock-indicator${product.is_out_of_stock ? ' is-out' : ''}`} />
              <strong>{product.name}</strong>
              <span>{product.is_out_of_stock ? 'Out of stock' : `${product.stock_qty} ${product.stock_unit}`}</span>
            </div>)}
          </div> : <p className="admin-ops-empty">No active stock alerts.</p>}
          <Link className="admin-stock-link" to="/admin/stock">Open stock management <ArrowUpRight size={15} /></Link>
        </section>}
      </div>
    )}

    <section className="admin-tools-section"><div className="admin-section-header"><h2>Admin Tools</h2><p>Quick access to FoodNova management workflows.</p></div>
      {visibleTools.length ? Object.entries(groups).map(([group, tools]) => <div className="admin-tool-group" key={group}><h3>{group}</h3><div className="admin-tools-grid">{tools.map((tool) => <Link key={tool.path} to={tool.path} className="admin-tool-card"><div className="admin-tool-icon"><tool.icon size={22} /></div><div className="admin-tool-content"><h3>{tool.title}</h3><p>{tool.description}</p></div><span className="admin-tool-arrow">→</span></Link>)}</div></div>) : <div className="admin-tools-empty">No admin tools available for your role.</div>}
    </section>
  </div>
}
