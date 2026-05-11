import { App as CapacitorApp } from '@capacitor/app'

export const CUSTOMER_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000
export const ADMIN_TIMEOUT_MS = 12 * 60 * 60 * 1000
export const LAST_ACTIVITY_KEY = 'foodnova_last_activity'
export const SESSION_EXPIRED_EVENT = 'foodnova-session-expired'

let watcherInterval: ReturnType<typeof window.setInterval> | null = null
let appStateHandle: { remove: () => Promise<void> } | null = null

const hasCustomerSession = () => Boolean(localStorage.getItem('token'))
const hasAdminSession = () => Boolean(localStorage.getItem('admin_token'))
const hasActiveSession = () => hasCustomerSession() || hasAdminSession()

const getActiveRole = () => {
  if (hasAdminSession()) return 'admin'
  if (hasCustomerSession()) return 'customer'
  return ''
}

export const updateLastActivity = () => {
  if (!hasActiveSession()) return
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()))
}

export const isSessionExpired = () => {
  const role = getActiveRole()
  if (!role) return false

  const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0)
  if (!lastActivity) {
    updateLastActivity()
    return false
  }

  const timeout = role === 'admin' ? ADMIN_TIMEOUT_MS : CUSTOMER_TIMEOUT_MS
  return Date.now() - lastActivity > timeout
}

export const clearActiveSessionOnly = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('foodnova_token')
  localStorage.removeItem('user')
  localStorage.removeItem('admin_token')
  localStorage.removeItem('admin')
  localStorage.removeItem(LAST_ACTIVITY_KEY)
}

export const enforceSessionTimeout = () => {
  if (!isSessionExpired()) return false

  const role = getActiveRole()
  clearActiveSessionOnly()
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { role } }))
  return true
}

const handleActivity = () => {
  updateLastActivity()
}

export const startSessionWatcher = () => {
  stopSessionWatcher()

  window.addEventListener('click', handleActivity)
  window.addEventListener('touchstart', handleActivity)
  window.addEventListener('keydown', handleActivity)
  window.addEventListener('scroll', handleActivity)
  window.addEventListener('focus', enforceSessionTimeout)

  enforceSessionTimeout()
  watcherInterval = window.setInterval(enforceSessionTimeout, 60000)

  CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) enforceSessionTimeout()
  }).then((handle) => {
    appStateHandle = handle
  }).catch(() => {
    appStateHandle = null
  })
}

export const stopSessionWatcher = () => {
  window.removeEventListener('click', handleActivity)
  window.removeEventListener('touchstart', handleActivity)
  window.removeEventListener('keydown', handleActivity)
  window.removeEventListener('scroll', handleActivity)
  window.removeEventListener('focus', enforceSessionTimeout)

  if (watcherInterval) {
    window.clearInterval(watcherInterval)
    watcherInterval = null
  }

  if (appStateHandle) {
    appStateHandle.remove().catch(() => null)
    appStateHandle = null
  }
}
