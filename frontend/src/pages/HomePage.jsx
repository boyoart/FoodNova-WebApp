import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCircle2, ChevronLeft, ChevronRight, FileText, Headphones, Heart, Lock, MapPin, MessageCircle, PackageCheck, ShoppingCart, Sparkles, Star, Truck, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { announcementsAPI, packsAPI, productsAPI, resolveMediaUrl } from '../services/api'
import { useCartStore } from '../store/cartStore'
import { buildWhatsAppLink } from '../utils/contactUtils'
import { formatPrice, getImageUrl, handleImageError } from '../utils/formatters'
import './HomePage.css'

const heroSlides = [
  {
    headline: 'Fresh Groceries Delivered Fast',
    subtext: 'Premium foodstuff, everyday groceries, and curated food packs delivered with clear updates from cart to doorstep.',
    primary: 'Shop Now',
    primaryTo: '/products',
    secondary: 'Explore Packs',
    secondaryTo: '/products',
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=900&h=650&fit=crop',
  },
  {
    headline: 'Premium Food Packs For Every Home',
    subtext: 'Choose balanced restock packs for busy families, students, and bulk household planning.',
    primary: 'Shop Now',
    primaryTo: '/products',
    secondary: 'Explore Packs',
    secondaryTo: '/products',
    image: 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=900&h=650&fit=crop',
  },
  {
    headline: 'Farm Fresh Essentials',
    subtext: 'Trusted sourcing, reliable stock visibility, and a polished grocery experience built for modern homes.',
    primary: 'Shop Now',
    primaryTo: '/products',
    secondary: 'Explore Packs',
    secondaryTo: '/products',
    image: 'https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=900&h=650&fit=crop',
  },
]

function AnnouncementAction({ announcement, className = '' }) {
  if (!announcement?.button_text || !announcement?.button_link) return null
  const link = announcement.button_link
  if (link.startsWith('/')) {
    return <Link to={link} className={className}>{announcement.button_text}</Link>
  }
  return <a href={link} className={className} target="_blank" rel="noopener noreferrer">{announcement.button_text}</a>
}

function AnnouncementTopBar({ announcement }) {
  return (
    <section className={`homepage-announcement-top ${announcement.theme || 'green'}`}>
      <div>
        <strong>{announcement.title}</strong>
        <span>{announcement.message}</span>
      </div>
      <AnnouncementAction announcement={announcement} />
    </section>
  )
}

function AnnouncementHeroBanner({ announcement }) {
  return (
    <section className={`homepage-announcement-hero ${announcement.theme || 'green'}`}>
      {announcement.image_url ? (
        <img src={resolveMediaUrl(announcement.image_url)} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} />
      ) : null}
      <div>
        <p className="announcement-label">FoodNova update</p>
        <h2>{announcement.title}</h2>
        <p>{announcement.message}</p>
      </div>
      <AnnouncementAction announcement={announcement} className="announcement-cta" />
    </section>
  )
}

function AnnouncementPopup({ announcement, onDismiss }) {
  if (!announcement) return null
  return (
    <div className="homepage-announcement-popup-backdrop" role="dialog" aria-modal="true" aria-labelledby="foodnova-popup-title">
      <div className={`homepage-announcement-popup ${announcement.theme || 'green'}`}>
        <button type="button" onClick={onDismiss} aria-label="Close announcement"><X size={18} /></button>
        {announcement.image_url ? (
          <img src={resolveMediaUrl(announcement.image_url)} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} />
        ) : null}
        <h2 id="foodnova-popup-title">{announcement.title}</h2>
        <p>{announcement.message}</p>
        <AnnouncementAction announcement={announcement} className="announcement-cta" />
      </div>
    </div>
  )
}

export default function HomePage() {
  const [activeSlide, setActiveSlide] = useState(0)
  const [featuredProducts, setFeaturedProducts] = useState([])
  const [featuredPacks, setFeaturedPacks] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [activePopupId, setActivePopupId] = useState(null)
  const [storeError, setStoreError] = useState('')
  const { items: cartItems, addItem } = useCartStore()
  const slide = heroSlides[activeSlide]

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((current) => (current + 1) % heroSlides.length)
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const loadFeaturedStorefront = async () => {
      try {
        const [productsRes, packsRes] = await Promise.allSettled([
          productsAPI.getAll(),
          packsAPI.getAll(),
        ])
        if (productsRes.status === 'fulfilled') {
          setFeaturedProducts((productsRes.value.data || []).slice(0, 6).map((item) => normalizeStoreItem(item, 'product')))
        }
        if (packsRes.status === 'fulfilled') {
          setFeaturedPacks((packsRes.value.data || []).slice(0, 3).map((item) => normalizeStoreItem(item, 'pack')))
        }
        if (productsRes.status === 'rejected' && packsRes.status === 'rejected') {
          setStoreError('Products are temporarily unavailable. Please check back shortly.')
        }
      } catch {
        setStoreError('Products are temporarily unavailable. Please check back shortly.')
      }
    }

    loadFeaturedStorefront()
  }, [])

  useEffect(() => {
    const loadAnnouncements = async () => {
      try {
        const response = await announcementsAPI.getActive()
        const activeAnnouncements = response.data || []
        setAnnouncements(activeAnnouncements)
        const popup = activeAnnouncements.find((announcement) => (
          announcement.display_type === 'popup'
          && !sessionStorage.getItem(`foodnova_popup_dismissed_${announcement.id}`)
        ))
        setActivePopupId(popup?.id || null)
      } catch (error) {
        console.warn('FoodNova announcements unavailable:', error)
        setAnnouncements([])
      }
    }

    loadAnnouncements()
  }, [])

  const goPrevious = () => setActiveSlide((current) => (current - 1 + heroSlides.length) % heroSlides.length)
  const goNext = () => setActiveSlide((current) => (current + 1) % heroSlides.length)
  const normalizeStoreItem = (item, itemType = 'product') => {
    const name = item?.name || item?.product_name || 'FoodNova Item'
    const price = Number(item?.price || item?.unit_price || 0)
    const stock = Number(item?.stock_qty ?? item?.stock ?? 999)
    return {
      ...item,
      name,
      product_name: name,
      price,
      unit_price: price,
      stock,
      stock_qty: stock,
      is_out_of_stock: itemType !== 'pack' && (item?.is_out_of_stock === true || stock <= 0),
      low_stock: itemType !== 'pack' && (item?.low_stock === true || (stock > 0 && stock <= Number(item?.low_stock_threshold || 5))),
      type: item?.type || item?.item_type || itemType,
      item_type: item?.item_type || item?.type || itemType,
      image_url: item?.image_url || item?.image || '/placeholder.png',
    }
  }

  const addFeaturedToCart = (item) => {
    const normalized = normalizeStoreItem(item, item.type || item.item_type || 'product')
    if (normalized.type !== 'pack' && normalized.is_out_of_stock) {
      toast.error('This item is out of stock')
      return
    }
    if (normalized.type !== 'pack') {
      const existingQty = cartItems.find((cartItem) => cartItem.id === normalized.id && (cartItem.type || cartItem.item_type || 'product') !== 'pack')?.quantity || 0
      if (existingQty + 1 > normalized.stock_qty) {
        toast.error(`Only ${normalized.stock_qty} left in stock`)
        return
      }
    }
    addItem(normalized)
    toast.success('Added to cart!')
  }

  const openWhatsApp = () => {
    window.open(buildWhatsAppLink('Hello FoodNova, I want to order foodstuff.'), '_blank', 'noopener,noreferrer')
  }

  const topBarAnnouncements = announcements.filter((announcement) => announcement.display_type === 'top_bar')
  const heroAnnouncements = announcements.filter((announcement) => announcement.display_type === 'hero_banner')
  const activePopup = announcements.find((announcement) => announcement.id === activePopupId)
  const dismissPopup = () => {
    if (activePopupId) sessionStorage.setItem(`foodnova_popup_dismissed_${activePopupId}`, 'true')
    setActivePopupId(null)
  }

  return (
    <div className="home-page">
      {topBarAnnouncements.map((announcement) => (
        <AnnouncementTopBar key={`top-${announcement.id}`} announcement={announcement} />
      ))}

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
          {heroSlides.map((item, index) => (
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

      {heroAnnouncements.length > 0 && (
        <div className="homepage-announcement-hero-list">
          {heroAnnouncements.map((announcement) => (
            <AnnouncementHeroBanner key={`hero-${announcement.id}`} announcement={announcement} />
          ))}
        </div>
      )}

      <section className="features">
        <h2>Why Choose FoodNova?</h2>
        <div className="features-grid">
          <div className="feature-card">
            <ShoppingCart size={32} />
            <h3>Quality Foodstuff</h3>
            <p>Freshly sourced essentials and reliable food packs.</p>
          </div>
          <div className="feature-card">
            <Lock size={32} />
            <h3>Secure Payment Flow</h3>
            <p>Use your order code, upload receipt, and track payment confirmation.</p>
          </div>
          <div className="feature-card">
            <Bell size={32} />
            <h3>Clear Order Updates</h3>
            <p>Get notifications for payment, processing, delivery, and completion.</p>
          </div>
          <div className="feature-card">
            <Headphones size={32} />
            <h3>Support When You Need It</h3>
            <p>Reach FoodNova through WhatsApp or email with your order code.</p>
          </div>
        </div>
      </section>

      <section className="home-store-section">
        <div className="section-heading">
          <div>
            <h2>Popular Foodstuff</h2>
            <p>Shop everyday essentials and reliable food packs from FoodNova.</p>
          </div>
          <Link to="/products">View All Products</Link>
        </div>
        {storeError && <p className="home-store-error">{storeError}</p>}
        {featuredProducts.length > 0 && (
          <div className="home-product-grid">
            {featuredProducts.map((product) => (
              <article className="home-product-card" key={`featured-product-${product.id}`}>
                <div className="home-product-image">
                  <img src={getImageUrl(product)} alt={product.name} loading="lazy" onError={handleImageError} />
                  <div className="home-product-badges"><span>Fresh</span>{product.low_stock ? <span>Hot deal</span> : <span>Bestseller</span>}</div>
                  <button type="button" className="home-favorite-button" aria-label={`Save ${product.name}`}><Heart size={17} /></button>
                  {product.is_out_of_stock && <span className="stock-ribbon out">Out of Stock</span>}
                  {product.low_stock && !product.is_out_of_stock && <span className="stock-ribbon low">Only {product.stock_qty} left</span>}
                </div>
                <div className="home-product-body">
                  <h3>{product.name}</h3>
                  <p>{formatPrice(product.price)}</p>
                  <button type="button" onClick={() => addFeaturedToCart(product)} disabled={product.is_out_of_stock}>
                    {product.is_out_of_stock ? 'Out of Stock' : 'Add to Cart'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {!storeError && featuredProducts.length === 0 && <p className="home-store-error">Popular products will appear here soon.</p>}
      </section>

      {featuredPacks.length > 0 && (
        <section className="home-store-section">
          <div className="section-heading">
            <div>
              <h2>FoodNova Food Packs</h2>
              <p>Curated foodstuff packages for homes, families, and bulk needs.</p>
            </div>
            <Link to="/products">Explore Food Packs</Link>
          </div>
          <div className="home-pack-grid">
            {featuredPacks.map((pack) => (
              <article className="home-pack-card" key={`featured-pack-${pack.id}`}>
                <img src={getImageUrl(pack)} alt={pack.name} loading="lazy" onError={handleImageError} />
                <div>
                  <h3>{pack.name}</h3>
                  <p>{pack.description || 'A curated FoodNova package for convenient restocking.'}</p>
                  <strong>{formatPrice(pack.price)}</strong>
                  <button type="button" onClick={() => addFeaturedToCart(pack)}>Shop Pack</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="how-it-works">
        <div className="section-heading centered">
          <div>
            <h2>How FoodNova Works</h2>
            <p>From cart to delivery, every step is built for clarity.</p>
          </div>
        </div>
        <div className="steps-grid">
          {[
            ['Shop Products', 'Browse foodstuff, groceries, and food packs.', ShoppingCart],
            ['Place Your Order', 'Add items to cart and enter your delivery details.', PackageCheck],
            ['Pay & Upload Receipt', 'Transfer to FoodNova OPay account and upload JPG, PNG, WEBP, or PDF receipt.', FileText],
            ['Track Delivery', 'Get updates, invoice, rider info, and delivery confirmation.', Truck],
          ].map(([title, text, Icon], index) => (
            <article className="step-card" key={title}>
              <span>{index + 1}</span>
              <Icon size={26} />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="trust-section">
        <h2>Why Customers Choose FoodNova</h2>
        <div className="trust-grid">
          {[
            ['Quality Foodstuff', ShoppingCart],
            ['Secure Payment Flow', Lock],
            ['Order Tracking', PackageCheck],
            ['WhatsApp Support', MessageCircle],
            ['Invoice & Receipt', FileText],
            ['Delivery Updates', Truck],
          ].map(([label, Icon]) => (
            <div className="trust-badge" key={label}><Icon size={20} /> {label}</div>
          ))}
        </div>
      </section>

      <section className="premium-proof-section">
        <div className="section-heading centered">
          <div>
            <h2>Freshness, Delivery, Trust</h2>
            <p>Commercial-grade grocery operations with a neighborhood feel.</p>
          </div>
        </div>
        <div className="premium-proof-grid">
          {[
            ['Freshness guarantee', 'Quality checks before dispatch and transparent stock status.', CheckCircle2],
            ['Delivery promise', 'Clear customer updates from payment confirmation to doorstep delivery.', Truck],
            ['Trusted sourcing', 'Reliable essentials, curated packs, and customer-first support.', Sparkles],
          ].map(([title, text, Icon]) => (
            <article className="premium-proof-card" key={title}>
              <Icon size={24} />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="testimonial-section">
        <div className="section-heading">
          <div>
            <h2>Customers Restock With Confidence</h2>
            <p>Designed for repeat shopping, clear payments, and dependable household planning.</p>
          </div>
          <div className="coverage-pill"><MapPin size={18} /> Growing delivery coverage</div>
        </div>
        <div className="testimonial-grid">
          {[
            ['A smarter way to restock rice, beans, oil, and quick meals for the week.', 'Adebayo, Lagos'],
            ['The food packs make monthly shopping simpler and easier to budget.', 'Chidinma, Abuja'],
            ['Order updates and receipts give the process a professional feel.', 'Tunde, Ibadan'],
          ].map(([quote, name]) => (
            <article className="testimonial-card" key={name}>
              <div><Star size={16} /><Star size={16} /><Star size={16} /><Star size={16} /><Star size={16} /></div>
              <p>{quote}</p>
              <strong>{name}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="cta">
        <h2>Ready to stock your home?</h2>
        <p>Order quality foodstuff from FoodNova and track every step from payment to delivery.</p>
        <div className="cta-actions">
          <Link to="/products" className="btn btn-primary btn-large">Shop Products</Link>
          <Link to="/tracking" className="btn btn-secondary btn-large">Track Order</Link>
          <button type="button" className="btn btn-light btn-large" onClick={openWhatsApp}>Chat on WhatsApp</button>
        </div>
      </section>

      <AnnouncementPopup announcement={activePopup} onDismiss={dismissPopup} />
    </div>
  )
}
