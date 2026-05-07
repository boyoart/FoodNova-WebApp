import { Link } from 'react-router-dom'
import { FOODNOVA_CONTACT, FOODNOVA_WEBSITE } from '../utils/contactUtils'
import './PoliciesPage.css'

const policies = [
  {
    title: 'Payment Policy',
    points: [
      'Orders are processed after payment confirmation.',
      'Customers must use their order code as payment narration/reference.',
      'Customers must upload a valid payment receipt.',
      'FoodNova may reject unclear, incorrect, or unverifiable receipts.',
      'Accepted receipt formats: JPG, PNG, WEBP, PDF.',
    ],
  },
  {
    title: 'Delivery Policy',
    points: [
      'Delivery timing depends on order processing, payment confirmation, rider availability, and customer location.',
      'Customers are responsible for providing accurate delivery details.',
      'FoodNova may contact customers for clarification.',
      'Delivery confirmation code should only be entered after receiving the order.',
    ],
  },
  {
    title: 'Cancellation Policy',
    points: [
      'Customers may request cancellation before the order is dispatched or out for delivery.',
      'Cancellation is not guaranteed and is subject to review.',
      'Cancellation may be unavailable once an order is out for delivery, delivered, or completed.',
    ],
  },
  {
    title: 'Refund Request Policy',
    points: [
      'Refund requests are reviewed by FoodNova.',
      'Refund approval depends on payment verification, order status, and circumstances.',
      'Refund approval does not mean instant payment reversal.',
      'FoodNova support will communicate next steps where applicable.',
    ],
  },
  {
    title: 'Product Availability / Stock Policy',
    points: [
      'Products are subject to availability.',
      'If an item becomes unavailable, FoodNova may contact the customer for replacement, adjustment, or cancellation options.',
      'FoodNova stock status may change due to demand.',
    ],
  },
  {
    title: 'Customer Responsibility',
    points: [
      'Provide correct name, phone number, and address.',
      'Upload correct payment receipt.',
      'Keep order code for support inquiries.',
      'Do not share or enter delivery confirmation code before receiving the order.',
    ],
  },
]

export default function PoliciesPage() {
  return (
    <div className="policies-page">
      <section className="policies-hero">
        <p className="policy-kicker">FoodNova support guide</p>
        <h1>FoodNova Customer Policies</h1>
        <p>Clear payment, delivery, cancellation, refund, stock, and support guidance for FoodNova customers.</p>
      </section>

      <div className="policies-grid">
        {policies.map((section) => (
          <article className="policy-card" key={section.title}>
            <h2>{section.title}</h2>
            <ul>
              {section.points.map((point) => <li key={point}>{point}</li>)}
            </ul>
          </article>
        ))}
      </div>

      <section className="policy-support-card">
        <h2>Support</h2>
        <p>Email: <a href={`mailto:${FOODNOVA_CONTACT.email}`}>{FOODNOVA_CONTACT.email}</a></p>
        <p>Phone/WhatsApp: <a href={`tel:${FOODNOVA_CONTACT.phone}`}>{FOODNOVA_CONTACT.phone}</a></p>
        <p>Website: <a href={FOODNOVA_WEBSITE} target="_blank" rel="noopener noreferrer">{FOODNOVA_WEBSITE}</a></p>
        <Link to="/contact" className="policy-support-link">Contact FoodNova</Link>
      </section>
    </div>
  )
}
