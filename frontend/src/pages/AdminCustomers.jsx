import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { adminAPI } from '../services/api'
import { formatPrice } from '../utils/formatters'
import { retentionErrorMessage } from '../utils/retentionErrors'
import './AdminCustomers.css'

export default function AdminCustomers() {
  const { isAdmin, admin } = useAuthStore()
  const superAdmin = String(admin?.admin_role || '').replaceAll('-', '_').toLowerCase() === 'super_admin' || (admin?.role === 'admin' && !admin?.admin_role)
  const [query, setQuery] = useState({ search: '', account_status: '', verification: '', page: 1 })
  const [customers, setCustomers] = useState([])
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 })
  const [selected, setSelected] = useState(null)
  const [action, setAction] = useState('suspend')
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const detailRequest = useRef(0)
  useEffect(() => {
    if (!isAdmin) return undefined
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const result = await adminAPI.getCustomers({ ...query, page_size: 20 }, controller.signal)
        if (!controller.signal.aborted) { setCustomers(result.data); setPagination(result.raw) }
      } catch { if (!controller.signal.aborted) { setCustomers([]); setMessage('Customer records are unavailable. Check your permissions and backend connection.') } }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [isAdmin, query, version])
  useEffect(() => () => { detailRequest.current++ }, [])
  const filter = (patch) => { setSelected(null); detailRequest.current++; setQuery({ ...query, ...patch, page: 1 }) }
  const open = async (customer) => {
    const request = ++detailRequest.current
    setSelected(null); setMessage('Loading customer details…'); setReason(''); setConfirmation('')
    try { const result = await adminAPI.getCustomer(customer.id); if (detailRequest.current === request) { setSelected(result.customer); setMessage('') } }
    catch { if (detailRequest.current === request) setMessage('Customer details could not be loaded.') }
  }
  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const result = await adminAPI.updateCustomerAccount(selected.id, { action, reason, confirmation })
      setMessage(result.message); setSelected(null); setVersion((value) => value + 1)
    } catch (error) { setMessage(retentionErrorMessage(error)) }
    finally { setBusy(false) }
  }
  const reset = async () => {
    if (busy) return
    setBusy(true)
    try { await adminAPI.sendCustomerPasswordReset(selected.id); setMessage('Password reset requested using the existing email service.') }
    catch { setMessage('The password reset request could not be completed.') }
    finally { setBusy(false) }
  }
  if (!isAdmin) return <p role="alert">Admin authorization required.</p>
  return <div className="admin-page admin-customers-page"><h1>Customers</h1><p>Manage authoritative customer accounts. Transaction records are retained.</p>
    <div className="customers-toolbar"><label>Search<input value={query.search} maxLength={150} onChange={(event) => filter({ search: event.target.value })} placeholder="Name, email or phone" /></label>
      <label>Account status<select value={query.account_status} onChange={(event) => filter({ account_status: event.target.value })}><option value="">All statuses</option>{['active', 'suspended', 'deactivated'].map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Email<select value={query.verification} onChange={(event) => filter({ verification: event.target.value })}><option value="">All emails</option><option value="verified">Verified</option><option value="unverified">Unverified</option></select></label><button type="button" onClick={() => setVersion((value) => value + 1)}>Refresh</button></div>
    <p role="status">{loading ? 'Loading customers…' : message}</p><p>{pagination.total ?? 'Unavailable'} matching customers · Page {query.page} of {pagination.total_pages || 1}</p>
    <div className="customers-layout"><div className="customers-table-wrap"><table className="customers-table"><caption className="sr-only">Customer account management</caption><thead><tr><th>Customer</th><th>Status</th><th>Email</th><th>Orders</th><th>Action</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><strong>{customer.full_name}</strong><span>{customer.email}</span></td><td>{customer.account_status}</td><td>{customer.email_verified ? 'Verified' : 'Unverified'}</td><td>{customer.orders_count}</td><td><button type="button" onClick={() => open(customer)}>View profile</button></td></tr>)}</tbody></table></div>
      {selected && <aside className="customer-details-card"><button type="button" onClick={() => { detailRequest.current++; setSelected(null) }}>Close profile</button><h2>{selected.full_name}</h2><p>{selected.email}</p><p>{selected.phone}</p><p>{selected.account_status} · {selected.email_verified ? 'Email verified' : 'Email unverified'}</p>
        <button type="button" disabled={busy || selected.account_status !== 'active'} onClick={reset}>Send password reset</button>
        <h3>Saved addresses</h3>{selected.addresses?.map((address) => <p key={address.id}>{[address.address_line, address.street, address.city, address.state].filter(Boolean).join(', ')}</p>)}
        <h3>Recent orders</h3>{selected.orders?.map((order) => <p key={order.id}>{order.order_code} · {order.order_status} · {formatPrice(order.total_amount)}</p>)}
        {superAdmin && selected.account_status !== 'deleted' && <form onSubmit={submit}><h3>Super Admin account action</h3><label>Action<select value={action} onChange={(event) => { setAction(event.target.value); setConfirmation('') }}>{['suspend', 'reactivate', 'deactivate', 'delete'].map((value) => <option key={value}>{value}</option>)}</select></label><p>Deletion erases the login identity and personal profile. Internal IDs and legally required financial/invoice evidence remain in the protected ledger. Unresolved orders, refunds, disputes and retention holds block deletion. Do not include personal information in the reason.</p><label>Reason (required)<textarea value={reason} minLength={8} maxLength={500} required onChange={(event) => setReason(event.target.value)} /></label><label>Type {action.toUpperCase() + ' CUSTOMER ' + selected.id}<input value={confirmation} required onChange={(event) => setConfirmation(event.target.value)} /></label><button type="submit" disabled={busy || confirmation !== action.toUpperCase() + ' CUSTOMER ' + selected.id}>{busy ? 'Updating…' : 'Confirm account action'}</button></form>}
      </aside>}
    </div><div className="customers-toolbar"><button type="button" disabled={loading || query.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}>Previous</button><button type="button" disabled={loading || query.page >= (pagination.total_pages || 1)} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Next</button></div>
  </div>
}
