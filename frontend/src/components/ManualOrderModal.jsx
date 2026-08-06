import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { adminAPI } from '../services/api'
import { formatPrice } from '../utils/formatters'

const steps = ['Customer', 'Products', 'Fulfillment', 'Payment & Review']

export default function ManualOrderModal({ permissions, onClose, onCreated }) {
  const [step, setStep] = useState(0)
  const [customers, setCustomers] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [customerMode, setCustomerMode] = useState('existing')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [guest, setGuest] = useState({ name: '', phone: '', email: '' })
  const [productSearch, setProductSearch] = useState('')
  const [cart, setCart] = useState([])
  const [fulfillment, setFulfillment] = useState('delivery')
  const [addressId, setAddressId] = useState('')
  const [address, setAddress] = useState('')
  const [coordinates, setCoordinates] = useState({ latitude: '', longitude: '' })
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [serviceLevel, setServiceLevel] = useState('standard')
  const [notes, setNotes] = useState('')
  const [payment, setPayment] = useState({ method: 'bank_transfer', status: 'pending_payment', reference: '' })
  const [discount, setDiscount] = useState({ amount: 0, percentage: 0, reason: '' })
  const [stockOverride, setStockOverride] = useState({ enabled: false, reason: '' })
  const idempotencyKey = useRef(globalThis.crypto?.randomUUID?.() || `manual-${Date.now()}-${Math.random()}`)

  const can = (permission) => permissions.includes('*') || permissions.includes(permission)
  const selectedCustomer = customers.find((item) => String(item.id) === String(customerId))
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0)
  const discountAmount = Math.max(Number(discount.amount || 0), subtotal * Number(discount.percentage || 0) / 100)
  const total = Math.max(0, subtotal + (fulfillment === 'delivery' ? Number(deliveryFee || 0) : 0) - discountAmount)

  useEffect(() => {
    Promise.all([adminAPI.getCustomers(), adminAPI.getProducts(), adminAPI.getPacks()])
      .then(([customerResult, productResult, packResult]) => {
        setCustomers(customerResult.data || [])
        const products = (productResult.data || []).flatMap((product) => {
          const variants = product.variants || []
          if (!variants.length) return [{ ...product, item_type: 'product', catalogKey: `product-${product.id}` }]
          return variants.map((variant) => ({
            ...product, price: variant.price, stock_qty: variant.stock_qty ?? variant.stock ?? 0,
            variant_id: variant.id, variant_weight: variant.weight, sku: variant.sku,
            displayName: `${product.name} — ${variant.weight}`, item_type: 'product', catalogKey: `variant-${variant.id}`,
          }))
        })
        const packs = (packResult.data || []).map((pack) => ({ ...pack, item_type: 'pack', catalogKey: `pack-${pack.id}`, displayName: `${pack.name} (Pack)`, stock_qty: null }))
        setCatalog([...products, ...packs].filter((item) => item.is_active !== false && item.active !== false))
      })
      .catch((error) => toast.error(error?.response?.data?.detail || 'Could not load manual-order options'))
      .finally(() => setLoading(false))
  }, [])

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase()
    return customers.filter((item) => !query || `${item.full_name} ${item.email} ${item.phone}`.toLowerCase().includes(query)).slice(0, 30)
  }, [customers, customerSearch])
  const filteredCatalog = useMemo(() => {
    const query = productSearch.trim().toLowerCase()
    return catalog.filter((item) => !query || `${item.displayName || item.name} ${item.sku || ''}`.toLowerCase().includes(query)).slice(0, 40)
  }, [catalog, productSearch])

  function addItem(item) {
    setCart((current) => {
      const existing = current.find((entry) => entry.catalogKey === item.catalogKey)
      if (existing) return current.map((entry) => entry.catalogKey === item.catalogKey ? { ...entry, quantity: entry.quantity + 1 } : entry)
      return [...current, { ...item, quantity: 1 }]
    })
  }

  function updateQuantity(key, value) {
    const quantity = Math.max(1, Number(value || 1))
    setCart((current) => current.map((item) => item.catalogKey === key ? { ...item, quantity } : item))
  }

  function validateStep() {
    if (step === 0 && customerMode === 'existing' && !customerId) return 'Select a customer'
    if (step === 0 && customerMode === 'guest' && !guest.name.trim()) return 'Guest name is required'
    if (step === 1 && !cart.length) return 'Add at least one product'
    if (step === 2 && fulfillment === 'delivery' && !addressId && !address.trim()) return 'Delivery address is required'
    return ''
  }

  function next() {
    const error = validateStep()
    if (error) return toast.error(error)
    setStep((current) => Math.min(steps.length - 1, current + 1))
  }

  async function submit() {
    if (submitting) return
    if (discountAmount > 0 && (!can('orders:manual_discount') || !discount.reason.trim())) return toast.error('An authorized discount and reason are required')
    const exceedsStock = cart.some((item) => item.stock_qty != null && item.quantity > Number(item.stock_qty))
    if (exceedsStock && (!stockOverride.enabled || !can('orders:stock_override') || !stockOverride.reason.trim())) return toast.error('Stock override permission and reason are required')
    if (payment.status === 'payment_confirmed' && !can('orders:manual_confirm_payment')) return toast.error('You cannot confirm payment during creation')
    const customer = customerMode === 'existing' ? selectedCustomer : null
    try {
      setSubmitting(true)
      const response = await adminAPI.createManualOrder({
        idempotency_key: idempotencyKey.current,
        customer_user_id: customer?.id || null,
        customer_name: customer?.full_name || guest.name,
        customer_phone: customer?.phone || guest.phone,
        customer_email: customer?.email || guest.email,
        items: cart.map((item) => ({ product_id: item.id, variant_id: item.variant_id, item_type: item.item_type, quantity: item.quantity })),
        fulfillment_method: fulfillment,
        delivery_service_level: serviceLevel,
        delivery_address_id: fulfillment === 'delivery' && addressId ? Number(addressId) : null,
        delivery_address: fulfillment === 'delivery' ? address : '',
        delivery_address_snapshot: fulfillment === 'delivery' && !addressId && coordinates.latitude && coordinates.longitude
          ? { address_line: address, latitude: Number(coordinates.latitude), longitude: Number(coordinates.longitude) }
          : null,
        delivery_notes: notes,
        delivery_fee: fulfillment === 'delivery' ? Number(deliveryFee || 0) : 0,
        discount_amount: Number(discount.amount || 0), discount_percentage: Number(discount.percentage || 0), discount_reason: discount.reason,
        payment_method: payment.method, payment_status: payment.status, payment_reference: payment.reference,
        order_source: customerMode === 'guest' ? 'walk_in' : 'admin_manual',
        stock_override: exceedsStock && stockOverride.enabled, stock_override_reason: stockOverride.reason,
      })
      toast.success(response.duplicate ? 'Order already created; opened existing order' : 'Manual order created')
      onCreated(response.order || response.data)
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Manual order creation failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="manual-order-overlay"><div className="manual-order-modal"><div className="loading">Loading order form…</div></div></div>
  return (
    <div className="manual-order-overlay" role="dialog" aria-modal="true" aria-label="Create Manual Order">
      <div className="manual-order-modal">
        <header><div><h2>Create Manual Order</h2><p>Uses FoodNova’s standard inventory, payment, pickup, and delivery workflows.</p></div><button type="button" onClick={onClose}>×</button></header>
        <nav className="manual-order-steps">{steps.map((label, index) => <button type="button" key={label} className={index === step ? 'active' : index < step ? 'done' : ''} onClick={() => index < step && setStep(index)}>{index + 1}. {label}</button>)}</nav>

        <div className="manual-order-body">
          {step === 0 && <section className="manual-grid">
            <label><span>Customer type</span><select value={customerMode} onChange={(e) => { setCustomerMode(e.target.value); setCustomerId('') }}><option value="existing">Existing customer</option><option value="guest">Guest / walk-in</option></select></label>
            {customerMode === 'existing' ? <>
              <label className="full"><span>Search customers</span><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Name, email, or phone" /></label>
              <div className="manual-choice-list full">{filteredCustomers.map((customer) => <button type="button" className={String(customerId) === String(customer.id) ? 'selected' : ''} key={customer.id} onClick={() => { setCustomerId(customer.id); setAddressId(customer.address?.id || '') }}><strong>{customer.full_name}</strong><span>{customer.email || customer.phone}</span></button>)}</div>
            </> : <>
              <label><span>Name *</span><input value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} /></label>
              <label><span>Phone</span><input value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} /></label>
              <label className="full"><span>Email</span><input type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} /></label>
              <p className="manual-note full">A guest order remains usable without creating a customer account.</p>
            </>}
          </section>}

          {step === 1 && <section>
            <label><span>Search products, variants, and packs</span><input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Product name or SKU" /></label>
            <div className="manual-catalog">{filteredCatalog.map((item) => <button type="button" key={item.catalogKey} onClick={() => addItem(item)}><strong>{item.displayName || item.name}</strong><span>{formatPrice(item.price)} · {item.stock_qty == null ? 'Pack' : `${item.stock_qty} in stock`}</span></button>)}</div>
            <div className="manual-cart">{cart.map((item) => <div key={item.catalogKey}><div><strong>{item.displayName || item.name}</strong><span>{formatPrice(item.price)} each</span></div><input type="number" min="1" value={item.quantity} onChange={(e) => updateQuantity(item.catalogKey, e.target.value)} /><strong>{formatPrice(item.price * item.quantity)}</strong><button type="button" onClick={() => setCart((current) => current.filter((entry) => entry.catalogKey !== item.catalogKey))}>Remove</button>{item.stock_qty != null && item.quantity > item.stock_qty && <small>Exceeds stock ({item.stock_qty})</small>}</div>)}</div>
            {cart.some((item) => item.stock_qty != null && item.quantity > item.stock_qty) && can('orders:stock_override') && <div className="manual-warning"><label><input type="checkbox" checked={stockOverride.enabled} onChange={(e) => setStockOverride({ ...stockOverride, enabled: e.target.checked })} /> Super Admin stock override</label>{stockOverride.enabled && <textarea value={stockOverride.reason} onChange={(e) => setStockOverride({ ...stockOverride, reason: e.target.value })} placeholder="Required override reason" />}</div>}
          </section>}

          {step === 2 && <section className="manual-grid">
            <label><span>Fulfillment</span><select value={fulfillment} onChange={(e) => setFulfillment(e.target.value)}><option value="delivery">Delivery</option><option value="pickup">Customer Pickup</option></select></label>
            {fulfillment === 'delivery' ? <>
              <label><span>Service level</span><select value={serviceLevel} onChange={(e) => setServiceLevel(e.target.value)}><option value="standard">Standard</option><option value="priority">Priority</option><option value="scheduled">Scheduled</option></select></label>
              {selectedCustomer?.addresses?.length > 0 && <label className="full"><span>Saved address</span><select value={addressId} onChange={(e) => setAddressId(e.target.value)}><option value="">Enter a new address</option>{selectedCustomer.addresses.map((item) => <option key={item.id} value={item.id}>{item.address_line || item.street}, {item.city || item.lga}</option>)}</select></label>}
              {!addressId && <label className="full"><span>Delivery address *</span><textarea value={address} onChange={(e) => setAddress(e.target.value)} /></label>}
              {!addressId && <><label><span>Latitude (optional)</span><input type="number" step="any" value={coordinates.latitude} onChange={(e) => setCoordinates({ ...coordinates, latitude: e.target.value })} /></label><label><span>Longitude (optional)</span><input type="number" step="any" value={coordinates.longitude} onChange={(e) => setCoordinates({ ...coordinates, longitude: e.target.value })} /></label></>}
              <label><span>Delivery fee</span><input type="number" min="0" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} /></label>
              <label className="full"><span>Delivery instructions</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            </> : <div className="manual-note full"><strong>Customer Pickup</strong><br />No delivery address, rider offer, assignment, or delivery fee will be created.</div>}
          </section>}

          {step === 3 && <section className="manual-grid">
            <label><span>Payment method *</span><select value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="card">Card</option><option value="pos">POS</option></select></label>
            <label><span>Payment status</span><select value={payment.status} onChange={(e) => setPayment({ ...payment, status: e.target.value })}><option value="pending_payment">Payment Pending</option><option value="receipt_submitted">Payment Submitted</option>{can('orders:manual_confirm_payment') && <option value="payment_confirmed">Payment Confirmed</option>}</select></label>
            <label className="full"><span>Payment reference</span><input value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} /></label>
            {can('orders:manual_discount') && <><label><span>Discount amount</span><input type="number" min="0" value={discount.amount} onChange={(e) => setDiscount({ ...discount, amount: e.target.value })} /></label><label><span>Discount percentage</span><input type="number" min="0" max="100" value={discount.percentage} onChange={(e) => setDiscount({ ...discount, percentage: e.target.value })} /></label>{discountAmount > 0 && <label className="full"><span>Discount reason *</span><textarea value={discount.reason} onChange={(e) => setDiscount({ ...discount, reason: e.target.value })} /></label>}</>}
            <div className="manual-review full"><h3>Order summary</h3><p><span>Customer</span><strong>{selectedCustomer?.full_name || guest.name}</strong></p><p><span>Fulfillment</span><strong>{fulfillment === 'pickup' ? 'Customer Pickup' : `${serviceLevel} Delivery`}</strong></p><p><span>Items</span><strong>{cart.reduce((sum, item) => sum + item.quantity, 0)}</strong></p><p><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></p><p><span>Delivery fee</span><strong>{formatPrice(fulfillment === 'delivery' ? Number(deliveryFee || 0) : 0)}</strong></p><p><span>Discount</span><strong>−{formatPrice(discountAmount)}</strong></p><p className="total"><span>Grand total</span><strong>{formatPrice(total)}</strong></p><p><span>Payment</span><strong>{payment.status.replace(/_/g, ' ')}</strong></p></div>
          </section>}
        </div>
        <footer><button type="button" onClick={step ? () => setStep(step - 1) : onClose}>{step ? 'Back' : 'Cancel'}</button>{step < steps.length - 1 ? <button type="button" className="btn-primary" onClick={next}>Continue</button> : <button type="button" className="btn-primary" disabled={submitting} onClick={submit}>{submitting ? 'Creating…' : 'Create Order'}</button>}</footer>
      </div>
    </div>
  )
}
