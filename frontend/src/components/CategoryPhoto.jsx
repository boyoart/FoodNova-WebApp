import { useState } from 'react'
import { resolveMediaUrl } from '../services/api'
import BrandLogo from './BrandLogo'

export default function CategoryPhoto({ category, candidates }) {
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const source = candidates[index]
  return <div className="cinema-category-image" data-image-state={loaded ? 'loaded' : source ? 'loading' : 'fallback'}>
    {!loaded && <div className="cinema-category-fallback" role="img" aria-label={`FoodNova selection for ${category.name}`}><BrandLogo decorative /><small>THE FOODNOVA PANTRY</small></div>}
    {source && <img src={resolveMediaUrl(source)} alt={`Food selection in ${category.name}`} width="400" height="400" loading="lazy" decoding="async" onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setIndex((value) => value + 1) }} />}
  </div>
}
