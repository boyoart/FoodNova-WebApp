import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, Truck, UserCheck, XCircle } from 'lucide-react'
import { adminAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './AdminDispatchBoard.css'

const QUEUES = [
  ['NEW', 'New Orders'],
  ['ASSIGNED', 'Assigned Orders'],
  ['ACCEPTED', 'Accepted Orders'],
  ['PICKED_UP', 'Picked Up Orders'],
  ['IN_TRANSIT', 'In Transit Orders'],
  ['ARRIVED', 'Arrived Orders'],
  ['DELIVERED', 'Delivered Orders'],
  ['CANCELLED', 'Cancelled Orders'],
]

function labelize(value = '') {
  return String(value || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatTime(value) {
  if (!value) return 'N/A'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export default function AdminDispatchBoard() {
  const { isAdmin, admin } = useAuthStore()
  const [board, setBoard] = useState({ queue: {}, riders: [], offers: [], stats: {} })
  const [loading, setLoading] = useState(true)
  const [activeQueue, setActiveQueue] = useState('NEW')
  const [selectedRiders, setSelectedRiders] = useState({})
  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const isSuperAdmin = admin?.admin_role === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || permissions.length === 0))
  const canView = isSuperAdmin || ['orders:view', 'orders:delivery', 'delivery:manage', 'workforce:view', 'workforce:manage'].some((permission) => permissions.includes(permission))
  const canManage = isSuperAdmin || ['orders:delivery', 'delivery:manage', 'workforce:manage'].some((permission) => permissions.includes(permission))

  const loadBoard = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getDispatchBoard()
      setBoard(response.data || response)
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to load dispatch board')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdmin || !canView) return undefined
    loadBoard()
    const interval = window.setInterval(loadBoard, 20000)
    return () => window.clearInterval(interval)
  }, [isAdmin, canView])

  const orders = useMemo(() => board.queue?.[activeQueue] || [], [board.queue, activeQueue])
  const availableRiders = useMemo(() => (board.riders || []).filter((rider) => rider.status_label === 'Available'), [board.riders])

  const autoAssign = async (order) => {
    if (!canManage) return
    try {
      await adminAPI.autoAssignDispatchOrder(order.id)
      toast.success('Auto assignment started')
      await loadBoard()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'No eligible rider available')
    }
  }

  const cancelOrder = async (order) => {
    if (!canManage) return
    const reason = window.prompt(`Cancel delivery for ${order.order_code}?`, 'Cancelled by dispatch admin')
    if (!reason) return
    try {
      await adminAPI.cancelDispatchOrder(order.id, { reason })
      toast.success('Delivery cancelled')
      await loadBoard()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to cancel delivery')
    }
  }

  const manualAssign = async (order) => {
    if (!canManage) return
    const riderId = selectedRiders[order.id]
    if (!riderId) {
      toast.error('Select an available rider first')
      return
    }
    try {
      await adminAPI.assignRider(order.id, {
        rider_id: Number(riderId),
        delivery_note: order.delivery_notes || '',
        mark_out_for_delivery: true,
      })
      toast.success('Rider assigned')
      await loadBoard()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to assign rider')
    }
  }

  if (!isAdmin) return <div className="admin-page"><p>Access denied.</p></div>
  if (!canView) return <div className="admin-page"><p>You do not have permission to view dispatch operations.</p></div>

  return (
    <div className="admin-page dispatch-board-page">
      <div className="dispatch-board-header">
        <div>
          <h1>Dispatch Operations Board</h1>
          <p>Live order queues, rider availability, assignment controls, and delivery PIN visibility.</p>
        </div>
        <button type="button" onClick={loadBoard} disabled={loading}><RefreshCw size={16} /> Refresh</button>
      </div>

      <section className="dispatch-stats">
        {QUEUES.map(([key, label]) => (
          <button type="button" key={key} className={activeQueue === key ? 'active' : ''} onClick={() => setActiveQueue(key)}>
            <span>{label}</span>
            <strong>{board.stats?.[key] || 0}</strong>
          </button>
        ))}
      </section>

      <section className="dispatch-layout">
        <div className="dispatch-panel">
          <div className="dispatch-panel-title">
            <h2>{labelize(activeQueue)}</h2>
            <span>{orders.length} orders</span>
          </div>
          {loading ? <p>Loading dispatch queue...</p> : orders.length ? orders.map((order) => (
            <article className="dispatch-order-card" key={order.id}>
              <div className="dispatch-card-head">
                <div>
                  <h3>{order.order_code}</h3>
                  <p>{order.customer_name || 'Customer'} - {order.customer_phone || order.phone || 'No phone'}</p>
                </div>
                <span className={`dispatch-status ${order.dispatch_status}`}>{labelize(order.dispatch_status)}</span>
              </div>
              <div className="dispatch-grid">
                <div><span>Pickup</span><strong>FoodNova pickup</strong></div>
                <div><span>Customer Address</span><strong>{order.delivery_address || 'N/A'}</strong></div>
                <div><span>Rider</span><strong>{order.rider_name || 'Unassigned'}</strong></div>
                <div><span>Rider Phone</span><strong>{order.rider_phone || 'N/A'}</strong></div>
                <div><span>PIN</span><strong>{order.delivery_pin || order.delivery_code || 'N/A'}</strong></div>
                <div><span>Updated</span><strong>{formatTime(order.updated_at)}</strong></div>
              </div>
              {order.delivery_notes && <p className="dispatch-note">{order.delivery_notes}</p>}
              <div className="dispatch-manual-assign">
                <select value={selectedRiders[order.id] || ''} onChange={(event) => setSelectedRiders((current) => ({ ...current, [order.id]: event.target.value }))}>
                  <option value="">Select available rider</option>
                  {availableRiders.map((rider) => (
                    <option key={rider.id} value={rider.id}>{rider.full_name || rider.name || `Rider #${rider.id}`} - {rider.phone || 'No phone'}</option>
                  ))}
                </select>
              </div>
              <div className="dispatch-actions">
                <button type="button" onClick={() => autoAssign(order)} disabled={!canManage || !['NEW', 'CANCELLED'].includes(order.dispatch_status)}><Truck size={15} /> Auto Assign</button>
                <button type="button" onClick={() => manualAssign(order)} disabled={!canManage || ['DELIVERED', 'CANCELLED'].includes(order.dispatch_status)}><UserCheck size={15} /> Manual Assign</button>
                <button type="button" className="danger" onClick={() => cancelOrder(order)} disabled={!canManage || ['DELIVERED', 'CANCELLED'].includes(order.dispatch_status)}><XCircle size={15} /> Cancel</button>
              </div>
            </article>
          )) : <p>No orders in this queue.</p>}
        </div>

        <aside className="dispatch-panel">
          <div className="dispatch-panel-title">
            <h2>Rider Directory</h2>
            <span>{availableRiders.length} available</span>
          </div>
          {(board.riders || []).map((rider) => (
            <article className="dispatch-rider-card" key={rider.id}>
              <div>
                <h3>{rider.full_name || rider.name || `Rider #${rider.id}`}</h3>
                <p>{rider.phone || 'No phone'} - {rider.company || 'FoodNova'}</p>
              </div>
              <span className={`dispatch-rider-status ${String(rider.status_label || '').replace(/\s+/g, '-')}`}>{rider.status_label}</span>
              <div className="dispatch-grid compact">
                <div><span>Status</span><strong>{rider.operational_status || 'OFFLINE'}</strong></div>
                <div><span>Approval</span><strong>{rider.kyc_status || 'PENDING'}</strong></div>
                <div><span>Last Active</span><strong>{formatTime(rider.last_active_time)}</strong></div>
                <div><span>Location</span><strong>{rider.current_location?.latitude ? `${Number(rider.current_location.latitude).toFixed(4)}, ${Number(rider.current_location.longitude).toFixed(4)}` : 'N/A'}</strong></div>
              </div>
            </article>
          ))}
        </aside>
      </section>
    </div>
  )
}
