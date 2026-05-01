import { Link } from 'react-router-dom'
import { ShoppingCart, Truck, DollarSign, Lock } from 'lucide-react'
import './HomePage.css'

export default function HomePage() {
  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1>Fresh Food Delivered to Your Door</h1>
          <p>Order groceries, meals, and food packs with instant checkout and secure payments.</p>
          <div className="hero-buttons">
            <Link to="/products" className="btn btn-primary">
              Start Shopping
            </Link>
            <Link to="/contact" className="btn btn-secondary">
              Learn More
            </Link>
          </div>
        </div>
        <div className="hero-image">
          <div className="placeholder-image">
            <img 
              src="https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&h=600&fit=crop" 
              alt="Fresh Food Groceries" 
              onError={(e) => {
                e.target.src = 'https://images.unsplash.com/photo-1488459716781-6815comet.jpg?w=800&h=600&fit=crop'
              }} 
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
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

      {/* CTA Section */}
      <section className="cta">
        <h2>Ready to Get Fresh Food?</h2>
        <p>Join thousands of customers enjoying fresh food delivery</p>
        <Link to="/products" className="btn btn-primary btn-large">
          Browse Products Now
        </Link>
      </section>

      {/* Info Section */}
      <section className="info">
        <div className="info-item">
          <h3>For Customers</h3>
          <p>Browse fresh products, create food packs, and track your orders in real-time.</p>
          <Link to="/products">Explore Products →</Link>
        </div>
        <div className="info-item">
          <h3>For Admins</h3>
          <p>Manage inventory, process orders, and approve payments with our admin dashboard.</p>
          <Link to="/admin/login">Admin Portal →</Link>
        </div>
      </section>
    </div>
  )
}
