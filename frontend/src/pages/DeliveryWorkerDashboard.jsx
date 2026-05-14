import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, MapPin, Power, RefreshCw, ShieldCheck } from 'lucide-react'
import { workerAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './WorkerPages.css'

function getPosition() {
  return new Promise((resolve, reject) => {
    const requestBrowserLocation = () => {
      if (!navigator.geolocation) {
        reject(new Error('GPS is not available on this device.'))
        return
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
    }

    const capacitorGeolocation = window.Capacitor?.Plugins?.Geolocation
    if (window.Capacitor?.isNativePlatform?.() && capacitorGeolocation?.getCurrentPosition) {
      capacitorGeolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
        .then(resolve)
        .catch(() => requestBrowserLocation())
      return
    }

    if (!navigator.geolocation) {
      reject(new Error('GPS is not available on this device.'))
      return
    }
    requestBrowserLocation()
  })
}

async function requestLocationPosition() {
  const capacitorGeolocation = window.Capacitor?.Plugins?.Geolocation
  if (window.Capacitor?.isNativePlatform?.() && capacitorGeolocation?.getCurrentPosition) {
    return getPosition()
  }
  if (navigator.permissions?.query) {
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' })
      if (permission.state === 'denied') {
        throw new Error('Location access is blocked. Please enable location permission in your phone/browser settings.')
      }
    } catch (error) {
      if (/blocked/i.test(error?.message || '')) throw error
    }
  }
  return getPosition()
}

function locationPayload(position) {
  const coords = position.coords
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    heading: coords.heading,
    speed: coords.speed,
    timestamp: new Date().toISOString(),
  }
}

function isLocationPermissionDenied(error) {
  return error?.code === 1 || /blocked|denied|permission/i.test(error?.message || '')
}

export default function DeliveryWorkerDashboard({ workerType }) {
  const { user, updateUser } = useAuthStore()
  const [worker, setWorker] = useState(user?.delivery_worker || null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [locationWarning, setLocationWarning] = useState('')
  const [locationMessage, setLocationMessage] = useState('')
  const [offers, setOffers] = useState([])
  const previousPendingOfferCount = useRef(0)
  const type = workerType || user?.delivery_worker_type || user?.role
  const title = type === 'rider' ? 'Rider / Delivery Partner Dashboard' : 'Walking Messenger Dashboard'

  const loadWorker = async () => {
    try {
      setLoading(true)
      const response = await workerAPI.me()
      setWorker(response.worker || response.data)
      if (response.user) updateUser({ ...user, ...response.user, delivery_worker: response.worker || response.data })
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Unable to load delivery account')
    } finally {
      setLoading(false)
    }
  }

  const loadOffers = async () => {
    try {
      const response = await workerAPI.getOffers()
      setOffers(response.offers || response.data || [])
    } catch {
      setOffers([])
    }
  }

  useEffect(() => {
    loadWorker()
    loadOffers()
  }, [])

  useEffect(() => {
    if (!worker || worker.kyc_status !== 'APPROVED' || worker.operational_status === 'OFFLINE') return undefined
    const intervalMs = worker.operational_status === 'ON_DELIVERY' || worker.operational_status === 'ASSIGNED' ? 12000 : type === 'messenger' ? 20000 : 30000
    const interval = window.setInterval(async () => {
      try {
        const position = await requestLocationPosition()
        const response = await workerAPI.locationPing(locationPayload(position))
        setWorker(response.worker || response.data)
      } catch {
        // Keep dashboard usable; visible status updates happen through explicit actions.
      }
    }, intervalMs)
    return () => window.clearInterval(interval)
  }, [worker?.operational_status, worker?.kyc_status, type])

  useEffect(() => {
    if (!worker || worker.kyc_status !== 'APPROVED') return undefined
    const interval = window.setInterval(loadOffers, 15000)
    return () => window.clearInterval(interval)
  }, [worker?.kyc_status])

  useEffect(() => {
    const pendingCount = offers.filter((offer) => offer.status === 'PENDING').length
    if (pendingCount > previousPendingOfferCount.current) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        if (AudioContextClass) {
          const context = new AudioContextClass()
          const oscillator = context.createOscillator()
          const gain = context.createGain()
          oscillator.frequency.value = 880
          gain.gain.value = 0.04
          oscillator.connect(gain)
          gain.connect(context.destination)
          oscillator.start()
          oscillator.stop(context.currentTime + 0.18)
        }
      } catch {
        // Browser or app may block sound until user interaction.
      }
    }
    previousPendingOfferCount.current = pendingCount
  }, [offers])

  const goOnline = async () => {
    try {
      setBusy(true)
      let payload = null
      try {
        const position = await requestLocationPosition()
        payload = locationPayload(position)
        setLocationWarning('')
      } catch (locationError) {
        if (type === 'messenger') throw locationError
        setLocationWarning(isLocationPermissionDenied(locationError) ? 'permission-denied' : 'unavailable')
        setLocationMessage(isLocationPermissionDenied(locationError) ? 'Location access is blocked. Please enable location permission in your phone/browser settings.' : 'Unable to get your location. Please turn on GPS and try again.')
      }
      const response = await workerAPI.goOnline(type, payload)
      setWorker(response.worker || response.data)
      toast.success(payload ? 'You are online' : 'You are online. Enable location access when possible.')
    } catch (error) {
      if (type === 'rider' && isLocationPermissionDenied(error)) {
        setLocationWarning('permission-denied')
        setLocationMessage('Location access is blocked. Please enable location permission in your phone/browser settings.')
      } else {
        toast.error(error?.response?.data?.detail || error.message || 'Unable to go online')
      }
    } finally {
      setBusy(false)
    }
  }

  const goOffline = async () => {
    try {
      setBusy(true)
      const response = await workerAPI.goOffline()
      setWorker(response.worker || response.data)
      toast.success('You are offline')
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Unable to go offline')
    } finally {
      setBusy(false)
    }
  }

  const sendPanic = async () => {
    try {
      setBusy(true)
      const position = await requestLocationPosition()
      await workerAPI.panicAlert(locationPayload(position))
      toast.success('Emergency alert sent')
    } catch (error) {
      toast.error(error?.response?.data?.detail || error.message || 'Unable to send alert')
    } finally {
      setBusy(false)
    }
  }

  const retryLocation = async () => {
    try {
      setBusy(true)
      const position = await requestLocationPosition()
      const response = await workerAPI.locationPing(locationPayload(position))
      setWorker(response.worker || response.data)
      setLocationWarning('')
      setLocationMessage('')
      toast.success('Location access enabled')
    } catch (error) {
      if (isLocationPermissionDenied(error)) {
        setLocationWarning('permission-denied')
        setLocationMessage('Location access is blocked. Please enable location permission in your phone/browser settings.')
      } else {
        setLocationWarning('unavailable')
        setLocationMessage('Unable to get your location. Please turn on GPS and try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  const acceptOffer = async (offer) => {
    try {
      setBusy(true)
      await workerAPI.acceptOffer(offer.id)
      toast.success('Delivery request accepted. Admin will confirm assignment.')
      await loadOffers()
      await loadWorker()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Unable to accept delivery request')
    } finally {
      setBusy(false)
    }
  }

  const declineOffer = async (offer) => {
    try {
      setBusy(true)
      await workerAPI.declineOffer(offer.id)
      toast.success('Delivery request declined')
      await loadOffers()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Unable to decline delivery request')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="worker-dashboard"><div className="worker-panel">Loading delivery account...</div></div>

  if (!worker) return <div className="worker-dashboard"><div className="worker-panel">Delivery account not found.</div></div>

  if (worker.kyc_status !== 'APPROVED') {
    const isRejected = worker.kyc_status === 'REJECTED'
    const isSuspended = worker.kyc_status === 'SUSPENDED'
    return (
      <div className="worker-dashboard">
        <section className="worker-panel status-panel">
          <ShieldCheck size={34} />
          <h1>{isSuspended ? 'Account Suspended' : isRejected ? 'Application Rejected' : 'Under Review'}</h1>
          <p>{isSuspended ? 'Your delivery account is suspended. Contact FoodNova admin.' : isRejected ? (worker.review_note || 'Your application was not approved at this time.') : 'Your FoodNova delivery account is under review. You will be notified once approved.'}</p>
        </section>
      </div>
    )
  }

  return (
    <div className="worker-dashboard">
      <section className="worker-panel worker-hero-panel">
        <div>
          <p>FoodNova Delivery Workforce</p>
          <h1>{title}</h1>
          <span>{type === 'messenger' ? 'Hyperlocal: local zone required before going online' : 'You are online and available for wider delivery requests.'}</span>
        </div>
        <strong>{worker.operational_status}</strong>
      </section>

      <section className="worker-actions-grid">
        <button type="button" onClick={worker.operational_status === 'OFFLINE' ? goOnline : goOffline} disabled={busy}>
          <Power size={20} /> {worker.operational_status === 'OFFLINE' ? 'Go Online' : 'Go Offline'}
        </button>
        <button type="button" className="panic-button" onClick={sendPanic} disabled={busy}>
          <AlertTriangle size={20} /> Emergency Alert
        </button>
      </section>

      <section className="worker-panel">
        <h2>Pending Delivery Offers {offers.filter((offer) => offer.status === 'PENDING').length > 0 && <span className="offer-count-badge">{offers.filter((offer) => offer.status === 'PENDING').length}</span>}</h2>
        {offers.filter((offer) => offer.status === 'PENDING').length ? (
          <div className="delivery-offer-list">
            {offers.filter((offer) => offer.status === 'PENDING').map((offer) => (
              <article className="delivery-offer-card" key={offer.id}>
                <div>
                  <h3>New delivery request available</h3>
                  <span>{offer.delivery_type?.replace(/_/g, ' ') || 'delivery request'}</span>
                </div>
                <p><strong>Pickup:</strong> {offer.pickup_area || 'FoodNova pickup'}</p>
                <p><strong>Delivery:</strong> {offer.delivery_area || 'Customer area'}</p>
                <p><strong>Distance:</strong> {offer.estimated_distance_meters ? `${(offer.estimated_distance_meters / 1000).toFixed(1)} km` : 'Needs admin review'}</p>
                <div className="delivery-offer-actions">
                  <button type="button" onClick={() => acceptOffer(offer)} disabled={busy}>Accept</button>
                  <button type="button" className="secondary-worker-button" onClick={() => declineOffer(offer)} disabled={busy}>Decline</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted"><MapPin size={16} /> New delivery assignments will appear here after admin dispatch.</p>
        )}
      </section>

      {type === 'rider' && locationWarning && (
        <section className="worker-panel location-warning-card" aria-live="polite">
          <div>
            <AlertTriangle size={22} />
            <h2>Location Permission Needed</h2>
          </div>
          <p>FoodNova riders are not restricted by geo-fencing, but GPS access is required for:</p>
          {locationMessage && <p className="location-warning-message">{locationMessage}</p>}
          <ul>
            <li>live delivery tracking</li>
            <li>assignment routing</li>
            <li>emergency support</li>
            <li>accurate delivery updates</li>
          </ul>
          <button type="button" onClick={retryLocation} disabled={busy}>
            <RefreshCw size={18} /> Retry Location
          </button>
        </section>
      )}

      <section className="worker-panel">
        <h2>Location Status</h2>
        {type === 'rider' && (
          <p className="location-helper-text">Location access is still required for live tracking, delivery assignment accuracy, and emergency support.</p>
        )}
        <div className="worker-detail-grid">
          <div><strong>Last Seen</strong><span>{worker.last_seen_at ? new Date(worker.last_seen_at).toLocaleString() : 'No GPS ping yet'}</span></div>
          <div><strong>Geo-Fence</strong><span>{type === 'messenger' ? (worker.inside_zone ? 'Inside operational zone' : 'Outside operational zone') : 'Not enforced for riders'}</span></div>
          <div><strong>GPS Fresh</strong><span>{worker.gps_recent ? 'Yes' : 'No'}</span></div>
          <div><strong>Assignment</strong><span>{worker.assignment_eligible ? 'Eligible' : (worker.assignment_eligibility_reason || 'Not eligible')}</span></div>
          <div><strong>Coordinates</strong><span>{worker.latest_latitude ? `${worker.latest_latitude}, ${worker.latest_longitude}` : 'Not available'}</span></div>
        </div>
      </section>

      <section className="worker-panel">
        <h2>Active Assigned Delivery</h2>
        {offers.filter((offer) => ['ACCEPTED', 'ASSIGNED'].includes(offer.status)).length ? (
          <div className="delivery-offer-list">
            {offers.filter((offer) => ['ACCEPTED', 'ASSIGNED'].includes(offer.status)).map((offer) => (
              <article className="delivery-offer-card" key={offer.id}>
                <div>
                  <h3>{offer.status === 'ASSIGNED' ? 'Assigned delivery' : 'Awaiting admin confirmation'}</h3>
                  <span>{offer.order_code}</span>
                </div>
                <p><strong>Pickup:</strong> {offer.pickup_area || 'FoodNova pickup'}</p>
                <p><strong>Delivery:</strong> {offer.delivery_address || offer.delivery_area || 'Customer area'}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted"><MapPin size={16} /> No active assigned delivery.</p>
        )}
      </section>
    </div>
  )
}
