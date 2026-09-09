import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { categoriesAPI, packsAPI, productsAPI } from '../services/api'
import { useCartStore } from '../store/cartStore'
import { formatPrice, getImageUrl, handleImageError } from '../utils/formatters'
import toast from 'react-hot-toast'
import {
  buildPaginationItems,
  CATALOG_PAGE_SIZE,
  displayVariantsFor,
  displayedPriceFor,
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
  const [openSections, setOpenSections] = useState({})
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
  }, [activeTab, category, page, searchTerm, searchParams, setSearchParams])

  const changeQuery = (updates, options = {}) => {
    setSearchParams(updateCatalogQuery(searchParams, updates), options)
  }

  const handleAddToCart = (item) => {
    const selected = activeTab === 'products' ? selectedVariantFor(item, selectedVariants) : null
    if (activeTab === 'products' && item.variants?.length && !selected) {
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
      cart_key: selected ? `product-${item.id}-${selected.id}` : `${activeTab}-${item.id}`,
    }, activeTab === 'packs' ? 'pack' : 'product')
    if (normalized.is_out_of_stock) {
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

  const toggleSection = (cardKey, section) => {
    setOpenSections((current) => ({ ...current, [cardKey]: current[cardKey] === section ? '' : section }))
  }

  const goToPage = (nextPage) => {
    if (nextPage < 1 || nextPage > pagination.total_pages || nextPage === page) return
    changeQuery({ page: nextPage })
  }

  const pageItems = buildPaginationItems(page, pagination.total_pages)

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
            const variants = activeTab === 'products' ? displayVariantsFor(item) : []
            const selected = selectedVariantFor(item, selectedVariants)
            const unavailable = activeTab === 'products'
              ? (purchasableVariants.length ? !selected : item.is_out_of_stock)
              : item.is_out_of_stock
            const cardKey = `${activeTab}-${item.id}`
            const openSection = openSections[cardKey] || ''
            const detailsId = `${cardKey}-details`
            const sizesId = `${cardKey}-sizes`

            return (
              <article key={cardKey} className="product-card" data-testid="product-card">
                <div className="product-image">
                  <img src={getImageUrl(item)} alt={item.name} onError={handleImageError} />
                  {unavailable && <div className="out-of-stock">Out of stock</div>}
                </div>
                <div className="product-info">
                  {item.category && <span className="category">{item.category}</span>}
                  <h2>{item.name}</h2>

                  <div className="product-info-tabs" role="tablist" aria-label={`${item.name} information`}>
                    <button
                      id={`${detailsId}-tab`}
                      type="button"
                      role="tab"
                      aria-selected={openSection === 'details'}
                      aria-controls={detailsId}
                      onClick={() => toggleSection(cardKey, 'details')}
                    >
                      Details
                    </button>
                    {variants.length > 0 && (
                      <button
                        id={`${sizesId}-tab`}
                        type="button"
                        role="tab"
                        aria-selected={openSection === 'sizes'}
                        aria-controls={sizesId}
                        onClick={() => toggleSection(cardKey, 'sizes')}
                      >
                        Sizes
                      </button>
                    )}
                  </div>

                  {openSection === 'details' && (
                    <div id={detailsId} role="tabpanel" aria-labelledby={`${detailsId}-tab`} className="product-tab-panel">
                      <p>{item.description || 'Quality FoodNova grocery item prepared for your order.'}</p>
                    </div>
                  )}
                  {openSection === 'sizes' && variants.length > 0 && (
                    <div id={sizesId} role="tabpanel" aria-labelledby={`${sizesId}-tab`} className="product-tab-panel">
                      <div className="variant-options" aria-label={`${item.name} sizes`}>
                        {variants.map((variant) => (
                          <button
                            type="button"
                            key={variant.id}
                            disabled={!variant.is_available}
                            aria-pressed={selected?.id === variant.id}
                            className={`variant-option ${selected?.id === variant.id ? 'selected' : ''}`}
                            onClick={() => setSelectedVariants((current) => ({ ...current, [item.id]: variant }))}
                          >
                            <span>{variant.weight || variant.label}</span>
                            <strong>{formatPrice(variant.price)}</strong>
                            {!variant.is_available && <small>Out of stock</small>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

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
