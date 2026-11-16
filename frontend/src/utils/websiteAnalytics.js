export const PUBLIC_ANALYTICS_PATHS = new Set(['/', '/products', '/cart', '/checkout', '/app', '/contact', '/privacy', '/terms'])
export const readReportMetric = (data, name, report = 'totals') => {
  const entry = data?.reports?.[report]
  if (entry?.status !== 'available' || !Array.isArray(entry.rows)) return null
  if (!entry.rows.length) return 0
  const value = entry.rows[0]?.[name]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
const KEY = 'foodnova_analytics_consent_v1'
const MAX_AGE = 180 * 86400000

export const analyticsItems = (items = []) => items.slice(0, 50).flatMap((item) => {
  const id = Number(item.product_id || item.id)
  const price = Number(item.price ?? item.unit_price)
  const quantity = Number(item.quantity ?? item.qty ?? 1)
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1) return []
  return [{ item_id: `${item.type === 'pack' || item.item_type === 'pack' ? 'pack' : 'product'}-${id}`, price, quantity,
    ...(Number.isSafeInteger(Number(item.variant_id)) ? { item_variant: String(item.variant_id) } : {}) }]
})

export function createAnalytics({ measurementId = '', win = globalThis.window, doc = globalThis.document, storage, now = Date.now } = {}) {
  const enabled = /^G-[A-Z0-9]+$/.test(measurementId)
  let consent = 'unknown', initialized = false, lastPage = '', lastSearch = '', checkoutSeen = false, lastItem = '', excluded = false
  const reportedOrders = new Set()
  try {
    storage ||= win?.localStorage
    const saved = JSON.parse(storage?.getItem(KEY) || 'null')
    if (saved && now() - saved.at < MAX_AGE && ['granted', 'denied'].includes(saved.value)) consent = saved.value
  } catch { /* No storage is required to shop. */ }
  const allowed = () => enabled && !excluded && consent === 'granted' && !win?.navigator?.globalPrivacyControl
    && !win?.location?.pathname?.startsWith('/admin')
  const command = (...args) => { if (win?.gtag) win.gtag(...args) }
  const initialize = () => {
    if (!allowed() || initialized || !doc || !win) return false
    // One application-owned script, basic consent mode: no Google request before opt-in.
    win.dataLayer ||= []
    win.gtag ||= function () { win.dataLayer.push(arguments) }
    command('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
    command('consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
    win[`ga-disable-${measurementId}`] = false
    command('js', new Date(now()))
    command('config', measurementId, { send_page_view: false, allow_google_signals: false,
      allow_ad_personalization_signals: false, ignore_referrer: false,
      page_location: `${win.location.origin}/`, page_referrer: '', page_title: 'FoodNova' })
    if (!doc.querySelector('script[data-foodnova-ga4]')) {
      const script = doc.createElement('script')
      script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
      script.dataset.foodnovaGa4 = 'true'; doc.head.appendChild(script)
    }
    initialized = true
    return true
  }
  const event = (name, params) => {
    try { if (allowed()) { initialize(); command('event', name, params) } } catch { /* Analytics never blocks commerce. */ }
  }
  return {
    enabled, getConsent: () => consent, allowed, initialize,
    exclude(value) {
      excluded = Boolean(value)
      if (win) win[`ga-disable-${measurementId}`] = !allowed()
    },
    setConsent(value) {
      consent = value === 'granted' ? 'granted' : 'denied'
      try { storage?.setItem(KEY, JSON.stringify({ value: consent, at: now() })) } catch { /* Optional preference storage. */ }
      if (!allowed()) {
        if (win) win[`ga-disable-${measurementId}`] = true
        command('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
        for (const cookie of (doc?.cookie || '').split(';')) {
          const name = cookie.split('=')[0].trim()
          if (!/^_ga(?:_|$)/.test(name)) continue
          const host = win?.location?.hostname || ''
          for (const domain of ['', ...host.split('.').map((_, i, parts) => parts.slice(i).join('.'))]) {
            doc.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}; SameSite=Lax`
          }
        }
        lastPage = ''; lastSearch = ''; lastItem = ''; checkoutSeen = false; reportedOrders.clear()
      } else {
        if (win) win[`ga-disable-${measurementId}`] = false
        command('consent', 'update', { analytics_storage: 'granted' })
        initialize()
      }
    },
    page(path) {
      if (!allowed()) return
      if (!PUBLIC_ANALYTICS_PATHS.has(path)) { lastPage = ''; lastItem = ''; lastSearch = ''; return }
      if (lastPage === path) return
      lastPage = path
      checkoutSeen = false; lastItem = ''; lastSearch = ''
      let referrer = ''
      try { const url = new URL(doc.referrer); if (url.origin !== win.location.origin) referrer = url.origin + '/' } catch { /* No referrer. */ }
      event('page_view', { page_location: `${win.location.origin}${path}`, page_referrer: referrer, page_title: path === '/' ? 'FoodNova Home' : `FoodNova ${path.slice(1)}` })
    },
    search(key) {
      if (!key) { lastSearch = ''; return }
      if (!allowed() || lastSearch === key) return
      lastSearch = key
      // Free-text queries may contain email/phone/address data. Never forward them.
      event('search', { search_term: 'catalogue search' })
    },
    commerce(name, items) {
      if (!allowed()) return
      if (!['view_item', 'add_to_cart', 'begin_checkout'].includes(name)) return
      if (name === 'begin_checkout' && checkoutSeen) return
      const safe = analyticsItems(items)
      if (name === 'begin_checkout' && safe.length) checkoutSeen = true
      if (safe.length) event(name, { currency: 'NGN', value: safe.reduce((sum, item) => sum + item.price * item.quantity, 0), items: safe })
    },
    viewItem(item) {
      if (!item) { lastItem = ''; return }
      if (!allowed()) return
      const items = analyticsItems([item])
      const key = items[0]?.item_id
      if (!key || lastItem === key) return
      lastItem = key
      event('view_item', { currency: 'NGN', value: items[0].price, items })
    },
    async purchases(orders, post) {
      if (!allowed() || !initialized) return
      const get = (field) => new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 1500)
        command('get', measurementId, field, (value) => { clearTimeout(timer); resolve(value) })
      })
      const candidates = orders.filter((order) => ['payment_confirmed', 'confirmed', 'paid', 'successful', 'success'].includes(order.payment_status) && !reportedOrders.has(order.id))
      if (!candidates.length) return
      const [client, session] = await Promise.all([get('client_id'), get('session_id')])
      if (!/^\d{1,20}\.\d{1,20}$/.test(client || '') || !/^\d{1,20}$/.test(String(session || '')) || !allowed()) return
      for (const order of candidates) {
        if (!allowed() || reportedOrders.has(order.id)) continue
        reportedOrders.add(order.id)
        try { await post(order.id, { consent: true, client_id: client, session_id: String(session) }) }
        catch { /* Backend owns durable deduplication. Retry on a later page visit only. */ }
      }
    },
  }
}

export const websiteAnalytics = createAnalytics({ measurementId: import.meta.env?.VITE_GA4_MEASUREMENT_ID || '' })
