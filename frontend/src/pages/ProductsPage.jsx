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
  const { items: cartItems, addItem } = useCartStore()

  useEffect(() => {
    fetchProducts()
  }, [])

  const normalizeStoreItem = (item, itemType = activeTab === 'packs' ? 'pack' : 'product') => {
    const name = item?.name || item?.product_name || 'FoodNova Item'
    const price = Number(item?.price || item?.unit_price || 0)
    const stock = Number(item?.stock_qty ?? item?.stock ?? 999)

    return {
      ...item,
      id: item?.id,
      name,
      product_name: name,
      price,
      unit_price: price,
      stock,
      stock_qty: stock,
      is_out_of_stock: item?.is_out_of_stock === true || stock <= 0,
      low_stock: item?.low_stock === true || (stock > 0 && stock <= Number(item?.low_stock_threshold || 5)),
      low_stock_threshold: item?.low_stock_threshold || 5,
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
    const normalized = normalizeStoreItem(item, activeTab === 'packs' ? 'pack' : 'product')
    if (normalized.is_out_of_stock) {
      toast.error('This item is out of stock')
      return
    }
    if (normalized.type !== 'pack') {
      const existingQty = cartItems.find((cartItem) => cartItem.id === normalized.id && cartItem.type !== 'pack')?.quantity || 0
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
          {items.map((item) => (
            <div key={`${activeTab}-${item.id}`} className="product-card">
              <div className="product-image">
                <img
                  src={getImageUrl(item)}
                  alt={item.name}
                  onError={handleImageError}
                />
                {activeTab === 'products' && item.is_out_of_stock && <div className="out-of-stock">Out of Stock</div>}
                {activeTab === 'products' && item.low_stock && !item.is_out_of_stock && <div className="low-stock-badge">Only {item.stock_qty} left</div>}
              </div>
              <div className="product-info">
                <h3>{item.name}</h3>
                <p className="description">{item.description}</p>
                {item.category && <span className="category">{item.category}</span>}
                {activeTab === 'products' && (
                  <div className="stock-info">
                    {item.is_out_of_stock ? (
                      <span className="out-of-stock-text">Out of stock</span>
                    ) : item.low_stock ? (
                      <span className="low-stock-text">Only {item.stock_qty} left</span>
                    ) : (
                      <span className="in-stock">{item.stock_qty} in stock</span>
                    )}
                  </div>
                )}
                <div className="product-footer">
                  <span className="price">{formatPrice(item.price)}</span>
                  <button
                    className="btn-add"
                    onClick={() => handleAddToCart(item)}
                    disabled={activeTab === 'products' && item.is_out_of_stock}
                  >
                    {activeTab === 'products' && item.is_out_of_stock ? 'Out of Stock' : 'Add to Cart'}
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
