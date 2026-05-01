import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { adminAPI } from '../services/api'
import { formatPrice } from '../utils/formatters'
import toast from 'react-hot-toast'
import './AdminPages.css'

export default function AdminStock() {
  const { isAdmin } = useAuthStore()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editStock, setEditStock] = useState('')

  useEffect(() => {
    if (isAdmin) {
      fetchStock()
    }
  }, [isAdmin])

  const fetchStock = async () => {
    try {
      setLoading(true)
      const res = await adminAPI.getStock()
      setProducts(res.data || [])
    } catch (error) {
      toast.error('Failed to load stock')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleStockUpdate = async (productId) => {
    try {
      await adminAPI.updateStock(productId, { stock: parseInt(editStock) })
      toast.success('Stock updated')
      setEditingId(null)
      fetchStock()
    } catch (error) {
      toast.error('Failed to update stock')
    }
  }

  if (!isAdmin) {
    return <div className="admin-page"><p>Access denied.</p></div>
  }

  return (
    <div className="admin-page">
      <h1>Stock Management</h1>

      {loading ? (
        <div className="loading">Loading stock...</div>
      ) : (
        <div className="stock-table">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map(product => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.category}</td>
                  <td>{formatPrice(product.price)}</td>
                  <td>
                    {editingId === product.id ? (
                      <input
                        type="number"
                        value={editStock}
                        onChange={(e) => setEditStock(e.target.value)}
                        className="edit-input"
                        min="0"
                      />
                    ) : (
                      product.stock
                    )}
                  </td>
                  <td>
                    {editingId === product.id ? (
                      <>
                        <button
                          className="btn-save"
                          onClick={() => handleStockUpdate(product.id)}
                        >
                          Save
                        </button>
                        <button
                          className="btn-cancel"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn-edit"
                        onClick={() => {
                          setEditingId(product.id)
                          setEditStock(product.stock)
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
