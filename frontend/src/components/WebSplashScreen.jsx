import { useEffect, useState } from 'react'
import FoodNovaLogo from './FoodNovaLogo'
import './WebSplashScreen.css'

export default function WebSplashScreen() {
  const [visible, setVisible] = useState(() => sessionStorage.getItem('foodnova_splash_seen') !== 'true')

  useEffect(() => {
    if (!visible) return undefined
    const timer = setTimeout(() => {
      sessionStorage.setItem('foodnova_splash_seen', 'true')
      setVisible(false)
    }, 1250)
    return () => clearTimeout(timer)
  }, [visible])

  if (!visible) return null

  return (
    <div className="web-splash" role="status" aria-live="polite">
      <div className="web-splash-inner">
        <FoodNovaLogo variant="splash" />
        <p>Fresh food at your doorstep</p>
        <div className="web-splash-progress"><span /></div>
      </div>
    </div>
  )
}
