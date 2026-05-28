import './FoodNovaLogo.css'

export default function FoodNovaLogo({ className = '', variant = 'default', alt = 'FoodNova' }) {
  return (
    <img
      src="/foodnova-logo.png"
      alt={alt}
      className={`foodnova-logo foodnova-logo-${variant} ${className}`.trim()}
      loading="eager"
      decoding="async"
      onError={(event) => {
        event.currentTarget.src = '/logo.png'
      }}
    />
  )
}
