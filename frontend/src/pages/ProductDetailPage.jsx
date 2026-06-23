import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Minus, Plus, ShoppingCart } from 'lucide-react'
import toast from 'react-hot-toast'
import { productsAPI } from '../services/api'
import { useCartStore } from '../store/cartStore'
import { formatPrice, getImageFallbackAttrs, getImageUrl, handleImageError } from '../utils/formatters'
import './ProductDetailPage.css'

const activeVariantsOf = (product) => (
  Array.isArray(product?.variants)
    ? product.variants.filter((variant) => variant?.is_active !== false)
    : []
)

const minVariantPrice = (variants) => {
  const prices = variants.map((variant) => Number(variant.price || 0)).filter((price) => price > 0)
  return prices.length ? Math.min(...prices) : 0
}

export default function ProductDetailPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const { items: cartItems, addItem } = useCartStore()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    let isMounted = true
    const loadProduct = async () => {
      try {
        setLoading(true)
        const response = await productsAPI.getById(productId)
        if (!isMounted) return
        setProduct(response.data)
        setSelectedVariantId('')
        setQuantity(1)
      } catch (error) {
        toast.error('Product unavailable')
        console.error(error)
        if (isMounted) setProduct(null)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadProduct()
    return () => {
      isMounted = false
    }
  }, [productId])

  const variants = useMemo(() => activeVariantsOf(product), [product])
  const hasVariants = product?.has_variants === true || variants.length > 1
  const selectedVariant = variants.find((variant) => String(variant.id) === String(selectedVariantId)) || null
  const price = selectedVariant ? Number(selectedVariant.price || 0) : hasVariants ? minVariantPrice(variants) : Number(product?.price || 0)
  const stock = selectedVariant ? Number(selectedVariant.stock_qty ?? selectedVariant.stock ?? 0) : hasVariants ? 0 : Number(product?.stock_qty ?? product?.stock ?? 0)
  const canAdd = !!product && (!hasVariants || !!selectedVariant) && stock > 0
  const cartKey = product ? `product-${product.id}-${selectedVariant?.id || selectedVariant?.sku || ''}` : ''
  const existingQty = cartItems.find((item) => (item.cart_key || `${item.type || item.item_type || 'product'}-${item.id}-${item.variant_id || item.sku || ''}`) === cartKey)?.quantity || 0
  const displayName = selectedVariant?.weight ? `${product?.name} - ${selectedVariant.weight}` : product?.name

  useEffect(() => {
    if (quantity > Math.max(stock - existingQty, 1)) {
      setQuantity(Math.max(stock - existingQty, 1))
    }
  }, [existingQty, quantity, stock])

  const addToCart = () => {
    if (!product) return
    if (hasVariants && !selectedVariant) {
      toast.error('Select a weight first')
      return
    }
    if (stock <= 0) {
      toast.error('This item is out of stock')
      return
    }
    if (existingQty + quantity > stock) {
      toast.error(`Only ${stock} left in stock`)
      return
    }
    addItem({
      ...product,
      id: product.id,
      product_id: product.id,
      name: product.name,
      product_name: product.name,
      display_name: displayName,
      price,
      unit_price: price,
      stock,
      stock_qty: stock,
      quantity,
      qty: quantity,
      type: 'product',
      item_type: 'product',
      selected_variant: selectedVariant,
      variant_id: selectedVariant?.id,
      variant_weight: selectedVariant?.weight || '',
      sku: selectedVariant?.sku || product.sku || '',
      cart_key: cartKey,
      image_url: selectedVariant?.image_url || product.image_url || '',
      effective_image_url: selectedVariant?.image_url || product.effective_image_url,
      category_image_url: product.category_image_url,
      default_image_url: product.default_image_url,
    })
    toast.success('Added to cart')
    navigate('/cart')
  }

  if (loading) return <div className="product-detail-page"><div className="loading">Loading product...</div></div>

  if (!product) {
    return (
      <div className="product-detail-page product-detail-empty">
        <h1>Product unavailable</h1>
        <Link to="/products">Back to products</Link>
      </div>
    )
  }

  return (
    <div className="product-detail-page">
      <button type="button" className="detail-back" onClick={() => navigate('/products')}>
        <ArrowLeft size={18} /> Products
      </button>

      <section className="product-detail-layout">
        <div className="product-detail-image">
          <img
            src={getImageUrl(product)}
            alt={product.name}
            onError={handleImageError}
            {...getImageFallbackAttrs(product)}
          />
        </div>

        <div className="product-detail-panel">
          <span className="detail-category">{product.category || product.category_name || 'FoodNova Grocery'}</span>
          <h1>{product.name}</h1>
          <p className="detail-description">{product.description || 'Premium FoodNova grocery item prepared from current inventory and fulfilled with reliable delivery updates.'}</p>

          {hasVariants && (
            <div className="detail-weight-selector">
              <strong>Select Weight</strong>
              <div>
                {variants.map((variant) => (
                  <label key={variant.id || variant.sku} className={String(selectedVariantId) === String(variant.id) ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="weight"
                      value={variant.id}
                      checked={String(selectedVariantId) === String(variant.id)}
                      onChange={() => {
                        setSelectedVariantId(variant.id)
                        setQuantity(1)
                      }}
                    />
                    <span>{variant.weight}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="detail-purchase-box">
            <div>
              <span className="detail-price">{hasVariants && !selectedVariant ? `From ${formatPrice(price)}` : formatPrice(price)}</span>
              <span className={`detail-stock ${stock > 0 ? 'available' : 'unavailable'}`}>
                {hasVariants && !selectedVariant ? 'Select a weight to view stock' : stock > 0 ? `${stock} in stock` : 'Out of stock'}
              </span>
            </div>

            <div className="detail-quantity" aria-label="Quantity">
              <button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))} disabled={quantity <= 1}>
                <Minus size={16} />
              </button>
              <span>{quantity}</span>
              <button type="button" onClick={() => setQuantity((current) => Math.min(stock || 1, current + 1))} disabled={!canAdd || quantity >= stock}>
                <Plus size={16} />
              </button>
            </div>
          </div>

          <button type="button" className="detail-add-button" onClick={addToCart} disabled={!canAdd}>
            <ShoppingCart size={18} />
            {hasVariants && !selectedVariant ? 'Select Weight First' : 'Add to Cart'}
          </button>

          <div className="detail-assurance">
            <span><CheckCircle2 size={16} /> Invoice shows selected weight</span>
            <span><CheckCircle2 size={16} /> Fresh FoodNova inventory</span>
            <span><CheckCircle2 size={16} /> Secure checkout</span>
          </div>
        </div>
      </section>
    </div>
  )
}
