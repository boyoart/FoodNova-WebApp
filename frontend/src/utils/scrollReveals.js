// Base styles stay visible. Animation is an optional enhancement, never a gate.
export const observeScrollReveals = ({ elements = [], Observer = globalThis.IntersectionObserver,
  media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'), seen = new WeakSet() } = {}) => {
  if (media?.matches || typeof Observer !== 'function') return () => {}
  const running = new Set()
  let observer
  const stop = () => {
    observer?.disconnect()
    running.forEach((animation) => animation.cancel())
    running.clear()
  }
  try {
    observer = new Observer((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting || seen.has(target)) return
        seen.add(target)
        observer.unobserve(target)
        if (media?.matches || typeof target.animate !== 'function') return
        try {
          const animation = target.animate([
            { opacity: .35, transform: 'translateY(18px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ], { duration: 560, delay: (elements.indexOf(target) % 4) * 65, easing: 'cubic-bezier(.22,.75,.2,1)', fill: 'none' })
          running.add(animation)
          animation.onfinish = animation.oncancel = () => running.delete(animation)
        } catch { /* A failed animation must leave the original content visible. */ }
      })
    }, { threshold: .08, rootMargin: '0px 0px -16px 0px' })
    elements.forEach((element) => { if (!seen.has(element)) observer.observe(element) })
    media?.addEventListener?.('change', stop)
  } catch { stop() }
  return () => { stop(); media?.removeEventListener?.('change', stop) }
}
