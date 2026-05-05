import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Home, MapPin, Phone, Plus, Save, Star, Trash2, UserRound } from 'lucide-react'
import { profileAPI } from '../services/api'
import './ProfilePage.css'

const emptyAddress = {
  label: 'Home',
  recipient_name: '',
  phone: '',
  country: 'Nigeria',
  state: '',
  city: '',
  lga: '',
  street: '',
  address_line: '',
  landmark: '',
  postal_code: '',
  is_default: false,
}

const getInitials = (name = 'User') =>
  name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U'

export default function ProfilePage() {
  const [profile, setProfile] = useState({ full_name: '', email: '', phone: '', avatar_url: '' })
  const [addresses, setAddresses] = useState([])
  const [form, setForm] = useState(emptyAddress)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingAddress, setSavingAddress] = useState(false)

  const hasGoogleKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      setLoading(true)
      const res = await profileAPI.getProfile()
      const body = res.data || res
      const nextProfile = body.profile || body.data?.profile || body || {}
      const nextAddresses = body.addresses || body.data?.addresses || []
      setProfile({
        full_name: nextProfile.full_name || nextProfile.name || '',
        email: nextProfile.email || '',
        phone: nextProfile.phone || '',
        avatar_url: nextProfile.avatar_url || '',
      })
      setAddresses(Array.isArray(nextAddresses) ? nextAddresses : [])
    } catch (error) {
      toast.error('Failed to load profile')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const reloadAddresses = async () => {
    const res = await profileAPI.getAddresses()
    const body = res.data || res
    setAddresses(body.addresses || body.data?.addresses || [])
  }

  const saveProfile = async (event) => {
    event.preventDefault()
    try {
      setSavingProfile(true)
      await profileAPI.updateProfile(profile)
      toast.success('Profile saved')
      await loadProfile()
    } catch (error) {
      toast.error('Failed to save profile')
      console.error(error)
    } finally {
      setSavingProfile(false)
    }
  }

  const saveAddress = async (event) => {
    event.preventDefault()

    if (!form.recipient_name || !form.phone || !form.address_line || !form.city || !form.state) {
      toast.error('Please complete recipient, phone, address, city, and state')
      return
    }

    try {
      setSavingAddress(true)
      if (editingId) {
        await profileAPI.updateAddress(editingId, form)
        toast.success('Address updated')
      } else {
        await profileAPI.createAddress(form)
        toast.success('Address added')
      }
      await reloadAddresses()
      setForm(emptyAddress)
      setEditingId(null)
    } catch (error) {
      toast.error('Failed to save address')
      console.error(error)
    } finally {
      setSavingAddress(false)
    }
  }

  const editAddress = (address) => {
    setEditingId(address.id)
    setForm({ ...emptyAddress, ...address })
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  const deleteAddress = async (addressId) => {
    try {
      await profileAPI.deleteAddress(addressId)
      setAddresses((current) => current.filter((address) => address.id !== addressId))
      toast.success('Address deleted')
    } catch (error) {
      toast.error('Failed to delete address')
    }
  }

  const setDefaultAddress = async (addressId) => {
    try {
      await profileAPI.setDefaultAddress(addressId)
      await reloadAddresses()
      toast.success('Default address updated')
    } catch (error) {
      toast.error('Failed to set default address')
    }
  }

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const formatAddress = (address) =>
    [
      address.address_line,
      address.street,
      address.city,
      address.lga,
      address.state,
      address.country,
    ]
      .filter(Boolean)
      .join(', ')

  if (loading) {
    return <div className="profile-page"><div className="profile-loading">Loading profile...</div></div>
  }

  return (
    <div className="profile-page">
      <div className="profile-hero">
        <div className="profile-avatar-large">
          {profile.avatar_url ? <img src={profile.avatar_url} alt="Profile avatar" /> : getInitials(profile.full_name)}
        </div>
        <div className="profile-hero-text">
          <p className="eyebrow">FoodNova customer profile</p>
          <h1>{profile.full_name || 'My Profile'}</h1>
          <p>{profile.email || 'Your email will appear here'}</p>
          <p className="profile-phone"><Phone size={16} /> {profile.phone || 'Add your phone number'}</p>
        </div>
      </div>

      <div className="profile-grid">
        <section className="profile-panel">
          <div className="section-heading">
            <UserRound size={20} />
            <div>
              <h2>Personal Information</h2>
              <p>Keep your contact details updated for orders and delivery.</p>
            </div>
          </div>

          <form className="profile-form premium-form" onSubmit={saveProfile}>
            <label>
              <span>Full Name</span>
              <input
                value={profile.full_name || ''}
                onChange={(event) => setProfile({ ...profile, full_name: event.target.value })}
                placeholder="Enter full name"
              />
            </label>

            <label>
              <span>Phone Number</span>
              <input
                value={profile.phone || ''}
                onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                placeholder="080... or +234..."
              />
            </label>

            <label>
              <span>Avatar Image URL</span>
              <input
                value={profile.avatar_url || ''}
                onChange={(event) => setProfile({ ...profile, avatar_url: event.target.value })}
                placeholder="https://example.com/photo.jpg"
              />
            </label>

            <button type="submit" className="primary-action" disabled={savingProfile}>
              <Save size={18} /> {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </section>

        <section className="profile-panel address-panel">
          <div className="section-heading">
            <MapPin size={20} />
            <div>
              <h2>Saved Delivery Addresses</h2>
              <p>Select a default address for faster checkout.</p>
            </div>
          </div>

          {addresses.length === 0 ? (
            <div className="empty-address-state">
              <Home size={32} />
              <p>No saved addresses yet. Add your first Nigerian delivery address below.</p>
            </div>
          ) : (
            <div className="address-list">
              {addresses.map((address) => (
                <article className="address-card" key={address.id}>
                  <div className="address-card-header">
                    <strong>{address.label || 'Address'}</strong>
                    {address.is_default && <span className="default-badge"><Star size={13} /> Default</span>}
                  </div>
                  <p className="address-recipient">{address.recipient_name} • {address.phone}</p>
                  <p className="address-text">{formatAddress(address)}</p>
                  {address.landmark && <p className="address-landmark">Landmark: {address.landmark}</p>}
                  <div className="address-actions">
                    <button type="button" onClick={() => editAddress(address)}>Edit</button>
                    {!address.is_default && <button type="button" onClick={() => setDefaultAddress(address.id)}>Set Default</button>}
                    <button type="button" className="danger-action" onClick={() => deleteAddress(address.id)}><Trash2 size={14} /> Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="profile-panel add-address-panel">
        <div className="section-heading">
          <Plus size={20} />
          <div>
            <h2>{editingId ? 'Edit Delivery Address' : 'Add Delivery Address'}</h2>
            <p>{hasGoogleKey ? 'Google autocomplete can help fill your address, and manual entry is still available.' : 'Manual Nigerian address entry is active.'}</p>
          </div>
        </div>

        {hasGoogleKey && (
          <div className="google-address-note">
            Google address autocomplete is enabled through your environment key. You can still adjust details manually before saving.
          </div>
        )}

        <form className="address-form premium-form" onSubmit={saveAddress}>
          <div className="form-row">
            <label>
              <span>Address Label</span>
              <input value={form.label || ''} onChange={(event) => updateForm('label', event.target.value)} placeholder="Home, Office, Church" />
            </label>
            <label>
              <span>Recipient Name</span>
              <input value={form.recipient_name || ''} onChange={(event) => updateForm('recipient_name', event.target.value)} placeholder="Who will receive the order?" />
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Phone</span>
              <input value={form.phone || ''} onChange={(event) => updateForm('phone', event.target.value)} placeholder="Recipient phone number" />
            </label>
            <label>
              <span>Country</span>
              <input value={form.country || ''} onChange={(event) => updateForm('country', event.target.value)} placeholder="Nigeria" />
            </label>
          </div>

          <div className="form-row three-columns">
            <label>
              <span>State</span>
              <input value={form.state || ''} onChange={(event) => updateForm('state', event.target.value)} placeholder="Lagos" />
            </label>
            <label>
              <span>City / Town</span>
              <input value={form.city || ''} onChange={(event) => updateForm('city', event.target.value)} placeholder="Lekki, Ikeja, Abuja..." />
            </label>
            <label>
              <span>LGA</span>
              <input value={form.lga || ''} onChange={(event) => updateForm('lga', event.target.value)} placeholder="Eti-Osa" />
            </label>
          </div>

          <label>
            <span>Street / Area</span>
            <input value={form.street || ''} onChange={(event) => updateForm('street', event.target.value)} placeholder="Street, estate, area" />
          </label>

          <label>
            <span>Full Address</span>
            <textarea value={form.address_line || ''} onChange={(event) => updateForm('address_line', event.target.value)} placeholder="House number, street, estate, bus stop, area" rows="3" />
          </label>

          <div className="form-row">
            <label>
              <span>Landmark</span>
              <input value={form.landmark || ''} onChange={(event) => updateForm('landmark', event.target.value)} placeholder="Near supermarket, church, school..." />
            </label>
            <label>
              <span>Postal Code</span>
              <input value={form.postal_code || ''} onChange={(event) => updateForm('postal_code', event.target.value)} placeholder="Optional" />
            </label>
          </div>

          <label className="checkbox-label">
            <input type="checkbox" checked={Boolean(form.is_default)} onChange={(event) => updateForm('is_default', event.target.checked)} />
            <span>Make this my default delivery address</span>
          </label>

          <div className="form-actions">
            {editingId && <button type="button" className="secondary-action" onClick={() => { setEditingId(null); setForm(emptyAddress) }}>Cancel Edit</button>}
            <button type="submit" className="primary-action" disabled={savingAddress}>
              <Save size={18} /> {savingAddress ? 'Saving...' : editingId ? 'Update Address' : 'Add Address'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
