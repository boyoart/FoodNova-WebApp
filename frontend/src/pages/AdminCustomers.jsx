import { useEffect, useMemo, useState } from 'react'
import { Mail, MapPin, Phone, RefreshCw, Search, ShoppingBag, UserRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import { adminAPI } from '../services/api'
import { formatPrice } from '../utils/formatters'
import CopyButton from '../components/ui/CopyButton'
import './AdminCustomers.css'

const normalizeList = (body) => {
  if (Array.isArray(body)) return body
  if (Array.isArray(body?.data)) return body.data
  if (Array.isArray(body?.customers)) return body.customers
  if (Array.isArray(body?.users)) return body.users
  if (Array.isArray(body?.orders)) return body.orders
  return []
}

const formatAddress = (value) => {
  if (!value) return 'No address saved'
  if (typeof value === 'string') return value
  return [value.address_line, value.street, value.area, value.city, value.lga, value.state, value.country].filter(Boolean).join(', ') || 'No address saved'
}

const getOrderCustomerEmail = (order) => order.customer_email || order.email || order.user_email || order.customer?.email || 'unknown@customer'

const buildCustomersFromOrders = (orders = []) => {
  const map = new Map()

  orders.forEach((order) => {
    const email = getOrderCustomerEmail(order)
    const current = map.get(email) || {
      id: email,
      full_name: order.customer_name || order.name || order.customer?.name || 'Customer',
      email,
      phone: order.customer_phone || order.phone || order.customer?.phone || '',
      address: order.delivery_address || order.address || order.delivery_address_snapshot || '',
      orders_count: 0,
      total_spent: 0,
      last_order_at: order.created_at || order.date || '',
      last_order_code: '',
      orders: [],
    }

    current.orders_count += 1
    current.total_spent += Number(order.total_amount || order.total || 0)
    current.last_order_at = order.created_at || order.date || current.last_order_at
    current.last_order_code = order.order_code || `FN-${String(order.id || '').padStart(5, '0')}`
    current.orders.push(order)

    if (!current.phone) current.phone = order.customer_phone || order.phone || ''
    if (!current.address || current.address === 'No address saved') current.address = order.delivery_address || order.address || order.delivery_address_snapshot || ''

    map.set(email, current)
  })

  return Array.from(map.values()).sort((a, b) => String(b.last_order_at || '').localeCompare(String(a.last_order_at || '')))
}

export default function AdminCustomers() {
  const { isAdmin } = useAuthStore()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [source, setSource] = useState('orders')
  const [loadError, setLoadError] = useState('')

  const loadCustomers = async () => {
    try {
      setLoading(true)
      setLoadError('')

      if (adminAPI.getCustomers) {
        try {
          const res = await adminAPI.getCustomers()
          const directCustomers = normalizeList(res)
          setCustomers(directCustomers)
          setSource('customers endpoint')
          return
        } catch (error) {
          console.warn('Direct customers endpoint unavailable. Deriving customers from orders.', error)
          setLoadError('Customer endpoint unavailable. Showing customers derived from orders.')
        }
      }

      try {
        const ordersRes = await adminAPI.getOrders()
        const orders = normalizeList(ordersRes)
        setCustomers(buildCustomersFromOrders(orders))
        setSource('orders fallback')
      } catch (ordersError) {
        console.error(ordersError)
        setCustomers([])
        setSource('unavailable')
        setLoadError('Unable to load customers. Check backend logs or admin session.')
      }
    } catch (error) {
      console.error(error)
      setLoadError('Unable to load customers. Check backend logs or admin session.')
      toast.error('Unable to load customers. Check backend logs or admin session.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) loadCustomers()
  }, [isAdmin])

  const filteredCustomers = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return customers
    return customers.filter((customer) => [customer.full_name, customer.name, customer.email, customer.phone, formatAddress(customer.address || customer.delivery_address)].join(' ').toLowerCase().includes(q))
  }, [customers, query])

  if (!isAdmin) {
    return <div className="admin-page"><p>Access denied. Admin login required.</p></div>
  }

  return (
    <div className="admin-customers-page admin-page">
      <div className="customers-header">
        <div>
          <h1><UserRound size={30} /> Customers</h1>
          <p>View customer contact details, delivery data, and order activity.</p>
        </div>
        <button type="button" className="customers-refresh" onClick={loadCustomers}><RefreshCw size={16} /> Refresh</button>
      </div>

      <div className="customers-summary">
        <div><strong>{customers.length}</strong><span>Total Customers</span></div>
        <div><strong>{customers.reduce((sum, customer) => sum + Number(customer.orders_count || customer.total_orders || customer.orders?.length || 0), 0)}</strong><span>Total Orders</span></div>
        <div><strong>{formatPrice(customers.reduce((sum, customer) => sum + Number(customer.total_spent || customer.revenue || 0), 0))}</strong><span>Customer Revenue</span></div>
      </div>

      <div className="customers-toolbar">
        <div className="customers-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers by name, email, phone, address..." /></div>
        <small>Data source: {source}</small>
      </div>
      {loadError && <div className="customers-empty">{loadError}</div>}

      {loading ? (
        <div className="customers-empty">Loading customers...</div>
      ) : loadError && source === 'unavailable' ? (
        null
      ) : filteredCustomers.length === 0 ? (
        <div className="customers-empty">No customers found.</div>
      ) : (
        <div className="customers-layout">
          <div className="customers-table-wrap">
            <table className="customers-table">
              <thead>
                <tr><th>Customer</th><th>Contact</th><th>Orders</th><th>Total Spent</th><th>Last Order</th><th>Action</th></tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id || customer.email}>
                    <td><strong>{customer.full_name || customer.name || 'Customer'}</strong><span>{customer.email}</span></td>
                    <td><span>{customer.phone || 'No phone'}</span></td>
                    <td>{customer.orders_count || customer.total_orders || customer.orders?.length || 0}</td>
                    <td>{formatPrice(customer.total_spent || customer.revenue || 0)}</td>
                    <td>{customer.last_order_code || customer.last_order_id ? <span className="copyable-value">{customer.last_order_code || customer.last_order_id}<CopyButton value={customer.last_order_code || customer.last_order_id} label="Copy" /></span> : '—'}</td>
                    <td><button type="button" onClick={() => setSelectedCustomer(customer)}>View Data</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedCustomer && (
            <aside className="customer-details-card">
              <button type="button" className="close-details" onClick={() => setSelectedCustomer(null)}>×</button>
              <div className="customer-avatar-big">{String(selectedCustomer.full_name || selectedCustomer.name || selectedCustomer.email || 'C').slice(0, 2).toUpperCase()}</div>
              <h2>{selectedCustomer.full_name || selectedCustomer.name || 'Customer'}</h2>
              <p className="customer-email"><Mail size={15} /> {selectedCustomer.email}</p>
              <p><Phone size={15} /> {selectedCustomer.phone || 'No phone saved'}</p>
              <p><MapPin size={15} /> {formatAddress(selectedCustomer.address || selectedCustomer.delivery_address)}</p>

              <div className="customer-metrics">
                <div><ShoppingBag size={16} /><strong>{selectedCustomer.orders_count || selectedCustomer.total_orders || selectedCustomer.orders?.length || 0}</strong><span>Orders</span></div>
                <div><strong>{formatPrice(selectedCustomer.total_spent || selectedCustomer.revenue || 0)}</strong><span>Total Spent</span></div>
              </div>

              {Array.isArray(selectedCustomer.orders) && selectedCustomer.orders.length > 0 && (
                <div className="customer-orders-mini">
                  <h3>Recent Orders</h3>
                  {selectedCustomer.orders.slice(0, 5).map((order) => (
                    <div key={order.id} className="mini-order-row">
                      <span className="copyable-value">{order.order_code || `FN-${String(order.id || '').padStart(5, '0')}`}<CopyButton value={order.order_code || `FN-${String(order.id || '').padStart(5, '0')}`} label="Copy" /></span>
                      <strong>{formatPrice(order.total_amount || order.total || 0)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  )
}
