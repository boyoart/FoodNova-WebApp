import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
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
  id_type: '',
  id_number: '',
  vehicle_type: '',
  partner_company: '',
  plate_number: '',
  driver_license_number: '',
}

export default function DeliveryWorkerSignup({ workerType }) {
  const routeType = useParams().workerType
  const type = (workerType || routeType) === 'rider' ? 'rider' : 'messenger'
  const [form, setForm] = useState(emptyForm)
  const [files, setFiles] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const title = useMemo(() => type === 'rider' ? 'FoodNova Rider Signup' : 'FoodNova Messenger Signup', [type])
  const subtitle = useMemo(
    () => type === 'rider'
      ? 'Apply as a vehicle-based delivery rider for FoodNova.'
      : 'Apply as a local walking delivery messenger for FoodNova.',
    [type],
  )
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const updateFile = (field, file) => setFiles((current) => ({ ...current, [field]: file || null }))

  const submit = async (event) => {
    event.preventDefault()
    if (form.password !== form.confirm_password) {
      toast.error('Passwords do not match')
      return
    }
    try {
      setSubmitting(true)
      await workerAPI.signup({
        ...form,
        worker_type: type,
        profile_photo: files.profile_photo,
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
            <label>Email Optional<input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></label>
            <label>Home Address<input value={form.home_address} onChange={(event) => update('home_address', event.target.value)} required /></label>
            <label>Password<input type="password" value={form.password} onChange={(event) => update('password', event.target.value)} required /></label>
            <label>Confirm Password<input type="password" value={form.confirm_password} onChange={(event) => update('confirm_password', event.target.value)} required /></label>
            <label>Emergency Contact Name<input value={form.emergency_contact_name} onChange={(event) => update('emergency_contact_name', event.target.value)} required /></label>
            <label>Emergency Contact Phone<input value={form.emergency_contact_phone} onChange={(event) => update('emergency_contact_phone', event.target.value)} required /></label>
            <label>ID Type<input value={form.id_type} onChange={(event) => update('id_type', event.target.value)} placeholder="NIN, Passport, Driver License" required /></label>
            <label>ID Number<input value={form.id_number} onChange={(event) => update('id_number', event.target.value)} required /></label>
            <label>Profile Photo Optional<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => updateFile('profile_photo', event.target.files?.[0])} /></label>
            <label>ID Upload Optional<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => updateFile('id_document', event.target.files?.[0])} /></label>
            {type === 'rider' && (
              <>
                <label>Vehicle Type<input value={form.vehicle_type} onChange={(event) => update('vehicle_type', event.target.value)} placeholder="Motorcycle, car, bike" required /></label>
                <label>Delivery Company Optional<input value={form.partner_company} onChange={(event) => update('partner_company', event.target.value)} placeholder="Company or partner name" /></label>
                <label>Plate Number Optional<input value={form.plate_number} onChange={(event) => update('plate_number', event.target.value)} /></label>
                <label>License Number Optional<input value={form.driver_license_number} onChange={(event) => update('driver_license_number', event.target.value)} /></label>
                <label>Vehicle Photo Optional<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => updateFile('vehicle_photo', event.target.files?.[0])} /></label>
              </>
            )}
          </div>

          <button type="submit" className="worker-primary-button" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit for Review'}</button>
          <p className="worker-auth-footer">Already approved? <Link to="/login">Login here</Link></p>
        </form>
      )}
    </div>
  )
}
