import { useState } from 'react'
import { Instagram, Mail, Phone, MapPin, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import './ContactPage.css'

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  })
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      // TODO: Connect to backend contact endpoint
      toast.success('Message sent! We will contact you soon.')
      setFormData({ name: '', email: '', subject: '', message: '' })
    } catch (error) {
      toast.error('Failed to send message')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="contact-page">
      <div className="contact-container">
        <div className="contact-header">
          <h1>Contact Us</h1>
          <p>Have questions? We'd love to hear from you.</p>
        </div>

        <div className="contact-grid">
          <div className="contact-info">
            <div className="info-item">
              <Mail size={32} />
              <div>
                <h3>Email</h3>
                <a href="mailto:support@foodnova.ng">support@foodnova.ng</a>
              </div>
            </div>

            <div className="info-item">
              <Phone size={32} />
              <div>
                <h3>Phone</h3>
                <a href="tel:+2348025801125">+2348025801125</a>
              </div>
            </div>

            <div className="info-item">
              <Instagram size={32} />
              <div>
                <h3>Instagram</h3>
                <a href="https://www.instagram.com/foodnovalimited">@foodnovalimited</a>
              </div>
            </div>

            <div className="info-item">
              <MapPin size={32} />
              <div>
                <h3>Address</h3>
                <p>33 Ariyo Akinloye Street<br />Isheri-Bucknor, Lagos, Nigeria</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="contact-form">
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="Your Name"
              />
            </div>

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="your@email.com"
              />
            </div>

            <div className="form-group">
              <label>Subject</label>
              <input
                type="text"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                required
                placeholder="How can we help?"
              />
            </div>

            <div className="form-group">
              <label>Message</label>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                placeholder="Your message..."
                rows={5}
              />
            </div>

            <button type="submit" className="btn btn-primary btn-large" disabled={loading}>
              <Send size={18} />
              {loading ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
