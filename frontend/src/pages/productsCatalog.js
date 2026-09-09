export const CATALOG_PAGE_SIZE = 10

const contractAvailability = (item) => {
  if (item?.is_active === false || item?.active === false) return false
  if (item?.is_available !== undefined) return item.is_available === true
  if (item?.stock_status !== undefined) return String(item.stock_status).toLowerCase() === 'in_stock'
  if (item?.is_out_of_stock !== undefined) return item.is_out_of_stock !== true
  if (item?.stock_qty !== undefined || item?.stock !== undefined) {
    return Number(item.stock_qty ?? item.stock ?? 0) > 0
  }
  return true
}

export const normalizeVariant = (variant = {}) => {
  const available = contractAvailability(variant)
  return {
    ...variant,
    price: Number(variant.price ?? variant.unit_price ?? 0),
    is_available: available,
    stock_status: available ? 'in_stock' : 'out_of_stock',
    is_out_of_stock: !available,
  }
}

export const normalizeStoreItem = (item, itemType = 'product') => {
  const name = item?.name || item?.product_name || 'FoodNova Item'
  const price = Number(item?.price || item?.unit_price || 0)
  const variants = (item?.variants || [])
    .filter((variant) => variant?.is_active !== false && variant?.active !== false)
    .map(normalizeVariant)
  const available = itemType === 'product' && variants.length
    ? item?.is_active !== false && item?.active !== false && variants.some((variant) => variant.is_available)
    : contractAvailability(item)

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
    variants,
    item_type: item?.item_type || item?.type || itemType,
    type: item?.type || item?.item_type || itemType,
    quantity: item?.quantity || item?.qty || 1,
    qty: item?.quantity || item?.qty || 1,
    image: item?.image || item?.image_url || '/placeholder.png',
    image_url: item?.image_url || item?.image || '/placeholder.png',
    category: item?.category || item?.category_name || '',
  }
}

export const galleryImagesFor = (item) => {
  const images = [
    item?.image_url,
    item?.image,
    item?.effective_image_url,
    ...(item?.variants || []).map((variant) => variant?.image_url || variant?.image),
  ]
  const isPlaceholder = (image) => {
    const value = String(image || '').trim().toLowerCase()
    return !value || value === '/placeholder.png' || value.includes('placeholder') || value.includes('default-product')
  }
  return [...new Set(images.map((image) => String(image || '').trim()).filter((image) => !isPlaceholder(image)))]
}

export const selectedVariantFor = (item, selections = {}) => {
  const variants = item?.variants || []
  const selected = selections[item?.id]
  const currentSelection = selected && variants.find((variant) => variant.id === selected.id)
  if (currentSelection?.is_available) return currentSelection
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
