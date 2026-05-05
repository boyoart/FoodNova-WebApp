import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { adminAPI } from '../services/api'
import { formatPrice } from '../utils/formatters'
import toast from 'react-hot-toast'
import './AdminPages.css'

export default function AdminStock() {
  const { isAdmin } = useAuthStore()
  const [activeTab, setActiveTab] = useState('products')
  const [products, setProducts] = useState([])
  const [packs, setPacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createData, setCreateData] = useState({})

  useEffect(() => {
    if (isAdmin) {
      fetchData()
    }
  }, [isAdmin])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [productsRes, packsRes] = await Promise.all([
        adminAPI.getProducts(),
        adminAPI.getPacks()
      ])
      setProducts(productsRes.data || [])
      setPacks(packsRes.data || [])
    } catch (error) {
      toast.error('Failed to load data')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (item) => {
    setEditingId(item.id)
    setEditData({ ...item })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditData({})
  }

  const handleSaveEdit = async () => {
    try {
      if (activeTab === 'products') {
        await adminAPI.updateProduct(editingId, editData)
        toast.success('Product updated successfully')
      } else {
        await adminAPI.updatePack(editingId, editData)
        toast.success('Pack updated successfully')
      }
      setEditingId(null)
      setEditData({})
      fetchData()
    } catch (error) {
      toast.error('Failed to update item')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return

    try {
      if (activeTab === 'products') {
        await adminAPI.deleteProduct(id)
        toast.success('Product deleted successfully')
      } else {
        await adminAPI.deletePack(id)
        toast.success('Pack deleted successfully')
      }
      fetchData()
    } catch (error) {
      toast.error('Failed to delete item')
    }
  }

  const handleCreate = async () => {
    try {
      if (activeTab === 'products') {
        await adminAPI.createProduct(createData)
        toast.success('Product created successfully')
      } else {
        await adminAPI.createPack(createData)
        toast.success('Pack created successfully')
      }
      setShowCreateModal(false)
      setCreateData({})
      fetchData()
    } catch (error) {
      toast.error('Failed to create item')
    }
  }

  const handleCreateModalClose = () => {
    setShowCreateModal(false)
    setCreateData({})
  }

  const renderProductForm = (data, setData, isCreate = false) => (
    <div className="form-grid">
      <div className="form-group">
        <label>Name</label>
        <input
          type="text"
          value={data.name || ''}
          onChange={(e) => setData({ ...data, name: e.target.value })}
          required
        />
      </div>
      <div className="form-group">
        <label>Price (₦)</label>
        <input
          type="number"
          value={data.price || ''}
          onChange={(e) => setData({ ...data, price: parseInt(e.target.value) || 0 })}
          min="0"
          required
        />
      </div>
      <div className="form-group">
        <label>Stock Quantity</label>
        <input
          type="number"
          value={data.stock_qty || data.stock || ''}
          onChange={(e) => setData({ ...data, stock_qty: parseInt(e.target.value) || 0, stock: parseInt(e.target.value) || 0 })}
          min="0"
          required
        />
      </div>
      <div className="form-group">
        <label>Category</label>
        <input
          type="text"
          value={data.category || ''}
          onChange={(e) => setData({ ...data, category: e.target.value, category_name: e.target.value })}
        />
      </div>
      <div className="form-group full-width">
        <label>Image URL</label>
        <input
          type="url"
          value={data.image_url || ''}
          onChange={(e) => setData({ ...data, image_url: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={data.is_active !== false}
            onChange={(e) => setData({ ...data, is_active: e.target.checked })}
          />
          Active
        </label>
      </div>
    </div>
  )

  const renderPackForm = (data, setData, isCreate = false) => (
    <div className="form-grid">
      <div className="form-group">
        <label>Name</label>
        <input
          type="text"
          value={data.name || ''}
          onChange={(e) => setData({ ...data, name: e.target.value })}
          required
        />
      </div>
      <div className="form-group">
        <label>Price (₦)</label>
        <input
          type="number"
          value={data.price || ''}
          onChange={(e) => setData({ ...data, price: parseInt(e.target.value) || 0 })}
          min="0"
          required
        />
      </div>
      <div className="form-group full-width">
        <label>Description</label>
        <textarea
          value={data.description || ''}
          onChange={(e) => setData({ ...data, description: e.target.value })}
          rows="3"
        />
      </div>
      <div className="form-group full-width">
        <label>Items (comma-separated)</label>
        <input
          type="text"
          value={Array.isArray(data.items) ? data.items.join(', ') : data.items || ''}
          onChange={(e) => setData({ ...data, items: e.target.value.split(',').map(item => item.trim()) })}
          placeholder="Rice, Beans, Oil"
        />
      </div>
      <div className="form-group full-width">
        <label>Image URL</label>
        <input
          type="url"
          value={data.image_url || ''}
          onChange={(e) => setData({ ...data, image_url: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={data.is_active !== false}
            onChange={(e) => setData({ ...data, is_active: e.target.checked })}
          />
          Active
        </label>
      </div>
    </div>
  )

  if (!isAdmin) {
    return <div className="admin-page"><p>Access denied.</p></div>
  }

  const items = activeTab === 'products' ? products : packs

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>Stock Management</h1>
        <button
          className="btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          Add {activeTab === 'products' ? 'Product' : 'Pack'}
        </button>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          Products ({products.length})
        </button>
        <button
          className={`tab ${activeTab === 'packs' ? 'active' : ''}`}
          onClick={() => setActiveTab('packs')}
        >
          Packs ({packs.length})
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="stock-table">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                {activeTab === 'products' ? (
                  <>
                    <th>Category</th>
                    <th>Stock</th>
                  </>
                ) : (
                  <>
                    <th>Description</th>
                    <th>Items</th>
                  </>
                )}
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>
                    {editingId === item.id ? (
                      <input
                        type="text"
                        value={editData.name || ''}
                        onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      />
                    ) : (
                      item.name
                    )}
                  </td>
                  {activeTab === 'products' ? (
                    <>
                      <td>
                        {editingId === item.id ? (
                          <input
                            type="text"
                            value={editData.category || ''}
                            onChange={(e) => setEditData({ ...editData, category: e.target.value, category_name: e.target.value })}
                          />
                        ) : (
                          item.category
                        )}
                      </td>
                      <td>
                        {editingId === item.id ? (
                          <input
                            type="number"
                            value={editData.stock_qty || editData.stock || ''}
                            onChange={(e) => setEditData({ ...editData, stock_qty: parseInt(e.target.value) || 0, stock: parseInt(e.target.value) || 0 })}
                            min="0"
                          />
                        ) : (
                          item.stock || item.stock_qty
                        )}
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        {editingId === item.id ? (
                          <textarea
                            value={editData.description || ''}
                            onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                            rows="2"
                          />
                        ) : (
                          item.description?.substring(0, 50) + (item.description?.length > 50 ? '...' : '')
                        )}
                      </td>
                      <td>
                        {editingId === item.id ? (
                          <input
                            type="text"
                            value={Array.isArray(editData.items) ? editData.items.join(', ') : editData.items || ''}
                            onChange={(e) => setEditData({ ...editData, items: e.target.value.split(',').map(item => item.trim()) })}
                          />
                        ) : (
                          Array.isArray(item.items) ? item.items.join(', ') : item.items
                        )}
                      </td>
                    </>
                  )}
                  <td>
                    {editingId === item.id ? (
                      <input
                        type="number"
                        value={editData.price || ''}
                        onChange={(e) => setEditData({ ...editData, price: parseInt(e.target.value) || 0 })}
                        min="0"
                      />
                    ) : (
                      formatPrice(item.price)
                    )}
                  </td>
                  <td>
                    <span className={`status ${item.is_active ? 'active' : 'inactive'}`}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    {editingId === item.id ? (
                      <div className="action-buttons">
                        <button className="btn-save" onClick={handleSaveEdit}>
                          Save
                        </button>
                        <button className="btn-cancel" onClick={handleCancelEdit}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="action-buttons">
                        <button className="btn-edit" onClick={() => handleEdit(item)}>
                          Edit
                        </button>
                        <button className="btn-delete" onClick={() => handleDelete(item.id)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Add New {activeTab === 'products' ? 'Product' : 'Pack'}</h2>
              <button className="modal-close" onClick={handleCreateModalClose}>×</button>
            </div>
            <div className="modal-body">
              {activeTab === 'products'
                ? renderProductForm(createData, setCreateData, true)
                : renderPackForm(createData, setCreateData, true)
              }
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={handleCreateModalClose}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleCreate}>
                Create {activeTab === 'products' ? 'Product' : 'Pack'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
