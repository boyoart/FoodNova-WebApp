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
    const existingItem = items.find(item => item.id === product.id)

    let newItems
    if (existingItem) {
      newItems = items.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + (product.quantity || 1) }
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
