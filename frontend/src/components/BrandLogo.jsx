import './BrandLogo.css'

export const OFFICIAL_LOGO = '/branding/foodnova-logo.png'

export default function BrandLogo({ className = '', decorative = false }) {
  return <span className={`brand-logo-surface ${className}`}>
    <img className="brand-logo-image" src={OFFICIAL_LOGO} width="828" height="394"
      alt={decorative ? '' : 'FoodNova — Quality Foodstuff. Reliable Supply.'} decoding="async" />
  </span>
}
