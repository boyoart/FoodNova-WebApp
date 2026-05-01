import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { adminAPI } from '../services/api'
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
                  <td>#{payment.id}</td>
                  <td>{payment.customer_name}</td>
                  <td>{formatPrice(payment.total_amount)}</td>
                  <td>
                    <button
                      className="btn-view-receipt"
                      onClick={() => setSelectedReceipt(payment.receipt_url)}
                    >
                      View Receipt
                    </button>
                  </td>
                  <td>
                    <button
                      className="btn-approve"
                      onClick={() => handleApprove(payment.id)}
                    >
                      Approve
                    </button>
                    <button
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
        <div className="modal" onClick={() => setSelectedReceipt(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedReceipt(null)}>×</button>
            <img src={selectedReceipt} alt="Receipt" />
          </div>
        </div>
      )}
    </div>
  )
}
