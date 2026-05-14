import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, MapPin, Power, RefreshCw, ShieldCheck } from 'lucide-react'
import { workerAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './WorkerPages.css'

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS is not available on this device.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 })
  })
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
  return error?.code === 1 || /denied|permission/i.test(error?.message || '')
}

export default function DeliveryWorkerDashboard({ workerType }) {
  const { user, updateUser } = useAuthStore()
  const [worker, setWorker] = useState(user?.delivery_worker || null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [locationWarning, setLocationWarning] = useState('')
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

  useEffect(() => {
    loadWorker()
  }, [])

  useEffect(() => {
    if (!worker || worker.kyc_status !== 'APPROVED' || worker.operational_status === 'OFFLINE') return undefined
    const intervalMs = worker.operational_status === 'ON_DELIVERY' ? 15000 : type === 'messenger' ? 30000 : 60000
    const interval = window.setInterval(async () => {
      try {
        const position = await getPosition()
        const response = await workerAPI.locationPing(locationPayload(position))
        setWorker(response.worker || response.data)
      } catch {
        // Keep dashboard usable; visible status updates happen through explicit actions.
      }
    }, intervalMs)
    return () => window.clearInterval(interval)
  }, [worker?.operational_status, worker?.kyc_status, type])

  const goOnline = async () => {
    try {
      setBusy(true)
      let payload = null
      try {
        const position = await getPosition()
        payload = locationPayload(position)
        setLocationWarning('')
      } catch (locationError) {
        if (type === 'messenger') throw locationError
        setLocationWarning(isLocationPermissionDenied(locationError) ? 'permission-denied' : 'unavailable')
      }
      const response = await workerAPI.goOnline(type, payload)
      setWorker(response.worker || response.data)
      toast.success(payload ? 'You are online' : 'You are online. Enable location access when possible.')
    } catch (error) {
      if (type === 'rider' && isLocationPermissionDenied(error)) {
        setLocationWarning('permission-denied')
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
      const position = await getPosition()
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
      const position = await getPosition()
      const response = await workerAPI.locationPing(locationPayload(position))
      setWorker(response.worker || response.data)
      setLocationWarning('')
      toast.success('Location access enabled')
    } catch (error) {
      if (isLocationPermissionDenied(error)) {
        setLocationWarning('permission-denied')
      } else {
        setLocationWarning('unavailable')
      }
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

      {type === 'rider' && locationWarning && (
        <section className="worker-panel location-warning-card" aria-live="polite">
          <div>
            <AlertTriangle size={22} />
            <h2>Location Permission Needed</h2>
          </div>
          <p>FoodNova riders are not restricted by geo-fencing, but GPS access is required for:</p>
          <ul>
            <li>live delivery tracking</li>
            <li>assignment routing</li>
            <li>emergency support</li>
            <li>accurate delivery updates</li>
          </ul>
          <button type="button" onClick={retryLocation} disabled={busy}>
            <RefreshCw size={18} /> Enable Location Access
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
        <h2>Assigned Deliveries</h2>
        <p className="muted"><MapPin size={16} /> New delivery assignments will appear here after admin dispatch.</p>
      </section>
    </div>
  )
}
