import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Camera, RefreshCw, ShieldCheck } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { workerAPI } from '../services/api'
import './WorkerPages.css'

const emptyForm = {
  full_name: '',
  phone: '',
  email: '',
  password: '',
  confirm_password: '',
  home_address: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  nin_number: '',
  nin_consent: false,
  id_type: '',
  id_number: '',
  vehicle_type: '',
  partner_company: '',
  plate_number: '',
  driver_license_number: '',
}

function isMobileSignupDevice() {
  const ua = navigator.userAgent || ''
  const native = Capacitor.isNativePlatform?.() === true
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  const mobileViewport = window.matchMedia?.('(max-width: 820px)').matches
  return native || (mobileUa && mobileViewport)
}

function dataUrlToFile(dataUrl, filename) {
  const [meta, content] = dataUrl.split(',')
  const mime = meta.match(/data:(.*?);base64/)?.[1] || 'image/jpeg'
  const binary = atob(content)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new File([bytes], filename, { type: mime })
}

export default function DeliveryWorkerSignup({ workerType }) {
  const routeType = useParams().workerType
  const type = (workerType || routeType) === 'rider' ? 'rider' : 'messenger'
  const [form, setForm] = useState(emptyForm)
  const [files, setFiles] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [verifyingNin, setVerifyingNin] = useState(false)
  const [ninVerification, setNinVerification] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [mobileAllowed, setMobileAllowed] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [selfiePreview, setSelfiePreview] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const title = useMemo(() => type === 'rider' ? 'FoodNova Rider Signup' : 'FoodNova Messenger Signup', [type])
  const subtitle = useMemo(
    () => type === 'rider'
      ? 'Apply as a vehicle-based delivery rider for FoodNova.'
      : 'Apply as a local walking delivery messenger for FoodNova.',
    [type],
  )

  useEffect(() => {
    setMobileAllowed(isMobileSignupDevice())
    return () => {
      streamRef.current?.getTracks?.().forEach((track) => track.stop())
    }
  }, [])

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (field === 'nin_number') setNinVerification(null)
  }
  const updateFile = (field, file) => setFiles((current) => ({ ...current, [field]: file || null }))

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraActive(true)
    } catch (error) {
      toast.error(error?.message || 'Unable to open camera. Please allow camera access.')
    }
  }

  const captureSelfie = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 640
    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
    const file = dataUrlToFile(dataUrl, `foodnova-selfie-${Date.now()}.jpg`)
    updateFile('selfie', file)
    setSelfiePreview(dataUrl)
    streamRef.current?.getTracks?.().forEach((track) => track.stop())
    streamRef.current = null
    setCameraActive(false)
  }

  const verifyNin = async () => {
    const nin = form.nin_number.replace(/\D/g, '')
    if (nin.length !== 11) {
      toast.error('NIN must be exactly 11 digits')
      return
    }
    if (!form.nin_consent) {
      toast.error('Consent is required before NIN verification')
      return
    }
    try {
      setVerifyingNin(true)
      const result = await workerAPI.verifyNin({
        nin,
        consent: true,
        consentAccepted: true,
        consentTimestamp: new Date().toISOString(),
        deviceMetadata: {
          userAgent: navigator.userAgent || '',
          platform: navigator.platform || '',
          language: navigator.language || '',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        },
      })
      if (!result.verified) {
        setNinVerification(null)
        toast.error(result.message || 'NIN verification failed. Please check the number and try again.')
        return
      }
      setNinVerification(result)
      toast.success('Identity Verified. Submitted for operational review.')
    } catch (error) {
      setNinVerification(null)
      toast.error(error?.response?.data?.detail || 'NIN verification failed. Please check the number and try again.')
    } finally {
      setVerifyingNin(false)
    }
  }

  const validate = () => {
    if (!mobileAllowed) return 'Delivery partner registration must be completed on a mobile phone so we can capture your selfie and verify your identity.'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return 'A valid email is required'
    if (form.phone.replace(/\D/g, '').length < 10) return 'A valid phone number is required'
    if (form.password !== form.confirm_password) return 'Passwords do not match'
    if (form.nin_number.replace(/\D/g, '').length !== 11) return 'NIN must be exactly 11 digits'
    if (!form.nin_consent) return 'NIN verification consent is required'
    if (!ninVerification?.verified) return 'Verify NIN before submitting'
    if (!files.selfie) return 'Capture a live selfie before submitting'
    if (!files.id_document) return 'Upload ID document before submitting'
    if (type === 'rider') {
      if (!form.vehicle_type.trim()) return 'Vehicle type is required'
      if (!form.plate_number.trim()) return 'Plate number is required'
      if (!form.driver_license_number.trim()) return 'Driver license number is required'
      if (!files.vehicle_photo) return 'Vehicle photo is required'
    }
    return ''
  }

  const submit = async (event) => {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      toast.error(validationError)
      return
    }
    try {
      setSubmitting(true)
      await workerAPI.signup({
        ...form,
        nin_number: form.nin_number.replace(/\D/g, ''),
        worker_type: type,
        selfie: files.selfie,
        id_document: files.id_document,
        vehicle_photo: files.vehicle_photo,
      })
      toast.success('Delivery account submitted for review')
      setSubmitted(true)
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Signup failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!mobileAllowed) {
    return (
      <div className="worker-auth-page">
        <section className="worker-signup-card worker-submitted-card">
          <div className="worker-auth-header">
            <p>Mobile registration required</p>
            <h1>{title}</h1>
            <span>Delivery partner registration must be completed on a mobile phone so we can capture your selfie and verify your identity.</span>
          </div>
          <p className="worker-auth-footer"><Link to="/">Back to FoodNova</Link></p>
        </section>
      </div>
    )
  }

  return (
    <div className="worker-auth-page">
      {submitted ? (
        <section className="worker-signup-card worker-submitted-card">
          <div className="worker-auth-header">
            <p>Application received</p>
            <h1>{title}</h1>
            <span>Your FoodNova delivery account is under review. You will be notified once approved.</span>
          </div>
          <p className="worker-auth-footer"><Link to="/login">Go to login</Link></p>
        </section>
      ) : (
        <form className="worker-signup-card" onSubmit={submit}>
          <div className="worker-auth-header">
            <p>Private FoodNova workforce link</p>
            <h1>{title}</h1>
            <span>{subtitle}</span>
          </div>

          <div className="worker-form-grid">
            <label>Full Name<input value={form.full_name} onChange={(event) => update('full_name', event.target.value)} required /></label>
            <label>Phone<input value={form.phone} onChange={(event) => update('phone', event.target.value)} required /></label>
            <label>Email<input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} required /></label>
            <label>Home Address<input value={form.home_address} onChange={(event) => update('home_address', event.target.value)} required /></label>
            <label>Password<input type="password" value={form.password} onChange={(event) => update('password', event.target.value)} required /></label>
            <label>Confirm Password<input type="password" value={form.confirm_password} onChange={(event) => update('confirm_password', event.target.value)} required /></label>
            <label>Emergency Contact Name<input value={form.emergency_contact_name} onChange={(event) => update('emergency_contact_name', event.target.value)} required /></label>
            <label>Emergency Contact Phone<input value={form.emergency_contact_phone} onChange={(event) => update('emergency_contact_phone', event.target.value)} required /></label>
            <label>NIN Number<input inputMode="numeric" maxLength="11" value={form.nin_number} onChange={(event) => update('nin_number', event.target.value.replace(/\D/g, ''))} required /></label>
            <label>ID Type<input value={form.id_type} onChange={(event) => update('id_type', event.target.value)} placeholder="NIN, Passport, Driver License" required /></label>
            <label>ID Number<input value={form.id_number} onChange={(event) => update('id_number', event.target.value)} required /></label>
            <label>ID Document Upload<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => updateFile('id_document', event.target.files?.[0])} required /></label>
          </div>

          <label className="worker-consent">
            <input type="checkbox" checked={form.nin_consent} onChange={(event) => update('nin_consent', event.target.checked)} />
            <span>I consent to FoodNova verifying my identity using my NIN for worker activation and compliance purposes.</span>
          </label>
          <div className="worker-verify-row">
            <button type="button" onClick={verifyNin} disabled={verifyingNin || !form.nin_consent || form.nin_number.length !== 11}>
              <ShieldCheck size={18} /> {verifyingNin ? 'Verifying...' : 'Verify NIN'}
            </button>
            {ninVerification?.verified && <span>✔ Identity Verified. Submitted for operational review - *******{ninVerification.nin_last4}</span>}
          </div>

          <section className="worker-camera-panel">
            <h2>Live Selfie</h2>
            <p>Use your phone camera to capture a clear selfie for KYC review.</p>
            {selfiePreview ? <img src={selfiePreview} alt="Selfie preview" /> : <video ref={videoRef} autoPlay playsInline muted />}
            <div>
              {!cameraActive && <button type="button" onClick={startCamera}><Camera size={18} /> {selfiePreview ? 'Retake Selfie' : 'Open Camera'}</button>}
              {cameraActive && <button type="button" onClick={captureSelfie}><Camera size={18} /> Capture Selfie</button>}
              {selfiePreview && <button type="button" onClick={() => { setSelfiePreview(''); updateFile('selfie', null); startCamera() }}><RefreshCw size={18} /> Retake</button>}
            </div>
          </section>

          {type === 'rider' && (
            <div className="worker-form-grid">
              <label>Vehicle Type<input value={form.vehicle_type} onChange={(event) => update('vehicle_type', event.target.value)} placeholder="Motorcycle, car, bike" required /></label>
              <label>Delivery Company Optional<input value={form.partner_company} onChange={(event) => update('partner_company', event.target.value)} placeholder="Company or partner name" /></label>
              <label>Plate Number<input value={form.plate_number} onChange={(event) => update('plate_number', event.target.value)} required /></label>
              <label>License Number<input value={form.driver_license_number} onChange={(event) => update('driver_license_number', event.target.value)} required /></label>
              <label>Vehicle Photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => updateFile('vehicle_photo', event.target.files?.[0])} required /></label>
            </div>
          )}

          <button type="submit" className="worker-primary-button" disabled={submitting || !ninVerification?.verified}>{submitting ? 'Submitting...' : 'Submit for Review'}</button>
          <p className="worker-auth-footer">Already approved? <Link to="/login">Login here</Link></p>
        </form>
      )}
    </div>
  )
}
