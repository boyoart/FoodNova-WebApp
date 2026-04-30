import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('user')) || null,
  admin: JSON.parse(localStorage.getItem('admin')) || null,
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
}))
