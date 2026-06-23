import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { adminAPI, resolveMediaUrl } from '../services/api'
import { formatPrice } from '../utils/formatters'
import toast from 'react-hot-toast'
import './AdminPages.css'

const emptyProduct = {
  name: '',
  price: '',
  stock_qty: '',
  category: '',
  description: '',
  contents: [],
  pack_info: '',
  serving_estimate: '',
  freshness_note: '',
  delivery_note: '',
  is_active: true,
  image_url: '',
}
const emptyPack = { name: '', price: '', description: '', items: [], is_active: true, image_url: '' }

export default function AdminStock() {
  const { isAdmin } = useAuthStore()
  const [activeTab, setActiveTab] = useState('products')
  const [products, setProducts] = useState([])
  const [packs, setPacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState(emptyProduct)
  const [showModal, setShowModal] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [stockFilter, setStockFilter] = useState('all')
  const isProduct = activeTab === 'products'

  useEffect(() => {
    if (isAdmin) fetchData()
  }, [isAdmin])

  const fetchData = async () => {
    try {
      setLoading(true)
      setLoadError('')
      const [productsRes, packsRes] = await Promise.all([adminAPI.getProducts(), adminAPI.getPacks()])
      setProducts(productsRes.data || [])
      setPacks(packsRes.data || [])
    } catch (error) {
      const message = [401, 403].includes(error?.response?.status)
        ? 'Session expired. Please log in again.'
        : 'Failed to load data. Please log out and log back in. If this continues, check backend deployment logs.'
      setLoadError(message)
      toast.error(message)
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const clearPreview = (data = formData) => {
    if (data.image_preview) URL.revokeObjectURL(data.image_preview)
  }

  const openCreateModal = () => {
    clearPreview()
    setEditingId(null)
    setFormData(isProduct ? emptyProduct : emptyPack)
    setShowModal(true)
  }

  const handleEdit = (item) => {
    clearPreview()
    setEditingId(item.id)
    setFormData({ ...(isProduct ? emptyProduct : emptyPack), ...item })
    setShowModal(true)
  }

  const closeModal = () => {
    clearPreview()
    setEditingId(null)
    setFormData(isProduct ? emptyProduct : emptyPack)
    setShowModal(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return

    try {
      if (isProduct) {
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

  const handleImageChange = (event) => {
    const file = event.target.files?.[0]
    clearPreview()

    if (!file) {
      setFormData((current) => ({ ...current, image_file: null, image_preview: '' }))
      return
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      event.target.value = ''
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5MB or smaller')
      event.target.value = ''
      return
    }

    setFormData((current) => ({ ...current, image_file: file, image_preview: URL.createObjectURL(file) }))
  }

  const removeSelectedImage = () => {
    clearPreview()
    setFormData((current) => ({
      ...current,
      image_file: null,
      image_preview: '',
      image_url: current.id ? current.image_url : '',
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      if (isProduct) {
        if (editingId) {
          await adminAPI.updateProduct(editingId, formData)
          toast.success('Product updated successfully')
        } else {
          await adminAPI.createProduct(formData)
          toast.success('Product created successfully')
        }
      } else if (editingId) {
        await adminAPI.updatePack(editingId, formData)
        toast.success('Pack updated successfully')
      } else {
        await adminAPI.createPack(formData)
        toast.success('Pack created successfully')
      }
      closeModal()
      fetchData()
    } catch (error) {
      toast.error(error.response?.data?.detail || `Failed to ${editingId ? 'update' : 'create'} item`)
      console.error(error)
    }
  }

  const renderImageUpload = (label) => {
    const preview = formData.image_preview || resolveMediaUrl(formData.image_url)
    return (
      <section className="stock-image-upload">
        <div>
          <div className="stock-image-upload-title">{label}</div>
          <p className="stock-image-upload-help">JPG, PNG or WEBP up to 5MB. Existing images stay unchanged unless you upload a new one.</p>
        </div>
        <div className="stock-image-upload-row">
          <div className="stock-image-preview">
            {preview ? <img src={preview} alt="Stock item preview" /> : <span>No image selected</span>}
          </div>
          <div className="stock-image-actions">
            <label className="stock-file-button">
              Choose Image
              <input type="file" accept="image/*" onChange={handleImageChange} />
            </label>
            {formData.image_file && (
              <button type="button" className="stock-remove-image" onClick={removeSelectedImage}>Remove selected image</button>
            )}
          </div>
        </div>
      </section>
    )
  }

  const renderStockThumb = (item) => {
    const imageUrl = resolveMediaUrl(item.image_url || item.image)
    return (
      <div className="stock-table-thumb">
        {imageUrl ? <img src={imageUrl} alt={item.name || 'Stock item'} /> : <span>No image</span>}
      </div>
    )
  }

  const getStockState = (item) => {
    const stock = Number(item.stock_qty ?? item.stock ?? 0)
    if (item.is_out_of_stock || stock <= 0) return 'out'
    if (item.low_stock || stock <= Number(item.low_stock_threshold || 5)) return 'low'
    return 'ok'
  }

  const renderStockStatus = (item) => {
    if (!isProduct) return <span className={`status ${item.is_active ? 'active' : 'inactive'}`}>{item.is_active ? 'Active' : 'Inactive'}</span>
    const state = getStockState(item)
    if (state === 'out') return <span className="stock-badge out">Out of Stock</span>
    if (state === 'low') return <span className="stock-badge low">Low Stock</span>
    return <span className={`status ${item.is_active ? 'active' : 'inactive'}`}>{item.is_active ? 'Active' : 'Inactive'}</span>
  }

  const updateVariant = (index, updates) => {
    setFormData((current) => {
      const variants = Array.isArray(current.variants) ? [...current.variants] : []
      variants[index] = { ...variants[index], ...updates }
      return { ...current, variants }
    })
  }

  const renderVariantEditor = () => {
    const variants = Array.isArray(formData.variants) ? formData.variants : []
    if (!variants.length) return null
    return (
      <div className="stock-form-field stock-form-field-wide variant-admin-editor">
        <label>Weight Variants</label>
        <div className="variant-admin-grid">
          {variants.map((variant, index) => (
            <div className="variant-admin-row" key={variant.id || variant.sku || index}>
              <strong>{variant.weight || 'Default'}</strong>
              <input aria-label={`${variant.weight || 'Default'} SKU`} value={variant.sku || ''} onChange={(event) => updateVariant(index, { sku: event.target.value })} />
              <input aria-label={`${variant.weight || 'Default'} price`} type="number" min="0" value={variant.price ?? ''} onChange={(event) => updateVariant(index, { price: Number(event.target.value) || 0 })} />
              <input aria-label={`${variant.weight || 'Default'} stock`} type="number" min="0" value={variant.stock_qty ?? variant.stock ?? ''} onChange={(event) => updateVariant(index, { stock_qty: Number(event.target.value) || 0, stock: Number(event.target.value) || 0 })} />
              <label>
                <input type="checkbox" checked={variant.is_active !== false} onChange={(event) => updateVariant(index, { is_active: event.target.checked, active: event.target.checked })} />
                Active
              </label>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderProductForm = () => (
    <>
    <div className="stock-form-grid">
      <div className="stock-form-field">
        <label>Product Name</label>
        <input value={formData.name || ''} onChange={(event) => setFormData({ ...formData, name: event.target.value })} required />
      </div>
      <div className="stock-form-field">
        <label>Price (₦)</label>
        <input type="number" min="0" value={formData.price || ''} onChange={(event) => setFormData({ ...formData, price: Number(event.target.value) || 0 })} required />
      </div>
      <div className="stock-form-field">
        <label>Stock Quantity</label>
        <input type="number" min="0" value={formData.stock_qty ?? formData.stock ?? ''} onChange={(event) => setFormData({ ...formData, stock_qty: Number(event.target.value) || 0, stock: Number(event.target.value) || 0 })} required disabled={Array.isArray(formData.variants) && formData.variants.length > 1} />
      </div>
      <div className="stock-form-field">
        <label>Category</label>
        <input value={formData.category || ''} onChange={(event) => setFormData({ ...formData, category: event.target.value, category_name: event.target.value })} />
      </div>
      <div className="stock-form-field stock-form-field-wide">
        <label>Description</label>
        <textarea value={formData.description || ''} onChange={(event) => setFormData({ ...formData, description: event.target.value })} rows="3" placeholder="Customer-facing product or pack description" />
      </div>
      <div className="stock-form-field stock-form-field-wide">
        <label>What's Included (comma-separated)</label>
        <input value={Array.isArray(formData.contents) ? formData.contents.join(', ') : formData.contents || ''} onChange={(event) => setFormData({ ...formData, contents: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="Rice, Beans, Garri, Oil" />
      </div>
      <div className="stock-form-field">
        <label>Pack / Quantity Info</label>
        <input value={formData.pack_info || ''} onChange={(event) => setFormData({ ...formData, pack_info: event.target.value })} placeholder="e.g. 13-item family pack" />
      </div>
      <div className="stock-form-field">
        <label>Serving Estimate</label>
        <input value={formData.serving_estimate || ''} onChange={(event) => setFormData({ ...formData, serving_estimate: event.target.value })} placeholder="e.g. Serves 4-6 for one week" />
      </div>
      <div className="stock-form-field">
        <label>Freshness Note</label>
        <input value={formData.freshness_note || ''} onChange={(event) => setFormData({ ...formData, freshness_note: event.target.value })} placeholder="Quality checked before dispatch" />
      </div>
      <div className="stock-form-field">
        <label>Delivery Note</label>
        <input value={formData.delivery_note || ''} onChange={(event) => setFormData({ ...formData, delivery_note: event.target.value })} placeholder="Packed after payment confirmation" />
      </div>
      <label className="stock-toggle">
        <input type="checkbox" checked={formData.is_active !== false} onChange={(event) => setFormData({ ...formData, is_active: event.target.checked })} />
        <span>Active product</span>
      </label>
      {renderVariantEditor()}
    </div>
    {renderImageUpload('Product Image')}
    </>
  )

  const renderPackForm = () => (
    <>
    <div className="stock-form-grid">
      <div className="stock-form-field">
        <label>Pack Name</label>
        <input value={formData.name || ''} onChange={(event) => setFormData({ ...formData, name: event.target.value })} required />
      </div>
      <div className="stock-form-field">
        <label>Price (₦)</label>
        <input type="number" min="0" value={formData.price || ''} onChange={(event) => setFormData({ ...formData, price: Number(event.target.value) || 0 })} required />
      </div>
      <div className="stock-form-field stock-form-field-wide">
        <label>Description</label>
        <textarea value={formData.description || ''} onChange={(event) => setFormData({ ...formData, description: event.target.value })} rows="3" />
      </div>
      <div className="stock-form-field stock-form-field-wide">
        <label>Items (comma-separated)</label>
        <input value={Array.isArray(formData.items) ? formData.items.join(', ') : formData.items || ''} onChange={(event) => setFormData({ ...formData, items: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="Rice, Beans, Oil" />
      </div>
      <label className="stock-toggle">
        <input type="checkbox" checked={formData.is_active !== false} onChange={(event) => setFormData({ ...formData, is_active: event.target.checked })} />
        <span>Active pack</span>
      </label>
    </div>
    {renderImageUpload('Pack Image')}
    </>
  )

  if (!isAdmin) return <div className="admin-page"><p>Access denied.</p></div>

  const lowStockProducts = products.filter((item) => getStockState(item) === 'low')
  const outOfStockProducts = products.filter((item) => getStockState(item) === 'out')
  const items = isProduct
    ? products.filter((item) => stockFilter === 'low' ? getStockState(item) === 'low' : stockFilter === 'out' ? getStockState(item) === 'out' : true)
    : packs
  const modalTitle = editingId
    ? `Edit ${isProduct ? 'Product' : 'Pack'}`
    : `Add New ${isProduct ? 'Product' : 'Pack'}`

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>Stock Management</h1>
        <button className="btn-primary" onClick={openCreateModal}>Add {isProduct ? 'Product' : 'Pack'}</button>
      </div>

      <div className="tabs">
        <button className={`tab ${isProduct ? 'active' : ''}`} onClick={() => { setActiveTab('products'); setStockFilter('all') }}>Products ({products.length})</button>
        <button className={`tab ${!isProduct ? 'active' : ''}`} onClick={() => setActiveTab('packs')}>Packs ({packs.length})</button>
      </div>

      {isProduct && (
        <div className="stock-filter-tabs">
          <button className={stockFilter === 'all' ? 'active' : ''} onClick={() => setStockFilter('all')}>All ({products.length})</button>
          <button className={stockFilter === 'low' ? 'active' : ''} onClick={() => setStockFilter('low')}>Low Stock ({lowStockProducts.length})</button>
          <button className={stockFilter === 'out' ? 'active' : ''} onClick={() => setStockFilter('out')}>Out of Stock ({outOfStockProducts.length})</button>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading...</div>
      ) : loadError ? (
        <div className="loading">{loadError}</div>
      ) : (
        <div className="stock-table">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Image</th>
                <th>Name</th>
                {isProduct ? <><th>Category</th><th>Contents</th><th>Stock</th></> : <><th>Description</th><th>Items</th></>}
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={isProduct ? `stock-row-${getStockState(item)}` : ''}>
                  <td>{item.id}</td>
                  <td>{renderStockThumb(item)}</td>
                  <td>{item.name}</td>
                  {isProduct ? (
                    <>
                      <td>{item.category}</td>
                      <td>{Array.isArray(item.contents) ? item.contents.slice(0, 3).join(', ') : ''}{Array.isArray(item.contents) && item.contents.length > 3 ? '...' : ''}</td>
                      <td>{Array.isArray(item.variants) && item.variants.length ? item.variants.map((variant) => `${variant.weight || 'Default'}: ${variant.stock_qty}`).join(', ') : (item.stock ?? item.stock_qty)}</td>
                    </>
                  ) : (
                    <>
                      <td>{item.description?.substring(0, 50)}{item.description?.length > 50 ? '...' : ''}</td>
                      <td>{Array.isArray(item.items) ? item.items.join(', ') : item.items}</td>
                    </>
                  )}
                  <td>{Array.isArray(item.variants) && item.variants.length ? item.variants.map((variant) => `${variant.weight || 'Default'} ${formatPrice(variant.price)}`).join(', ') : formatPrice(item.price)}</td>
                  <td>{renderStockStatus(item)}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-edit" onClick={() => handleEdit(item)}>Edit</button>
                      <button className="btn-delete" onClick={() => handleDelete(item.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="stock-modal-backdrop">
          <div className="stock-modal">
            <div className="stock-modal-header">
              <div>
                <h2>{modalTitle}</h2>
                <p>Fill in {isProduct ? 'product' : 'pack'} details below</p>
              </div>
              <button type="button" className="stock-modal-close" onClick={closeModal}>×</button>
            </div>
            <form className="stock-modal-form" onSubmit={handleSubmit}>
              {isProduct ? renderProductForm() : renderPackForm()}
              <div className="stock-modal-footer">
                <button type="button" className="stock-secondary-button" onClick={closeModal}>Cancel</button>
                <button type="submit" className="stock-primary-button">{editingId ? `Update ${isProduct ? 'Product' : 'Pack'}` : `Save ${isProduct ? 'Product' : 'Pack'}`}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
