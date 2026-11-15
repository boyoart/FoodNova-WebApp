export const isComboPackInventoryError = (error, items = []) => {
  const includesPack = items.some((item) => (item?.item_type || item?.type) === 'pack')
  if (!includesPack) return false

  const detail = error?.response?.data?.detail ?? error?.detail
  const message = typeof detail === 'string'
    ? detail
    : Array.isArray(detail)
      ? detail.map((item) => typeof item === 'string' ? item : item?.msg || '').join(' ')
      : detail?.message || detail?.msg || ''

  return /combo pack|component|inventory unit|currently unavailable|not available until/i.test(message)
}