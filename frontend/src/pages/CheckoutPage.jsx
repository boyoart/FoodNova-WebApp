import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '../store/cartStore'
import { useAuthStore } from '../store/authStore'
import { ordersAPI, profileAPI } from '../services/api'
import { formatPrice } from '../utils/formatters'
import toast from 'react-hot-toast'
import { Home, MapPin, Mail, Phone, Truck } from 'lucide-react'
import AddressAutocomplete from '../components/AddressAutocomplete'
import './CheckoutPage.css'

const emptyAddress = {
  label: 'Home', recipient_name: '', phone: '', country: 'Nigeria', state: '', city: '', lga: '', street: '', area: '', address_line: '', landmark: '', postal_code: '', google_place_id: '', latitude: null, longitude: null, is_default: false,
}

const formatFullAddress = (address = {}) => [address.address_line, address.street, address.area, address.city, address.lga, address.state, address.country || 'Nigeria'].filter(Boolean).join(', ')

const getFriendlyErrorMessage = (error, fallback = 'Something went wrong') => {
  const detail = error?.response?.data?.detail || error?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((item) => typeof item === 'string' ? item : item?.msg ? `${Array.isArray(item.loc) ? item.loc.join(' → ') + ': ' : ''}${item.msg}` : '').filter(Boolean).join(' | ') || fallback
  if (detail && typeof detail === 'object') return detail.msg || detail.message || fallback
  return error?.response?.data?.message || error?.message || fallback
}

const normalizeNumericId = (value) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, getTotalPrice, clearCart } = useCartStore()
  const { user, isAuthenticated } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [deliveryMethod, setDeliveryMethod] = useState('delivery')
  const [addressMode, setAddressMode] = useState('new')
  const [savedAddresses, setSavedAddresses] = useState([])
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const [saveNewAddress, setSaveNewAddress] = useState(true)
  const [makeDefaultAddress, setMakeDefaultAddress] = useState(false)
  const [formData, setFormData] = useState({ name: user?.name || user?.full_name || user?.fullName || '', email: user?.email || '', phone: user?.phone || '', delivery_notes: '' })
  const [manualAddress, setManualAddress] = useState({ ...emptyAddress, recipient_name: user?.name || user?.full_name || user?.fullName || '', phone: user?.phone || '' })

  useEffect(() => {
    if (!isAuthenticated) return
    const loadProfileAndAddresses = async () => {
      try {
        setProfileLoading(true)
        const profileRes = await profileAPI.getProfile()
        const body = profileRes?.data || profileRes || {}
        const profile = body.profile || body.data?.profile || body || {}
        const addresses = body.addresses || body.data?.addresses || []
        setFormData((current) => ({ ...current, name: current.name || profile.full_name || profile.name || '', email: current.email || profile.email || '', phone: current.phone || profile.phone || '' }))
        setManualAddress((current) => ({ ...current, recipient_name: current.recipient_name || profile.full_name || profile.name || '', phone: current.phone || profile.phone || '' }))
        if (Array.isArray(addresses) && addresses.length > 0) {
          setSavedAddresses(addresses)
          const defaultAddress = addresses.find((address) => address.is_default) || addresses[0]
          setSelectedAddressId(String(defaultAddress.id))
          setAddressMode('saved')
        }
      } catch (error) {
        console.warn('Failed to load saved addresses for checkout', error)
      } finally {
        setProfileLoading(false)
      }
    }
    loadProfileAndAddresses()
  }, [isAuthenticated])

  const handleAutocompleteSelect = useCallback((addressPayload) => {
    setManualAddress((current) => ({ ...current, ...addressPayload, country: addressPayload.country || current.country || 'Nigeria' }))
    toast.success('Address details filled. Please review before placing order.')
  }, [])

  const selectedAddress = useMemo(() => savedAddresses.find((address) => String(address.id) === String(selectedAddressId)), [savedAddresses, selectedAddressId])
  const subtotal = Number(getTotalPrice() || 0)

  const handleCustomerChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (name === 'name') setManualAddress((prev) => ({ ...prev, recipient_name: value }))
    if (name === 'phone') setManualAddress((prev) => ({ ...prev, phone: value }))
  }

  const handleAddressChange = (e) => setManualAddress((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  const extractOrder = (res) => { const body = res?.data ?? res; return body?.order || body?.data || body }
  const getActiveAddress = () => deliveryMethod === 'pickup' ? null : (addressMode === 'saved' && selectedAddress ? selectedAddress : { ...manualAddress, recipient_name: manualAddress.recipient_name || formData.name, phone: manualAddress.phone || formData.phone })
  const validateAddress = (address) => !address || Boolean(address.state && address.city && address.address_line && address.landmark)
  const refreshSavedAddresses = async () => { const res = await profileAPI.getAddresses(); const body = res?.data || res || {}; setSavedAddresses(Array.isArray(body.addresses || body.data) ? (body.addresses || body.data) : []) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const activeAddress = getActiveAddress()
    if (deliveryMethod === 'delivery' && !validateAddress(activeAddress)) { toast.error('Please complete your delivery address: state, city, full address, and landmark are required'); return }
    try {
      setLoading(true)
      let finalAddress = activeAddress
      let deliveryAddressId = addressMode === 'saved' ? normalizeNumericId(selectedAddress?.id) : null
      if (deliveryMethod === 'delivery' && addressMode === 'new' && saveNewAddress && isAuthenticated) {
        try {
          const saved = await profileAPI.createAddress({ ...activeAddress, recipient_name: activeAddress.recipient_name || formData.name, phone: activeAddress.phone || formData.phone, is_default: makeDefaultAddress || savedAddresses.length === 0 })
          const savedBody = saved?.data || saved || {}
          const savedAddress = savedBody.address || savedBody.data || savedBody
          if (savedAddress?.id) { deliveryAddressId = normalizeNumericId(savedAddress.id); finalAddress = savedAddress; await refreshSavedAddresses() }
        } catch (error) {
          console.warn('Address save failed, placing order with address snapshot only', error)
          toast.error(getFriendlyErrorMessage(error, 'Address could not be saved, but checkout will continue with this address'))
        }
      }
      const deliveryAddress = deliveryMethod === 'pickup' ? 'Pickup selected' : formatFullAddress(finalAddress)
      const orderData = {
        customer_name: formData.name, customer_email: formData.email, customer_phone: formData.phone, phone: formData.phone, delivery_method: deliveryMethod,
        delivery_address_id: deliveryAddressId, delivery_address: deliveryAddress, address: deliveryAddress, delivery_address_snapshot: finalAddress,
        state: finalAddress?.state || '', city: finalAddress?.city || '', lga: finalAddress?.lga || '', street_address: finalAddress?.address_line || finalAddress?.street || '', landmark: finalAddress?.landmark || '', delivery_notes: formData.delivery_notes,
        delivery_fee_payment: deliveryMethod === 'delivery' ? 'paid_to_rider_after_delivery' : '',
        items: items.map((item) => { const quantity = item.quantity || item.qty || 1; const price = Number(item.price || item.unit_price || 0); const name = item.name || item.product_name || 'FoodNova Item'; return { id: item.id, product_id: item.product_id || item.id, name, product_name: name, price, unit_price: price, quantity, qty: quantity } }),
        payment_method: 'bank_transfer', total_amount: subtotal, total: subtotal,
      }
      const createdOrder = extractOrder(await ordersAPI.create(orderData))
      if (!createdOrder?.id) throw new Error('Order was created but no order ID was returned')
      clearCart(); toast.success('Order placed successfully. Use your Order Code as payment narration, then upload your receipt.'); navigate('/orders')
    } catch (error) {
      console.error('Checkout error:', error)
      toast.error(getFriendlyErrorMessage(error, 'Failed to place order'))
    } finally { setLoading(false) }
  }

  if (items.length === 0) return <div className="checkout-page"><div className="empty-cart-message"><p>Your cart is empty. Please add items before checking out.</p><button onClick={() => navigate('/products')} className="btn btn-primary">Continue Shopping</button></div></div>

  return (
    <div className="checkout-page"><div className="checkout-container"><div className="checkout-form"><h1>Checkout</h1><form onSubmit={handleSubmit}>
      <fieldset><legend>Delivery Method</legend><div className="delivery-options two-column-options">
        <label className={`radio-label ${deliveryMethod === 'delivery' ? 'selected' : ''}`}><input type="radio" name="deliveryMethod" value="delivery" checked={deliveryMethod === 'delivery'} onChange={(e) => setDeliveryMethod(e.target.value)} /><span className="radio-text"><strong><Truck size={17} /> Delivery</strong><small>Deliver to a saved or new Nigerian address. Rider fee is paid after delivery.</small></span></label>
        <label className={`radio-label ${deliveryMethod === 'pickup' ? 'selected' : ''}`}><input type="radio" name="deliveryMethod" value="pickup" checked={deliveryMethod === 'pickup'} onChange={(e) => setDeliveryMethod(e.target.value)} /><span className="radio-text"><strong><Home size={17} /> Pickup</strong><small>Pick up your order when FoodNova confirms it is ready.</small></span></label>
      </div></fieldset>
      <fieldset><legend>Customer Information</legend><div className="form-group"><label><Mail size={18} /> Full Name</label><input type="text" name="name" value={formData.name} onChange={handleCustomerChange} required /></div><div className="form-group"><label>Email</label><input type="email" name="email" value={formData.email} onChange={handleCustomerChange} required /></div><div className="form-group"><label><Phone size={18} /> Phone Number</label><input type="tel" name="phone" value={formData.phone} onChange={handleCustomerChange} required /></div></fieldset>
      {deliveryMethod === 'delivery' && <fieldset><legend>Delivery Address</legend>{profileLoading && <div className="form-notice"><p>Loading saved addresses...</p></div>}{savedAddresses.length > 0 && <div className="address-mode-tabs"><button type="button" className={addressMode === 'saved' ? 'active' : ''} onClick={() => setAddressMode('saved')}>Use Saved Address</button><button type="button" className={addressMode === 'new' ? 'active' : ''} onClick={() => setAddressMode('new')}>Add New Address</button></div>}
        {addressMode === 'saved' && savedAddresses.length > 0 ? <div className="saved-address-section"><div className="saved-address-grid">{savedAddresses.map((address) => <label key={address.id} className={`saved-address-card ${String(selectedAddressId) === String(address.id) ? 'selected' : ''}`}><input type="radio" name="savedAddress" value={address.id} checked={String(selectedAddressId) === String(address.id)} onChange={(e) => setSelectedAddressId(e.target.value)} /><div><div className="saved-address-title"><strong>{address.label || 'Saved Address'}</strong>{address.is_default && <span>Default</span>}</div><p>{address.recipient_name || formData.name} • {address.phone || formData.phone}</p><p>{formatFullAddress(address)}</p>{address.landmark && <p className="landmark-line">Landmark: {address.landmark}</p>}</div></label>)}</div><div className="form-notice info"><p>Saved local addresses can be used for checkout. Local IDs are kept out of the backend order payload.</p></div></div> : <div className="manual-address-section"><div className="form-notice"><p>Search with Google autocomplete or enter the Nigerian delivery address manually below.</p></div><AddressAutocomplete onSelect={handleAutocompleteSelect} />
          <div className="form-row"><div className="form-group"><label>Recipient Name *</label><input name="recipient_name" value={manualAddress.recipient_name} onChange={handleAddressChange} required /></div><div className="form-group"><label>Recipient Phone *</label><input name="phone" value={manualAddress.phone} onChange={handleAddressChange} required /></div></div>
          <div className="form-row"><div className="form-group"><label>Address Label</label><input name="label" placeholder="Home, Office, Church" value={manualAddress.label} onChange={handleAddressChange} /></div><div className="form-group"><label>Country</label><input name="country" value={manualAddress.country} onChange={handleAddressChange} /></div></div>
          <div className="form-row three-columns"><div className="form-group"><label>State *</label><input name="state" placeholder="e.g., Lagos" value={manualAddress.state} onChange={handleAddressChange} required /></div><div className="form-group"><label>City / Town *</label><input name="city" placeholder="e.g., Ikeja" value={manualAddress.city} onChange={handleAddressChange} required /></div><div className="form-group"><label>LGA</label><input name="lga" placeholder="e.g., Ikeja" value={manualAddress.lga} onChange={handleAddressChange} /></div></div>
          <div className="form-group"><label><MapPin size={18} /> Full Address / House Number *</label><textarea name="address_line" placeholder="House number, street, estate, bus stop, area" value={manualAddress.address_line} onChange={handleAddressChange} rows="3" required /></div>
          <div className="form-row"><div className="form-group"><label>Street / Area</label><input name="street" placeholder="Street, estate, area" value={manualAddress.street} onChange={handleAddressChange} /></div><div className="form-group"><label>Nearest Bus Stop / Landmark *</label><input name="landmark" placeholder="e.g., Near Computer Village" value={manualAddress.landmark} onChange={handleAddressChange} required /></div></div>
          <div className="form-row"><label className="checkbox-row"><input type="checkbox" checked={saveNewAddress} onChange={(e) => setSaveNewAddress(e.target.checked)} /><span>Save this address to my profile</span></label><label className="checkbox-row"><input type="checkbox" checked={makeDefaultAddress} onChange={(e) => setMakeDefaultAddress(e.target.checked)} /><span>Make this my default address</span></label></div></div>}
        <div className="form-group"><label>Delivery Notes (Optional)</label><textarea name="delivery_notes" placeholder="Any special delivery instructions" value={formData.delivery_notes} onChange={handleCustomerChange} rows="3" /></div><div className="form-notice warning"><p>Delivery fee is not included in this order total. Delivery fee will be paid directly to the rider after delivery.</p></div></fieldset>}
      {deliveryMethod === 'pickup' && <fieldset><legend>Pickup Notice</legend><div className="form-notice info"><p>You selected pickup. We will contact you when your order is ready for pickup.</p></div></fieldset>}
      <fieldset><legend>Payment Method</legend><div className="payment-info"><p><strong>Bank Transfer Details:</strong></p><p>Account: FoodNova Inc.</p><p>Bank: Main Bank</p><p>Account Number: 1234567890</p><p>Reference: Use your Order Code after placing the order.</p></div></fieldset><button type="submit" className="btn btn-primary btn-large" disabled={loading}>{loading ? 'Processing...' : 'Place Order'}</button>
    </form></div><div className="checkout-summary"><h2>Order Summary</h2><div className="summary-items">{items.map((item) => { const quantity = item.quantity || item.qty || 1; const price = Number(item.price || item.unit_price || 0); return <div key={item.id} className="summary-item"><span>{item.name || item.product_name || 'FoodNova Item'} x {quantity}</span><span>{formatPrice(price * quantity)}</span></div> })}</div><div className="summary-totals"><div className="summary-row"><span>Product Total:</span><span>{formatPrice(subtotal)}</span></div>{deliveryMethod === 'delivery' && <div className="summary-row"><span>Delivery Fee:</span><span className="delivery-fee">Paid to rider after delivery</span></div>}<div className="summary-row total"><span>Amount to Transfer Now:</span><span>{formatPrice(subtotal)}</span></div></div></div></div></div>
  )
}
