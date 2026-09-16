import { useEffect } from 'react'
import { Apple, BellRing, MapPinned, Play, ShoppingBasket, Smartphone, Sparkles } from 'lucide-react'
import { APP_STORE_URL, PLAY_STORE_URL } from '../config/appStores'
import './AppLandingPage.css'

const PAGE_TITLE = 'FoodNova Mobile App | Coming Soon'
const PAGE_DESCRIPTION = 'FoodNova for Android and iPhone is coming soon. Shop foodstuff, manage orders and stay connected with FoodNova wherever you are.'
const PAGE_CANONICAL = 'https://foodnova.com.ng/app'

const stores = [
  { key: 'play', eyebrow: PLAY_STORE_URL ? 'Get it on' : 'Coming Soon on', label: 'Google Play', url: PLAY_STORE_URL, Icon: Play },
  { key: 'apple', eyebrow: APP_STORE_URL ? 'Download on the' : 'Coming Soon on the', label: 'App Store', url: APP_STORE_URL, Icon: Apple },
]

function StoreControls({ compact = false }) {
  return (
    <div className={`app-store-controls ${compact ? 'compact' : ''}`} aria-label="Mobile app availability">
      {stores.map(({ key, eyebrow, label, url, Icon }) => {
        const content = <><Icon aria-hidden="true" /><span><small>{eyebrow}</small><strong>{label}</strong></span></>
        return url ? (
          <a className="app-store-control active" href={url} target="_blank" rel="noopener noreferrer" key={key} aria-label={`${eyebrow} ${label}`}>
            {content}
          </a>
        ) : (
          <div className="app-store-control coming-soon" role="status" aria-disabled="true" key={key} aria-label={`${eyebrow} ${label}; download is not available yet`}>
            {content}
          </div>
        )
      })}
    </div>
  )
}

function usePageMetadata() {
  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector('meta[name="description"]')
    const previousDescription = description?.getAttribute('content')
    const descriptionNode = description || document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'description' }))
    const canonical = document.querySelector('link[rel="canonical"]')
    const previousCanonical = canonical?.getAttribute('href')
    const canonicalNode = canonical || document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'canonical' }))

    document.title = PAGE_TITLE
    descriptionNode.setAttribute('content', PAGE_DESCRIPTION)
    canonicalNode.setAttribute('href', PAGE_CANONICAL)

    return () => {
      document.title = previousTitle
      if (description) descriptionNode.setAttribute('content', previousDescription || '')
      else descriptionNode.remove()
      if (canonical) canonicalNode.setAttribute('href', previousCanonical || '')
      else canonicalNode.remove()
    }
  }, [])
}

export default function AppLandingPage() {
  usePageMetadata()

  return (
    <div className="app-landing-page">
      <section className="app-launch-hero">
        <div className="app-launch-copy">
          <p className="app-eyebrow"><Sparkles size={15} aria-hidden="true" /> FoodNova Mobile</p>
          <h1>Your FoodNova,<span>Now in Your Pocket.</span></h1>
          <p className="app-launch-lead">Shop everyday foodstuff, manage your orders and stay updated wherever you are with the FoodNova mobile app.</p>
          <p className="app-availability"><span aria-hidden="true" /> FoodNova for Android and iPhone is coming soon.</p>
          <StoreControls />
        </div>

        <div className="app-phone-stage" aria-label="Illustration of the FoodNova mobile experience">
          <div className="app-orbit app-orbit-one" aria-hidden="true" />
          <div className="app-orbit app-orbit-two" aria-hidden="true" />
          <div className="app-phone" aria-hidden="true">
            <div className="app-phone-speaker" />
            <div className="app-phone-screen">
              <header className="app-phone-header">
                <img src="/foodnova-logo.png" alt="" />
                <span><BellRing size={16} /></span>
              </header>
              <div className="app-phone-welcome"><small>GOOD FOOD, MADE SIMPLE</small><strong>Everyday essentials,<br />right at your fingertips.</strong></div>
              <div className="app-phone-pills"><i>Staples</i><i>Breakfast</i><i>Cooking</i></div>
              <div className="app-phone-products"><div><span>Rice</span></div><div><span>Beans</span></div></div>
              <div className="app-phone-status"><MapPinned size={17} /><span><strong>Clear order updates</strong><small>From checkout to delivery</small></span></div>
              <div className="app-phone-nav"><span className="selected"><ShoppingBasket size={16} />Shop</span><span><Smartphone size={16} />Orders</span></div>
            </div>
          </div>
          <div className="app-floating-note app-floating-note-top"><ShoppingBasket size={18} /><span>Easy shopping</span></div>
          <div className="app-floating-note app-floating-note-bottom"><BellRing size={18} /><span>Order updates</span></div>
        </div>
      </section>

      <section className="app-benefits" aria-labelledby="app-benefits-title">
        <div className="app-section-heading">
          <p className="app-eyebrow">Made for everyday convenience</p>
          <h2 id="app-benefits-title">Everything You Need, Wherever You Are</h2>
        </div>
        <div className="app-benefit-grid">
          <article><ShoppingBasket size={26} /><h3>Easy Shopping</h3><p>Browse FoodNova products, packs and everyday essentials.</p></article>
          <article><Smartphone size={26} /><h3>Simple Ordering</h3><p>Add products to your cart and place orders with a clear checkout flow.</p></article>
          <article><BellRing size={26} /><h3>Order Updates</h3><p>Stay informed as your FoodNova order moves through each stage.</p></article>
          <article><MapPinned size={26} /><h3>Live Delivery Tracking</h3><p>Follow active deliveries when live tracking is available for your order.</p></article>
        </div>
      </section>

      <section className="app-final-cta" aria-labelledby="app-final-cta-title">
        <div><p className="app-eyebrow">Coming soon</p><h2 id="app-final-cta-title">FoodNova Is Coming to Your Phone.</h2><p>Our mobile apps are being prepared for Google Play and the Apple App Store.</p></div>
        <StoreControls compact />
      </section>
    </div>
  )
}
