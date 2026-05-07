import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw } from 'lucide-react'
import { adminAPI, resolveMediaUrl } from '../services/api'
import { formatPrice } from '../utils/formatters'
import { useAuthStore } from '../store/authStore'
import './AdminCancellations.css'

const statusOptions = ['all', 'pending', 'approved', 'rejected']
const typeOptions = ['all', 'cancellation', 'refund']

export default function AdminCancellations() {
  const { isAdmin, admin } = useAuthStore()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [reviewMode, setReviewMode] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [saving, setSaving] = useState(false)

  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const isSuperAdmin = admin?.admin_role === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || permissions.length === 0))
  const canView = isSuperAdmin || permissions.includes('cancellations:view') || permissions.includes('cancellations:manage') || permissions.includes('orders:update') || permissions.includes('payments:approve')
  const canManage = isSuperAdmin || permissions.includes('cancellations:manage') || permissions.includes('orders:update') || permissions.includes('payments:approve')

  const loadRequests = async () => {
    try {
      setLoading(true)
      const params = {}
      if (statusFilter !== 'all') params.status = statusFilter
      if (typeFilter !== 'all') params.request_type = typeFilter
      const response = await adminAPI.getCancellationRequests(params)
      setRequests(response.data || [])
    } catch (error) {
      toast.error([401, 403].includes(error?.response?.status) ? 'Access denied.' : 'Failed to load cancellation requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin && canView) loadRequests()
    else setLoading(false)
  }, [isAdmin, canView, statusFilter, typeFilter])

  const visibleRequests = useMemo(() => requests, [requests])

  const openReview = (request, mode) => {
    setSelected(request)
    setReviewMode(mode)
    setAdminNote('')
  }

  const closeReview = () => {
    setSelected(null)
    setReviewMode('')
    setAdminNote('')
  }

  const submitReview = async (event) => {
    event.preventDefault()
    if (reviewMode === 'reject' && !adminNote.trim()) {
      toast.error('Rejection reason is required')
      return
    }
    try {
      setSaving(true)
      if (reviewMode === 'approve') {
        await adminAPI.approveCancellationRequest(selected.id, { admin_note: adminNote })
        toast.success('Request approved')
      } else {
        await adminAPI.rejectCancellationRequest(selected.id, { rejection_reason: adminNote, admin_note: adminNote })
        toast.success('Request rejected')
      }
      closeReview()
      await loadRequests()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to update request')
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) return <div className="admin-page"><p>Access denied.</p></div>
  if (!canView) return <div className="admin-page"><p>You do not have permission to view cancellation requests.</p></div>

  return (
    <div className="admin-page admin-cancellations-page">
      <div className="cancellation-header">
        <div>
          <h1>Cancellation & Refund Requests</h1>
          <p>Review customer cancellation and refund requests.</p>
        </div>
        <button type="button" className="btn-view" onClick={loadRequests}><RefreshCw size={16} /> Refresh</button>
      </div>

      <div className="cancellation-filters">
        <div>{statusOptions.map((status) => <button key={status} type="button" className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>{status}</button>)}</div>
        <div>{typeOptions.map((type) => <button key={type} type="button" className={typeFilter === type ? 'active' : ''} onClick={() => setTypeFilter(type)}>{type}</button>)}</div>
      </div>

      {loading ? (
        <div className="loading">Loading cancellation requests...</div>
      ) : visibleRequests.length ? (
        <div className="cancellation-list">
          {visibleRequests.map((request) => {
            const order = request.order || {}
            const receiptUrl = resolveMediaUrl(order.receipt?.url || '')
            return (
              <article key={request.id} className="cancellation-card">
                <div className="cancellation-card-top">
                  <div>
                    <h3>{request.order_code || `Order #${request.order_id}`}</h3>
                    <p>{request.customer_name || 'Customer'} · {request.customer_phone || 'No phone'}</p>
                  </div>
                  <span className={`cancel-status ${request.status}`}>{request.status}</span>
                </div>
                <div className="cancellation-meta">
                  <span>Type: <strong>{request.request_type}</strong></span>
                  <span>Requested: <strong>{request.requested_at ? new Date(request.requested_at).toLocaleString() : 'N/A'}</strong></span>
                  <span>Total: <strong>{formatPrice(order.total_amount || 0)}</strong></span>
                  <span>Payment: <strong>{order.payment_status || 'N/A'}</strong></span>
                  <span>Order: <strong>{order.order_status || 'N/A'}</strong></span>
                </div>
                <p className="cancel-reason"><strong>Reason:</strong> {request.reason}</p>
                {request.admin_note && <p className="cancel-note"><strong>Admin note:</strong> {request.admin_note}</p>}
                {receiptUrl && <button type="button" className="btn-view-receipt" onClick={() => window.open(receiptUrl, '_blank', 'noopener,noreferrer')}>View Receipt</button>}
                {canManage && request.status === 'pending' && (
                  <div className="cancellation-actions">
                    <button type="button" className="btn-approve" onClick={() => openReview(request, 'approve')}>Approve</button>
                    <button type="button" className="btn-reject" onClick={() => openReview(request, 'reject')}>Reject</button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="empty-state">No cancellation requests found.</div>
      )}

      {selected && (
        <div className="cancellation-modal">
          <div className="cancellation-modal-card">
            <h2>{reviewMode === 'approve' ? 'Approve Request' : 'Reject Request'}</h2>
            <p>{reviewMode === 'approve' ? 'Approving cancellation may mark the order as cancelled and may restock items if applicable.' : 'Provide a clear reason for rejection.'}</p>
            <form onSubmit={submitReview}>
              <textarea rows="4" value={adminNote} onChange={(event) => setAdminNote(event.target.value)} placeholder={reviewMode === 'approve' ? 'Admin note (optional)' : 'Rejection reason'} required={reviewMode === 'reject'} />
              <div>
                <button type="button" className="btn-cancel" onClick={closeReview}>Cancel</button>
                <button type="submit" className={reviewMode === 'approve' ? 'btn-approve' : 'btn-reject'} disabled={saving}>{saving ? 'Saving...' : reviewMode === 'approve' ? 'Confirm Approval' : 'Reject Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
