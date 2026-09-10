import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, DollarSign, Lock, ShoppingCart, Truck, ShieldCheck, PackageCheck } from 'lucide-react'
import api, { resolveMediaUrl } from '../services/api'
import './HomePage.css'

const heroSlides = [
  {
    headline: 'Quality Foodstuff. Reliable Supply.',
    subtext: 'Fresh groceries, food packs, and everyday essentials delivered with convenience.',
    primary: 'Shop Products',
    primaryTo: '/products',
    secondary: 'View Food Packs',
    secondaryTo: '/products',
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=900&h=650&fit=crop',
  },
  {
    headline: 'Stock Your Home the Easy Way',
    subtext: 'Order rice, garri, beans, oil, noodles, and curated food packs in minutes.',
    primary: 'Start Shopping',
    primaryTo: '/products',
    secondary: 'Learn More',
    secondaryTo: '/contact',
    image: 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=900&h=650&fit=crop',
  },
  {
    headline: 'Fast Orders. Clear Updates.',
    subtext: 'Track your order, upload payment receipts, and receive delivery updates from FoodNova.',
    primary: 'View Products',
    primaryTo: '/products',
    secondary: 'My Orders',
    secondaryTo: '/orders',
    image: 'https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=900&h=650&fit=crop',
  },
]

export default function HomePage() {
  const [activeSlide, setActiveSlide] = useState(0)
  const [managedSlides, setManagedSlides] = useState([])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const slides = managedSlides.length ? managedSlides : heroSlides
  const slide = slides[Math.min(activeSlide, slides.length - 1)]

  useEffect(() => {
    api.get('/announcements/active').then(({ data }) => {
      const items = data?.announcements || data?.data || []
      const banners = items.filter((item) => item.display_type === 'hero_banner').map((item) => ({
        headline: item.title,
        subtext: item.message,
        primary: item.button_text || 'Shop Products',
        primaryTo: item.button_link || '/products',
        secondary: 'View Products',
        secondaryTo: '/products',
        image: resolveMediaUrl(item.image_url),
      }))
      if (banners.length) { setManagedSlides(banners); setActiveSlide(0) }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([api.get('/products?page=1&page_size=8'), api.get('/categories')]).then(([productRes, categoryRes]) => {
      const list = productRes.data?.products || productRes.data?.items || productRes.data?.data || []
      setProducts(Array.isArray(list) ? list : [])
      const cats = categoryRes.data?.categories || categoryRes.data?.data || categoryRes.data || []
      setCategories(Array.isArray(cats) ? cats.filter((c) => c?.is_active !== false) : [])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length)
    }, 5000)

    return () => clearInterval(interval)
  }, [slides.length])

  const goPrevious = () => setActiveSlide((current) => (current - 1 + slides.length) % slides.length)
  const goNext = () => setActiveSlide((current) => (current + 1) % slides.length)

  return (
    <div className="home-page">
      <section className="hero-slider" aria-label="FoodNova highlights">
        <div className="hero-slide">
          <div className="hero-content">
            <p className="hero-kicker">FoodNova marketplace</p>
            <h1>{slide.headline}</h1>
            <p>{slide.subtext}</p>
            <div className="hero-buttons">
              <Link to={slide.primaryTo} className="btn btn-primary">{slide.primary}</Link>
              <Link to={slide.secondaryTo} className="btn btn-secondary">{slide.secondary}</Link>
            </div>
          </div>

          <div className="hero-image">
            <div className="placeholder-image">
              <img
                src={slide.image}
                alt={slide.headline}
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
            </div>
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
              onClick={() => setActiveSlide(index)}
              aria-label={`Show slide ${index + 1}`}
              aria-current={index === activeSlide}
            />
          ))}
        </div>
      </section>

      <section className="features">
        <h2>Why Choose FoodNova?</h2>
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
        <div className="home-section-heading"><p className="hero-kicker">Fresh picks for your kitchen</p><h2>Shop Popular Essentials</h2><Link to="/products">View all products</Link></div>
        <div className="home-product-grid">
          {products.slice(0, 8).map((product) => {
            const available = product.is_available !== false && product.stock_status !== 'out_of_stock'
            return <Link className="home-product-card" to={`/products?search=${encodeURIComponent(product.name || '')}`} key={product.id}>
              <img src={resolveMediaUrl(product.image_url || product.image || '/placeholder.png')} alt={product.name} />
              <span>{product.category || 'Food essentials'}</span><h3>{product.name}</h3><strong>₦{Number(product.price || 0).toLocaleString()}</strong><em>{available ? 'In stock' : 'Out of stock'}</em>
            </Link>
          })}
        </div>
      </section>

      <section className="home-categories"><div className="home-section-heading"><p className="hero-kicker">Browse with ease</p><h2>Shop by Category</h2></div><div className="category-card-grid">{categories.slice(0, 6).map((category) => <Link key={category.id || category.name} to={`/products?category=${encodeURIComponent(category.name)}`} className="category-card"><h3>{category.name}</h3><span>Explore selection →</span></Link>)}</div></section>

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
