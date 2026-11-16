import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { websiteAnalyticsAPI } from '../services/api'
import { readReportMetric as metric } from '../utils/websiteAnalytics'
import './AdminWebsiteAnalytics.css'

export const canViewWebsiteAnalytics = (admin) => {
  const role = String(admin?.admin_role || '').toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
  return role === 'super_admin' || admin?.permissions?.includes('reports:view') || (admin?.role === 'admin' && !role && !admin?.permissions?.length)
}
const value = (number, suffix = '') => number == null || !Number.isFinite(Number(number)) ? 'Unavailable' : `${Number(number).toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`
const definitions = [
  ['trend', 'Traffic trend', [['date', 'Date (YYYYMMDD)'], ['sessions', 'Sessions'], ['activeUsers', 'Active users'], ['screenPageViews', 'Views']]],
  ['locations', 'Visitor countries and cities', [['country', 'Country'], ['city', 'Approximate city'], ['activeUsers', 'Active users']]],
  ['channels', 'Acquisition channels', [['sessionDefaultChannelGroup', 'Channel'], ['sessions', 'Sessions']]],
  ['sources', 'Referral sources', [['sessionSourceMedium', 'Source / medium'], ['sessions', 'Sessions']]],
  ['pages', 'Popular pages', [['pagePath', 'Public page'], ['screenPageViews', 'Views']]],
  ['devices', 'Devices', [['deviceCategory', 'Device'], ['sessions', 'Sessions']]],
  ['products', 'Product engagement', [['itemId', 'Catalogue item'], ['itemsViewed', 'Views'], ['itemsAddedToCart', 'Added'], ['itemsPurchased', 'Purchased items']]],
  ['funnel', 'Checkout funnel event counts', [['eventName', 'Event'], ['eventCount', 'Count']]],
]

function ReportTable({ title, report, columns }) {
  return <section className="website-report-card"><h2>{title}</h2>
    {!report || report.status !== 'available' || !Array.isArray(report.rows) ? <p>Unavailable — GA4 did not return this report.</p> : <>
      <p className="website-report-note">{report.sampled ? 'Sampled estimates. ' : 'GA4 estimates. '}{report.thresholded && 'Privacy thresholding applies. '}{report.data_loss && 'High-cardinality data loss applies. '}{report.truncated && `Top ${report.rows.length} of ${report.row_count} rows; not a complete list. `}{report.timezone && `Timezone: ${report.timezone}.`}</p>
      {report.rows.length ? <div className="website-table-scroll"><table><caption className="sr-only">{title}</caption><thead><tr>{columns.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}</tr></thead><tbody>{report.rows.map((row, index) => <tr key={index}>{columns.map(([key]) => <td key={key}>{typeof row[key] === 'number' ? value(row[key]) : row[key] || '(not set)'}</td>)}</tr>)}</tbody></table></div> : <p>No recorded data in this range.</p>}
    </>}
  </section>
}

export function WebsiteTrafficSummary() {
  const { admin, isAdmin } = useAuthStore()
  const allowed = isAdmin && canViewWebsiteAnalytics(admin)
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!allowed) return undefined
    const controller = new AbortController()
    websiteAnalyticsAPI.summary(controller.signal).then((result) => { if (!controller.signal.aborted) setData(result) }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [allowed])
  if (!allowed) return null
  return <section className="website-report-card"><div className="website-report-heading"><h2>Website Traffic</h2><Link to="/admin/website-analytics">View Full Analytics</Link></div>
    <p>{failed ? 'Website analytics is unavailable.' : data?.notice || 'Loading GA4 traffic…'}</p>
    {data?.status === 'not_configured' && <p>GA4 property and server reporting credentials need configuration.</p>}
    <dl className="website-metrics"><div><dt>Sessions today</dt><dd>{value(data?.sessions_today)}</dd></div><div><dt>Active visitors today</dt><dd>{value(data?.visitors_today)}</dd></div><div><dt>Sessions · last 7 days</dt><dd>{value(data?.sessions_week)}</dd></div><div><dt>Top source · last 7 days</dt><dd>{data?.top_source || 'Unavailable'}</dd></div><div><dt>Purchase session rate · 7 days</dt><dd>{value(data?.conversion_rate, '%')}</dd></div></dl>
  </section>
}

export default function AdminWebsiteAnalytics() {
  const { admin, isAdmin } = useAuthStore()
  const allowed = isAdmin && canViewWebsiteAnalytics(admin)
  const [range, setRange] = useState({ preset: '30', start: '', end: '' })
  const [query, setQuery] = useState({ preset: '30' })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!allowed) return undefined
    const controller = new AbortController()
    setLoading(true); setError(''); setData(null)
    websiteAnalyticsAPI.report(query, controller.signal).then((result) => { if (!controller.signal.aborted) setData(result) })
      .catch((failure) => { if (!controller.signal.aborted) setError(typeof failure.response?.data?.detail === 'string' ? failure.response.data.detail : 'GA4 is unavailable. Check server deployment, credentials and property access.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [allowed, query])
  if (!allowed) return <p role="alert">Website Analytics requires reports:view permission.</p>
  const reports = data?.reports || {}
  const sessions = metric(data, 'sessions')
  const purchaseRate = metric(data, 'sessionKeyEventRate:purchase', 'purchase_sessions')
  const rate = purchaseRate != null && purchaseRate >= 0 && purchaseRate <= 1 ? purchaseRate * 100 : null
  return <div className="website-analytics"><h1>Website Traffic &amp; Conversion Analytics</h1><p>GA4 visitor estimates. Operational order and revenue reports remain separate.</p>
    <form className="website-date-filter" onSubmit={(event) => { event.preventDefault(); setQuery({ ...range }) }}><label>Date range<select value={range.preset} onChange={(event) => setRange({ ...range, preset: event.target.value })}><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="custom">Custom range</option></select></label>{range.preset === 'custom' && <><label>Start<input type="date" required value={range.start} onChange={(event) => setRange({ ...range, start: event.target.value })} /></label><label>End<input type="date" required value={range.end} min={range.start} onChange={(event) => setRange({ ...range, end: event.target.value })} /></label></>}<button type="submit" disabled={loading}>Apply dates</button></form>
    <div role="status">{loading && 'Loading GA4 reports…'}{error}{data?.message}{data?.notice}</div>
    {data && <><p>{data.range?.start} – {data.range?.end} · {data.status} {data.cached && '· Cached up to 5 minutes'} {data.generated_at && `· Retrieved ${new Date(data.generated_at).toLocaleString()}`}</p>
      <dl className="website-metrics">{[['Sessions', sessions], ['Active users', metric(data, 'activeUsers')], ['Total users', metric(data, 'totalUsers')], ['Page views', metric(data, 'screenPageViews')], ['Reported purchases', metric(data, 'ecommercePurchases')], ['Purchase session rate', rate]].map(([label, number]) => <div key={label}><dt>{label}</dt><dd>{value(number, label === 'Purchase session rate' ? '%' : '')}</dd></div>)}</dl>
      <p>Purchase session rate is GA4’s registered purchase key-event rate for this range. Mark purchase as a key event in GA4 to enable this metric. Funnel figures below are event counts, not a sequential/cohort funnel. Purchases cover new website orders only and require consent and a signed-in customer revisiting My Orders after payment confirmation; this can undercount. No historical collection is implied.</p>
      {reports.totals && <p>{reports.totals.sampled && 'Totals are sampled. '}{reports.totals.thresholded && 'Totals are privacy-thresholded. '}{reports.totals.data_loss && 'Totals have high-cardinality data loss. '}</p>}
      <div className="website-report-grid">{definitions.map(([key, title, columns]) => <ReportTable key={key} title={title} report={reports[key]} columns={columns} />)}</div></>}
  </div>
}
