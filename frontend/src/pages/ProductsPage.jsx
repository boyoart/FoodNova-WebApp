import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { productsAPI, packsAPI } from '../services/api'
import { useCartStore } from '../store/cartStore'
import { formatPrice, getImageUrl, handleImageError } from '../utils/formatters'
import toast from 'react-hot-toast'
import './ProductsPage.css'

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [packs, setPacks] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('products')
  const [loading, setLoading] = useState(true)
  const [selectedVariants, setSelectedVariants] = useState({})
  const { addItem } = useCartStore()

  useEffect(() => {
    fetchProducts()
  }, [])

  const normalizeStoreItem = (item, itemType = activeTab === 'packs' ? 'pack' : 'product') => {
    const name = item?.name || item?.product_name || 'FoodNova Item'
    const price = Number(item?.price || item?.unit_price || 0)
    const available = item?.is_available !== false && item?.stock_status !== 'out_of_stock' && item?.is_out_of_stock !== true

    return {
      ...item,
      id: item?.id,
      name,
      product_name: name,
      price,
      unit_price: price,
      is_available: available,
      stock_status: available ? 'in_stock' : 'out_of_stock',
      is_out_of_stock: !available,
      item_type: item?.item_type || item?.type || itemType,
      type: item?.type || item?.item_type || itemType,
      quantity: item?.quantity || item?.qty || 1,
      qty: item?.quantity || item?.qty || 1,
      image: item?.image || item?.image_url || '/placeholder.png',
      image_url: item?.image_url || item?.image || '/placeholder.png',
      category: item?.category || item?.category_name || '',
    }
  }

  const fetchProducts = async () => {
    try {
      setLoading(true)
      const [productsRes, packsRes] = await Promise.all([
        productsAPI.getAll({ search: searchTerm }),
        packsAPI.getAll({ search: searchTerm }),
      ])

      const productData = Array.isArray(productsRes.data) ? productsRes.data : []
      const packData = Array.isArray(packsRes.data) ? packsRes.data : []

      setProducts(productData.map((item) => normalizeStoreItem(item, 'product')))
      setPacks(packData.map((item) => normalizeStoreItem(item, 'pack')))
    } catch (error) {
      toast.error('Failed to load products')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddToCart = (item) => {
    const selected = activeTab === 'products'
      ? (selectedVariants[item.id] || item.variants?.find((variant) => variant.is_available))
      : null
    if (activeTab === 'products' && item.variants?.length && !selected) {
      toast.error('Please select an available size')
      return
    }
    const normalized = normalizeStoreItem({
      ...item,
      ...(selected || {}),
      id: item.id,
      product_id: item.id,
      variant_id: selected?.id,
      variant_weight: selected?.weight || selected?.label || '',
      sku: selected?.sku || item.sku,
      name: selected ? `${item.name} - ${selected.weight || selected.label}` : item.name,
      cart_key: selected ? `product-${item.id}-${selected.id}` : `${activeTab}-${item.id}`,
    }, activeTab === 'packs' ? 'pack' : 'product')
    if (normalized.is_out_of_stock) {
      toast.error('This item is out of stock')
      return
    }
    addItem(normalized)
    toast.success('Added to cart!')
  }

  const handleSearch = (e) => {
    e.preventDefault()
    fetchProducts()
  }

  const items = activeTab === 'products' ? products : packs

  return (
    <div className="products-page">
      <div className="products-header">
        <h1>Our Products</h1>
        <form onSubmit={handleSearch} className="search-form">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>
      </div>

      <div className="products-tabs">
        <button
          className={`tab ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          Products
        </button>
        <button
          className={`tab ${activeTab === 'packs' ? 'active' : ''}`}
          onClick={() => setActiveTab('packs')}
        >
          Food Packs
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading products...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p>No {activeTab} found</p>
        </div>
      ) : (
        <div className="products-grid">
          {items.map((item) => {
            const variants = activeTab === 'products' ? (item.variants || []) : []
            const selected = selectedVariants[item.id] || variants.find((variant) => variant.is_available) || null
            const displayed = selected ? { ...item, ...selected } : item
            const unavailable = activeTab === 'products' && (variants.length ? !selected : item.is_out_of_stock)
            return (
            <div key={`${activeTab}-${item.id}`} className="product-card">
              <div className="product-image">
                <img
                  src={getImageUrl(item)}
                  alt={item.name}
                  onError={handleImageError}
                />
                {unavailable && <div className="out-of-stock">Out of Stock</div>}
              </div>
              <div className="product-info">
                <h3>{item.name}</h3>
                <p className="description">{item.description}</p>
                {item.category && <span className="category">{item.category}</span>}
                {variants.length > 0 && <div className="variant-options" aria-label={`${item.name} sizes`}>
                  {variants.map((variant) => <button type="button" key={variant.id} disabled={!variant.is_available} className={selected?.id === variant.id ? 'selected' : ''} onClick={() => setSelectedVariants((current) => ({ ...current, [item.id]: variant }))}>
                    {variant.weight || variant.label} · {formatPrice(variant.price)}{!variant.is_available ? ' · Out of stock' : ''}
                  </button>)}
                </div>}
                {activeTab === 'products' && (
                  <div className="stock-info">
                    {unavailable ? (
                      <span className="out-of-stock-text">Out of stock</span>
                    ) : (
                      <span className="in-stock">In stock</span>
                    )}
                  </div>
                )}
                <div className="product-footer">
                  <span className="price">{formatPrice(displayed.price)}</span>
                  <button
                    className="btn-add"
                    onClick={() => handleAddToCart(item)}
                    disabled={unavailable}
                  >
                    {unavailable ? 'Out of Stock' : 'Add to Cart'}
                  </button>
                </div>
              </div>
            </div>
          )})}
        </div>
      )}
    </div>
  )
}
