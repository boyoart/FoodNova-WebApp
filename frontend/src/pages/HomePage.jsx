import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, DollarSign, Lock, ShoppingCart, Truck } from 'lucide-react'
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
  const slide = heroSlides[activeSlide]

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((current) => (current + 1) % heroSlides.length)
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const goPrevious = () => setActiveSlide((current) => (current - 1 + heroSlides.length) % heroSlides.length)
  const goNext = () => setActiveSlide((current) => (current + 1) % heroSlides.length)

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
