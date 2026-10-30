const FEATURED_PACK_NAMES = ['Starter Pack', 'Gift Combo', 'Full Package']

export const selectFeaturedComboPacks = (packs = []) => {
  const activePacks = packs.filter((pack) => pack?.is_active !== false && pack?.active !== false)
  return FEATURED_PACK_NAMES
    .map((name) => activePacks.find((pack) => String(pack?.name || '').trim().toLowerCase() === name.toLowerCase()))
    .filter(Boolean)
}

export const hasConfirmedFivePercentDiscount = (pack = {}) => (
  Number(pack.discount_percentage ?? pack.discount_percent) === 5
)
