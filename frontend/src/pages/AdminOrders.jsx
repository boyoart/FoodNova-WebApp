import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { adminAPI, resolveMediaUrl } from '../services/api'
import { formatPrice } from '../utils/formatters'
import { normalizePhoneForWhatsApp } from '../utils/contactUtils'
import toast from 'react-hot-toast'
import { MessageCircle, Trash2 } from 'lucide-react'
import CopyButton from '../components/ui/CopyButton'
import './AdminPages.css'

const PAYMENT_STATUS_OPTIONS = [
  { value: 'pending_payment', label: 'Pending Payment' },
  { value: 'receipt_submitted', label: 'Receipt Submitted' },
  { value: 'payment_confirmed', label: 'Payment Confirmed' },
  { value: 'payment_rejected', label: 'Payment Rejected' },
]

const ORDER_STATUS_OPTIONS = [
  { value: 'order_placed', label: 'Order Placed' },
  { value: 'processing', label: 'Processing' },
  { value: 'ready_for_pickup', label: 'Ready for Pickup' },
  { value: 'picked_up', label: 'Picked Up' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

const DASHBOARD_CARDS = [
  { key: 'total', label: 'Total Orders' },
  { key: 'pending_payment', label: 'Pending Payment' },
  { key: 'processing', label: 'Processing' },
  { key: 'out_for_delivery', label: 'Out For Delivery' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
]

export default function AdminOrders() {
  const { isAdmin, admin } = useAuthStore()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [orderScope, setOrderScope] = useState('active')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingOrder, setDeletingOrder] = useState(false)
  const [paymentAuditLogs, setPaymentAuditLogs] = useState([])
  const [serviceNote, setServiceNote] = useState('')
  const [sendingServiceNote, setSendingServiceNote] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [riders, setRiders] = useState([])
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assigningRider, setAssigningRider] = useState(false)
  const [assignmentForm, setAssignmentForm] = useState({ rider_id: '', delivery_note: '', mark_out_for_delivery: true })
  const [selectedOrderIds, setSelectedOrderIds] = useState([])
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [deliveryFilter, setDeliveryFilter] = useState('all')
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [bulkAssignModalOpen, setBulkAssignModalOpen] = useState(false)
  const [bulkAssignmentForm, setBulkAssignmentForm] = useState({ rider_id: '', delivery_note: '', mark_out_for_delivery: true })
  const [bulkAssigningRider, setBulkAssigningRider] = useState(false)

  useEffect(() => {
    if (isAdmin) {
      fetchOrders()
    }
  }, [isAdmin, filter, orderScope])

  const adminPermissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const isSuperAdmin = admin?.admin_role === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || adminPermissions.length === 0))
  const canDeleteOrders = isSuperAdmin || adminPermissions.includes('orders:delete')
  const canUpdateOrders = isSuperAdmin || adminPermissions.includes('orders:update')
  const canAssignRiders = isSuperAdmin || adminPermissions.includes('orders:delivery') || adminPermissions.includes('delivery:manage')
  const getOrderStatus = (order = {}) => order.order_status || order.fulfillment_status || order.delivery_status || order.status || 'order_placed'
  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const fromDate = dateRange.from ? new Date(`${dateRange.from}T00:00:00`) : null
    const toDate = dateRange.to ? new Date(`${dateRange.to}T23:59:59`) : null
    return orders.filter((order) => {
      const paymentStatus = order.payment_status || order.status || ''
      const deliveryStatus = getOrderStatus(order)
      const createdAt = order.created_at ? new Date(order.created_at) : null
      const searchable = [
        order.order_code,
        order.customer_name,
        order.customer_phone,
        order.phone,
        order.rider_name,
      ].filter(Boolean).join(' ').toLowerCase()
      if (term && !searchable.includes(term)) return false
      if (paymentFilter !== 'all' && paymentStatus !== paymentFilter) return false
      if (deliveryFilter !== 'all' && deliveryStatus !== deliveryFilter) return false
      if (fromDate && (!createdAt || createdAt < fromDate)) return false
      if (toDate && (!createdAt || createdAt > toDate)) return false
      return true
    })
  }, [orders, searchTerm, paymentFilter, deliveryFilter, dateRange])
  const dashboardCounts = useMemo(() => {
    const counts = { total: orders.length, pending_payment: 0, processing: 0, out_for_delivery: 0, delivered: 0, cancelled: 0 }
    orders.forEach((order) => {
      const paymentStatus = order.payment_status || order.status || ''
      const orderStatus = getOrderStatus(order)
      if (paymentStatus === 'pending_payment') counts.pending_payment += 1
      if (orderStatus === 'processing') counts.processing += 1
      if (orderStatus === 'out_for_delivery' || order.delivery_status === 'IN_TRANSIT') counts.out_for_delivery += 1
      if (orderStatus === 'delivered') counts.delivered += 1
      if (orderStatus === 'cancelled') counts.cancelled += 1
    })
    return counts
  }, [orders])
  const selectableOrderIds = filteredOrders.filter(order => !order.is_deleted).map(order => Number(order.id)).filter(Boolean)
  const selectedOrders = useMemo(() => orders.filter(order => selectedOrderIds.includes(Number(order.id))), [orders, selectedOrderIds])
  const selectedCount = selectedOrderIds.length
  const allVisibleSelected = selectableOrderIds.length > 0 && selectableOrderIds.every(id => selectedOrderIds.includes(id))

  useEffect(() => {
    const filteredIds = new Set(filteredOrders.filter(order => !order.is_deleted).map(order => Number(order.id)).filter(Boolean))
    setSelectedOrderIds((current) => current.filter(id => filteredIds.has(id)))
  }, [filteredOrders])

  const normalizeOrderResponse = (res) => {
    if (Array.isArray(res)) return res
    if (Array.isArray(res?.data)) return res.data
    if (Array.isArray(res?.orders)) return res.orders
    if (Array.isArray(res?.data?.orders)) return res.data.orders
    return []
  }

  const fetchOrders = async () => {
    try {
      setLoading(true)
      setLoadError('')
      const params = {
        ...(filter !== 'all' ? { status: filter } : {}),
        ...(orderScope === 'deleted' && canDeleteOrders ? { include_deleted: true } : {}),
      }
      const res = await adminAPI.getOrders(params)
      const nextOrders = normalizeOrderResponse(res)
      setOrders(nextOrders)
      setSelectedOrderIds((current) => {
        const visibleIds = new Set(nextOrders.filter(order => !order.is_deleted).map(order => Number(order.id)).filter(Boolean))
        return current.filter(id => visibleIds.has(id))
      })
    } catch (error) {
      const message = [401, 403].includes(error?.response?.status)
        ? 'Session expired. Please log in again.'
        : 'Failed to load data. Please log out and log back in. If this continues, check backend deployment logs.'
      setLoadError(message)
      toast.error(message)
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handlePaymentStatusUpdate = async (orderId, newStatus) => {
    let payload = { payment_status: newStatus }
    if (newStatus === 'payment_rejected') {
      const reason = window.prompt('Reason for rejection')
      if (!reason || !reason.trim()) {
        toast.error('Rejection reason is required')
        return
      }
      payload = { ...payload, reason: reason.trim(), rejection_reason: reason.trim() }
    }
    try {
      await adminAPI.updatePaymentStatus(orderId, payload)
      toast.success('Payment status updated')
      if (selectedOrder?.id === orderId) loadPaymentAudit(orderId)
      fetchOrders()
    } catch (error) {
      toast.error('Failed to update payment status')
    }
  }

  const handleOrderStatusUpdate = async (orderId, newStatus) => {
    try {
      await adminAPI.updateFulfillmentStatus(orderId, { order_status: newStatus, fulfillment_status: newStatus })
      toast.success('Order status updated')
      // Refresh the selected order details
      if (selectedOrder?.id === orderId) {
        const updated = orders.find(o => o.id === orderId)
        if (updated) setSelectedOrder(updated)
      }
      fetchOrders()
    } catch (error) {
      toast.error('Failed to update order status')
    }
  }

  const handleSendServiceNote = async () => {
    if (!serviceNote.trim()) {
      toast.error('Please enter a service note')
      return
    }

    try {
      setSendingServiceNote(true)
      await adminAPI.updateOrder(selectedOrder.id, {
        service_note: serviceNote,
      })
      toast.success('Service update sent to customer')
      setServiceNote('')
      await fetchOrders()
      // Refresh selected order
      const updated = orders.find(o => o.id === selectedOrder.id)
      if (updated) setSelectedOrder(updated)
    } catch (error) {
      toast.error('Failed to send service note')
      console.error(error)
    } finally {
      setSendingServiceNote(false)
    }
  }

  const handleViewOrder = (order) => {
    setSelectedOrder(order)
    setServiceNote(order.service_note || '')
    loadPaymentAudit(order.id)
    loadRiders()
  }

  const handleCloseOrder = () => {
    setSelectedOrder(null)
    setServiceNote('')
    setPaymentAuditLogs([])
    setAssignModalOpen(false)
    setDeleteModalOpen(false)
    setDeleteConfirmText('')
  }

  const openDeleteModal = () => {
    setDeleteConfirmText('')
    setDeleteModalOpen(true)
  }

  const deleteSelectedOrder = async () => {
    if (!selectedOrder || deleteConfirmText !== 'DELETE') return
    try {
      setDeletingOrder(true)
      await adminAPI.deleteOrder(selectedOrder.id)
      toast.success('Order deleted successfully')
      handleCloseOrder()
      await fetchOrders()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to delete order')
    } finally {
      setDeletingOrder(false)
    }
  }

  const toggleOrderSelection = (orderId) => {
    const id = Number(orderId)
    if (!id) return
    setSelectedOrderIds((current) => (
      current.includes(id) ? current.filter(item => item !== id) : [...current, id]
    ))
  }

  const toggleSelectAllOrders = () => {
    setSelectedOrderIds((current) => {
      if (allVisibleSelected) {
        return current.filter(id => !selectableOrderIds.includes(id))
      }
      return Array.from(new Set([...current, ...selectableOrderIds]))
    })
  }

  const selectCurrentPageOrders = () => {
    setSelectedOrderIds(selectableOrderIds)
  }

  const selectAllFilteredOrders = () => {
    setSelectedOrderIds(selectableOrderIds)
  }

  const clearBulkSelection = () => {
    setSelectedOrderIds([])
  }

  const exportRows = selectedOrders.map((order) => ({
    'Order Code': order.order_code || `#${order.id}`,
    Customer: order.customer_name || '',
    Phone: order.phone || order.customer_phone || '',
    Rider: order.rider_name || '',
    Amount: order.total_amount || 0,
    Payment: order.payment_status || order.status || '',
    Status: getOrderStatus(order),
    Created: order.created_at || '',
  }))

  const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`

  const downloadBlob = (content, filename, type) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportSelectedCsv = () => {
    if (!selectedOrders.length) return
    const headers = Object.keys(exportRows[0])
    const csv = [headers.map(escapeCsv).join(','), ...exportRows.map(row => headers.map(header => escapeCsv(row[header])).join(','))].join('\n')
    downloadBlob(csv, `foodnova-orders-${Date.now()}.csv`, 'text/csv;charset=utf-8')
  }

  const exportSelectedExcel = () => {
    if (!selectedOrders.length) return
    const headers = Object.keys(exportRows[0])
    const rows = exportRows.map(row => `<tr>${headers.map(header => `<td>${String(row[header] ?? '').replace(/[<>&]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char]))}</td>`).join('')}</tr>`).join('')
    const table = `<table><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`
    downloadBlob(table, `foodnova-orders-${Date.now()}.xls`, 'application/vnd.ms-excel;charset=utf-8')
  }

  const bulkSendWhatsApp = () => {
    const targets = selectedOrders.filter(order => order.customer_phone || order.phone)
    if (!targets.length) {
      toast.error('No selected orders have customer phone numbers')
      return
    }
    targets.forEach((order) => {
      const phone = normalizePhoneForWhatsApp(order.customer_phone || order.phone)
      const message = `Hello ${order.customer_name || 'Customer'}, this is FoodNova regarding your order ${order.order_code || `#${order.id}`}.`
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
    })
    toast.success(`${targets.length} WhatsApp message${targets.length === 1 ? '' : 's'} generated`)
  }

  const runBulkDelete = async () => {
    if (!selectedOrderIds.length || bulkProcessing) return
    const confirmed = window.confirm(`Are you sure you want to delete ${selectedOrderIds.length} selected orders?`)
    if (!confirmed) return
    try {
      setBulkProcessing(true)
      const response = await adminAPI.bulkDeleteOrders(selectedOrderIds)
      toast.success(`${response.processed || 0} Orders Deleted Successfully`)
      clearBulkSelection()
      await fetchOrders()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Bulk delete failed')
    } finally {
      setBulkProcessing(false)
    }
  }

  const runBulkStatusUpdate = async (status) => {
    if (!selectedOrderIds.length || bulkProcessing) return
    try {
      setBulkProcessing(true)
      const response = await adminAPI.bulkUpdateOrderStatus(selectedOrderIds, status)
      toast.success(`${response.processed || 0} Orders Updated Successfully`)
      clearBulkSelection()
      await fetchOrders()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Bulk status update failed')
    } finally {
      setBulkProcessing(false)
    }
  }

  const openBulkAssignModal = () => {
    if (!selectedOrderIds.length) return
    setBulkAssignmentForm({ rider_id: '', delivery_note: '', mark_out_for_delivery: true })
    setBulkAssignModalOpen(true)
    loadRiders()
  }

  const submitBulkRiderAssignment = async (event) => {
    event.preventDefault()
    if (!bulkAssignmentForm.rider_id) {
      toast.error('Please select a rider')
      return
    }
    try {
      setBulkAssigningRider(true)
      setBulkProcessing(true)
      const response = await adminAPI.bulkAssignRider(selectedOrderIds, {
        rider_id: Number(bulkAssignmentForm.rider_id),
        delivery_note: bulkAssignmentForm.delivery_note,
        mark_out_for_delivery: bulkAssignmentForm.mark_out_for_delivery,
      })
      toast.success(`${response.processed || 0} Orders Assigned Successfully`)
      setBulkAssignModalOpen(false)
      clearBulkSelection()
      await fetchOrders()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Bulk rider assignment failed')
    } finally {
      setBulkAssigningRider(false)
      setBulkProcessing(false)
    }
  }

  const loadPaymentAudit = async (orderId) => {
    try {
      const response = await adminAPI.getOrderPaymentAudit(orderId)
      setPaymentAuditLogs(response.data || [])
    } catch (error) {
      if (![401, 403].includes(error?.response?.status)) console.error(error)
      setPaymentAuditLogs([])
    }
  }

  const getReceiptUrl = (receipt = {}) => resolveMediaUrl(
    receipt.url || receipt.receipt_url || receipt.data_url || ''
  )

  const isPdfReceipt = (receipt = {}) => {
    const mimeType = String(receipt.mime_type || '').toLowerCase()
    const fileType = String(receipt.file_type || '').toLowerCase()
    const source = getReceiptUrl(receipt).toLowerCase()
    return mimeType === 'application/pdf' || fileType === 'pdf' || source.includes('.pdf')
  }

  const openReceiptUrl = (receipt = {}) => {
    const receiptUrl = getReceiptUrl(receipt)
    if (receiptUrl) window.open(receiptUrl, '_blank', 'noopener,noreferrer')
  }

  const openCustomerWhatsApp = (order) => {
    const phone = normalizePhoneForWhatsApp(order?.customer_phone || order?.phone)
    const orderCode = order?.order_code || (order?.id ? `FN-${order.id}` : 'this order')
    const message = `Hello ${order?.customer_name || 'Customer'}, this is FoodNova regarding your order ${orderCode}.`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  const loadRiders = async () => {
    try {
      const assignRiderApiUrl = '/admin/riders?status=active'
      console.info('ASSIGN_RIDER_API_URL', assignRiderApiUrl)
      const response = await adminAPI.getRiders({ status: 'active' })
      console.info('ASSIGN_RIDER_RESPONSE', response)
      const assignable = (response.data || []).filter((rider) => {
        const lifecycleStatus = String(rider.status || rider.kyc_status || rider.approval_status || '').toUpperCase()
        const deleted = Boolean(rider.deleted_at || rider.isDeleted || rider.is_deleted || lifecycleStatus === 'DELETED')
        return lifecycleStatus === 'ACTIVE' && !deleted
      })
      console.info('ADMIN_ORDER_ASSIGNMENT_RIDERS', {
        total_riders_found: response.data?.length || 0,
        rider_ids_returned: assignable.map((rider) => rider.id),
        rider_status_values_returned: assignable.map((rider) => ({
          id: rider.id,
          database_rider_id: rider.database_rider_id,
          status: rider.status,
          kyc_status: rider.kyc_status,
          approval_status: rider.approval_status,
          rider_table_status: rider.rider_table_status,
          nin_verified: rider.nin_verified,
          online: rider.operational_status === 'ONLINE',
          available: rider.operational_status === 'ONLINE' && !rider.active_order,
        })),
      })
      setRiders(assignable)
    } catch (error) {
      if (![401, 403].includes(error?.response?.status)) console.error(error)
      setRiders([])
    }
  }

  const openAssignModal = () => {
    setAssignmentForm({
      rider_id: selectedOrder?.rider_id || '',
      delivery_note: selectedOrder?.delivery_note || '',
      mark_out_for_delivery: true,
    })
    setAssignModalOpen(true)
    loadRiders()
  }

  const submitRiderAssignment = async (event) => {
    event.preventDefault()
    if (!assignmentForm.rider_id) {
      toast.error('Please select a rider')
      return
    }
    try {
      setAssigningRider(true)
      const response = await adminAPI.assignRider(selectedOrder.id, {
        rider_id: Number(assignmentForm.rider_id),
        delivery_note: assignmentForm.delivery_note,
        mark_out_for_delivery: assignmentForm.mark_out_for_delivery,
      })
      const updatedOrder = response.order || response.data
      if (updatedOrder?.id) {
        setSelectedOrder(updatedOrder)
        setOrders((current) => current.map((order) => order.id === updatedOrder.id ? updatedOrder : order))
      }
      setAssignModalOpen(false)
      toast.success('Rider assigned successfully')
      fetchOrders()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to assign rider')
    } finally {
      setAssigningRider(false)
    }
  }

  if (!isAdmin) {
    return <div className="admin-page"><p>Access denied.</p></div>
  }

  return (
    <div className="admin-page">
      <h1>Order Management</h1>

      <div className="order-count-dashboard">
        {DASHBOARD_CARDS.map((card) => (
          <div key={card.key} className="order-count-card">
            <span>{card.label}</span>
            <strong>{dashboardCounts[card.key] || 0}</strong>
          </div>
        ))}
      </div>

      {canDeleteOrders && (
        <div className="order-scope-tabs">
          <button type="button" className={orderScope === 'active' ? 'active' : ''} onClick={() => setOrderScope('active')}>Active Orders</button>
          <button type="button" className={orderScope === 'deleted' ? 'active' : ''} onClick={() => setOrderScope('deleted')}>Deleted Orders</button>
        </div>
      )}

      <div className="order-management-controls">
        <label className="order-search-field">
          <span>Quick Search</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Order code, customer, phone, rider"
          />
        </label>
        <label>
          <span>Payment Status</span>
          <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
            <option value="all">All payments</option>
            {PAYMENT_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span>Delivery Status</span>
          <select value={deliveryFilter} onChange={(event) => setDeliveryFilter(event.target.value)}>
            <option value="all">All delivery statuses</option>
            {ORDER_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span>From</span>
          <input type="date" value={dateRange.from} onChange={(event) => setDateRange({ ...dateRange, from: event.target.value })} />
        </label>
        <label>
          <span>To</span>
          <input type="date" value={dateRange.to} onChange={(event) => setDateRange({ ...dateRange, to: event.target.value })} />
        </label>
      </div>

      <div className="order-selection-shortcuts">
        <button type="button" onClick={selectCurrentPageOrders} disabled={!selectableOrderIds.length || bulkProcessing}>Select Current Page</button>
        <button type="button" onClick={selectAllFilteredOrders} disabled={!selectableOrderIds.length || bulkProcessing}>Select All Filtered Orders</button>
      </div>

      <div className="filter-tabs">
        {[
          'all',
          'pending_payment',
          'receipt_submitted',
          'payment_confirmed',
          'order_placed',
          'processing',
          'ready_for_pickup',
          'out_for_delivery',
          'delivered',
        ].map(status => (
          <button
            key={status}
            className={`tab ${filter === status ? 'active' : ''}`}
            onClick={() => setFilter(status)}
          >
            {status.replace(/_/g, ' ').toUpperCase()}
          </button>
        ))}
      </div>

      {selectedCount > 0 && (
        <div className="bulk-order-toolbar" role="region" aria-label="Bulk order actions">
          <strong>{selectedCount} {selectedCount === 1 ? 'order' : 'orders'} selected</strong>
          <div className="bulk-order-actions">
            {canDeleteOrders && (
              <button type="button" className="btn-delete" onClick={runBulkDelete} disabled={bulkProcessing}>
                Bulk Delete
              </button>
            )}
            {canUpdateOrders && (
              <>
                <button type="button" className="btn-view" onClick={() => runBulkStatusUpdate('PROCESSING')} disabled={bulkProcessing}>
                  Bulk Mark Processing
                </button>
                <button type="button" className="btn-view" onClick={() => runBulkStatusUpdate('OUT_FOR_DELIVERY')} disabled={bulkProcessing}>
                  Bulk Mark Out For Delivery
                </button>
                <button type="button" className="btn-view" onClick={() => runBulkStatusUpdate('DELIVERED')} disabled={bulkProcessing}>
                  Bulk Mark Delivered
                </button>
              </>
            )}
            {canAssignRiders && (
              <button type="button" className="btn-view" onClick={openBulkAssignModal} disabled={bulkProcessing}>
                Bulk Assign Rider
              </button>
            )}
            <button type="button" className="btn-view" onClick={exportSelectedCsv} disabled={bulkProcessing}>
              Export Selected to CSV
            </button>
            <button type="button" className="btn-view" onClick={exportSelectedExcel} disabled={bulkProcessing}>
              Export Selected to Excel
            </button>
            <button type="button" className="btn-view" onClick={bulkSendWhatsApp} disabled={bulkProcessing}>
              Bulk Send WhatsApp
            </button>
            <button type="button" className="btn-cancel" onClick={clearBulkSelection} disabled={bulkProcessing}>
              Cancel Selection
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading orders...</div>
      ) : loadError ? (
        <div className="empty-state">{loadError}</div>
      ) : filteredOrders.length === 0 ? (
        <div className="empty-state">No orders found</div>
      ) : (
        <div className="orders-table">
          <table>
            <thead>
              <tr>
                <th className="order-select-column">
                  <input
                    type="checkbox"
                    aria-label="Select all visible orders"
                    checked={allVisibleSelected}
                    disabled={!selectableOrderIds.length || bulkProcessing}
                    onChange={toggleSelectAllOrders}
                  />
                </th>
                <th>Order Code</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Code</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => {
                const paymentStatus = order.payment_status || order.status || 'pending_payment'
                const orderStatus = order.order_status || order.fulfillment_status || order.status || 'order_placed'
                const deliveryCode = order.delivery_code

                return (
                  <tr key={order.id} className={selectedOrderIds.includes(Number(order.id)) ? 'order-row-selected' : ''}>
                    <td className="order-select-column">
                      <input
                        type="checkbox"
                        aria-label={`Select order ${order.order_code || order.id}`}
                        checked={selectedOrderIds.includes(Number(order.id))}
                        disabled={order.is_deleted || bulkProcessing}
                        onChange={() => toggleOrderSelection(order.id)}
                      />
                    </td>
                    <td><span className="copyable-value">{order.order_code || `#${order.id}`} <CopyButton value={order.order_code || `#${order.id}`} label="Copy" /></span></td>
                    <td>{order.customer_name || 'Unknown'}</td>
                    <td>{order.phone || order.customer_phone || 'N/A'}</td>
                    <td>{order.delivery_method === 'pickup' ? '🏪' : '🚗'}</td>
                    <td>{formatPrice(order.total_amount || 0)}</td>
                    <td>
                      <select
                        value={paymentStatus}
                        onChange={(e) => handlePaymentStatusUpdate(order.id, e.target.value)}
                        className="status-select"
                      >
                        {PAYMENT_STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={orderStatus}
                        onChange={(e) => handleOrderStatusUpdate(order.id, e.target.value)}
                        className="status-select"
                      >
                        {ORDER_STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {deliveryCode ? (
                        <span className="copyable-value"><span className="delivery-code-badge">{deliveryCode}</span> <CopyButton value={deliveryCode} label="Copy" /></span>
                      ) : order.delivery_method === 'delivery' && orderStatus === 'out_for_delivery' ? (
                        <span className="code-generating">Generating...</span>
                      ) : (
                        <span className="code-none">-</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn-view"
                        onClick={() => handleViewOrder(order)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {bulkAssignModalOpen && (
        <div className="assign-rider-modal">
          <div className="assign-rider-card">
            <div className="assign-rider-header">
              <h3>Bulk Assign Rider</h3>
              <button type="button" onClick={() => setBulkAssignModalOpen(false)}>×</button>
            </div>
            <form onSubmit={submitBulkRiderAssignment}>
              <p className="muted">{selectedCount} {selectedCount === 1 ? 'order' : 'orders'} selected</p>
              <label>
                Active Rider
                <select value={bulkAssignmentForm.rider_id} onChange={(event) => setBulkAssignmentForm({ ...bulkAssignmentForm, rider_id: event.target.value })} required>
                  <option value="">Select rider</option>
                  {riders.map((rider) => (
                    <option key={rider.id} value={rider.id}>
                      {rider.full_name || rider.name} - {rider.phone}{rider.vehicle_type ? ` (${rider.vehicle_type})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Delivery Note
                <textarea rows="3" value={bulkAssignmentForm.delivery_note} onChange={(event) => setBulkAssignmentForm({ ...bulkAssignmentForm, delivery_note: event.target.value })} placeholder="Optional note for these orders" />
              </label>
              <label className="assign-rider-check">
                <input type="checkbox" checked={bulkAssignmentForm.mark_out_for_delivery} onChange={(event) => setBulkAssignmentForm({ ...bulkAssignmentForm, mark_out_for_delivery: event.target.checked })} />
                <span>Mark orders as Out for Delivery</span>
              </label>
              <div className="assign-rider-actions">
                <button type="button" className="btn-cancel" onClick={() => setBulkAssignModalOpen(false)} disabled={bulkAssigningRider}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={bulkAssigningRider}>{bulkAssigningRider ? 'Assigning...' : 'Assign Rider to Orders'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div className="order-detail-modal">
          <div className="modal-overlay" onClick={handleCloseOrder}></div>
          <div className="modal-content order-details-modal">
            <div className="modal-header">
              <h2>Order Details</h2>
              <div className="modal-header-actions">
                <Link className="btn-view invoice-link-button" to={`/admin/orders/${selectedOrder.id}/invoice`} state={{ order: selectedOrder }}>View Invoice</Link>
                {(selectedOrder.customer_phone || selectedOrder.phone) && (
                  <button type="button" className="btn-view order-whatsapp-btn" onClick={() => openCustomerWhatsApp(selectedOrder)}>
                    <MessageCircle size={14} /> Message Customer on WhatsApp
                  </button>
                )}
                {canDeleteOrders && !selectedOrder.is_deleted && (
                  <button type="button" className="btn-delete order-delete-button" onClick={openDeleteModal}>
                    <Trash2 size={14} /> Delete Order
                  </button>
                )}
                <button className="close-btn" onClick={handleCloseOrder}>×</button>
              </div>
            </div>

            <div className="order-detail-content">
              {/* Order Information */}
              <div className="admin-order-section">
                <h4>📦 Order Information</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <strong>Order Code:</strong>
                    <span className="copyable-value">{selectedOrder.order_code || `#${selectedOrder.id}`} <CopyButton value={selectedOrder.order_code || `#${selectedOrder.id}`} label="Copy" /></span>
                  </div>
                  <div className="info-item">
                    <strong>Customer:</strong>
                    <span>{selectedOrder.customer_name || 'Unknown'}</span>
                  </div>
                  <div className="info-item">
                    <strong>Email:</strong>
                    <span>{selectedOrder.customer_email || 'N/A'}</span>
                  </div>
                  <div className="info-item">
                    <strong>Phone:</strong>
                    <span>{selectedOrder.phone || selectedOrder.customer_phone || 'N/A'}</span>
                  </div>
                  <div className="info-item">
                    <strong>Method:</strong>
                    <span>{selectedOrder.delivery_method === 'pickup' ? '🏪 Pickup' : '🚗 Delivery'}</span>
                  </div>
                  <div className="info-item">
                    <strong>Created:</strong>
                    <span>{selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString() : 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Delivery Information */}
              {selectedOrder.delivery_method === 'delivery' && (
                <div className="admin-order-section">
                  <h4>📍 Delivery Information</h4>
                  <div className="info-grid">
                    <div className="info-item full-width">
                      <strong>Address:</strong>
                      <span>{selectedOrder.delivery_address || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              )}

              {selectedOrder.delivery_method === 'delivery' && (
                <div className="admin-order-section">
                  <h4>Delivery Assignment</h4>
                  {selectedOrder.rider_name ? (
                    <div className="info-grid">
                      <div className="info-item"><strong>Assigned Worker:</strong><span>{selectedOrder.rider_name}</span></div>
                      <div className="info-item"><strong>Worker Type:</strong><span>{selectedOrder.delivery_worker_type === 'messenger' ? 'Messenger' : 'Rider'}</span></div>
                      <div className="info-item"><strong>Worker Phone:</strong><span>{selectedOrder.rider_phone || 'N/A'}</span></div>
                      <div className="info-item"><strong>Delivery Status:</strong><span>{selectedOrder.delivery_status || selectedOrder.fulfillment_status || 'N/A'}</span></div>
                      <div className="info-item"><strong>Vehicle:</strong><span>{[selectedOrder.rider_vehicle_type, selectedOrder.rider_vehicle_number].filter(Boolean).join(' - ') || 'N/A'}</span></div>
                      <div className="info-item"><strong>Assigned At:</strong><span>{selectedOrder.delivery_assigned_at ? new Date(selectedOrder.delivery_assigned_at).toLocaleString() : 'N/A'}</span></div>
                      <div className="info-item full-width"><strong>Delivery Note:</strong><span>{selectedOrder.delivery_note || 'No note'}</span></div>
                    </div>
                  ) : (
                    <p className="muted">No rider assigned yet.</p>
                  )}
                  <button type="button" className="btn-view assign-rider-button" onClick={openAssignModal}>Assign Rider</button>
                </div>
              )}

              {/* Pickup Information */}
              {selectedOrder.delivery_method === 'pickup' && selectedOrder.pickup_note && (
                <div className="admin-order-section">
                  <h4>🏪 Pickup Note</h4>
                  <p>{selectedOrder.pickup_note}</p>
                </div>
              )}

              {/* Items */}
              <div className="admin-order-section">
                <h4>📋 Items Ordered</h4>
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedOrder.items || []).map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.product_name || item.name || (item.variant_weight ? `${item.base_product_name || 'FoodNova Item'} - ${item.variant_weight}` : 'Unknown')}</td>
                        <td>{item.quantity || item.qty || 1}</td>
                        <td>{formatPrice(item.price || item.unit_price || 0)}</td>
                        <td>{formatPrice((item.price || item.unit_price || 0) * (item.quantity || item.qty || 1))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="order-total">
                  <strong>Total Amount: {formatPrice(selectedOrder.total_amount || 0)}</strong>
                </div>
              </div>

              {/* Receipt Information */}
              {selectedOrder.receipt && (
                <div className="admin-order-section">
                  <h4>🧾 Receipt Information</h4>
                  <div className="info-grid">
                    <div className="info-item">
                      <strong>Filename:</strong>
                      <span>{selectedOrder.receipt.filename || 'N/A'}</span>
                    </div>
                    <div className="info-item">
                      <strong>Status:</strong>
                      <span>{selectedOrder.receipt.status || 'N/A'}</span>
                    </div>
                    <div className="info-item">
                      <strong>Uploaded:</strong>
                      <span>{selectedOrder.receipt.uploaded_at ? new Date(selectedOrder.receipt.uploaded_at).toLocaleString() : 'N/A'}</span>
                    </div>
                    {selectedOrder.receipt.mime_type && (
                      <div className="info-item">
                        <strong>Type:</strong>
                        <span>{selectedOrder.receipt.mime_type}</span>
                      </div>
                    )}
                  </div>
                  {getReceiptUrl(selectedOrder.receipt) && (
                    <div className="admin-receipt-inline">
                      {!isPdfReceipt(selectedOrder.receipt) && (
                        <img
                          src={getReceiptUrl(selectedOrder.receipt)}
                          alt="Payment receipt"
                          className="receipt-preview-image"
                        />
                      )}
                      <button
                        type="button"
                        className="btn-view-receipt"
                        onClick={() => openReceiptUrl(selectedOrder.receipt)}
                      >
                        {isPdfReceipt(selectedOrder.receipt) ? 'View PDF Receipt' : 'View Receipt'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="admin-order-section">
                <h4>Payment Approval History</h4>
                {paymentAuditLogs.length ? (
                  <div className="payment-audit-list">
                    {paymentAuditLogs.map((log) => (
                      <div key={log.id} className="payment-audit-card">
                        <div><strong>{log.action?.replace(/_/g, ' ')}</strong> by {log.admin_name || log.admin_email || 'Admin'}</div>
                        <p>{log.old_payment_status || 'N/A'} -&gt; {log.new_payment_status || 'N/A'}</p>
                        <p>{log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}</p>
                        {(log.note || log.rejection_reason) && <p>{log.note || log.rejection_reason}</p>}
                        {log.receipt_url && <button type="button" className="btn-view-receipt" onClick={() => window.open(resolveMediaUrl(log.receipt_url), '_blank', 'noopener,noreferrer')}>View Receipt</button>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No payment audit records yet.</p>
                )}
              </div>

              {/* Payment Status */}
              <div className="admin-order-section">
                <h4>💳 Payment Status Management</h4>
                <div className="status-control-group">
                  <label>Payment Status:</label>
                  <select
                    value={selectedOrder.payment_status || selectedOrder.status || 'pending_payment'}
                    onChange={(e) => handlePaymentStatusUpdate(selectedOrder.id, e.target.value)}
                    className="status-select"
                  >
                    {PAYMENT_STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Order Status */}
              <div className="admin-order-section">
                <h4>📦 Order Status Management</h4>
                <div className="status-control-group">
                  <label>Order Status:</label>
                  <select
                    value={selectedOrder.order_status || selectedOrder.fulfillment_status || selectedOrder.status || 'order_placed'}
                    onChange={(e) => handleOrderStatusUpdate(selectedOrder.id, e.target.value)}
                    className="status-select"
                  >
                    {ORDER_STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Delivery Code */}
              {selectedOrder.delivery_method === 'delivery' && (selectedOrder.order_status === 'out_for_delivery' || selectedOrder.fulfillment_status === 'out_for_delivery') && (
                <div className="admin-order-section">
                  <h4>🔐 Delivery Confirmation Code</h4>
                  {selectedOrder.delivery_code ? (
                    <>
                      <div className="delivery-code-display">
                        <div className="delivery-code-box">
                          {selectedOrder.delivery_code}
                        </div>
                      </div>
                      <p className="delivery-code-info">
                        ✓ Code generated on {selectedOrder.delivery_code_created_at ? new Date(selectedOrder.delivery_code_created_at).toLocaleString() : 'N/A'}
                      </p>
                      <p className="delivery-code-instruction">
                        📌 Instructions: Give this code to the dispatcher/rider. The customer will enter it in the app to confirm delivery.
                      </p>
                    </>
                  ) : (
                    <p className="delivery-code-note">Code will be generated when order is marked "Out for Delivery"</p>
                  )}
                  {selectedOrder.delivery_confirmed_at && (
                    <div className="delivery-confirmed-section">
                      <p className="confirmed-message">✓ Delivery confirmed by customer on {new Date(selectedOrder.delivery_confirmed_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Service Update Note */}
              <div className="admin-order-section">
                <h4>📢 Admin Service Note</h4>
                <textarea
                  value={serviceNote}
                  onChange={(e) => setServiceNote(e.target.value)}
                  placeholder="Enter service update to notify customer (e.g., 'Delay due to traffic' or 'Rider on the way')"
                  className="service-note-textarea"
                  rows="4"
                />
                <button
                  onClick={handleSendServiceNote}
                  disabled={sendingServiceNote}
                  className="btn-send-note"
                  style={{
                    marginTop: '10px',
                    padding: '10px 16px',
                    backgroundColor: '#FF9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: sendingServiceNote ? 'not-allowed' : 'pointer',
                    opacity: sendingServiceNote ? 0.6 : 1,
                  }}
                >
                  {sendingServiceNote ? 'Sending...' : 'Send Service Update'}
                </button>
                {selectedOrder.service_note && (
                  <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '6px' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>
                      <strong>Last Update:</strong>
                    </p>
                    <p style={{ margin: '0', color: '#333' }}>{selectedOrder.service_note}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          {assignModalOpen && (
            <div className="assign-rider-modal">
              <div className="assign-rider-card">
                <div className="assign-rider-header">
                  <h3>Assign Rider</h3>
                  <button type="button" onClick={() => setAssignModalOpen(false)}>×</button>
                </div>
                <form onSubmit={submitRiderAssignment}>
                  <label>
                    Active Rider
                    <select value={assignmentForm.rider_id} onChange={(event) => setAssignmentForm({ ...assignmentForm, rider_id: event.target.value })} required>
                      <option value="">Select rider</option>
                      {riders.map((rider) => (
                        <option key={rider.id} value={rider.id}>
                          {rider.full_name || rider.name} - {rider.phone}{rider.vehicle_type ? ` (${rider.vehicle_type})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Delivery Note
                    <textarea rows="3" value={assignmentForm.delivery_note} onChange={(event) => setAssignmentForm({ ...assignmentForm, delivery_note: event.target.value })} placeholder="Optional delivery note for customer/rider context" />
                  </label>
                  <label className="assign-rider-check">
                    <input type="checkbox" checked={assignmentForm.mark_out_for_delivery} onChange={(event) => setAssignmentForm({ ...assignmentForm, mark_out_for_delivery: event.target.checked })} />
                    <span>Mark order as Out for Delivery</span>
                  </label>
                  <div className="assign-rider-actions">
                    <button type="button" className="btn-cancel" onClick={() => setAssignModalOpen(false)}>Cancel</button>
                    <button type="submit" className="btn-primary" disabled={assigningRider}>{assigningRider ? 'Assigning...' : 'Assign Rider'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
          {deleteModalOpen && (
            <div className="order-delete-modal">
              <div className="order-delete-card">
                <h3>Delete Order?</h3>
                <p>This will remove the order from active records. This action should only be used for duplicate, test, or incorrect orders.</p>
                <div className="delete-order-summary">
                  <strong>{selectedOrder.order_code || `#${selectedOrder.id}`}</strong>
                  <span>{selectedOrder.customer_name || 'Unknown customer'} · {formatPrice(selectedOrder.total_amount || 0)}</span>
                </div>
                <label>
                  Type DELETE to confirm
                  <input value={deleteConfirmText} onChange={(event) => setDeleteConfirmText(event.target.value)} autoFocus />
                </label>
                <div className="delete-order-actions">
                  <button type="button" className="btn-cancel" onClick={() => setDeleteModalOpen(false)}>Cancel</button>
                  <button type="button" className="btn-delete" disabled={deleteConfirmText !== 'DELETE' || deletingOrder} onClick={deleteSelectedOrder}>
                    {deletingOrder ? 'Deleting...' : 'Delete Order'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
