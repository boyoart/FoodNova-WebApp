import { useEffect, useRef } from 'react'

// All markup stays visible without this optional enhancement. No autoplay or scroll hijack.
export function useCinematicMotion(root, revision) {
  useEffect(() => {
    let cancelled = false
    let media
    let resize
    let refreshFrame = 0
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!reduced || reduced.matches) return undefined
    Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([engine, plugin]) => {
      if (cancelled || !root.current) return
      const gsap = engine.gsap
      const ScrollTrigger = plugin.ScrollTrigger
      gsap.registerPlugin(ScrollTrigger)
      media = gsap.matchMedia()
      media.add({ desktop: '(min-width: 900px)', mobile: '(max-width: 899px)', reduce: '(prefers-reduced-motion: reduce)' }, (context) => {
        if (context.conditions.reduce) return
        const desktop = context.conditions.desktop
        const select = gsap.utils.selector(root.current)
        select('[data-cinema-assembly]').forEach((scene) => {
          const layers = scene.querySelectorAll('[data-cinema-layer]')
          const timeline = gsap.timeline({ scrollTrigger: { trigger: scene, start: 'top 15%', end: desktop ? 'bottom bottom' : 'bottom 20%', scrub: 0.6 } })
          layers.forEach((layer, index) => {
            const direction = index % 2 ? 1 : -1
            timeline.fromTo(layer, { xPercent: desktop ? direction * 28 : direction * 3, yPercent: desktop ? (index - 2) * 22 : 3, rotation: desktop ? direction * 14 : direction * 2, scale: desktop ? 0.72 : 0.97 },
              { xPercent: 0, yPercent: 0, rotation: 0, scale: 1, ease: 'none', duration: 1 }, index * 0.05)
          })
        })
        select('[data-cinema-reveal]').forEach((section) => {
          gsap.fromTo(section, { y: desktop ? 38 : 16 }, { y: 0, ease: 'none',
            scrollTrigger: { trigger: section, start: 'top 96%', end: 'top 62%', scrub: true } })
        })
        select('[data-cinema-scene]').forEach((scene) => {
          const image = scene.querySelector('[data-cinema-product]')
          if (!image) return
          gsap.fromTo(image, { yPercent: desktop ? 12 : 3, rotation: desktop ? -7 : -2, scale: desktop ? 0.88 : 0.98 },
            { yPercent: desktop ? -12 : -3, rotation: desktop ? 6 : 2, scale: desktop ? 1.06 : 1.01, ease: 'none',
              scrollTrigger: { trigger: scene, start: 'top bottom', end: 'bottom top', scrub: 0.45, invalidateOnRefresh: true } })
        })
        const hero = select('.cinema-hero')[0]
        if (hero) gsap.to(select('.cinema-hero-visual'), { yPercent: desktop ? 14 : 3, ease: 'none',
          scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } })
      }, root.current)
      // Image boxes have explicit dimensions. Coalesce actual layout changes instead
      // of forcing a complete scroll-layout refresh for every repeated product image.
      const refresh = () => {
        if (cancelled || refreshFrame) return
        refreshFrame = requestAnimationFrame(() => {
          refreshFrame = 0
          if (!cancelled) ScrollTrigger.refresh()
        })
      }
      if (typeof ResizeObserver === 'function') { resize = new ResizeObserver(refresh); resize.observe(root.current) }
      document.fonts?.ready.then(refresh)
      refresh()
    }).catch(() => { media?.revert(); resize?.disconnect(); cancelAnimationFrame(refreshFrame) /* Static layout remains usable. */ })
    return () => {
      cancelled = true
      resize?.disconnect()
      cancelAnimationFrame(refreshFrame)
      media?.revert()
    }
  }, [root, revision])
}

export function CinematicSection({ children, className = '', ...props }) {
  const ref = useRef(null)
  return <section ref={ref} data-cinema-reveal className={className} {...props}>{children}</section>
}
