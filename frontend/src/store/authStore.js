import { create } from 'zustand'
import { clearActiveSessionOnly, updateLastActivity } from '../utils/sessionManager'

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
    localStorage.setItem('foodnova_token', token)
    localStorage.setItem('user', JSON.stringify(user))
    localStorage.setItem('foodnova_user', JSON.stringify(user))
    updateLastActivity()
    set({ user, isAuthenticated: true })
  },

  adminLogin: (admin, token) => {
    localStorage.setItem('admin_token', token)
    localStorage.setItem('admin', JSON.stringify(admin))
    localStorage.setItem('foodnova_admin', JSON.stringify(admin))
    updateLastActivity()
    set({ admin, isAdmin: true })
  },

  logout: () => {
    clearActiveSessionOnly()
    set({ user: null, admin: null, isAuthenticated: false, isAdmin: false })
  },

  updateUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user))
    localStorage.setItem('foodnova_user', JSON.stringify(user))
    set({ user })
  },

  hasAdminPermission: (permission) => {
    const admin = safeJsonParse('admin', null)
    return admin?.admin_role === 'super_admin' || admin?.permissions?.includes(permission)
  },
}))
