import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { productsAPI, packsAPI, ordersAPI, resolveMediaUrl } from '../services/api'
import { useCartStore } from '../store/cartStore'
import { useAuthStore } from '../store/authStore'
import { formatPrice, getImageUrl, handleImageError } from '../utils/formatters'
import { normalizeStoreItem, formatPackContents, packEnquiryUrl } from '../pages/productsCatalog'
import { basketTotal, customerOrdersLink, ownedCustomerData, productLink, readViewedIds, rebuildSelection, revalidateSelection, sameBasket, unwrapItem } from '../utils/shopping'
import './ShoppingWidgets.css'

const services = { getProduct: productsAPI.getById, getPack: packsAPI.getById }
const Review = ({ lines }) => <div className="basket-review"><ul>{lines.map((line, index) => <li key={`${line.cart_key}-${index}`}><span>{line.name} × {line.quantity}</span><strong>{formatPrice(line.price * line.quantity)}</strong></li>)}</ul><p>Total <strong>{formatPrice(basketTotal(lines))}</strong></p></div>

export function ComboPackExplorer({ packs, onPackUpdated }) {
  const [compare, setCompare] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(null)
  const { addItem } = useCartStore()
  const addPack = async (pack) => {
    setBusy(pack.id); setMessage('')
    try {
      const fresh = unwrapItem(await packsAPI.getById(pack.id))
      onPackUpdated?.(fresh)
      const line = (await revalidateSelection([{ id: fresh.id, type: 'pack', quantity: 1 }], { ...services, getPack: async () => fresh }))[0]
      if (Number(fresh.price) !== Number(pack.price)) { setMessage(`The current ${fresh.name} price is ${formatPrice(fresh.price)}. Review it, then add again.`); return }
      addItem(line); setMessage(`${fresh.name} added to your cart.`)
    } catch { setMessage('Please enquire with FoodNova about this pack, or browse the current Food Packs catalogue.') }
    finally { setBusy(null) }
  }
  return <div className="combo-explorer">
    <button type="button" className="shopping-button secondary" onClick={() => setCompare((value) => !value)} aria-expanded={compare} aria-controls="pack-comparison">{compare ? 'Hide comparison' : 'Compare Food Packs'}</button>
    {compare && <div className="pack-comparison" id="pack-comparison" tabIndex="0"><table><caption>Current prices and configured contents</caption><thead><tr><th scope="col">Pack</th><th scope="col">Price</th><th scope="col">Contents</th><th scope="col">Choose</th></tr></thead><tbody>{packs.map((pack) => <tr key={pack.id}>
      <th scope="row"><img src={resolveMediaUrl(pack.image_url)} alt="" width="64" height="64" onError={handleImageError} />{pack.name}</th><td>{formatPrice(pack.price)}</td><td>{pack.components?.length ? formatPackContents(pack.components) : 'Ask our team for the configured contents.'}</td><td>
        {pack.is_available !== false && pack.components?.length > 0 ? <button type="button" className="shopping-button" disabled={busy !== null} onClick={() => addPack(pack)}>{busy === pack.id ? 'Checking…' : 'Add pack'}</button> : <a href={packEnquiryUrl(pack.name)} target="_blank" rel="noreferrer">Enquire about this pack</a>}
        <Link to={`/products?tab=packs&search=${encodeURIComponent(pack.name)}`}>View pack</Link>
      </td></tr>)}</tbody></table></div>}
    <p role="status">{message}</p>
  </div>
}

function BasketBuilder({ products }) {
  const [rows, setRows] = useState([{ key: 1, id: '', variantId: '', quantity: 1 }])
  const sequence = useRef(1)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const { addItem } = useCartStore()
  const change = (key, patch) => { setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row)); setPreview(null); setMessage('') }
  const selections = rows.filter((row) => row.id).map((row) => ({ ...row, type: 'product' }))
  const review = async (commit = false) => {
    if (!selections.length) { setMessage('Choose at least one product.'); return }
    setBusy(true); setMessage('')
    try {
      const fresh = await revalidateSelection(selections, services)
      setPreview(fresh)
      if (commit && preview && sameBasket(preview, fresh)) {
        fresh.forEach(addItem); setMessage('Your basket was added at current catalogue prices.'); setPreview(null)
        setRows([{ key: ++sequence.current, id: '', variantId: '', quantity: 1 }])
      } else if (commit) setMessage('Prices changed. Please review the updated basket and confirm again.')
    } catch (error) { setPreview(null); setMessage(error.message || 'Please review the current catalogue.') }
    finally { setBusy(false) }
  }
  const liveLines = selections.flatMap((row) => {
    const product = products.find((entry) => String(entry.id) === String(row.id))
    const variant = product?.variants?.find((entry) => String(entry.id) === String(row.variantId))
    const price = Number(variant?.price ?? product?.price)
    return Number.isFinite(price) && Number.isInteger(Number(row.quantity)) && Number(row.quantity) > 0 ? [{ price, quantity: Number(row.quantity) }] : []
  })
  return <section className="shopping-panel"><p className="shopping-kicker">Your kitchen, your choice</p><h2>Build your food basket</h2><p>Choose essentials, review today’s prices, then add them to your usual cart.</p>
    {!products.length && <p>Products are loading. You can also <Link to="/products">browse the catalogue</Link>.</p>}
    {rows.map((row) => {
      const product = products.find((item) => String(item.id) === String(row.id))
      const variants = normalizeStoreItem(product || {}).variants
      return <div className="basket-builder-row" key={row.key}>
        <label>Product<select value={row.id} disabled={busy} onChange={(event) => { const selected = products.find((item) => String(item.id) === event.target.value); const variant = normalizeStoreItem(selected || {}).variants.find((item) => item.is_available); change(row.key, { id: event.target.value, variantId: variant?.id || '' }) }}><option value="">Choose a product</option>{products.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        {variants.length > 0 && <label>Size<select value={row.variantId} disabled={busy} onChange={(event) => change(row.key, { variantId: event.target.value })}><option value="">Choose size</option>{variants.map((variant) => <option key={variant.id} value={variant.id} disabled={!variant.is_available}>{variant.weight || 'Standard size'} · {formatPrice(variant.price)}</option>)}</select></label>}
        <label>Quantity<input type="number" min="1" max="99" step="1" value={row.quantity} disabled={busy} onChange={(event) => change(row.key, { quantity: event.target.value })} /></label>
        <button type="button" className="shopping-remove" disabled={busy || rows.length === 1} aria-label={`Remove basket row ${rows.indexOf(row) + 1}`} onClick={() => { setRows((current) => current.filter((item) => item.key !== row.key)); setPreview(null) }}>Remove</button>
      </div>
    })}
    <div className="shopping-actions"><button type="button" className="shopping-button secondary" disabled={busy || rows.length >= 8} onClick={() => { setRows((current) => [...current, { key: ++sequence.current, id: '', variantId: '', quantity: 1 }]); setPreview(null) }}>Add another product</button><strong>Selection total: {formatPrice(basketTotal(liveLines))}</strong></div>
    {preview && <Review lines={preview} />}
    <div className="shopping-actions"><button type="button" className="shopping-button" disabled={busy || !products.length} onClick={() => review(Boolean(preview))}>{busy ? 'Checking current prices…' : preview ? 'Add reviewed basket to cart' : 'Review basket'}</button><Link to="/cart">View cart</Link></div><p role="status">{message}</p>
  </section>
}

function ShoppingShortcuts() {
  const { isAuthenticated, isAdmin, user } = useAuthStore()
  const customer = isAuthenticated && !isAdmin && Boolean(user?.id || user?.email)
  const identity = customer ? String(user?.id || user?.email || 'customer') : ''
  const identityRef = useRef(identity)
  identityRef.current = identity
  const [orderState, setOrderState] = useState({ owner: '', items: [] })
  const orders = ownedCustomerData(orderState, identity, [])
  const setOrders = (items) => setOrderState({ owner: identity, items })
  const [recent, setRecent] = useState(null)
  const [recentLoading, setRecentLoading] = useState(false)
  const [reviewState, setReviewState] = useState({ owner: '', items: null })
  const reviewed = ownedCustomerData(reviewState, identity, null)
  const setReviewed = (items) => setReviewState({ owner: identity, items })
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const { addItem } = useCartStore()
  useEffect(() => { setOrders([]); setReviewed(null); setSelectedOrder(null); setMessage(''); setBusy(false) }, [identity])
  const loadOrders = async () => {
    if (!customer) return
    const session = identity
    setBusy(true); setMessage('')
    try { const response = await ordersAPI.getCustomerOrders(); if (identityRef.current === session) { setOrders((response.data || []).slice(0, 5)); setMessage(response.data?.length ? 'Choose an order to review its items at current prices.' : 'No previous orders found.') } }
    catch { if (identityRef.current === session) setMessage('Your orders could not be loaded. Please open My Orders.') }
    finally { if (identityRef.current === session) setBusy(false) }
  }
  const rebuild = async (order, commit = false) => {
    if (!customer) return
    const session = identity
    setBusy(true); setMessage('')
    try {
      const selection = rebuildSelection(order.items)
      if (!selection.length) throw new Error('This order has no items to rebuild.')
      const fresh = await revalidateSelection(selection, services)
      if (identityRef.current !== session) return
      if (commit && reviewed && sameBasket(reviewed, fresh)) { fresh.forEach(addItem); setReviewed(null); setSelectedOrder(null); setMessage('Reviewed items added to your cart at current prices.') }
      else { setReviewed(fresh); setSelectedOrder(order); if (commit) setMessage('Prices changed. Please review the updated total and confirm again.') }
    } catch (error) { if (identityRef.current === session) { setReviewed(null); setMessage(error.message || 'Please choose current items from the catalogue.') } }
    finally { if (identityRef.current === session) setBusy(false) }
  }
  const loadRecent = async () => {
    if (recentLoading) return
    setRecentLoading(true)
    setMessage('')
    let ids = []
    try { ids = readViewedIds(sessionStorage) } catch { /* Optional history. */ }
    const result = await Promise.allSettled(ids.map(async (id) => unwrapItem(await productsAPI.getById(id))))
    setRecent(result.filter((entry) => entry.status === 'fulfilled' && entry.value?.is_active !== false).map((entry) => entry.value))
    if (result.some((entry) => entry.status === 'rejected')) setMessage('Some recently viewed products could not be refreshed. Please try again.')
    setRecentLoading(false)
  }
  return <section className="shopping-panel"><p className="shopping-kicker">Pick up where you left off</p><h2>Your shopping shortcuts</h2>
    <div className="shortcut-cards"><div><h3>Track your order</h3><p>Sign in to see only your own orders and delivery updates.</p><Link className="shopping-button" to={customerOrdersLink(customer)}>{customer ? 'Open My Orders' : 'Sign in to track'}</Link></div><div><h3>Buy again</h3><p>Review a previous basket using current prices and available sizes.</p>{customer ? <button type="button" className="shopping-button secondary" disabled={busy} onClick={loadOrders}>Load my recent orders</button> : <Link to="/login">Sign in to buy again</Link>}</div></div>
    {customer && orders.length > 0 && <ul className="buy-again-orders">{orders.map((order) => <li key={order.id}><span>{order.order_code || 'Previous order'}</span><button type="button" disabled={busy} onClick={() => rebuild(order)}>Review current basket</button></li>)}</ul>}
    {customer && reviewed && <><Review lines={reviewed} /><button type="button" className="shopping-button" disabled={busy} onClick={() => rebuild(selectedOrder, true)}>Add reviewed items to cart</button></>}
    <p role="status">{message}</p>
    <h3>Recently viewed</h3><button type="button" className="shopping-button secondary" disabled={recentLoading} onClick={loadRecent}>{recentLoading ? 'Refreshing products…' : 'Show recently viewed products'}</button>
    {recent && (recent.length ? <div className="recent-products">{recent.map((product) => <Link key={product.id} to={productLink(product.id)}><img src={getImageUrl(product)} alt="" width="84" height="84" loading="lazy" onError={handleImageError} /><span>{product.name}</span><strong>{product.price != null && Number.isFinite(Number(product.price)) ? formatPrice(product.price) : 'View price'}</strong></Link>)}</div> : <p>Open product details to build your recently viewed list on this browser tab.</p>)}
    <div className="delivery-guidance"><h3>Delivery to your address</h3><p>Delivery eligibility is checked when you place an order. A separate address checker is not available yet.</p><Link to="/contact">Ask FoodNova about delivery</Link></div>
  </section>
}

export default function ShoppingWidgets({ products }) {
  return <div className="homepage-shopping"><BasketBuilder products={products} /><ShoppingShortcuts /></div>
}
