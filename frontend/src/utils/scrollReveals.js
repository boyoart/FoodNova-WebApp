// Base styles stay visible. Animation is an optional enhancement, never a gate.
export const REVEAL_SELECTOR = '.home-combo-packs, .feature-card, .home-section-heading, .home-product-card, .category-card, .home-trust, .cta, .shopping-panel'

export const observeScrollReveals = ({ elements = [], root, Observer = globalThis.IntersectionObserver,
  Mutations = globalThis.MutationObserver,
  media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'), seen = new WeakSet() } = {}) => {
  if (media?.matches || typeof Observer !== 'function') return () => {}
  const running = new Set()
  const registered = new WeakSet()
  let observer
  let mutations
  let stopped = false
  const stop = () => {
    stopped = true
    observer?.disconnect()
    mutations?.disconnect()
    running.forEach((animation) => animation.cancel())
    running.clear()
  }
  try {
    observer = new Observer((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (stopped || !isIntersecting || seen.has(target)) return
        seen.add(target)
        observer.unobserve(target)
        if (media?.matches || typeof target.animate !== 'function') return
        try {
          const animation = target.animate([
            { opacity: .15, transform: 'translateY(22px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ], { duration: 650, delay: (Math.max(0, Array.from(target.parentElement?.children || []).indexOf(target)) % 4) * 65, easing: 'cubic-bezier(.22,.75,.2,1)', fill: 'none' })
          running.add(animation)
          animation.onfinish = animation.oncancel = () => running.delete(animation)
        } catch { /* A failed animation must leave the original content visible. */ }
      })
    }, { threshold: 0, rootMargin: '0px 0px -24px 0px' })
    const register = (element) => {
      if (!stopped && !seen.has(element) && !registered.has(element)) {
        registered.add(element)
        observer.observe(element)
      }
    }
    const discover = () => root?.querySelectorAll(REVEAL_SELECTOR).forEach(register)
    elements.forEach(register)
    discover()
    // Suspense and catalogue responses mount cards after the initial effect.
    if (root && typeof Mutations === 'function') {
      mutations = new Mutations(discover)
      mutations.observe(root, { childList: true, subtree: true })
    }
    media?.addEventListener?.('change', stop)
  } catch { stop() }
  return () => { stop(); media?.removeEventListener?.('change', stop) }
}
