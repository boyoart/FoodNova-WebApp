import { Link } from 'react-router-dom'
import { Instagram, Mail, Phone, MapPin } from 'lucide-react'
import { FOODNOVA_CONTACT, FOODNOVA_SOCIAL_LINKS } from '../utils/contactUtils'
import './Footer.css'

export default function Footer() {
  const currentYear = new Date().getFullYear()
  const handleLogoError = (event) => {
    if (event.currentTarget.dataset.fallback !== 'true') {
      event.currentTarget.dataset.fallback = 'true'
      event.currentTarget.src = '/logo.png'
      return
    }

    event.currentTarget.style.display = 'none'
  }

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-section">
            <div className="footer-brand">
              <img src="/foodnova-logo.png" alt="FoodNova" onError={handleLogoError} />
              <h4>FoodNova</h4>
            </div>
            <p>Fresh food delivery for everyone, everywhere.</p>
            <div className="social-links">
              <a href={FOODNOVA_SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" aria-label={`Instagram: ${FOODNOVA_CONTACT.instagram}`}>
                <Instagram size={20} />
              </a>
              <a href={FOODNOVA_SOCIAL_LINKS.tiktok} target="_blank" rel="noopener noreferrer" aria-label={`TikTok: ${FOODNOVA_CONTACT.tiktok}`} className="social-icon-text">
                TT
              </a>
            </div>
          </div>

          <div className="footer-section">
            <h5>Quick Links</h5>
            <ul>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/products">Products</Link></li>
              <li><Link to="/faq">FAQ</Link></li>
              <li><Link to="/policies">Policies</Link></li>
              <li><Link to="/contact">Contact</Link></li>
              <li><Link to="/privacy">Privacy Policy</Link></li>
              <li><Link to="/terms">Terms of Service</Link></li>
            </ul>
          </div>

          <div className="footer-section">
            <h5>Legal</h5>
            <ul>
              <li><Link to="/policies">Customer Policies</Link></li>
              <li><Link to="/privacy">Privacy Policy</Link></li>
              <li><Link to="/terms">Terms of Service</Link></li>
              <li><a href={`mailto:${FOODNOVA_CONTACT.email}`}>Report Issue</a></li>
            </ul>
          </div>

          <div className="footer-section">
            <h5>Contact</h5>
            <ul>
              <li>
                <a href={`mailto:${FOODNOVA_CONTACT.email}`}>
                  <Mail size={16} />
                  {FOODNOVA_CONTACT.email}
                </a>
              </li>
              <li>
                <a href={`tel:${FOODNOVA_CONTACT.phone}`}>
                  <Phone size={16} />
                  {FOODNOVA_CONTACT.phone}
                </a>
              </li>
              <li>
                <span>
                  <MapPin size={16} />
                  {FOODNOVA_CONTACT.address}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {currentYear} FoodNova. All rights reserved.</p>
          <p>Powered by React + Vite | FastAPI | PostgreSQL</p>
        </div>
      </div>
    </footer>
  )
}
