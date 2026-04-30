import { useState, useEffect } from 'react'
import { Search, Filter } from 'lucide-react'
import { productsAPI, packsAPI } from '../services/api'
import { useCartStore } from '../store/cartStore'
import toast from 'react-hot-toast'
import './ProductsPage.css'

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [packs, setPacks] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('products')
  const [loading, setLoading] = useState(true)
  const { addItem } = useCartStore()

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      setLoading(true)
      const [productsRes, packsRes] = await Promise.all([
        productsAPI.getAll({ search: searchTerm }),
        packsAPI.getAll({ search: searchTerm }),
      ])
      setProducts(productsRes.data || [])
      setPacks(packsRes.data || [])
    } catch (error) {
      toast.error('Failed to load products')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddToCart = (item) => {
    addItem(item)
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
            <div key={item.id} className="product-card">
              <div className="product-image">
                <img
                  src={item.image || '/placeholder.png'}
                  alt={item.name}
                  onError={(e) => {
                    e.target.src = '/placeholder.png'
                  }}
                />
                {item.stock <= 0 && <div className="out-of-stock">Out of Stock</div>}
              </div>
              <div className="product-info">
                <h3>{item.name}</h3>
                <p className="description">{item.description}</p>
                {item.category && <span className="category">{item.category}</span>}
                <div className="product-footer">
                  <span className="price">${item.price.toFixed(2)}</span>
                  <button
                    className="btn-add"
                    onClick={() => handleAddToCart(item)}
                    disabled={item.stock <= 0}
                  >
                    Add to Cart
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
