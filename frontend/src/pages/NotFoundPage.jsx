import { Link } from 'react-router-dom'
import './NotFoundPage.css'

export default function NotFoundPage() {
  return (
    <div className="not-found-page">
      <div className="not-found-content">
        <h1 className="not-found-code">404</h1>
        <h2>Page Not Found</h2>
        <p>The page you are looking for does not exist or may have moved.</p>
        <div className="not-found-actions">
          <Link to="/" className="not-found-btn primary">Back Home</Link>
          <Link to="/products" className="not-found-btn">Shop Products</Link>
          <Link to="/tracking" className="not-found-btn">Track Order</Link>
        </div>
      </div>
    </div>
  )
}
