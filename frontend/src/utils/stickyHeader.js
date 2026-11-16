export const observeStickyHeader = ({ header, sentinel, onScrollChange,
  Observer = globalThis.IntersectionObserver, Resize = globalThis.ResizeObserver,
  rootStyle = globalThis.document?.documentElement?.style } = {}) => {
  if (!header) return () => {}
  let observer
  let resize
  const previousOffset = rootStyle?.getPropertyValue('--foodnova-header-offset') || ''
  const measure = () => rootStyle?.setProperty('--foodnova-header-offset', `${Math.ceil(header.getBoundingClientRect().height) + 12}px`)
  measure()
  if (typeof Resize === 'function') {
    resize = new Resize(measure)
    resize.observe(header)
  }
  if (typeof Observer === 'function' && sentinel) {
    observer = new Observer(([entry]) => onScrollChange(!entry.isIntersecting), { threshold: 0 })
    observer.observe(sentinel)
  }
  return () => {
    observer?.disconnect()
    resize?.disconnect()
    if (previousOffset) rootStyle?.setProperty('--foodnova-header-offset', previousOffset)
    else rootStyle?.removeProperty('--foodnova-header-offset')
  }
}
