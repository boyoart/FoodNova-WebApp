import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, DollarSign, Lock, ShoppingCart, Truck, ShieldCheck, PackageCheck } from 'lucide-react'
import api, { resolveMediaUrl } from '../services/api'
import './HomePage.css'

const heroSlides = [
  {
    id: 'everyday-staples',
    eyebrow: 'Everyday essentials',
    headline: 'Stock Up on',
    highlight: 'Everyday Staples',
    subtext: 'Rice, beans, garri and the essentials your kitchen depends on.',
    primary: 'Shop Essentials',
    primaryTo: '/products?category=Food%20Staples',
    productRefs: [{ id: 6, name: 'Foreign Rice' }, { id: 7, name: 'Honey Beans' }, { id: 8, name: 'Garri Ijebu' }],
  },
  {
    id: 'quick-meals',
    eyebrow: 'Quick & easy',
    headline: 'Make Every Meal',
    highlight: 'Simple & Delicious',
    subtext: 'Stock up on pasta, noodles and cooking essentials for convenient everyday meals.',
    primary: 'Shop Quick Meals',
    primaryTo: '/products?category=Pasta%20%26%20Noodles',
    productRefs: [{ id: 9, name: 'Spaghetti' }, { id: 12, name: 'Noodles' }, { id: 10, name: 'Tomato Paste' }],
  },
  {
    id: 'cooking-essentials',
    eyebrow: 'Cooking essentials',
    headline: 'Everything You Need',
    highlight: 'to Bring Flavour Home',
    subtext: 'Cooking oils and trusted seasonings for meals your family will enjoy.',
    primary: 'Explore Cooking Essentials',
    primaryTo: '/products?category=Cooking%20Ingredients',
    productRefs: [{ id: 24, name: 'Palm Oil' }, { id: 15, name: 'Vegetable Oil' }, { id: 28, name: 'Maggi' }],
  },
  {
    id: 'breakfast-favourites',
    eyebrow: 'Start your day right',
    headline: 'Breakfast Favourites',
    highlight: 'for Every Morning',
    subtext: 'Stock your pantry with familiar breakfast essentials for the whole family.',
    primary: 'Shop Breakfast',
    primaryTo: '/products?category=Breakfast',
    productRefs: [{ id: 21, name: 'Milo' }, { id: 25, name: 'Milk' }, { id: 17, name: 'Sugar' }],
  },
  {
    id: 'foodnova-promotion',
    eyebrow: 'Quality foodstuff. Reliable supply.',
    headline: 'The FoodNova',
    highlight: 'Pantry Collection',
    subtext: 'Trusted staples and everyday favourites, thoughtfully selected for your home.',
    primary: 'Shop FoodNova',
    primaryTo: '/products',
    promotionalImage: '/images/foodnova-promotional-hero.jpg',
  },
]

const getProductImage = (product) => {
  const primary = product?.images?.find((image) => image?.is_primary) || product?.images?.[0]
  return resolveMediaUrl(primary?.image_url || product?.effective_image_url || product?.image_url || product?.image || product?.default_image_url || '/uploads/catalog/foodnova-placeholder.svg')
}

const resolveHeroProduct = (products, reference) => products.find((product) => (
  Number(product?.id) === reference.id && product?.name === reference.name && product?.is_active !== false
))

export default function HomePage() {
  const [activeSlide, setActiveSlide] = useState(0)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [isHeroPaused, setIsHeroPaused] = useState(false)
  const resumeTimer = useRef(null)
  const slides = useMemo(() => heroSlides.map((item) => ({
    ...item,
    products: (item.productRefs || []).slice(0, 3).map((reference) => resolveHeroProduct(products, reference)).filter(Boolean),
  })), [products])
  const slide = slides[Math.min(activeSlide, slides.length - 1)]

  useEffect(() => {
    Promise.all([api.get('/products?page=1&page_size=100'), api.get('/categories')]).then(([productRes, categoryRes]) => {
      const list = productRes.data?.products || productRes.data?.items || productRes.data?.data || []
      setProducts(Array.isArray(list) ? list : [])
      const cats = categoryRes.data?.categories || categoryRes.data?.data || categoryRes.data || []
      setCategories(Array.isArray(cats) ? cats.filter((c) => c?.is_active !== false) : [])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (isHeroPaused || document.hidden) return undefined
    const interval = setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length)
    }, 6500)

    return () => clearInterval(interval)
  }, [slides.length, isHeroPaused])

  useEffect(() => {
    const handleVisibility = () => setIsHeroPaused(document.hidden)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => {
    const nextSlide = slides[(activeSlide + 1) % slides.length]
    const nextImages = nextSlide.promotionalImage
      ? [nextSlide.promotionalImage]
      : nextSlide.products.map(getProductImage).filter(Boolean)
    nextImages.forEach((source) => { const preload = new Image(); preload.src = source })
  }, [activeSlide, slides])

  useEffect(() => () => clearTimeout(resumeTimer.current), [])

  const pauseAfterInteraction = () => {
    setIsHeroPaused(true)
    clearTimeout(resumeTimer.current)
    resumeTimer.current = setTimeout(() => setIsHeroPaused(false), 9000)
  }

  const goPrevious = () => { pauseAfterInteraction(); setActiveSlide((current) => (current - 1 + slides.length) % slides.length) }
  const goNext = () => { pauseAfterInteraction(); setActiveSlide((current) => (current + 1) % slides.length) }
  const selectSlide = (index) => { pauseAfterInteraction(); setActiveSlide(index) }

  return (
    <div className="home-page">
      <section className={`hero-slider ${isHeroPaused ? 'is-paused' : ''}`} aria-label="FoodNova highlights" onMouseEnter={() => setIsHeroPaused(true)} onMouseLeave={() => setIsHeroPaused(false)} onFocusCapture={() => setIsHeroPaused(true)} onBlurCapture={() => setIsHeroPaused(false)} onKeyDown={(event) => { if (event.key === 'ArrowLeft') goPrevious(); if (event.key === 'ArrowRight') goNext() }}>
        <div className="hero-slide" key={slide.id || `${slide.headline}-${activeSlide}`}>
          <div className="hero-content">
            <p className="hero-kicker">{slide.eyebrow || 'FoodNova marketplace'}</p>
            <h1>{slide.headline}{slide.highlight && <span>{slide.highlight}</span>}</h1>
            <p>{slide.subtext}</p>
            <div className="hero-buttons">
              <Link to={slide.primaryTo} className="btn btn-primary">{slide.primary}</Link>
              {slide.secondary && <Link to={slide.secondaryTo} className="btn btn-secondary">{slide.secondary}</Link>}
            </div>
          </div>

          <div className={`hero-image ${slide.promotionalImage ? 'hero-promo-image' : 'hero-product-composition'}`}>
            {slide.promotionalImage ? (
              <img src={slide.promotionalImage} alt="FoodNova pantry product collection" loading="lazy" />
            ) : slide.products.map((product, index) => (
              <div className={`hero-product hero-product-${index + 1}`} key={product.id}>
                <img
                  src={getProductImage(product)}
                  alt={product.name}
                  loading={activeSlide === 0 ? 'eager' : 'lazy'}
                  fetchPriority={activeSlide === 0 && index === 0 ? 'high' : 'auto'}
                />
                <span>{product.name}</span>
              </div>
            ))}
          </div>
        </div>

        <button type="button" className="hero-arrow hero-arrow-left" onClick={goPrevious} aria-label="Previous slide">
          <ChevronLeft size={22} />
        </button>
        <button type="button" className="hero-arrow hero-arrow-right" onClick={goNext} aria-label="Next slide">
          <ChevronRight size={22} />
        </button>

        <div className="hero-dots" aria-label="Hero slide controls">
          {slides.map((item, index) => (
            <button
              type="button"
              key={item.headline}
              className={index === activeSlide ? 'active' : ''}
              onClick={() => selectSlide(index)}
              aria-label={`Show slide ${index + 1}`}
              aria-current={index === activeSlide}
            ><span /></button>
          ))}
        </div>
      </section>

      <section className="features">
        <div className="features-grid">
          <div className="feature-card">
            <ShoppingCart size={32} />
            <h3>Easy Ordering</h3>
            <p>Simple, intuitive interface makes ordering a breeze.</p>
          </div>
          <div className="feature-card">
            <Truck size={32} />
            <h3>Fast Delivery</h3>
            <p>Quick delivery to your doorstep with real-time tracking.</p>
          </div>
          <div className="feature-card">
            <DollarSign size={32} />
            <h3>Flexible Payment</h3>
            <p>Multiple payment options including secure bank transfers.</p>
          </div>
          <div className="feature-card">
            <Lock size={32} />
            <h3>Secure & Safe</h3>
            <p>Your data and transactions are protected with encryption.</p>
          </div>
        </div>
      </section>

      <section className="home-merchandising">
        <div className="home-section-heading"><div><p className="hero-kicker">Fresh picks for your kitchen</p><h2>Shop Popular Essentials</h2></div><Link to="/products">View all products <span aria-hidden="true">→</span></Link></div>
        <div className="home-product-grid">
          {products.slice(0, 8).map((product) => {
            const available = product.is_available !== false && product.stock_status !== 'out_of_stock'
            return <article className="home-product-card" key={product.id}>
              <Link to={`/products?search=${encodeURIComponent(product.name || '')}`} className="home-product-image"><img src={getProductImage(product)} alt={product.name} /></Link>
              <span className="home-product-category">{product.category || 'Food essentials'}</span><h3>{product.name}</h3><div className="home-product-meta"><strong>₦{Number(product.price || 0).toLocaleString()}</strong><em className={available ? 'available' : 'unavailable'}>{available ? 'In stock' : 'Out of stock'}</em></div><Link className="home-product-action" to={`/products?search=${encodeURIComponent(product.name || '')}`}>{available ? 'View Product' : 'View details'}</Link>
            </article>
          })}
        </div>
      </section>

      <section className="home-categories"><div className="home-section-heading"><div><p className="hero-kicker">Explore with ease</p><h2>Shop by Category</h2></div><Link to="/products">View all categories <span aria-hidden="true">→</span></Link></div><div className="category-card-grid">{categories.slice(0, 8).map((category) => <Link key={category.id || category.name} to={`/products?category=${encodeURIComponent(category.name)}`} className="category-card">{category.image_url && <span className="category-card-image"><img src={resolveMediaUrl(category.image_url)} alt="" /></span>}<h3>{category.name}</h3><span>Explore selection →</span></Link>)}</div></section>

      <section className="home-trust"><div><ShieldCheck size={26}/><h3>Secure Ordering</h3><p>Your checkout is protected.</p></div><div><PackageCheck size={26}/><h3>Quality Products</h3><p>Everyday essentials, carefully selected.</p></div><div><Truck size={26}/><h3>Reliable Delivery</h3><p>Delivery or pickup where supported.</p></div></section>

      <section className="cta">
        <h2>Ready to Restock with FoodNova?</h2>
        <p>Shop fresh staples, food packs, and everyday essentials with clear order updates.</p>
        <Link to="/products" className="btn btn-primary btn-large">
          Browse Products Now
        </Link>
      </section>
    </div>
  )
}
