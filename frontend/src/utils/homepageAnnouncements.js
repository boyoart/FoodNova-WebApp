export const tickerDrafts = [
  'Welcome to FoodNova — Quality Foodstuff, Reliable Supply.',
  'Explore FoodNova Food Packs for Everyday Shopping.',
  'Discover Rice, Beans, Garri, Oils and More.',
  'Shop Your Everyday Essentials with FoodNova.',
]

export const safeAnnouncementLink = (value) => {
  const text = String(value || '').trim()
  if (/^\/(?!\/)/.test(text) && !/[\\\s]/.test(text)) return text
  try {
    const url = new URL(text)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
const utcDate = (value) => Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
export const tickerAnnouncements = (rows, now = Date.now()) => rows.filter((item) => {
  if (item.display_type !== 'top_bar' || item.is_active === false || !String(item.message || '').trim()) return false
  if (item.start_date && !(utcDate(item.start_date) <= now)) return false
  if (item.end_date && !(utcDate(item.end_date) > now)) return false
  return true
}).sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || Number(b.id || 0) - Number(a.id || 0))

// Suppress only the visually audited legacy mobile-mockup campaign, wherever hosted.
export const isLegacyHomepagePromotion = (item) => /(?:^|\/)announcement-78637d94fa75434594d783495a18d2c9\.png(?:\?|$)/.test(item.image_url || item.imageUrl || '')
