// Legacy image-only CMS banners sometimes use punctuation to satisfy required fields.
export const heroText = (value, fallback) => {
  const text = typeof value === 'string' ? value.trim() : ''
  return /[\p{L}\p{N}]/u.test(text) ? text : fallback
}

export const normalizeHeroBanner = (banner, fallback) => {
  const headline = heroText(banner.title, '')
  return {
    id: `campaign-${banner.id || banner.slug || fallback.id}`,
    eyebrow: fallback.eyebrow,
    headline: headline || fallback.headline,
    highlight: headline ? '' : fallback.highlight,
    subtext: heroText(banner.message, fallback.subtext),
    primary: heroText(banner.button_text, fallback.primary),
    primaryTo: banner.button_link?.trim() || fallback.primaryTo,
    promotionalImage: banner.image_url?.trim() || fallback.promotionalImage,
    productRefs: fallback.productRefs,
  }
}
