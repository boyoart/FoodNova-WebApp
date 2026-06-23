import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Heart, Search, Sparkles } from 'lucide-react'
import { productsAPI, packsAPI } from '../services/api'
import { useCartStore } from '../store/cartStore'
import { formatPrice, getImageFallbackAttrs, getImageUrl, handleImageError } from '../utils/formatters'
import toast from 'react-hot-toast'
import './ProductsPage.css'

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [packs, setPacks] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [stockFilter, setStockFilter] = useState('all')
  const [sortOption, setSortOption] = useState('newest')
  const [activeTab, setActiveTab] = useState('products')
  const [loading, setLoading] = useState(true)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { items: cartItems, addItem } = useCartStore()

  useEffect(() => {
    fetchProducts()
  }, [])

  useEffect(() => {
    const category = searchParams.get('category')
    if (category) {
      setCategoryFilter(category)
      setActiveTab('products')
    }
  }, [searchParams])

  const normalizeStoreItem = (item, itemType = activeTab === 'packs' ? 'pack' : 'product') => {
    const name = item?.name || item?.product_name || 'FoodNova Item'
    const variants = Array.isArray(item?.variants) ? item.variants.filter((variant) => variant?.is_active !== false) : []
    const hasVariants = item?.has_variants === true || variants.length > 1
    const variantPrices = variants.map((variant) => Number(variant.price || 0)).filter((price) => price > 0)
    const price = hasVariants && variantPrices.length ? Math.min(...variantPrices) : Number(item?.price ?? item?.unit_price ?? 0)
    const stock = hasVariants
      ? variants.reduce((sum, variant) => sum + Number(variant.stock_qty ?? variant.stock ?? 0), 0)
      : Number(item?.stock_qty ?? item?.stock ?? 999)

    return {
      ...item,
      id: item?.id,
      name,
      product_name: name,
      display_name: name,
      price,
      unit_price: price,
      base_price: item?.price || item?.base_price || price,
      starting_price: price,
      stock,
      stock_qty: stock,
      variants,
      has_variants: hasVariants,
      selected_variant: null,
      variant_id: null,
      variant_weight: '',
      sku: item?.sku || '',
      cart_key: `${itemType}-${item?.id}`,
      is_out_of_stock: item?.is_out_of_stock === true || stock <= 0,
      low_stock: item?.low_stock === true || (stock > 0 && stock <= Number(item?.low_stock_threshold || 5)),
      low_stock_threshold: item?.low_stock_threshold || 5,
      item_type: item?.item_type || item?.type || itemType,
      type: item?.type || item?.item_type || itemType,
      quantity: item?.quantity || item?.qty || 1,
      qty: item?.quantity || item?.qty || 1,
      image: item?.image || item?.image_url || item?.effective_image_url || item?.category_image_url || item?.default_image_url || '',
      image_url: item?.image_url || item?.image || '',
      category: item?.category || item?.category_name || '',
      includedItems: Array.isArray(item?.included_items) ? item.included_items : Array.isArray(item?.items) ? item.items : [],
      familySize: item?.family_size || item?.serves || 'Family restock',
      deliveryEstimate: item?.delivery_estimate || '24-48 hrs',
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
    const normalized = normalizeStoreItem(item, activeTab === 'packs' ? 'pack' : 'product')
    if (normalized.has_variants && normalized.type !== 'pack') {
      navigate(`/products/${normalized.id}`)
      return
    }
    if (normalized.is_out_of_stock) {
      toast.error('This item is out of stock')
      return
    }
    if (normalized.type !== 'pack') {
      const existingQty = cartItems.find((cartItem) => (cartItem.cart_key || `${cartItem.type || cartItem.item_type || 'product'}-${cartItem.id}-${cartItem.variant_id || cartItem.sku || ''}`) === normalized.cart_key)?.quantity || 0
      if (existingQty + 1 > normalized.stock_qty) {
        toast.error(`Only ${normalized.stock_qty} left in stock`)
        return
      }
    }
    addItem(normalized)
    toast.success('Added to cart!')
  }

  const handleSearch = (e) => {
    e.preventDefault()
  }

  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))]
  const baseItems = activeTab === 'products' ? products : packs
  const items = baseItems
    .filter((item) => {
      const query = searchTerm.trim().toLowerCase()
      if (!query) return true
      return [item.name, item.description, item.category].some((value) => String(value || '').toLowerCase().includes(query))
    })
    .filter((item) => activeTab !== 'products' || categoryFilter === 'all' || item.category === categoryFilter)
    .filter((item) => {
      if (activeTab !== 'products') return true
      if (stockFilter === 'available') return !item.is_out_of_stock
      if (stockFilter === 'low') return item.low_stock && !item.is_out_of_stock
      if (stockFilter === 'out') return item.is_out_of_stock
      return true
    })
    .sort((a, b) => {
      if (sortOption === 'price_asc') return Number(a.price || 0) - Number(b.price || 0)
      if (sortOption === 'price_desc') return Number(b.price || 0) - Number(a.price || 0)
      return Number(b.id || 0) - Number(a.id || 0)
    })

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

      <div className="product-controls">
        <label>
          Category
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} disabled={activeTab !== 'products'}>
            <option value="all">All Categories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label>
          Stock
          <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} disabled={activeTab !== 'products'}>
            <option value="all">All</option>
            <option value="available">Available</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
        </label>
        <label>
          Sort
          <select value={sortOption} onChange={(event) => setSortOption(event.target.value)}>
            <option value="newest">Newest</option>
            <option value="price_asc">Price Low to High</option>
            <option value="price_desc">Price High to Low</option>
          </select>
        </label>
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
          {items.map((item) => (
            <div key={`${activeTab}-${item.id}`} className="product-card">
              <div className="product-image">
                <img
                  src={getImageUrl(item)}
                  alt={item.name}
                  loading="lazy"
                  onError={handleImageError}
                  {...getImageFallbackAttrs(item)}
                />
                <div className="product-badges">
                  <span><Sparkles size={13} /> Fresh</span>
                  <span>{activeTab === 'packs' ? 'Food pack' : 'Bestseller'}</span>
                </div>
                <button type="button" className="product-favorite" aria-label={`Save ${item.name}`}><Heart size={17} /></button>
                {activeTab === 'products' && item.is_out_of_stock && <div className="out-of-stock">Out of Stock</div>}
                {activeTab === 'products' && item.low_stock && !item.is_out_of_stock && <div className="low-stock-badge">Only {item.stock_qty} left</div>}
              </div>
              <div className="product-info">
                <h3>{activeTab === 'products' ? <Link to={`/products/${item.id}`}>{item.name}</Link> : item.name}</h3>
                <p className="description">{item.description}</p>
                {item.category && <span className="category">{item.category}</span>}
                {activeTab === 'packs' && (
                  <div className="pack-extras">
                    <div className="pack-meta">
                      <span>{item.familySize}</span>
                      <span>{item.deliveryEstimate}</span>
                    </div>
                    <div className="pack-included">
                      <strong>What's inside</strong>
                      {(item.includedItems.length ? item.includedItems : ['Rice', 'Beans', 'Garri', 'Spaghetti']).slice(0, 5).map((entry) => (
                        <span key={String(entry)}><CheckCircle2 size={14} /> {typeof entry === 'string' ? entry : entry?.name || entry?.product_name || 'Food item'}</span>
                      ))}
                    </div>
                  </div>
                )}
                {activeTab === 'products' && (
                  <>
                  <div className="stock-info">
                    {item.is_out_of_stock ? (
                      <span className="out-of-stock-text">Out of stock</span>
                    ) : item.low_stock ? (
                      <span className="low-stock-text">Only {item.stock_qty} left</span>
                    ) : (
                      <span className="in-stock">{item.stock_qty} in stock</span>
                    )}
                  </div>
                  </>
                )}
                <div className="product-footer">
                  <span className="price">{item.has_variants ? `From ${formatPrice(item.price)}` : formatPrice(item.price)}</span>
                  <button
                    className="btn-add"
                    onClick={() => handleAddToCart(item)}
                    disabled={activeTab === 'products' && item.is_out_of_stock}
                  >
                    {activeTab === 'products' && item.is_out_of_stock ? 'Out of Stock' : item.has_variants ? 'Select Weight' : 'Add to Cart'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
