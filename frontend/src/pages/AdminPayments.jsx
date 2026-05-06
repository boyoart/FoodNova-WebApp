import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { adminAPI, resolveMediaUrl } from '../services/api'
import { formatPrice } from '../utils/formatters'
import toast from 'react-hot-toast'
import './AdminPages.css'

export default function AdminPayments() {
  const { isAdmin } = useAuthStore()
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedReceipt, setSelectedReceipt] = useState(null)

  useEffect(() => {
    if (isAdmin) {
      fetchPayments()
    }
  }, [isAdmin])

  const fetchPayments = async () => {
    try {
      setLoading(true)
      const res = await adminAPI.getPendingPayments()
      setPayments(res.data || [])
    } catch (error) {
      toast.error('Failed to load payments')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (orderId) => {
    try {
      await adminAPI.approvePayment(orderId)
      toast.success('Payment approved')
      fetchPayments()
    } catch (error) {
      toast.error('Failed to approve payment')
    }
  }

  const handleReject = async (orderId) => {
    try {
      await adminAPI.rejectPayment(orderId, { reason: 'Invalid receipt' })
      toast.success('Payment rejected')
      fetchPayments()
    } catch (error) {
      toast.error('Failed to reject payment')
    }
  }

  const isPdfReceipt = (receipt = {}) => {
    const mimeType = String(receipt.mime_type || '').toLowerCase()
    const fileType = String(receipt.file_type || '').toLowerCase()
    const source = String(receipt.source || receipt.url || '').toLowerCase()
    return mimeType === 'application/pdf' || fileType === 'pdf' || source.includes('.pdf')
  }

  const openReceiptUrl = (url) => {
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const openReceipt = (payment) => {
    const receipt = payment.receipt || {}
    const receiptSource =
      receipt.data_url ||
      receipt.url ||
      receipt.receipt_url ||
      payment.receipt_url ||
      payment.receiptUrl ||
      payment.receipt_image ||
      null

    const source = resolveMediaUrl(receiptSource)

    setSelectedReceipt({
      orderId: payment.id,
      orderCode: payment.order_code,
      customerName: payment.customer_name,
      amount: payment.total_amount,
      filename: receipt.filename || payment.receipt_filename || 'Receipt uploaded',
      uploadedAt: receipt.uploaded_at || payment.receipt_uploaded_at,
      status: receipt.status || payment.payment_status || payment.status,
      mimeType: receipt.mime_type || '',
      fileType: receipt.file_type || '',
      source,
      raw: { ...receipt, source },
    })
  }

  const closeReceipt = () => setSelectedReceipt(null)

  if (!isAdmin) {
    return <div className="admin-page"><p>Access denied.</p></div>
  }

  return (
    <div className="admin-page">
      <h1>Payment Approvals</h1>

      {loading ? (
        <div className="loading">Loading payments...</div>
      ) : payments.length === 0 ? (
        <div className="empty-state">No pending payments</div>
      ) : (
        <div className="payments-table">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Receipt</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(payment => (
                <tr key={payment.id}>
                  <td>#{payment.order_code || payment.id}</td>
                  <td>{payment.customer_name || 'Customer'}</td>
                  <td>{formatPrice(payment.total_amount || payment.total || 0)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-view-receipt"
                      onClick={() => openReceipt(payment)}
                    >
                      View Receipt
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-approve"
                      onClick={() => handleApprove(payment.id)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn-reject"
                      onClick={() => handleReject(payment.id)}
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedReceipt && (
        <div className="admin-receipt-modal">
          <div className="admin-receipt-overlay" onClick={closeReceipt}></div>
          <div className="admin-receipt-content">
            <div className="admin-receipt-header">
              <h2>Payment Receipt</h2>
              <button type="button" className="modal-close" onClick={closeReceipt}>×</button>
            </div>

            <div className="admin-receipt-body">
              <div className="receipt-meta-card">
                <p><strong>Order:</strong> #{selectedReceipt.orderCode || selectedReceipt.orderId}</p>
                <p><strong>Customer:</strong> {selectedReceipt.customerName || 'Customer'}</p>
                <p><strong>Amount:</strong> {formatPrice(selectedReceipt.amount || 0)}</p>
                <p><strong>File:</strong> {selectedReceipt.filename}</p>
                {selectedReceipt.uploadedAt && (
                  <p><strong>Uploaded:</strong> {new Date(selectedReceipt.uploadedAt).toLocaleString()}</p>
                )}
              </div>

              {selectedReceipt.source ? (
                <div className="receipt-preview-block">
                  {isPdfReceipt(selectedReceipt) ? (
                    <div className="receipt-placeholder">
                      <h3>PDF receipt uploaded</h3>
                      <p>{selectedReceipt.filename}</p>
                    </div>
                  ) : (
                    <img
                      src={selectedReceipt.source}
                      alt="Payment receipt"
                      className="receipt-preview-image"
                    />
                  )}
                  <button
                    type="button"
                    className="btn-view-receipt"
                    onClick={() => openReceiptUrl(selectedReceipt.source)}
                  >
                    {isPdfReceipt(selectedReceipt) ? 'View PDF Receipt' : 'View Receipt'}
                  </button>
                </div>
              ) : (
                <div className="receipt-placeholder">
                  <h3>Receipt submitted</h3>
                  <p>The customer uploaded a receipt file named:</p>
                  <strong>{selectedReceipt.filename}</strong>
                  <p className="receipt-note">
                    This temporary backend currently stores the receipt metadata. New uploads can be upgraded to store an image preview/file URL when we connect permanent file storage.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
