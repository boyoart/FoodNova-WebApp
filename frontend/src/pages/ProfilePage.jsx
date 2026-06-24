import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { BellRing, ClipboardList, Home, KeyRound, LayoutDashboard, MapPin, Megaphone, Package, Phone, Plus, Save, ShieldCheck, Star, Trash2, Truck, UserRound, Users } from 'lucide-react'
import { authAPI, profileAPI, resolveMediaUrl } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { canUseAdminTools } from '../utils/accountRoles'
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

const adminToolLinks = [
  { to: '/admin/dashboard', label: 'Dashboard', description: 'Operations overview', icon: LayoutDashboard },
  { to: '/admin/orders', label: 'Orders', description: 'Search and update orders', icon: ClipboardList },
  { to: '/admin/dispatch', label: 'Dispatch', description: 'Riders and delivery status', icon: Truck },
  { to: '/admin/stock', label: 'Inventory', description: 'Products, packs, and stock', icon: Package },
  { to: '/admin/announcements', label: 'Announcements', description: 'Banners and promos', icon: Megaphone },
  { to: '/admin/customers', label: 'Customers', description: 'Customer list and activity', icon: Users },
  { to: '/admin/broadcasts', label: 'Broadcasts', description: 'Customer notifications', icon: BellRing },
]

export default function ProfilePage() {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const [profile, setProfile] = useState({ full_name: '', email: '', phone: '', avatar_url: '', role: '', admin_role: '' })
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })
  const [addresses, setAddresses] = useState([])
  const [form, setForm] = useState(emptyAddress)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [savingAddress, setSavingAddress] = useState(false)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const hasGoogleKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)

  useEffect(() => {
    loadProfile()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('highlight') !== 'biometric') return undefined
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [location.search, loading])

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
  }, [avatarPreview])

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
        role: nextProfile.role || user?.role || '',
        admin_role: nextProfile.admin_role || user?.admin_role || '',
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

  const handleAvatarFileChange = (event) => {
    const file = event.target.files?.[0]
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(null)
    setAvatarPreview('')

    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      event.target.value = ''
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Avatar image must be 5MB or smaller')
      event.target.value = ''
      return
    }

    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const uploadAvatar = async () => {
    if (!avatarFile) {
      toast.error('Please choose an avatar image first')
      return
    }

    try {
      setUploadingAvatar(true)
      const res = await profileAPI.uploadAvatar(avatarFile)
      const avatarUrl = res.avatar_url || res.data?.avatar_url || res.profile?.avatar_url || res.data?.profile?.avatar_url
      if (!avatarUrl) throw new Error('Avatar URL missing from response')
      const nextProfile = { ...profile, avatar_url: avatarUrl }
      setProfile(nextProfile)
      try {
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}')
        localStorage.setItem('user', JSON.stringify({ ...storedUser, avatar_url: avatarUrl }))
      } catch {
        // ignore local profile cache update failures
      }
      setAvatarFile(null)
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
      setAvatarPreview('')
      window.dispatchEvent(new Event('foodnova-profile-updated'))
      toast.success('Avatar uploaded')
    } catch (error) {
      toast.error(error.response?.status === 401 ? 'Session expired. Please log in again.' : (error.response?.data?.detail || 'Failed to upload avatar'))
      console.error(error)
    } finally {
      setUploadingAvatar(false)
    }
  }

  const changePassword = async (event) => {
    event.preventDefault()

    if (!passwordForm.current_password || !passwordForm.new_password || !passwordForm.confirm_password) {
      toast.error('Please complete all password fields')
      return
    }

    if (passwordForm.new_password.length < 6) {
      toast.error('New password must be at least 6 characters')
      return
    }

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('New password and confirmation must match')
      return
    }

    try {
      setChangingPassword(true)
      const res = await authAPI.changePassword(passwordForm)
      toast.success(res?.data?.message || 'Password changed successfully')
      setPasswordForm({
        current_password: '',
        new_password: '',
        confirm_password: '',
      })
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to change password')
      console.error(error)
    } finally {
      setChangingPassword(false)
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

  const showAdminTools = canUseAdminTools({ ...user, ...profile })

  return (
    <div className="profile-page">
      <div className="profile-hero">
        <div className="profile-avatar-large">
          {profile.avatar_url ? <img src={resolveMediaUrl(profile.avatar_url)} alt="Profile avatar" /> : getInitials(profile.full_name)}
        </div>
        <div className="profile-hero-text">
          <p className="eyebrow">FoodNova customer profile</p>
          <h1>{profile.full_name || 'My Profile'}</h1>
          <p>{profile.email || 'Your email will appear here'}</p>
          <p className="profile-phone"><Phone size={16} /> {profile.phone || 'Add your phone number'}</p>
        </div>
      </div>

      <div className="profile-grid">
        <div className="profile-column">
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

              <div className="avatar-upload-box">
                <div className="avatar-preview-card">
                  <div className="avatar-preview-image">
                    {avatarPreview || profile.avatar_url ? (
                      <img src={avatarPreview || resolveMediaUrl(profile.avatar_url)} alt="Avatar preview" />
                    ) : (
                      <span className="avatar-preview-placeholder">{getInitials(profile.full_name)}</span>
                    )}
                  </div>
                  <div>
                    <strong>Upload Avatar Picture</strong>
                    <p>Select a JPG, PNG, or WEBP image up to 5MB.</p>
                  </div>
                </div>

                <label className="avatar-file-input">
                  <span>Choose image</span>
                  <input type="file" accept="image/*" onChange={handleAvatarFileChange} />
                </label>

                <div className="avatar-upload-actions">
                  <button type="button" className="primary-action" onClick={uploadAvatar} disabled={!avatarFile || uploadingAvatar}>
                    {uploadingAvatar ? 'Uploading...' : 'Upload Avatar'}
                  </button>
                </div>
              </div>

              <button type="submit" className="primary-action" disabled={savingProfile}>
                <Save size={18} /> {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
          </section>

          {showAdminTools && (
            <section className="profile-panel admin-tools-panel">
              <div className="section-heading">
                <ShieldCheck size={20} />
                <div>
                  <h2>Admin Tools</h2>
                  <p>Quick access for FoodNova operations.</p>
                </div>
              </div>

              <div className="admin-tools-grid">
                {adminToolLinks.map(({ to, label, description, icon: Icon }) => (
                  <Link className="admin-tool-link" to={to} key={to}>
                    <Icon size={18} />
                    <span>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="profile-panel security-panel">
            <div className="section-heading">
              <KeyRound size={20} />
              <div>
                <h2>Account Security</h2>
                <p>Change your customer account password.</p>
              </div>
            </div>

            <form className="security-form premium-form" onSubmit={changePassword}>
              <label>
                <span>Current Password</span>
                <input
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(event) => setPasswordForm({ ...passwordForm, current_password: event.target.value })}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                />
              </label>

              <label>
                <span>New Password</span>
                <input
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(event) => setPasswordForm({ ...passwordForm, new_password: event.target.value })}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                />
              </label>

              <label>
                <span>Confirm New Password</span>
                <input
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(event) => setPasswordForm({ ...passwordForm, confirm_password: event.target.value })}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                />
              </label>

              <button type="submit" className="primary-action" disabled={changingPassword}>
                <KeyRound size={18} /> {changingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          </section>

        </div>

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
