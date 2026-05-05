import { Link } from 'react-router-dom'
import { Facebook, Instagram, Twitter, Mail, Phone, MapPin } from 'lucide-react'
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
              <a href="#" aria-label="Facebook">
                <Facebook size={20} />
              </a>
              <a href="#" aria-label="Instagram">
                <Instagram size={20} />
              </a>
              <a href="#" aria-label="Twitter">
                <Twitter size={20} />
              </a>
            </div>
          </div>

          <div className="footer-section">
            <h5>Quick Links</h5>
            <ul>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/products">Products</Link></li>
              <li><Link to="/contact">Contact</Link></li>
              <li><Link to="/privacy">Privacy Policy</Link></li>
              <li><Link to="/terms">Terms of Service</Link></li>
            </ul>
          </div>

          <div className="footer-section">
            <h5>Legal</h5>
            <ul>
              <li><Link to="/privacy">Privacy Policy</Link></li>
              <li><Link to="/terms">Terms of Service</Link></li>
              <li><a href="mailto:support@foodnova.ng">Report Issue</a></li>
            </ul>
          </div>

          <div className="footer-section">
            <h5>Contact</h5>
            <ul>
              <li>
                <a href="mailto:support@foodnova.ng">
                  <Mail size={16} />
                  support@foodnova.ng
                </a>
              </li>
              <li>
                <a href="tel:+2348148242485">
                  <Phone size={16} />
                  +234 814 824 2485
                </a>
              </li>
              <li>
                <span>
                  <MapPin size={16} />
                  33 Ariyo Akinloye Street, Isheri-Bucknor, Lagos, Nigeria
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
