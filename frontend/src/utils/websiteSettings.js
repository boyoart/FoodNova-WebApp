const SETTINGS_KEY = 'foodnova_website_settings'
export const WEBSITE_SETTINGS_EVENT = 'foodnova-website-settings-updated'

const defaultLaunchDate = () => {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  date.setHours(9, 0, 0, 0)
  return date.toISOString()
}

export const defaultWebsiteSettings = {
  comingSoonEnabled: false,
  splashEnabled: true,
  launchDate: defaultLaunchDate(),
  headline: 'Something Fresh Is Coming',
  subtext: 'FoodNova is preparing a premium grocery experience for your neighborhood.',
  homepageBanners: '',
  featuredPacks: '',
  homepageAnnouncement: '',
  subscribers: [],
  subscriberEmail: '',
}

export function getWebsiteSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return { ...defaultWebsiteSettings, ...saved }
  } catch {
    return defaultWebsiteSettings
  }
}

export function saveWebsiteSettings(nextSettings) {
  const settings = { ...getWebsiteSettings(), ...nextSettings }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  window.dispatchEvent(new CustomEvent(WEBSITE_SETTINGS_EVENT, { detail: settings }))
  return settings
}

export function isAdminPath(pathname = window.location.pathname) {
  return pathname.startsWith('/admin')
}

export function isPublicBlockedByComingSoon(pathname = window.location.pathname) {
  const settings = getWebsiteSettings()
  if (!settings.comingSoonEnabled) return false
  if (isAdminPath(pathname)) return false
  if (pathname === '/coming-soon') return false
  return true
}
