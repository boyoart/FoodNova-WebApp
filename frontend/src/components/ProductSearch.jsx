import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { productsAPI, resolveMediaUrl } from '../services/api'
import { nextSuggestionIndex, searchOptions } from '../utils/shopping'
import { formatPrice, handleImageError } from '../utils/formatters'
import './ProductSearch.css'

export default function ProductSearch({ value, onChange, onSubmit, onNavigate, mobileOpen }) {
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [status, setStatus] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    let current = true
    setOptions([]); setActive(-1)
    if (value.trim().length < 2) { setStatus(''); return undefined }
    const timer = setTimeout(async () => {
      setStatus('Searching…')
      try {
        const response = await productsAPI.getAll({ search: value.trim(), page: 1, page_size: 6 })
        if (current) { const next = searchOptions(response.data); setOptions(next); setStatus(next.length ? '' : 'No suggestions. Press Enter to search the catalogue.') }
      } catch { if (current) setStatus('Suggestions unavailable. Press Enter to search the catalogue.') }
    }, 250)
    return () => { current = false; clearTimeout(timer) }
  }, [value])
  const choose = (option) => { setOpen(false); navigate(option.to); onNavigate() }
  return <form className={`navbar-search smart-search${mobileOpen ? ' is-mobile-open' : ''}`} role="search" onSubmit={(event) => { setOpen(false); onSubmit(event) }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <label className="sr-only" htmlFor="navbar-product-search">Search products</label>
    <input id="navbar-product-search" value={value} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open && (options.length > 0 || Boolean(status))} aria-controls="product-search-options" aria-activedescendant={active >= 0 ? `suggestion-${options[active]?.id}` : undefined}
      placeholder="Search products or categories…" onChange={(event) => { onChange(event.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { setOpen(false); setActive(-1) }
        if (options.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); setActive((index) => nextSuggestionIndex(index, event.key, options.length)) }
        if (event.key === 'Enter' && open && active >= 0 && options[active]) { event.preventDefault(); choose(options[active]) }
      }} />
    <button type="submit" aria-label="Search products"><Search size={18} /></button>
    {open && (options.length > 0 || status) && <div className="search-suggestions">
      <ul id="product-search-options" role="listbox" aria-label="Product and category suggestions">{options.map((option, index) => <li key={option.id} role="presentation">
        <button type="button" role="option" data-sound={option.kind === 'product' ? 'select' : undefined} id={`suggestion-${option.id}`} aria-selected={active === index} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
          {option.kind === 'product' && <img src={resolveMediaUrl(option.image_url || '/uploads/catalog/foodnova-placeholder.svg')} alt="" width="42" height="42" onError={handleImageError} />}
          <span><strong>{option.name}</strong><small>{option.kind === 'category' ? 'Browse category' : option.category}</small></span>
          {option.kind === 'product' && <b>{option.price != null && Number.isFinite(Number(option.price)) ? formatPrice(option.price) : 'View price'}</b>}
        </button></li>)}</ul>
      {status && <p role="status">{status}</p>}
    </div>}
  </form>
}
