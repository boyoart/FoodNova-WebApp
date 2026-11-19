import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUpRight, ArrowRight, ShoppingBag, ShieldCheck, PackageCheck, Truck } from 'lucide-react'
import toast from 'react-hot-toast'
import api, { packsAPI, productsAPI, resolveMediaUrl } from '../services/api'
import { useCartStore } from '../store/cartStore'
import { formatPrice } from '../utils/formatters'
import { formatPackContents, normalizeStoreItem, packEnquiryUrl } from './productsCatalog'
import { normalizeHeroBanner } from './homepageHero'
import { unwrapItem } from '../utils/shopping'
import { CinematicSection, useCinematicMotion } from '../components/CinematicMotion'
import { catalogueRows, curatedProducts, photographicImage, optimizeCataloguePhoto, categoryPhoto, isActive, itemPrice, packLink, productLink, reviewCinematicPurchase } from './cinematicCatalogue'
import './CinematicHomePage.css'

const ShoppingWidgets = lazy(() => import('../components/ShoppingWidgets'))
const services = { getProduct: productsAPI.getById, getPack: packsAPI.getById }

function Photo({ item, eager = false, priority = 'auto', className = '', ...props }) {
  const [failedSource, setFailedSource] = useState('')
  const [originalSource, setOriginalSource] = useState('')
  const source = photographicImage(item)
  const original = resolveMediaUrl(source)
  const requested = originalSource === source ? original : optimizeCataloguePhoto(original)
  if (!source || source === failedSource) return <div className={`cinema-photo-unavailable ${className}`} role="img" aria-label={`${item.name}: photograph unavailable`}>{item.name}</div>
  return <img className={className} src={requested} alt={item.name} width="720" height="720" loading={eager ? 'eager' : 'lazy'} {...{ fetchpriority: priority }} decoding="async" onError={() => requested !== original ? setOriginalSource(source) : setFailedSource(source)} {...props} />
}

function Price({ value }) {
  return value == null ? <span>See current price</span> : <span>{formatPrice(value)}</span>
}

function ProductCard({ raw, index }) {
  const [product, setProduct] = useState(raw)
  const [variantId, setVariantId] = useState(() => itemPrice(raw).variant?.id)
  const [busy, setBusy] = useState(false)
  const addItem = useCartStore((state) => state.addItem)
  const { variant, price } = itemPrice(product, variantId)
  const normalized = normalizeStoreItem(product)
  const available = normalized.is_available && (!variant || variant.is_available)
  const add = async () => {
    setBusy(true)
    try {
      const { line, changed } = await reviewCinematicPurchase({ product, variantId: variant?.id, services })
      if (changed) {
        setProduct(unwrapItem(await productsAPI.getById(product.id)))
        toast('The price changed. Please review the current price and add again.')
        return
      }
      addItem(line)
      toast.success(`${product.name} added to cart`)
    } catch (error) { toast.error(error.message || 'Please check the current catalogue.') }
    finally { setBusy(false) }
  }
  return <article className="cinema-product-card" data-cinema-reveal>
    <Link className="cinema-product-photo" to={productLink(product.id)} aria-label={`View ${product.name}`}><span className="cinema-product-number">{String(index + 1).padStart(2, '0')}</span><Photo item={product} /><ArrowUpRight size={20} /></Link>
    <div className="cinema-product-meta"><span>{product.category || product.category_name}</span><h3><Link to={productLink(product.id)}>{product.name}</Link></h3></div>
    {normalized.variants.length > 0 && <label className="cinema-size">Size<select value={variant?.id || ''} onChange={(event) => setVariantId(event.target.value)} disabled={busy} aria-label={`Size for ${product.name}`}>
      {normalized.variants.map((v) => <option value={v.id} key={v.id}>{v.weight || v.label || product.stock_unit || 'Standard'}{v.is_available ? '' : ' — unavailable'}</option>)}</select></label>}
    <div className="cinema-product-buy"><strong><Price value={price} /></strong><button type="button" onClick={add} disabled={busy || !available || price == null} aria-label={`Add ${product.name} to cart`}><ShoppingBag size={17} />{busy ? 'Checking…' : available ? 'Add' : 'Unavailable'}</button></div>
  </article>
}

function PackCard({ raw, index }) {
  const [pack, setPack] = useState(raw)
  const [busy, setBusy] = useState(false)
  const addItem = useCartStore((state) => state.addItem)
  const normalized = normalizeStoreItem(pack, 'pack')
  const add = async () => {
    setBusy(true)
    try {
      const { line, changed } = await reviewCinematicPurchase({ product: pack, type: 'pack', services })
      if (changed) { setPack(unwrapItem(await packsAPI.getById(pack.id))); toast('Review the updated pack price, then add again.'); return }
      addItem(line); toast.success(`${pack.name} added to cart`)
    } catch { toast('Please enquire with FoodNova about this pack.') }
    finally { setBusy(false) }
  }
  return <article className={`cinema-pack cinema-pack-${index % 3}`} data-cinema-reveal>
    <div className="cinema-pack-heading"><span>FOODNOVA / {String(index + 1).padStart(2, '0')}</span><ArrowUpRight size={22} /></div>
    <Link to={packLink(pack)} className="cinema-pack-photo" aria-label={`Explore ${pack.name}`}><Photo item={pack} /></Link>
    <h3>{pack.name}</h3><p>{pack.description}</p>
    {pack.components?.length > 0 && <details><summary>What’s inside</summary><p>{formatPackContents(pack.components)}</p></details>}
    <div className="cinema-pack-bottom"><strong><Price value={pack.price != null && Number.isFinite(Number(pack.price)) ? Number(pack.price) : null} /></strong>
      {normalized.is_available && pack.price != null ? <button className="cinema-round-action" type="button" disabled={busy} onClick={add} aria-label={`Add ${pack.name} to cart`}>{busy ? '…' : <ShoppingBag size={21} />}</button>
        : <a className="cinema-round-action" href={packEnquiryUrl(pack.name)} target="_blank" rel="noreferrer" aria-label={`Enquire about ${pack.name}`}><ArrowUpRight size={22} /></a>}</div>
  </article>
}

export default function CinematicHomePage() {
  const root = useRef(null)
  const [data, setData] = useState({ products: [], packs: [], categories: [], campaigns: [] })
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState([])
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const paths = ['/products?page=1&page_size=100', '/packs?page=1&page_size=100', '/categories', '/announcements/active']
    Promise.allSettled(paths.map((path) => api.get(path, { signal: controller.signal }))).then((results) => {
      if (controller.signal.aborted) return
      const keys = ['products', 'packs', 'categories', 'announcements']
      const lists = results.map((result, i) => result.status === 'fulfilled' ? catalogueRows(result.value, keys[i]) : [])
      setData({ products: lists[0].filter(isActive), packs: lists[1].filter(isActive), categories: lists[2].filter(isActive), campaigns: lists[3].filter((item) => item.display_type === 'hero_banner') })
      setErrors(results.flatMap((result, i) => result.status === 'rejected' && i < 3 ? [keys[i]] : []))
      setLoading(false)
    })
    return () => controller.abort()
  }, [refresh])
  const products = curatedProducts(data.products)
  const hero = products[0] || data.packs.find(photographicImage)
  const stories = products.slice(0, 3)
  useCinematicMotion(root, data)
  return <div className="cinematic-homepage" ref={root}>
    <div className="cinema-preview-note">Cinematic preview <span>Explore the new FoodNova experience</span><Link to="/">Current homepage <ArrowUpRight size={14} /></Link></div>
    <section className="cinema-hero" aria-labelledby="cinema-title">
      <div className="cinema-hero-grain" aria-hidden="true" />
      <div className="cinema-hero-copy"><p className="cinema-eyebrow"><span /> YOUR EVERYDAY, WELL STOCKED.</p><h1 id="cinema-title">Good Food.<br /><em>Better Value.</em></h1>
        <p className="cinema-hero-description">The food you love. The essentials you count on. Affordable food shopping for your home in Nigeria.</p>
        <div className="cinema-actions"><Link to="/products" className="cinema-button cinema-button-gold">Shop Now <ArrowUpRight size={20} /></Link><a href="#cinema-packs" className="cinema-text-link">Explore Food Packs <ArrowRight size={18} /></a></div>
        <div className="cinema-hero-footnote"><PackageCheck size={18} /><span>Quality foodstuff. Reliable supply.</span></div>
      </div>
      <div className="cinema-hero-visual" data-cinema-scene>{hero ? <>
        <div className="cinema-orbit" aria-hidden="true" /><span className="cinema-visual-caption">THE PANTRY EDIT</span>
        <Link to={hero === products[0] ? productLink(hero.id) : packLink(hero)} className="cinema-hero-main"><Photo item={hero} eager priority="high" data-cinema-product /></Link>
        {products.slice(1, 3).map((product, index) => <Link className={`cinema-hero-satellite satellite-${index}`} key={product.id} to={productLink(product.id)} aria-label={`Shop ${product.name}`}><Photo item={product} eager /><span>{product.name}</span></Link>)}
        <div className="cinema-featured-tag"><span>IN THE SPOTLIGHT</span><strong>{hero.name}</strong><span>{hero === products[0] ? itemPrice(hero).variant?.weight : 'FoodNova Food Pack'} <b><Price value={hero === products[0] ? itemPrice(hero).price : hero.price} /></b></span></div>
      </> : <div className="cinema-hero-empty"><span>FOODNOVA</span><p>{loading ? 'Your pantry selection is loading…' : 'Explore the current catalogue for your kitchen essentials.'}</p><Link to="/products">Browse foodstuff <ArrowUpRight size={22} /></Link></div>}</div>
      <a href="#cinema-story" className="cinema-scroll-cue">A LITTLE SCROLL. A LOT TO DISCOVER. <ArrowDown size={17} /></a>
    </section>
    <div className="cinema-values-strip"><span>EVERYDAY ESSENTIALS</span><i aria-hidden="true">✳</i><span>THOUGHTFULLY PACKED</span><i aria-hidden="true">✳</i><span>FOODNOVA VALUE</span></div>
    {errors.length > 0 && <div className="cinema-api-notice" role="status">Some catalogue sections could not load. <button type="button" onClick={() => { setLoading(true); setRefresh((value) => value + 1) }}>Try again</button> or <Link to="/products">visit the catalogue</Link>.</div>}
    {products.length > 1 && <section className="cinema-assembly" data-cinema-assembly aria-labelledby="cinema-assembly-title"><div className="cinema-assembly-sticky"><div className="cinema-assembly-copy"><p className="cinema-eyebrow">THE INGREDIENTS OF A GOOD EVERYDAY</p><h2 id="cinema-assembly-title">A pantry.<br /><em>Full of possibility.</em></h2><p>Explore the essentials that bring your kitchen together.</p><Link className="cinema-text-link" to="/products">Build your pantry <ArrowUpRight size={20} /></Link></div><div className="cinema-assembly-art">{products.slice(0, 5).map((product, index) => <Link key={product.id} className={`cinema-assembly-layer assembly-layer-${index}`} data-cinema-layer to={productLink(product.id)} aria-label={`Explore ${product.name}`}><Photo item={product} /><span>{product.name} <b><Price value={itemPrice(product).price} /></b></span></Link>)}</div><span className="cinema-assembly-scroll">SCROLL TO BRING IT TOGETHER <ArrowDown size={16} /></span></div></section>}
    {data.campaigns.map((item) => {
      const campaign = normalizeHeroBanner(item, { headline: 'From the FoodNova pantry', primary: 'Shop FoodNova', primaryTo: '/products' })
      return <CinematicSection className="cinema-campaign" key={item.id}><div><p className="cinema-eyebrow">{campaign.eyebrow || 'FROM FOODNOVA'}</p><h2>{campaign.headline} {campaign.highlight && <em>{campaign.highlight}</em>}</h2><p>{campaign.subtext}</p><Link to={campaign.primaryTo} className="cinema-button cinema-button-dark">{campaign.primary} <ArrowUpRight size={19} /></Link></div>{campaign.promotionalImage && <img src={resolveMediaUrl(campaign.promotionalImage)} alt={campaign.headline} width="700" height="600" loading="lazy" decoding="async" />}</CinematicSection>
    })}
    <section className="cinema-story" id="cinema-story" aria-label="The FoodNova pantry story">
      <CinematicSection className="cinema-story-intro"><p className="cinema-eyebrow">SMALL ESSENTIALS. BIG POSSIBILITIES.</p><h2>A good meal<br />starts <em>right here.</em></h2><p>From the everyday favourites to the ingredients that make it yours. Meet your next kitchen essentials.</p></CinematicSection>
      {stories.map((product, index) => <section className={`cinema-story-scene story-tone-${index}`} data-cinema-scene key={product.id} aria-labelledby={`story-${product.id}`}>
        <div className="cinema-story-sticky"><div className="cinema-story-text"><span className="cinema-scene-index">0{index + 1} / THE PANTRY EDIT</span><p className="cinema-eyebrow">{product.category || product.category_name}</p><h2 id={`story-${product.id}`}>{product.name}<span className="cinema-title-dot">.</span></h2><p>{product.description}</p><div className="cinema-story-price"><Price value={itemPrice(product).price} />{itemPrice(product).variant?.weight && <span>/ {itemPrice(product).variant.weight}</span>}</div><Link to={productLink(product.id)} className="cinema-button cinema-button-dark">Explore {product.name} <ArrowUpRight size={20} /></Link></div>
          <div className="cinema-story-art"><span className="cinema-story-word" aria-hidden="true">{product.name.split(' ').slice(-1)}</span><div className="cinema-story-disc" aria-hidden="true" /><Photo item={product} data-cinema-product /><span className="cinema-story-art-label">FOODNOVA / KITCHEN ESSENTIALS</span></div></div>
      </section>)}
    </section>
    <CinematicSection className="cinema-packs-section" id="cinema-packs"><div className="cinema-section-heading"><div><p className="cinema-eyebrow">LESS PLANNING. MORE LIVING.</p><h2>A whole lot<br />of <em>good.</em></h2></div><div><p>Discover our Food Packs. Your favourite essentials, brought together.</p><Link to="/products?tab=packs" className="cinema-text-link">Explore every pack <ArrowUpRight size={19} /></Link></div></div>
      <div className="cinema-pack-grid">{data.packs.map((pack, index) => <PackCard raw={pack} index={index} key={pack.id} />)}</div>
      {!loading && !data.packs.length && <p>Food Packs are currently unavailable to load. <Link to="/products?tab=packs">Visit Food Packs</Link>.</p>}
    </CinematicSection>
    <CinematicSection className="cinema-categories"><div className="cinema-section-heading"><div><p className="cinema-eyebrow">FIND YOUR EVERYDAY</p><h2>What’s on<br /><em>your list?</em></h2></div><Link to="/products" className="cinema-text-link">Shop the pantry <ArrowUpRight size={19} /></Link></div>
      <div className="cinema-category-grid">{data.categories.map((category, index) => {
        const image = categoryPhoto(category, data.products)
        return <Link to={`/products?category=${encodeURIComponent(category.name)}`} key={category.id} className="cinema-category" data-cinema-reveal><div className="cinema-category-image">{image ? <img src={resolveMediaUrl(image)} alt={`Food selection in ${category.name}`} width="400" height="400" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} /> : <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>}</div><h3>{category.name}</h3><ArrowUpRight size={21} /></Link>
      })}</div>
    </CinematicSection>
    <CinematicSection className="cinema-featured"><div className="cinema-section-heading"><div><p className="cinema-eyebrow">MAKE ROOM IN YOUR PANTRY</p><h2>Everyday <em>favourites.</em></h2></div><Link to="/products" className="cinema-text-link">Shop all essentials <ArrowUpRight size={19} /></Link></div><div className="cinema-product-grid">{products.map((product, index) => <ProductCard raw={product} index={index} key={product.id} />)}</div>
      {loading && <p role="status">Loading the current FoodNova catalogue…</p>}
    </CinematicSection>
    <CinematicSection className="cinema-shopping"><Suspense fallback={<p>Loading shopping tools…</p>}><ShoppingWidgets products={data.products} /></Suspense></CinematicSection>
    <CinematicSection className="cinema-trust"><div><ShieldCheck /><h3>Shop with confidence</h3><p>Review your items and current prices before checkout.</p></div><div><PackageCheck /><h3>Your kitchen, your choice</h3><p>Choose the products, sizes and Food Packs that suit you.</p></div><div><Truck /><h3>From our shop to your door</h3><p>Check delivery options for your address at checkout.</p></div></CinematicSection>
    <CinematicSection className="cinema-finale"><p className="cinema-eyebrow">GOOD FOOD. BETTER VALUE.</p><h2>Your next great meal<br />starts with <em>FoodNova.</em></h2><Link to="/products" className="cinema-button cinema-button-gold">Let’s stock your kitchen <ArrowUpRight size={21} /></Link><p>Quality Foodstuff. Reliable Supply.</p></CinematicSection>
  </div>
}
