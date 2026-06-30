import { create } from 'zustand'
import { clearActiveSessionOnly, updateLastActivity } from '../utils/sessionManager'
import { canUseAdminTools } from '../utils/accountRoles'

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
  user: safeJsonParse('user', null) || safeJsonParse('foodnova_user', null),
  admin: safeJsonParse('admin', null) || safeJsonParse('foodnova_admin', null),
  isAuthenticated: !!(localStorage.getItem('token') || localStorage.getItem('foodnova_token')),
  isAdmin: !!localStorage.getItem('admin_token'),

  login: (user, token) => {
    localStorage.setItem('token', token)
    localStorage.setItem('foodnova_token', token)
    localStorage.setItem('user', JSON.stringify(user))
    localStorage.setItem('foodnova_user', JSON.stringify(user))
    if (canUseAdminTools(user)) {
      localStorage.setItem('admin_token', token)
      localStorage.setItem('admin', JSON.stringify(user))
      localStorage.setItem('foodnova_admin', JSON.stringify(user))
    } else {
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin')
      localStorage.removeItem('foodnova_admin')
    }
    updateLastActivity()
    set({
      user,
      admin: canUseAdminTools(user) ? user : null,
      isAuthenticated: true,
      isAdmin: canUseAdminTools(user),
    })
  },

  adminLogin: (admin, token) => {
    localStorage.setItem('admin_token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('foodnova_token', token)
    localStorage.setItem('admin', JSON.stringify(admin))
    localStorage.setItem('foodnova_admin', JSON.stringify(admin))
    updateLastActivity()
    set({ user: admin, admin, isAuthenticated: true, isAdmin: true })
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
