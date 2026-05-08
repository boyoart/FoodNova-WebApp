import { useEffect, useState } from 'react'
import './PWAInstallPrompt.css'

const DISMISS_KEY = 'foodnova_pwa_install_dismissed'

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === 'true' || isStandalone()) return undefined

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
      setVisible(true)
    }

    const handleInstalled = () => {
      localStorage.setItem(DISMISS_KEY, 'true')
      setVisible(false)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true')
    setVisible(false)
  }

  const install = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setVisible(false)
  }

  if (!visible || !deferredPrompt) return null

  return (
    <div className="pwa-install-prompt" role="dialog" aria-label="Install FoodNova app">
      <div>
        <strong>Install FoodNova App</strong>
        <p>Add FoodNova to your home screen for faster ordering and tracking.</p>
      </div>
      <div className="pwa-install-actions">
        <button type="button" className="pwa-install-primary" onClick={install}>Install</button>
        <button type="button" className="pwa-install-dismiss" onClick={dismiss} aria-label="Dismiss install prompt">Dismiss</button>
      </div>
    </div>
  )
}
