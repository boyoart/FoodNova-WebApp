import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { adminAPI, resolveMediaUrl } from '../services/api'
import { formatPrice } from '../utils/formatters'
import toast from 'react-hot-toast'
import './AdminPages.css'

const emptyProduct = { name: '', description: '', price: '', stock_qty: '', category: '', is_active: true, image_url: '', images: [], image_files: [], remove_image_ids: [] }
const emptyPack = { name: '', price: '', description: '', items: [], is_active: true, image_url: '' }

export default function AdminStock() {
  const { isAdmin } = useAuthStore()
  const [activeTab, setActiveTab] = useState('products')
  const [products, setProducts] = useState([])
  const [packs, setPacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState(emptyProduct)
  const [initialFormData, setInitialFormData] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [stockFilter, setStockFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRows, setSelectedRows] = useState([])
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
    setInitialFormData(null)
    setShowModal(true)
  }

  const handleEdit = (item) => {
    clearPreview()
    setEditingId(item.id)
    const next = { ...(isProduct ? emptyProduct : emptyPack), ...item }
    setFormData(next)
    setInitialFormData(next)
    setShowModal(true)
  }

  const closeModal = () => {
    clearPreview()
    setEditingId(null)
    setInitialFormData(null)
    setFormData(isProduct ? emptyProduct : emptyPack)
    setShowModal(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Archive this product and all of its variants? Historical orders will be preserved.')) return

    try {
      if (isProduct) {
        await adminAPI.deleteProduct(id)
        toast.success('Product archived successfully')
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
    const files = [...(event.target.files || [])]
    if (!files.length) return
    if (files.some((file) => !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024)) {
      toast.error('Choose JPG, PNG or WEBP images up to 5MB each')
      event.target.value = ''
      return
    }
    setFormData((current) => ({ ...current, image_files: [...(current.image_files || []), ...files.map((file) => ({ file, preview: URL.createObjectURL(file) }))] }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      if (isProduct) {
        if (editingId) {
          const patch = {}
          const fields = ['name', 'price', 'stock_qty', 'category', 'description', 'contents', 'pack_info', 'serving_estimate', 'freshness_note', 'delivery_note', 'is_active', 'variants']
          fields.forEach((field) => {
            const before = initialFormData?.[field]
            const after = formData?.[field]
            if (JSON.stringify(before) !== JSON.stringify(after)) patch[field] = after
          })
          if ((formData.image_files || []).length) patch.image_files = formData.image_files.map((entry) => entry.file)
          if ((formData.remove_image_ids || []).length) patch.remove_image_ids = formData.remove_image_ids
          if (formData.primary_image_id) patch.primary_image_id = formData.primary_image_id
          await adminAPI.updateProduct(editingId, patch)
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
    const existing = formData.images || []
    const pending = formData.image_files || []
    return (
      <section className="stock-image-upload">
        <div>
          <div className="stock-image-upload-title">{label}</div>
          <p className="stock-image-upload-help">Select multiple JPG, PNG or WEBP images, up to 5MB each.</p>
        </div>
        <div className="stock-image-upload-row">
          <div className="stock-image-actions">
            <label className="stock-file-button">
              Upload Images
              <input type="file" accept="image/*" multiple onChange={handleImageChange} />
            </label>
          </div>
        </div>
        <div className="stock-image-gallery">
          {existing.map((entry) => <div className={`stock-image-card ${entry.is_primary ? 'primary' : ''}`} key={entry.id || entry.image_url}><img src={resolveMediaUrl(entry.image_url)} alt="Product" /><strong>{entry.is_primary ? 'Primary' : ''}</strong>{!entry.is_primary && entry.id && <button type="button" onClick={() => setFormData((current) => ({ ...current, primary_image_id: entry.id, images: current.images.map((image) => ({ ...image, is_primary: image.id === entry.id })) }))}>Set Primary</button>}<button type="button" onClick={() => setFormData((current) => ({ ...current, images: current.images.filter((image) => image !== entry), remove_image_ids: entry.id ? [...(current.remove_image_ids || []), entry.id] : current.remove_image_ids }))}>Remove</button></div>)}
          {pending.map((entry, index) => <div className="stock-image-card" key={entry.preview}><img src={entry.preview} alt="New product" /><strong>New</strong><button type="button" onClick={() => setFormData((current) => ({ ...current, image_files: current.image_files.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button></div>)}
          {!existing.length && !pending.length && <span>No images uploaded</span>}
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
    if (item.is_active === false || item.active === false) return 'archived'
    const stock = Number(item.stock_qty ?? item.stock ?? 0)
    if (item.is_out_of_stock || stock <= 0) return 'out'
    if (item.low_stock || stock <= Number(item.low_stock_threshold || 5)) return 'low'
    return 'ok'
  }

  const renderStockStatus = (item) => {
    if (!isProduct) return <span className={`status ${item.is_active ? 'active' : 'inactive'}`}>{item.is_active ? 'Active' : 'Inactive'}</span>
    const state = getStockState(item)
    if (state === 'archived') return <span className="stock-badge archived">Archived</span>
    if (state === 'out') return <span className="stock-badge out">Out of Stock</span>
    if (state === 'low') return <span className="stock-badge low">Low Stock</span>
    return <span className={`status ${item.is_active ? 'active' : 'inactive'}`}>{item.is_active ? 'Active' : 'Inactive'}</span>
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
        <input type="number" min="0" value={formData.stock_qty ?? formData.stock ?? ''} onChange={(event) => setFormData({ ...formData, stock_qty: Number(event.target.value) || 0, stock: Number(event.target.value) || 0 })} required />
      </div>
      <div className="stock-form-field">
        <label>Category</label>
        <input value={formData.category || ''} onChange={(event) => setFormData({ ...formData, category: event.target.value, category_name: event.target.value })} />
      </div>
      <label className="stock-toggle">
        <input type="checkbox" checked={formData.is_active !== false} onChange={(event) => setFormData({ ...formData, is_active: event.target.checked })} />
        <span>Active product</span>
      </label>
      <div className="stock-form-field stock-form-field-wide">
        <label>Description</label>
        <textarea rows="4" value={formData.description || ''} onChange={(event) => setFormData({ ...formData, description: event.target.value })} />
      </div>
    </div>
    <section className="stock-variant-editor">
      <div className="stock-image-upload-title">Variants / sizes</div>
      <p className="stock-image-upload-help">Leave empty for a normal single-unit product. Each variant has independent pricing and stock.</p>
      {(formData.variants || []).map((variant, index) => (
        <div className="stock-form-grid" key={variant.id || `new-${index}`}>
          <div className="stock-form-field"><label>Size / weight</label><input value={variant.weight || ''} onChange={(event) => setFormData({ ...formData, variants: formData.variants.map((entry, entryIndex) => entryIndex === index ? { ...entry, weight: event.target.value } : entry) })} /></div>
          <div className="stock-form-field"><label>Price (₦)</label><input type="number" min="0" value={variant.price ?? ''} onChange={(event) => setFormData({ ...formData, variants: formData.variants.map((entry, entryIndex) => entryIndex === index ? { ...entry, price: Number(event.target.value) || 0 } : entry) })} /></div>
          <div className="stock-form-field"><label>Quantity</label><input type="number" min="0" value={variant.stock_qty ?? variant.stock ?? ''} onChange={(event) => setFormData({ ...formData, variants: formData.variants.map((entry, entryIndex) => entryIndex === index ? { ...entry, stock_qty: Number(event.target.value) || 0, stock: Number(event.target.value) || 0 } : entry) })} /></div>
          <label className="stock-toggle"><input type="checkbox" checked={variant.is_active !== false} onChange={(event) => setFormData({ ...formData, variants: formData.variants.map((entry, entryIndex) => entryIndex === index ? { ...entry, is_active: event.target.checked } : entry) })} /><span>Active</span></label>
          <button type="button" className="stock-secondary-button" onClick={() => setFormData({ ...formData, variants: formData.variants.filter((_, entryIndex) => entryIndex !== index) })}>Remove</button>
        </div>
      ))}
      <button type="button" className="stock-secondary-button" onClick={() => setFormData({ ...formData, variants: [...(formData.variants || []), { weight: '', price: formData.price || 0, stock_qty: 0, is_active: true }] })}>Add variant</button>
    </section>
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
  const activeProducts = products.filter((item) => item.is_active !== false)
  const archivedProducts = products.filter((item) => item.is_active === false)
  const items = isProduct
    ? products.filter((item) => {
        const matchesSearch = `${item.name} ${item.category} ${(item.variants || []).map((variant) => `${variant.weight} ${variant.sku}`).join(' ')}`.toLowerCase().includes(searchTerm.trim().toLowerCase())
        const matchesStock = stockFilter === 'active'
          ? item.is_active !== false
          : stockFilter === 'archived'
            ? item.is_active === false
            : stockFilter === 'low'
              ? getStockState(item) === 'low'
              : stockFilter === 'out'
                ? getStockState(item) === 'out'
                : true
        return matchesSearch && matchesStock
      })
    : packs
  const modalTitle = editingId
    ? `Edit ${isProduct ? 'Product' : 'Pack'}`
    : `Add New ${isProduct ? 'Product' : 'Pack'}`
  const visibleRows = isProduct
    ? items.flatMap((item) => [
        { key: `product:${item.id}`, item, row: item, kind: 'product' },
        ...(item.variants || []).map((variant) => ({ key: `variant:${variant.id}`, item, row: variant, kind: 'variant' })),
      ])
    : items.map((item) => ({ key: `pack:${item.id}`, item, row: item, kind: 'pack' }))
  const visibleKeys = visibleRows.map((entry) => entry.key)
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selectedRows.includes(key))
  const toggleRow = (key) => setSelectedRows((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key])
  const bulkArchive = async () => {
    const productIds = selectedRows.filter((key) => key.startsWith('product:')).map((key) => Number(key.split(':')[1]))
    const variantIds = selectedRows.filter((key) => key.startsWith('variant:')).map((key) => Number(key.split(':')[1]))
    const parentCount = productIds.length
    const warning = `Archive ${selectedRows.length} selected item${selectedRows.length === 1 ? '' : 's'}? ${parentCount ? `${parentCount} parent product${parentCount === 1 ? '' : 's'} and all of their active variants will be affected. ` : ''}Catalog availability will change. Historical orders are preserved, and parent products can be restored from the Archived filter.`
    if (!window.confirm(warning)) return
    try {
      const result = await adminAPI.bulkDeleteProducts({ product_ids: productIds, variant_ids: variantIds })
      if (result.failed) throw new Error('Some selected items could not be archived')
      toast.success(result.message || 'Selected items archived')
      setSelectedRows([])
      await fetchData()
    } catch (error) {
      toast.error(error.response?.data?.detail?.message || error.response?.data?.detail || error.message || 'Bulk archive failed')
    }
  }

  const handleRestore = async (id) => {
    try {
      await adminAPI.restoreProduct(id)
      toast.success('Product restored successfully')
      await fetchData()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to restore product')
    }
  }

  const bulkRestore = async () => {
    const product_ids = selectedRows.filter((key) => key.startsWith('product:')).map((key) => Number(key.split(':')[1]))
    const variant_ids = selectedRows.filter((key) => key.startsWith('variant:')).map((key) => Number(key.split(':')[1]))
    try {
      await adminAPI.bulkRestoreProducts({ product_ids, variant_ids })
      toast.success('Selected items restored')
      setSelectedRows([])
      await fetchData()
    } catch (error) { toast.error(error.response?.data?.detail || 'Bulk restore failed') }
  }

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
        <><div className="stock-filter-tabs">
          <button className={stockFilter === 'all' ? 'active' : ''} onClick={() => setStockFilter('all')}>All ({products.length})</button>
          <button className={stockFilter === 'active' ? 'active' : ''} onClick={() => setStockFilter('active')}>Active ({activeProducts.length})</button>
          <button className={stockFilter === 'archived' ? 'active' : ''} onClick={() => setStockFilter('archived')}>Archived ({archivedProducts.length})</button>
          <button className={stockFilter === 'low' ? 'active' : ''} onClick={() => setStockFilter('low')}>Low Stock ({lowStockProducts.length})</button>
          <button className={stockFilter === 'out' ? 'active' : ''} onClick={() => setStockFilter('out')}>Out of Stock ({outOfStockProducts.length})</button>
        </div><input className="stock-search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search products, variants, or SKU" /></>
      )}

      {isProduct && selectedRows.length > 0 && <div className="stock-bulk-toolbar"><strong>{selectedRows.length} selected</strong><button type="button" className="btn-delete" onClick={bulkArchive}>Archive Selected</button>{stockFilter === 'archived' && <button type="button" className="btn-edit" onClick={bulkRestore}>Restore Selected</button>}<button type="button" className="stock-secondary-button" onClick={() => setSelectedRows([])}>Clear selection</button></div>}

      {loading ? (
        <div className="loading">Loading...</div>
      ) : loadError ? (
        <div className="loading">{loadError}</div>
      ) : (
        <div className="stock-table">
          <table>
            <thead>
              <tr>
                {isProduct && <th><input type="checkbox" aria-label="Select all visible results" checked={allVisibleSelected} onChange={() => setSelectedRows((current) => allVisibleSelected ? current.filter((key) => !visibleKeys.includes(key)) : [...new Set([...current, ...visibleKeys])])} /></th>}
                <th>ID</th>
                <th>Image</th>
                <th>Name</th>
                {isProduct ? <><th>Category</th><th>Stock</th></> : <><th>Description</th><th>Items</th></>}
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ key, item, row, kind }) => {
                return (<tr key={key} className={isProduct ? `stock-row-${getStockState(row)}` : ''}>
                  {isProduct && <td><input type="checkbox" aria-label={`Select ${item.name}${kind === 'variant' ? ` ${row.weight}` : ''}`} checked={selectedRows.includes(key)} onChange={() => toggleRow(key)} /></td>}
                  <td>{row.id}</td>
                  <td>{renderStockThumb(row.image_url ? row : item)}</td>
                  <td>{item.name}{kind === 'variant' ? ` — ${row.weight || 'Default'}` : kind === 'product' && item.variants?.length ? ' — All variants' : ''}</td>
                  {isProduct ? (
                    <>
                      <td>{item.category}</td>
                      <td>{row.stock_qty ?? row.stock}</td>
                    </>
                  ) : (
                    <>
                      <td>{item.description?.substring(0, 50)}{item.description?.length > 50 ? '...' : ''}</td>
                      <td>{Array.isArray(item.items) ? item.items.join(', ') : item.items}</td>
                    </>
                  )}
                  <td>{formatPrice(row.price)}</td>
                  <td>{renderStockStatus(row)}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-edit" onClick={() => handleEdit(item)}>Edit</button>
                      {kind !== 'variant' && (item.is_active === false
                        ? <button className="btn-edit" onClick={() => handleRestore(item.id)}>Restore</button>
                        : <button className="btn-delete" onClick={() => handleDelete(item.id)}>Archive</button>)}
                    </div>
                  </td>
                </tr>)
              })}
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
