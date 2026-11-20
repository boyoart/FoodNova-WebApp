import { galleryImagesFor, normalizeStoreItem } from './productsCatalog.js'
import { productLink, revalidateSelection, sameBasket } from '../utils/shopping.js'

export const isActive = (item) => item?.id != null && Boolean(item?.name) && item.is_active !== false && item.active !== false
export const photographicImage = (item) => galleryImagesFor(item).find((url) => /\.(?:png|jpe?g|webp|avif)(?:\?|$)/i.test(url)) || ''
// Delivery-only optimization of genuine product/pack photographs; never touch receipt media.
export const optimizeCataloguePhoto = (url) => /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/v\d+\/foodnova\/(?:products|packs)\//.test(url)
  ? url.replace('/image/upload/', '/image/upload/f_auto,q_auto,c_limit,w_1000/') : url
export const catalogueRows = (body, key) => {
  const data = body?.data ?? body
  if (Array.isArray(data)) return data
  return [data?.[key], data?.items, data?.data].find(Array.isArray) || []
}

export const curatedProducts = (products) => {
  const priorities = ['foreign rice', 'honey beans', 'garri ijebu', 'palm oil', 'vegetable oil', 'grounded egusi']
  const priority = (product) => {
    const position = priorities.indexOf(product.name.trim().toLowerCase())
    return position < 0 ? priorities.length : position
  }
  return products.filter(isActive).filter(photographicImage).sort((a, b) => priority(a) - priority(b)).slice(0, 8)
}

export const itemPrice = (raw, variantId) => {
  const item = normalizeStoreItem(raw)
  const variants = item.variants
  const variant = variants.find((v) => String(v.id) === String(variantId)) || variants.find((v) => v.is_available) || variants[0]
  const original = raw?.variants?.find((v) => String(v.id) === String(variant?.id))
  const value = variant ? original?.price ?? original?.unit_price : raw?.price
  return { variant, price: value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null }
}

export const categoryPhotos = (category, products) => {
  const clean = (value) => String(value || '').trim().toLowerCase()
  const matches = products.filter((p) => isActive(p) && (
    (p.category_id != null && String(p.category_id) === String(category.id)) ||
    [p.category, p.category_name].some((name) => name && clean(name) === clean(category.name))))
  return [...new Set([photographicImage(category), ...matches.map(photographicImage)].filter(Boolean))]
}
export const categoryPhoto = (category, products) => categoryPhotos(category, products)[0] || ''
export const packLink = (pack) => `/products?tab=packs&search=${encodeURIComponent(pack.name)}`
export { productLink }

// Reuse the existing validation/cart contract. Price changes require a second review.
export const reviewCinematicPurchase = async ({ product, variantId, type = 'product', services }) => {
  const fresh = await revalidateSelection([{ id: product.id, type, variantId, quantity: 1 }], services)
  const oldPrice = type === 'pack' ? product.price : itemPrice(product, variantId).price
  const previous = [{ ...fresh[0], price: oldPrice }]
  return { line: fresh[0], changed: oldPrice == null || !sameBasket(previous, fresh) }
}
