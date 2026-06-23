import { resolveMediaUrl } from '../services/api'

export const DEFAULT_PLACEHOLDER_IMAGE = '/placeholder.svg'

/**
 * Utility functions for FoodNova frontend
 */

/**
 * Format price with Nigerian Naira currency
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string (e.g., "₦8,500.00")
 */
export const formatPrice = (amount) => {
  if (!amount && amount !== 0) return '₦0.00'
  const num = Number(amount)
  return `₦${num.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Get image URL with fallback
 * @param {object} item - Product or pack item
 * @returns {string} Image URL or placeholder
 */
export const getImageUrl = (item) => {
  if (!item) return DEFAULT_PLACEHOLDER_IMAGE
  
  // Try image_url first (backend image field)
  if (item.image_url) return resolveMediaUrl(item.image_url)

  if (item.effective_image_url) return resolveMediaUrl(item.effective_image_url)

  if (item.category_image_url) return resolveMediaUrl(item.category_image_url)
  
  // Fallback to image field
  if (item.image) return resolveMediaUrl(item.image)
  
  // Fallback to placeholder
  return resolveMediaUrl(item.default_image_url || DEFAULT_PLACEHOLDER_IMAGE)
}

/**
 * Handle image errors with fallback to placeholder
 * @param {event} e - The error event from img element
 */
export const handleImageError = (e) => {
  const target = e.target
  const current = target.getAttribute('src') || ''
  const categoryFallback = target.dataset.categoryImage || ''
  const defaultFallback = target.dataset.defaultImage || DEFAULT_PLACEHOLDER_IMAGE

  if (categoryFallback && current !== categoryFallback) {
    target.src = categoryFallback
    return
  }

  if (current !== defaultFallback) {
    target.src = defaultFallback
  }
}

export const getImageFallbackAttrs = (item = {}) => ({
  'data-category-image': item.category_image_url ? resolveMediaUrl(item.category_image_url) : '',
  'data-default-image': resolveMediaUrl(item.default_image_url || DEFAULT_PLACEHOLDER_IMAGE),
})
