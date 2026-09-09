import { useEffect, useState } from 'react'
import { Minus, Plus, Search, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { categoriesAPI, packsAPI, productsAPI, resolveMediaUrl } from '../services/api'
import { useCartStore } from '../store/cartStore'
import { formatPrice, getImageUrl, handleImageError } from '../utils/formatters'
import toast from 'react-hot-toast'
import {
  buildPaginationItems,
  CATALOG_PAGE_SIZE,
  displayVariantsFor,
  displayedPriceFor,
  galleryImagesFor,
  getPageNumber,
  normalizeStoreItem,
  selectedVariantFor,
  updateCatalogQuery,
} from './productsCatalog'
import './ProductsPage.css'

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'packs' ? 'packs' : 'products'
  const searchTerm = searchParams.get('search') || ''
  const category = activeTab === 'products' ? (searchParams.get('category') || '') : ''
  const page = getPageNumber(searchParams.get('page'))
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 1 })
  const [searchInput, setSearchInput] = useState(searchTerm)
  const [loading, setLoading] = useState(true)
  const [selectedVariants, setSelectedVariants] = useState({})
  const [refreshToken, setRefreshToken] = useState(0)
  const [modalItem, setModalItem] = useState(null)
  const [modalTab, setModalTab] = useState('details')
  const [modalImage, setModalImage] = useState('')
  const [modalQuantity, setModalQuantity] = useState(1)
  const [modalUnavailable, setModalUnavailable] = useState(false)
  const { addItem } = useCartStore()

  useEffect(() => {
    setSearchInput(searchTerm)
  }, [searchTerm])

  useEffect(() => {
    let mounted = true
    categoriesAPI.getAll()
      .then((response) => {
        if (!mounted) return
        const body = response.data
        const data = Array.isArray(body) ? body : (body?.categories || body?.data || [])
        setCategories(data.filter((item) => item?.name))
      })
      .catch((error) => console.error('Failed to load product categories', error))
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const refreshCatalog = () => setRefreshToken((current) => current + 1)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshCatalog()
    }
    window.addEventListener('focus', refreshCatalog)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('focus', refreshCatalog)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const fetchPage = async () => {
      try {
        setLoading(true)
        const params = {
          page,
          page_size: CATALOG_PAGE_SIZE,
          ...(searchTerm ? { search: searchTerm } : {}),
          ...(category ? { category } : {}),
        }
        const response = activeTab === 'products'
          ? await productsAPI.getAll(params)
          : await packsAPI.getAll(params)
        if (!mounted) return
        setItems(response.data.map((item) => normalizeStoreItem(item, activeTab === 'packs' ? 'pack' : 'product')))
        setPagination(response.pagination)
        if (page > response.pagination.total_pages) {
          setSearchParams(updateCatalogQuery(searchParams, { page: response.pagination.total_pages }), { replace: true })
        }
      } catch (error) {
        if (!mounted) return
        toast.error(`Failed to load ${activeTab === 'packs' ? 'food packs' : 'products'}`)
        console.error(error)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchPage()
    return () => { mounted = false }
  }, [activeTab, category, page, refreshToken, searchTerm, searchParams, setSearchParams])

  const changeQuery = (updates, options = {}) => {
    setSearchParams(updateCatalogQuery(searchParams, updates), options)
  }

  const handleAddToCart = (item, options = {}) => {
    const itemType = item.type === 'pack' || item.item_type === 'pack' ? 'pack' : 'product'
    const selected = itemType === 'product'
      ? (options.selectedVariant ?? selectedVariantFor(item, selectedVariants))
      : null
    if (itemType === 'product' && item.variants?.length && !selected) {
      toast.error('Please select an available size')
      return
    }
    const selectedLabel = selected?.weight || selected?.label || ''
    const normalized = normalizeStoreItem({
      ...item,
      ...(selected || {}),
      id: item.id,
      product_id: item.id,
      variant_id: selected?.id,
      variant_weight: selectedLabel,
      sku: selected?.sku || item.sku,
      name: selectedLabel ? `${item.name} - ${selectedLabel}` : item.name,
      cart_key: selected ? `product-${item.id}-${selected.id}` : `${itemType}-${item.id}`,
      quantity: Math.max(1, Number(options.quantity || 1)),
    }, itemType)
    if (normalized.is_out_of_stock || options.unavailable) {
      toast.error('This item is out of stock')
      return
    }
    addItem(normalized)
    toast.success('Added to cart!')
  }

  const handleSearch = (event) => {
    event.preventDefault()
    changeQuery({ search: searchInput, page: 1 })
  }

  const selectCatalogTab = (tab) => {
    changeQuery({ tab, category: '', page: 1 })
  }

  const selectCategory = (event) => {
    changeQuery({ category: event.target.value, page: 1 })
  }

  const openProductModal = async (item) => {
    setModalItem(item)
    setModalTab('details')
    setModalQuantity(1)
    setModalUnavailable(item.is_active === false)
    setModalImage(galleryImagesFor(item)[0] || '')
    try {
      const response = item.type === 'pack'
        ? await packsAPI.getById(item.id)
        : await productsAPI.getById(item.id)
      const body = response.data?.product || response.data?.pack || response.data?.data || response.data
      const fresh = normalizeStoreItem(body, item.type === 'pack' ? 'pack' : 'product')
      setModalItem(fresh)
      setModalUnavailable(fresh.is_active === false)
      setModalImage(galleryImagesFor(fresh)[0] || '')
    } catch (error) {
      if (error?.response?.status === 404) {
        setModalUnavailable(true)
      } else {
        toast.error('Could not refresh product availability')
      }
    }
  }

  const closeProductModal = () => setModalItem(null)

  const selectModalVariant = (variant) => {
    if (!modalItem || !variant.is_available) return
    setSelectedVariants((current) => ({ ...current, [modalItem.id]: variant }))
    if (variant.image_url || variant.image) setModalImage(variant.image_url || variant.image)
  }

  useEffect(() => {
    if (!modalItem) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeProductModal()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [modalItem])

  const goToPage = (nextPage) => {
    if (nextPage < 1 || nextPage > pagination.total_pages || nextPage === page) return
    changeQuery({ page: nextPage })
  }

  const pageItems = buildPaginationItems(page, pagination.total_pages)
  const modalVariants = modalItem?.type === 'product' ? displayVariantsFor(modalItem) : []
  const modalSelectedVariant = modalItem?.type === 'product'
    ? selectedVariantFor(modalItem, selectedVariants)
    : null
  const modalImages = galleryImagesFor(modalItem)
  const modalGallery = modalImages.length ? modalImages : ['/placeholder.png']
  const modalOutOfStock = Boolean(modalItem) && (
    modalUnavailable
    || modalItem.is_available === false
    || (modalItem.type === 'product' && modalItem.variants?.length > 0 && !modalSelectedVariant)
  )

  return (
    <div className="products-page">
      <header className="products-header">
        <div>
          <p className="products-eyebrow">FoodNova Market</p>
          <h1>Our Products</h1>
        </div>
        <form onSubmit={handleSearch} className="search-form" role="search">
          <Search size={20} aria-hidden="true" />
          <label className="sr-only" htmlFor="catalog-search">Search the catalog</label>
          <input
            id="catalog-search"
            type="search"
            placeholder="Search products..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button type="submit">Search</button>
        </form>
      </header>

      <div className="catalog-controls">
        <div className="products-tabs" role="tablist" aria-label="Catalog type">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'products'}
            className={`catalog-tab ${activeTab === 'products' ? 'active' : ''}`}
            onClick={() => selectCatalogTab('products')}
          >
            Products
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'packs'}
            className={`catalog-tab ${activeTab === 'packs' ? 'active' : ''}`}
            onClick={() => selectCatalogTab('packs')}
          >
            Food Packs
          </button>
        </div>
        {activeTab === 'products' && categories.length > 0 && (
          <label className="category-filter">
            <span>Category</span>
            <select value={category} onChange={selectCategory}>
              <option value="">All categories</option>
              {categories.map((item) => <option key={item.id || item.name} value={item.name}>{item.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {loading ? (
        <div className="loading" aria-live="polite">Loading products...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p>No {activeTab === 'packs' ? 'food packs' : 'products'} found</p>
        </div>
      ) : (
        <div className="products-grid">
          {items.map((item) => {
            const purchasableVariants = activeTab === 'products' ? (item.variants || []) : []
            const selected = selectedVariantFor(item, selectedVariants)
            const unavailable = activeTab === 'products'
              ? (purchasableVariants.length ? !selected : item.is_out_of_stock)
              : item.is_out_of_stock
            const cardKey = `${activeTab}-${item.id}`

            return (
              <article
                key={cardKey}
                className="product-card"
                data-testid="product-card"
                tabIndex="0"
                aria-label={`View ${item.name} details`}
                onClick={(event) => {
                  if (!event.target.closest('button, a, input, select')) openProductModal(item)
                }}
                onKeyDown={(event) => {
                  if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
                    event.preventDefault()
                    openProductModal(item)
                  }
                }}
              >
                <div className="product-image">
                  <img src={getImageUrl(item)} alt={item.name} onError={handleImageError} />
                  {unavailable && <div className="out-of-stock">Out of stock</div>}
                </div>
                <div className="product-info">
                  {item.category && <span className="category">{item.category}</span>}
                  <h2>{item.name}</h2>
                  <button type="button" className="product-view-details" onClick={() => openProductModal(item)}>
                    View full details
                  </button>

                  <div className="product-footer">
                    <div className="product-price-status">
                      <span className="price">{formatPrice(displayedPriceFor(item, selectedVariants))}</span>
                      {activeTab === 'products' && (
                        unavailable
                          ? <span className="out-of-stock-text">Out of stock</span>
                          : <span className="in-stock">In stock</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn-add"
                      onClick={() => handleAddToCart(item)}
                      disabled={unavailable}
                    >
                      {unavailable ? 'Out of stock' : 'Add to Cart'}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {modalItem && (
        <div
          className="product-modal-backdrop"
          data-testid="product-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeProductModal()
          }}
        >
          <section
            className="product-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
            data-testid="product-modal"
          >
            <button type="button" className="product-modal-close" onClick={closeProductModal} aria-label="Close product details">
              <X size={22} aria-hidden="true" />
            </button>

            <div className="product-modal-media">
              <div className="product-modal-main-image">
                <img
                  src={resolveMediaUrl(modalImage) || resolveMediaUrl(modalGallery[0])}
                  alt={modalItem.name}
                  onError={handleImageError}
                />
              </div>
              {modalGallery.length > 1 && (
                <div className="product-thumbnails" aria-label={`${modalItem.name} images`}>
                  {modalGallery.map((image, index) => (
                    <button
                      type="button"
                      key={image}
                      aria-label={`Show ${modalItem.name} image ${index + 1}`}
                      aria-pressed={modalImage === image}
                      onClick={() => setModalImage(image)}
                    >
                      <img src={resolveMediaUrl(image)} alt="" onError={handleImageError} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="product-modal-content">
              {modalItem.category && <span className="category">{modalItem.category}</span>}
              <h2 id="product-modal-title">{modalItem.name}</h2>

              <div className="product-modal-tabs" role="tablist" aria-label={`${modalItem.name} information`}>
                <button
                  id="product-modal-details-tab"
                  type="button"
                  role="tab"
                  aria-selected={modalTab === 'details'}
                  aria-controls="product-modal-details"
                  onClick={() => setModalTab('details')}
                >
                  Details
                </button>
                {modalVariants.length > 0 && (
                  <button
                    id="product-modal-sizes-tab"
                    type="button"
                    role="tab"
                    aria-selected={modalTab === 'sizes'}
                    aria-controls="product-modal-sizes"
                    onClick={() => setModalTab('sizes')}
                  >
                    Sizes
                  </button>
                )}
              </div>

              {modalTab === 'details' && (
                <div id="product-modal-details" role="tabpanel" aria-labelledby="product-modal-details-tab" className="product-modal-panel">
                  <p>{modalItem.description || 'Quality FoodNova grocery item prepared for your order.'}</p>
                </div>
              )}
              {modalTab === 'sizes' && modalVariants.length > 0 && (
                <div id="product-modal-sizes" role="tabpanel" aria-labelledby="product-modal-sizes-tab" className="product-modal-panel">
                  <div className="variant-options" aria-label={`${modalItem.name} sizes`}>
                    {modalVariants.map((variant) => (
                      <button
                        type="button"
                        key={variant.id}
                        disabled={!variant.is_available}
                        aria-pressed={modalSelectedVariant?.id === variant.id}
                        className={`variant-option ${modalSelectedVariant?.id === variant.id ? 'selected' : ''}`}
                        onClick={() => selectModalVariant(variant)}
                      >
                        <span>{variant.weight || variant.label}</span>
                        <strong>{formatPrice(variant.price)}</strong>
                        {!variant.is_available && <small>Out of stock</small>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="product-modal-purchase">
                <div>
                  <span className="price">{formatPrice(displayedPriceFor(modalItem, selectedVariants))}</span>
                  {modalOutOfStock
                    ? <span className="out-of-stock-text">Out of stock</span>
                    : <span className="in-stock">In stock</span>}
                </div>
                <div className="product-quantity" aria-label="Quantity selector">
                  <button type="button" aria-label="Decrease quantity" onClick={() => setModalQuantity((current) => Math.max(1, current - 1))} disabled={modalQuantity === 1}>
                    <Minus size={17} aria-hidden="true" />
                  </button>
                  <output aria-live="polite">{modalQuantity}</output>
                  <button type="button" aria-label="Increase quantity" onClick={() => setModalQuantity((current) => Math.min(99, current + 1))}>
                    <Plus size={17} aria-hidden="true" />
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-add product-modal-add"
                  disabled={modalOutOfStock}
                  onClick={() => handleAddToCart(modalItem, {
                    selectedVariant: modalSelectedVariant,
                    quantity: modalQuantity,
                    unavailable: modalOutOfStock,
                  })}
                >
                  {modalOutOfStock ? 'Out of stock' : 'Add to Cart'}
                </button>
              </div>
              {modalUnavailable && <p className="product-modal-unavailable">This product is no longer available in the active catalog.</p>}
            </div>
          </section>
        </div>
      )}

      {!loading && pagination.total_pages > 1 && (
        <nav className="catalog-pagination" aria-label="Product pages">
          <button type="button" onClick={() => goToPage(page - 1)} disabled={page === 1}>
            <span className="desktop-label">Previous</span><span className="mobile-label">Prev</span>
          </button>
          <div className="pagination-pages">
            {pageItems.map((item) => typeof item === 'number' ? (
              <button
                type="button"
                key={item}
                className={item === page ? 'current' : ''}
                aria-current={item === page ? 'page' : undefined}
                aria-label={`Page ${item}`}
                onClick={() => goToPage(item)}
              >
                {item}
              </button>
            ) : <span key={item} aria-hidden="true">…</span>)}
          </div>
          <span className="pagination-summary" aria-live="polite">{page} / {pagination.total_pages}</span>
          <button type="button" onClick={() => goToPage(page + 1)} disabled={page === pagination.total_pages}>Next</button>
        </nav>
      )}
    </div>
  )
}
