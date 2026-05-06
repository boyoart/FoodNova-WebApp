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

export const useAuthStore = create((set) => ({
  user: safeJsonParse('user', null),
  admin: safeJsonParse('admin', null),
  isAuthenticated: !!localStorage.getItem('token'),
  isAdmin: !!localStorage.getItem('admin_token'),

  login: (user, token) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, isAuthenticated: true })
  },

  adminLogin: (admin, token) => {
    localStorage.setItem('admin_token', token)
    localStorage.setItem('admin', JSON.stringify(admin))
    set({ admin, isAdmin: true })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin')
    set({ user: null, admin: null, isAuthenticated: false, isAdmin: false })
  },

  updateUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user))
    set({ user })
  },

  hasAdminPermission: (permission) => {
    const admin = safeJsonParse('admin', null)
    return admin?.admin_role === 'super_admin' || admin?.permissions?.includes(permission)
  },
}))
