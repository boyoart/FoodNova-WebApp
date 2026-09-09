export const CATALOG_PAGE_SIZE = 10

export const normalizeStoreItem = (item, itemType = 'product') => {
  const name = item?.name || item?.product_name || 'FoodNova Item'
  const price = Number(item?.price || item?.unit_price || 0)
  const available = item?.is_available !== false
    && item?.stock_status !== 'out_of_stock'
    && item?.is_out_of_stock !== true

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

export const selectedVariantFor = (item, selections = {}) => {
  const variants = item?.variants || []
  const selected = selections[item?.id]
  if (selected && variants.some((variant) => variant.id === selected.id && variant.is_available)) {
    return selected
  }
  return variants.find((variant) => variant.is_available) || null
}

export const displayVariantsFor = (item) => (
  (item?.variants || []).filter((variant) => String(variant?.weight || '').trim())
)

export const displayedPriceFor = (item, selections = {}) => (
  selectedVariantFor(item, selections)?.price ?? item?.price ?? 0
)

export const getPageNumber = (value) => {
  const page = Number.parseInt(value || '1', 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

export const buildPaginationItems = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1])
  const ordered = [...pages].filter((page) => page > 0 && page <= totalPages).sort((a, b) => a - b)
  const result = []
  ordered.forEach((page, index) => {
    if (index > 0 && page - ordered[index - 1] > 1) result.push(`ellipsis-${page}`)
    result.push(page)
  })
  return result
}

export const updateCatalogQuery = (current, updates) => {
  const next = new URLSearchParams(current)
  Object.entries(updates).forEach(([key, value]) => {
    if (value === undefined) return
    const normalized = String(value ?? '').trim()
    if (!normalized || (key === 'page' && normalized === '1') || (key === 'tab' && normalized === 'products')) {
      next.delete(key)
    } else {
      next.set(key, normalized)
    }
  })
  return next
}
