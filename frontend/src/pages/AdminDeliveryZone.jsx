import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { adminAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './WorkerPages.css'

export default function AdminDeliveryZone() {
  const { isAdmin, admin } = useAuthStore()
  const [zone, setZone] = useState({ zone_name: '', center_latitude: '', center_longitude: '', radius_meters: 5000, is_active: true })
  const [saving, setSaving] = useState(false)

  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : []
  const isSuperAdmin = admin?.admin_role === 'super_admin' || (admin?.role === 'admin' && (!admin?.admin_role || permissions.length === 0))
  const canManage = isSuperAdmin || ['workforce:manage', 'delivery:manage', 'riders:manage'].some((permission) => permissions.includes(permission))

  useEffect(() => {
    const load = async () => {
      try {
        const response = await adminAPI.getDeliveryZone()
        setZone(response.zone || response.data)
      } catch (error) {
        toast.error(error?.response?.data?.detail || 'Failed to load delivery zone')
      }
    }
    if (isAdmin && canManage) load()
  }, [isAdmin, canManage])

  const update = (field, value) => setZone((current) => ({ ...current, [field]: value }))
  const submit = async (event) => {
    event.preventDefault()
    try {
      setSaving(true)
      const response = await adminAPI.updateDeliveryZone({
        ...zone,
        center_latitude: Number(zone.center_latitude),
        center_longitude: Number(zone.center_longitude),
        radius_meters: Number(zone.radius_meters),
      })
      setZone(response.zone || response.data)
      toast.success('Delivery zone updated')
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to update delivery zone')
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) return <div className="admin-page"><p>Access denied.</p></div>
  if (!canManage) return <div className="admin-page"><p>You do not have permission to manage delivery zones.</p></div>

  return (
    <div className="admin-page">
      <form className="delivery-zone-card" onSubmit={submit}>
        <h1>Delivery Zone Settings</h1>
        <p>Messenger geofencing uses this operational zone. Riders are tracked but not blocked by this radius.</p>
        <label>Zone Name<input value={zone.zone_name || ''} onChange={(event) => update('zone_name', event.target.value)} required /></label>
        <label>Center Latitude<input type="number" step="any" value={zone.center_latitude ?? ''} onChange={(event) => update('center_latitude', event.target.value)} required /></label>
        <label>Center Longitude<input type="number" step="any" value={zone.center_longitude ?? ''} onChange={(event) => update('center_longitude', event.target.value)} required /></label>
        <label>Radius Meters<input type="number" min="50" value={zone.radius_meters || 5000} onChange={(event) => update('radius_meters', event.target.value)} required /></label>
        <label className="zone-checkbox"><input type="checkbox" checked={zone.is_active !== false} onChange={(event) => update('is_active', event.target.checked)} /> Active zone</label>
        <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Zone'}</button>
      </form>
    </div>
  )
}
