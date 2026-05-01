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
  if (!item) return '/placeholder.png'
  
  // Try image_url first (backend image field)
  if (item.image_url) return item.image_url
  
  // Fallback to image field
  if (item.image) return item.image
  
  // Fallback to placeholder
  return '/placeholder.png'
}

/**
 * Handle image errors with fallback to placeholder
 * @param {event} e - The error event from img element
 */
export const handleImageError = (e) => {
  e.target.src = '/placeholder.png'
}
