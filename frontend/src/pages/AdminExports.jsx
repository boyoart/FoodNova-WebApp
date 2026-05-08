import { useState } from 'react'
import toast from 'react-hot-toast'
import { FileText, RefreshCw } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { adminAPI } from '../services/api'
import './AdminExports.css'

const exportItems = [
  { type: 'orders', title: 'Export Orders', description: 'Order codes, customers, totals, payment status, and delivery status.' },
  { type: 'customers', title: 'Export Customers', description: 'Customer contact records with order counts for operations.' },
  { type: 'products', title: 'Export Products', description: 'Product catalog, pricing, stock levels, and availability flags.' },
  { type: 'payments', title: 'Export Payments', description: 'Payment status, receipt flags, approvals, and rejection notes.' },
  { type: 'cancellations', title: 'Export Cancellation Requests', description: 'Cancellation and refund request decisions and review notes.' },
  { type: 'riders', title: 'Export Riders', description: 'Delivery rider contact and vehicle records.' },
  { type: 'audit-logs', title: 'Export Audit Logs', description: 'Admin activity history for accountability and review.' },
]

const canUseExports = (admin) => {
  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const isSuperAdmin = admin?.admin_role === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || permissions.length === 0))
  return isSuperAdmin || permissions.includes('exports:view') || permissions.includes('exports:download')
}

const canDownloadExports = (admin) => {
  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const isSuperAdmin = admin?.admin_role === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || permissions.length === 0))
  return isSuperAdmin || permissions.includes('exports:download')
}

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export default function AdminExports() {
  const { isAdmin, admin } = useAuthStore()
  const [downloading, setDownloading] = useState('')

  const hasAccess = isAdmin && canUseExports(admin)
  const hasDownloadAccess = isAdmin && canDownloadExports(admin)

  const handleExport = async (type) => {
    try {
      setDownloading(type)
      const { blob, filename } = await adminAPI.exportData(type)
      downloadBlob(blob, filename)
      toast.success('CSV download started')
    } catch (error) {
      console.error(`Export ${type} failed`, error)
      const status = error?.response?.status
      toast.error(status === 403 ? 'You do not have permission to export data.' : 'Export failed. Please try again.')
    } finally {
      setDownloading('')
    }
  }

  if (!isAdmin) {
    return (
      <div className="admin-page admin-exports-page">
        <div className="admin-export-denied">Access denied. Admin login required.</div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="admin-page admin-exports-page">
        <div className="admin-export-denied">
          <h1>Data Exports</h1>
          <p>You do not have permission to view or download FoodNova exports.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page admin-exports-page">
      <section className="admin-exports-hero">
        <div>
          <p className="admin-exports-kicker">FoodNova Records</p>
          <h1>Data Exports</h1>
          <p>Download FoodNova business records for backup and reporting.</p>
        </div>
      </section>

      <div className="admin-exports-grid">
        {exportItems.map((item) => {
          const isLoading = downloading === item.type
          return (
            <article key={item.type} className="admin-export-card">
              <div className="admin-export-card-icon">
                <FileText size={24} />
              </div>
              <div className="admin-export-card-body">
                <h2>{item.title}</h2>
                <p>{item.description}</p>
              </div>
              <button
                type="button"
                className="admin-export-btn"
                onClick={() => handleExport(item.type)}
                disabled={Boolean(downloading) || !hasDownloadAccess}
              >
                {isLoading ? <RefreshCw size={16} className="admin-export-spin" /> : <FileText size={16} />}
                <span>{isLoading ? 'Preparing...' : hasDownloadAccess ? 'Download CSV' : 'Download permission required'}</span>
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}
