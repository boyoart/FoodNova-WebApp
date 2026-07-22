import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { adminAPI, resolveMediaUrl } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { formatPrice } from '../utils/formatters'
import './AdminExpansion.css'

const errorText = (error, fallback = 'Request failed') => {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((item) => item?.msg || String(item)).join(' | ')
  return error?.message || fallback
}

const listFrom = (body, key) => body?.[key] || body?.data || []
const dateInput = (value) => value ? String(value).slice(0, 16) : ''
const isoOrNull = (value) => value ? new Date(value).toISOString() : null

function AdminGate({ permissions = [], children }) {
  const { isAdmin, admin } = useAuthStore()
  const assigned = Array.isArray(admin?.permissions) ? admin.permissions : []
  const role = String(admin?.admin_role || '').toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
  const superAdmin = role === 'super_admin' || (admin?.role === 'admin' && (!role || assigned.length === 0))
  if (!isAdmin) return <div className="admin-page"><div className="cms-state">Admin login is required.</div></div>
  if (!superAdmin && permissions.length && !permissions.some((permission) => assigned.includes(permission))) {
    return <div className="admin-page"><div className="cms-state error">You do not have permission to access this module.</div></div>
  }
  return children
}

function PageHeader({ title, description }) {
  return <div className="cms-header"><div><Link to="/admin/dashboard" className="cms-back">← Admin Dashboard</Link><h1>{title}</h1><p>{description}</p></div></div>
}

function State({ loading, error, empty, retry }) {
  if (loading) return <div className="cms-state">Loading…</div>
  if (error) return <div className="cms-state error"><p>{error}</p><button className="btn-primary" onClick={retry}>Retry</button></div>
  if (empty) return <div className="cms-state">No records found.</div>
  return null
}

export function AdminReports() {
  const now = new Date(); const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30)
  const [range, setRange] = useState({ start_date: monthAgo.toISOString().slice(0, 10), end_date: now.toISOString().slice(0, 10) })
  const [report, setReport] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const load = async () => {
    console.info('ADMIN_REPORTS_REQUEST_STARTED', { range })
    try {
      setLoading(true); setError('')
      const body = await adminAPI.getReports(range)
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        console.warn('ADMIN_REPORTS_RESPONSE_INVALID', { response_type: typeof body })
        throw new Error('The reports service returned an invalid response. Please retry.')
      }
      setReport(body)
      console.info('ADMIN_REPORTS_REQUEST_SUCCEEDED', { has_summary: !!body.summary })
    } catch (e) {
      console.warn('ADMIN_REPORTS_REQUEST_FAILED', { status: e?.response?.status || 0, reason: errorText(e) })
      setReport(null); setError(errorText(e, 'Unable to load reports'))
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const download = async (type) => { try { const blob = await adminAPI.exportReport(type); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `foodnova-${type}.csv`; link.click(); URL.revokeObjectURL(url) } catch (e) { toast.error(errorText(e, 'Export failed')) } }
  const summary = report?.summary || report?.data || {}
  const breakdown = (value) => Array.isArray(value)
    ? value.map((item) => [item?.status || 'unknown', Number(item?.count || 0)])
    : Object.entries(value || {}).map(([status, count]) => [status, Number(count || 0)])
  return <AdminGate permissions={['reports:view']}><div className="admin-page"><PageHeader title="Reports" description="Operational reporting from authoritative order, payment, inventory, and customer data." />
    <form className="cms-toolbar" onSubmit={(e) => { e.preventDefault(); load() }}><label>From<input type="date" value={range.start_date} onChange={(e) => setRange({ ...range, start_date: e.target.value })} /></label><label>To<input type="date" value={range.end_date} onChange={(e) => setRange({ ...range, end_date: e.target.value })} /></label><button className="btn-primary">Apply</button></form>
    <State loading={loading} error={error} retry={load} />{!loading && !error && <><div className="cms-metrics">{[
      ['Orders', summary.total_orders || 0], ['Confirmed Revenue', formatPrice(summary.confirmed_revenue || 0)], ['Pending Payments', summary.pending_payments || 0], ['Delivered', summary.delivered_orders || 0], ['Active Customers', summary.active_customers || 0], ['Assigned Deliveries', summary.assigned_deliveries || 0]
    ].map(([label, value]) => <div className="cms-metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="cms-grid two"><section className="cms-panel"><h2>Order Status</h2>{breakdown(report?.orders_by_status).map(([key, value]) => <div className="cms-breakdown" key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{value}</strong></div>)}</section><section className="cms-panel"><h2>Payment Status</h2>{breakdown(report?.payments_by_status).map(([key, value]) => <div className="cms-breakdown" key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{value}</strong></div>)}</section></div>
    <section className="cms-panel"><div className="cms-panel-title"><h2>Top Products</h2><div className="cms-actions"><button type="button" onClick={() => download('orders')}>Export Orders</button><button type="button" onClick={() => download('products')}>Export Products</button><button type="button" onClick={() => download('customers')}>Export Customers</button></div></div>{(report?.top_products || []).length ? <div className="cms-table"><table><thead><tr><th>Product</th><th>Quantity</th><th>Revenue</th></tr></thead><tbody>{report.top_products.map((item) => <tr key={`${item.product_id}-${item.name}`}><td>{item.name}</td><td>{item.quantity_sold}</td><td>{formatPrice(item.revenue)}</td></tr>)}</tbody></table></div> : <div className="cms-state">No product sales were recorded for this date range.</div>}</section></>}</div></AdminGate>
}

const emptyAnnouncement = { title: '', message: '', display_type: 'top_bar', button_text: '', button_link: '', image_url: '', theme: 'green', priority: 0, is_active: true, start_date: '', end_date: '' }

function AnnouncementManager({ banners = false }) {
  const [items, setItems] = useState([]); const [form, setForm] = useState({ ...emptyAnnouncement, display_type: banners ? 'hero_banner' : 'top_bar' }); const [editing, setEditing] = useState(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const load = async () => { try { setLoading(true); setError(''); const body = await adminAPI.getAnnouncements(); const all = listFrom(body, 'announcements'); setItems(all.filter((item) => banners ? item.display_type === 'hero_banner' : item.display_type !== 'hero_banner')) } catch (e) { setError(errorText(e)) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])
  const reset = () => { setEditing(null); setForm({ ...emptyAnnouncement, display_type: banners ? 'hero_banner' : 'top_bar' }) }
  const edit = (item) => { setEditing(item.id); setForm({ ...emptyAnnouncement, ...item, start_date: dateInput(item.start_date), end_date: dateInput(item.end_date) }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const upload = async (file) => { if (!file) return; try { const body = await adminAPI.uploadAnnouncementImage(file); setForm((current) => ({ ...current, image_url: body.image_url || body.url || body.data?.image_url || '' })); toast.success('Image uploaded') } catch (e) { toast.error(errorText(e, 'Image upload failed')) } }
  const save = async (event) => { event.preventDefault(); if (!form.title.trim() || !form.message.trim()) return toast.error('Title and message are required'); try { setSaving(true); const payload = { ...form, priority: Number(form.priority || 0), display_type: banners ? 'hero_banner' : form.display_type, start_date: isoOrNull(form.start_date), end_date: isoOrNull(form.end_date) }; if (editing) await adminAPI.updateAnnouncement(editing, payload); else await adminAPI.createAnnouncement(payload); toast.success(`${banners ? 'Banner' : 'Announcement'} saved`); reset(); await load() } catch (e) { toast.error(errorText(e)) } finally { setSaving(false) } }
  const remove = async (item) => { if (!window.confirm(`Delete “${item.title}”?`)) return; try { await adminAPI.deleteAnnouncement(item.id); setItems((current) => current.filter((value) => value.id !== item.id)); toast.success('Deleted') } catch (e) { toast.error(errorText(e)) } }
  const toggle = async (item) => { try { await adminAPI.updateAnnouncement(item.id, { is_active: !item.is_active }); await load() } catch (e) { toast.error(errorText(e)) } }
  const title = banners ? 'Homepage Banners' : 'Announcements'; const permissions = ['announcements:view', 'announcements:manage']
  return <AdminGate permissions={permissions}><div className="admin-page"><PageHeader title={title} description={banners ? 'Hero content shared by the existing announcement content service.' : 'Persistent published notices. Use Broadcasts for direct customer messages.'} />
    <form className="cms-panel cms-form" onSubmit={save}><h2>{editing ? 'Edit' : 'Create'} {banners ? 'Banner' : 'Announcement'}</h2><div className="cms-grid two"><label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label><label>Display type<select value={form.display_type} disabled={banners} onChange={(e) => setForm({ ...form, display_type: e.target.value })}><option value="top_bar">Top bar</option><option value="modal">Modal</option><option value="inline">Inline</option><option value="hero_banner">Hero banner</option></select></label></div><label>Message<textarea rows="3" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required /></label><div className="cms-grid three"><label>CTA text<input value={form.button_text || ''} onChange={(e) => setForm({ ...form, button_text: e.target.value })} /></label><label>CTA link<input value={form.button_link || ''} onChange={(e) => setForm({ ...form, button_link: e.target.value })} /></label><label>Priority / order<input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></label></div><div className="cms-grid three"><label>Start<input type="datetime-local" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label><label>End<input type="datetime-local" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label><label>Image<input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} /></label></div>{form.image_url && <img className="cms-preview" src={resolveMediaUrl(form.image_url)} alt="Preview" />}<label className="cms-check"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active</label><div className="cms-actions"><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>{editing && <button type="button" onClick={reset}>Cancel</button>}</div></form>
    <State loading={loading} error={error} empty={!items.length} retry={load} />{!loading && !error && <div className="cms-card-grid">{items.map((item) => <article className="cms-record" key={item.id}>{item.image_url && <img src={resolveMediaUrl(item.image_url)} alt="" />}<div><div className="cms-record-title"><h3>{item.title}</h3><span className={item.is_active ? 'cms-badge active' : 'cms-badge'}>{item.is_active ? 'Active' : 'Inactive'}</span></div><p>{item.message}</p><small>{item.display_type} · priority {item.priority || 0}</small><div className="cms-actions"><button onClick={() => edit(item)}>Edit</button><button onClick={() => toggle(item)}>{item.is_active ? 'Deactivate' : 'Activate'}</button><button className="danger" onClick={() => remove(item)}>Delete</button></div></div></article>)}</div>}</div></AdminGate>
}

export const AdminBanners = () => <AnnouncementManager banners />
export const AdminAnnouncements = () => <AnnouncementManager />

export function AdminDeliveryZones() {
  const [zone, setZone] = useState(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const load = async () => { try { setLoading(true); setError(''); const body = await adminAPI.getDeliveryZone(); setZone(body.zone || body.data) } catch (e) { setError(errorText(e)) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])
  const save = async (event) => { event.preventDefault(); try { setSaving(true); const body = await adminAPI.updateDeliveryZone({ ...zone, center_latitude: Number(zone.center_latitude), center_longitude: Number(zone.center_longitude), radius_meters: Number(zone.radius_meters) }); setZone(body.zone || body.data); toast.success('Delivery zone updated') } catch (e) { toast.error(errorText(e)) } finally { setSaving(false) } }
  return <AdminGate permissions={['delivery_zones:view', 'delivery_zones:manage', 'workforce:view', 'workforce:manage']}><div className="admin-page"><PageHeader title="Delivery Zones" description="The backend currently supports one circular operational zone used for rider matching—not map polygons or pricing tiers." /><State loading={loading} error={error} retry={load} />{zone && <form className="cms-panel cms-form" onSubmit={save}><div className="cms-grid two"><label>Zone name<input value={zone.zone_name || ''} onChange={(e) => setZone({ ...zone, zone_name: e.target.value })} required /></label><label>Radius (metres)<input type="number" min="50" value={zone.radius_meters || 0} onChange={(e) => setZone({ ...zone, radius_meters: e.target.value })} required /></label><label>Centre latitude<input type="number" step="any" min="-90" max="90" value={zone.center_latitude ?? ''} onChange={(e) => setZone({ ...zone, center_latitude: e.target.value })} required /></label><label>Centre longitude<input type="number" step="any" min="-180" max="180" value={zone.center_longitude ?? ''} onChange={(e) => setZone({ ...zone, center_longitude: e.target.value })} required /></label></div><label className="cms-check"><input type="checkbox" checked={zone.is_active !== false} onChange={(e) => setZone({ ...zone, is_active: e.target.checked })} /> Zone active</label><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Zone'}</button></form>}</div></AdminGate>
}

export function AdminWebsiteSettings() {
  const [settings, setSettings] = useState(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const load = async () => { try { setLoading(true); setError(''); const body = await adminAPI.getWebsiteSettings(); setSettings(body.settings || body.data) } catch (e) { setError(errorText(e)) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])
  const save = async (event) => { event.preventDefault(); try { setSaving(true); const body = await adminAPI.updateWebsiteSettings(settings); setSettings(body.settings || body.data); toast.success('Website settings saved') } catch (e) { toast.error(errorText(e)) } finally { setSaving(false) } }
  const field = (key, label, type = 'text') => <label>{label}<input type={type} value={settings?.[key] || ''} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} /></label>
  return <AdminGate permissions={['website_settings:view', 'website_settings:manage', 'announcements:manage']}><div className="admin-page"><PageHeader title="Website Settings" description="Safe public business and launch settings only. Infrastructure credentials are never exposed here." /><State loading={loading} error={error} retry={load} />{settings && <form className="cms-panel cms-form" onSubmit={save}><h2>General</h2><div className="cms-grid two">{field('siteName', 'Site name')}{field('siteDescription', 'Site description')}</div><h2>Maintenance & Coming Soon</h2><div className="cms-grid two">{field('headline', 'Coming-soon headline')}{field('launchDate', 'Launch date', 'datetime-local')}</div><label>Coming-soon message<textarea rows="3" value={settings.subtext || ''} onChange={(e) => setSettings({ ...settings, subtext: e.target.value })} /></label><div className="cms-grid three"><label className="cms-check"><input type="checkbox" checked={!!settings.comingSoonEnabled} onChange={(e) => setSettings({ ...settings, comingSoonEnabled: e.target.checked })} /> Coming Soon</label><label className="cms-check"><input type="checkbox" checked={!!settings.maintenanceMode} onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })} /> Maintenance</label><label className="cms-check"><input type="checkbox" checked={!!settings.splashEnabled} onChange={(e) => setSettings({ ...settings, splashEnabled: e.target.checked })} /> Splash enabled</label></div><h2>Homepage references</h2><div className="cms-grid two">{field('featuredPacks', 'Featured pack IDs')}{field('homepageAnnouncement', 'Homepage announcement reference')}</div><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button></form>}</div></AdminGate>
}

export function AdminComingSoonSubscribers() {
  const [items, setItems] = useState([]); const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [meta, setMeta] = useState({ page: 1, page_size: 50, total: 0 })
  const load = async (page = 1) => { try { setLoading(true); setError(''); const body = await adminAPI.getComingSoonSubscribers({ ...(query ? { search: query } : {}), page, page_size: meta.page_size }); setItems(listFrom(body, 'subscribers')); setMeta((current) => ({ ...current, page: body.page || page, page_size: body.page_size || current.page_size, total: body.total ?? body.count ?? 0 })) } catch (e) { setError(errorText(e)) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])
  const remove = async (item) => { if (!window.confirm(`Remove ${item.email} from the launch list?`)) return; try { await adminAPI.deleteComingSoonSubscriber(item.id); setItems((current) => current.filter((value) => value.id !== item.id)); toast.success('Subscriber removed') } catch (e) { toast.error(errorText(e)) } }
  const exportCsv = () => { const content = ['email,source,subscribed_at', ...items.map((item) => [item.email, item.source, item.created_at].map((value) => `"${String(value || '').replaceAll('"', '""')}"`).join(','))].join('\n'); const url = URL.createObjectURL(new Blob([content], { type: 'text/csv' })); const link = document.createElement('a'); link.href = url; link.download = 'foodnova-coming-soon-subscribers.csv'; link.click(); URL.revokeObjectURL(url) }
  const hasPrevious = meta.page > 1; const hasNext = meta.page * meta.page_size < meta.total
  return <AdminGate permissions={['subscribers:view', 'subscribers:manage', 'announcements:view']}><div className="admin-page"><PageHeader title="Coming Soon Subscribers" description="Launch-list email addresses and subscription dates." /><form className="cms-toolbar" onSubmit={(e) => { e.preventDefault(); load(1) }}><input placeholder="Search email" value={query} onChange={(e) => setQuery(e.target.value)} /><button className="btn-primary">Search</button><button type="button" onClick={exportCsv} disabled={!items.length}>Export current page</button></form><State loading={loading} error={error} empty={!items.length} retry={() => load(meta.page)} />{!loading && !error && items.length > 0 && <><div className="cms-table"><table><thead><tr><th>Email</th><th>Source</th><th>Subscribed</th><th></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.email}</td><td>{item.source}</td><td>{item.created_at ? new Date(item.created_at).toLocaleString() : '—'}</td><td><button className="danger" onClick={() => remove(item)}>Remove</button></td></tr>)}</tbody></table></div><div className="cms-pagination"><button disabled={!hasPrevious} onClick={() => load(meta.page - 1)}>Previous</button><span>Page {meta.page} · {meta.total} subscribers</span><button disabled={!hasNext} onClick={() => load(meta.page + 1)}>Next</button></div></>}</div></AdminGate>
}

const emptyCategory = { name: '', slug: '', description: '', image_url: '', display_order: 0, is_active: true }
export function AdminCategories() {
  const [items, setItems] = useState([]); const [form, setForm] = useState(emptyCategory); const [editing, setEditing] = useState(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [query, setQuery] = useState('')
  const load = async () => { try { setLoading(true); setError(''); const body = await adminAPI.getCategories(); setItems(listFrom(body, 'categories')) } catch (e) { setError(errorText(e)) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])
  const filtered = useMemo(() => items.filter((item) => `${item.name} ${item.slug}`.toLowerCase().includes(query.toLowerCase())), [items, query])
  const reset = () => { setEditing(null); setForm(emptyCategory) }
  const edit = (item) => { setEditing(item.id); setForm({ ...emptyCategory, ...item }) }
  const upload = async (file) => { if (!file) return; try { const body = await adminAPI.uploadCategoryImage(file); setForm((current) => ({ ...current, image_url: body.image_url || body.url || body.data?.image_url || '' })) } catch (e) { toast.error(errorText(e)) } }
  const save = async (event) => { event.preventDefault(); try { setSaving(true); const payload = { ...form, display_order: Number(form.display_order || 0) }; if (editing) await adminAPI.updateCategory(editing, payload); else await adminAPI.createCategory(payload); toast.success('Category saved'); reset(); await load() } catch (e) { toast.error(errorText(e)) } finally { setSaving(false) } }
  const remove = async (item) => { if (!window.confirm(`Delete ${item.name}? Attached products must be reassigned first.`)) return; try { await adminAPI.deleteCategory(item.id); await load(); toast.success('Category deleted') } catch (e) { toast.error(errorText(e)) } }
  return <AdminGate permissions={['categories:view', 'categories:manage', 'stock:view']}><div className="admin-page"><PageHeader title="Categories" description="Catalog categories shared by Admin inventory and public product browsing." /><form className="cms-panel cms-form" onSubmit={save}><h2>{editing ? 'Edit' : 'Create'} Category</h2><div className="cms-grid three"><label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label>Slug<input value={form.slug || ''} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="generated-from-name" /></label><label>Display order<input type="number" min="0" value={form.display_order || 0} onChange={(e) => setForm({ ...form, display_order: e.target.value })} /></label></div><label>Description<textarea rows="2" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><label>Image/icon<input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} /></label>{form.image_url && <img className="cms-preview small" src={resolveMediaUrl(form.image_url)} alt="Category preview" />}<label className="cms-check"><input type="checkbox" checked={form.is_active !== false} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active</label><div className="cms-actions"><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Category'}</button>{editing && <button type="button" onClick={reset}>Cancel</button>}</div></form><div className="cms-toolbar"><input placeholder="Search categories" value={query} onChange={(e) => setQuery(e.target.value)} /></div><State loading={loading} error={error} empty={!filtered.length} retry={load} />{!loading && !error && filtered.length > 0 && <div className="cms-table"><table><thead><tr><th>Category</th><th>Slug</th><th>Products</th><th>Order</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><div className="cms-category-cell">{item.image_url && <img src={resolveMediaUrl(item.image_url)} alt="" />}<strong>{item.name}</strong></div></td><td>{item.slug}</td><td>{item.product_count}</td><td>{item.display_order}</td><td>{item.is_active ? 'Active' : 'Inactive'}</td><td><div className="cms-actions"><button onClick={() => edit(item)}>Edit</button><button className="danger" onClick={() => remove(item)}>Delete</button></div></td></tr>)}</tbody></table></div>}</div></AdminGate>
}
