import { create } from 'zustand'

const safeJsonParse = (key, fallback) => {
  try {
    const value = localStorage.getItem(key)
    if (!value || value === 'undefined' || value === 'null') return fallback
    return JSON.parse(value)
  } catch (error) {
    console.warn(`Invalid localStorage value for ${key}. Resetting it.`, error)
    localStorage.removeItem(key)
    return fallback
  }
}

export const useCartStore = create((set, get) => ({
  items: safeJsonParse('cart', []),

  addItem: (product) => {
    const items = get().items
    const productType = product.type || product.item_type || 'product'
    const existingItem = items.find(item => item.id === product.id && (item.type || item.item_type || 'product') === productType)
    const requestedQty = Number(product.quantity || 1)
    const availableStock = Number(product.stock_qty ?? product.stock ?? 999)

    if (productType !== 'pack' && availableStock <= 0) {
      return
    }

    let newItems
    if (existingItem) {
      newItems = items.map(item =>
        item.id === product.id && (item.type || item.item_type || 'product') === productType
          ? { ...item, quantity: Math.min(Number(item.quantity || 1) + requestedQty, availableStock) }
          : item
      )
    } else {
      newItems = [...items, { ...product, quantity: product.quantity || 1 }]
    }

    localStorage.setItem('cart', JSON.stringify(newItems))
    set({ items: newItems })
  },

  removeItem: (productId) => {
    const items = get().items.filter(item => item.id !== productId)
    localStorage.setItem('cart', JSON.stringify(items))
    set({ items })
  },

  updateQuantity: (productId, quantity) => {
    const items = get().items.map(item =>
      item.id === productId ? { ...item, quantity } : item
    ).filter(item => item.quantity > 0)

    localStorage.setItem('cart', JSON.stringify(items))
    set({ items })
  },

  clearCart: () => {
    localStorage.removeItem('cart')
    set({ items: [] })
  },

  getTotalPrice: () => {
    return get().items.reduce((total, item) => total + (Number(item.price || item.unit_price || 0) * Number(item.quantity || item.qty || 1)), 0)
  },

  getTotalItems: () => {
    return get().items.reduce((total, item) => total + Number(item.quantity || item.qty || 1), 0)
  },
}))
