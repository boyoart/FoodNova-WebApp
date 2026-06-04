import { useState } from 'react'
import toast from 'react-hot-toast'
import { Activity, RefreshCw } from 'lucide-react'
import { adminAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './AdminPages.css'
import './AdminNinDiagnostics.css'

const displayValue = (value) => {
  if (value === null || value === undefined || value === '') return 'Not available'
  return String(value)
}

export default function AdminNinDiagnostics() {
  const { isAdmin } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const testProvider = async () => {
    setLoading(true)
    try {
      const response = await adminAPI.testNinProvider()
      setResult(response)
      if (response.authenticated) toast.success('NIN provider authenticated successfully')
      else toast.error(response.last_error || 'NIN provider test failed')
    } catch (error) {
      const response = error.response?.data || {
        balance_request_status: 'request_failed',
        http_status_code: error.response?.status,
        provider_response_body: error.response?.data || error.message,
        last_error: error.message,
      }
      setResult(response)
      toast.error(response.detail || response.last_error || 'NIN provider test failed')
    } finally {
      setLoading(false)
    }
  }

  if (!isAdmin) return <div className="admin-page"><p>Access denied. Admin login required.</p></div>

  const rawBody = result?.provider_response_body
  const formattedBody = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody ?? '', null, 2)

  return (
    <div className="admin-page nin-diagnostics-page">
      <header className="nin-diagnostics-header">
        <div>
          <p className="admin-eyebrow">Temporary diagnostics</p>
          <h1>NIN Provider Test</h1>
          <p>Runs a live balance request against NINBVNPORTAL and displays the unmodified provider response.</p>
        </div>
        <Activity size={36} />
      </header>

      <button type="button" className="nin-test-button" onClick={testProvider} disabled={loading}>
        <RefreshCw size={18} className={loading ? 'spin' : ''} />
        {loading ? 'Testing NIN Provider...' : 'Test NIN Provider'}
      </button>

      {result && (
        <section className="nin-result-panel">
          <dl className="nin-result-grid">
            <div><dt>Provider URL</dt><dd>{displayValue(result.provider_url || result.base_url)}</dd></div>
            <div><dt>API key loaded</dt><dd>{result.api_key_loaded ? `Yes (${result.api_key_masked})` : 'No'}</dd></div>
            <div><dt>Balance request status</dt><dd>{displayValue(result.balance_request_status)}</dd></div>
            <div><dt>HTTP status code</dt><dd>{displayValue(result.http_status_code)}</dd></div>
            <div><dt>Authenticated</dt><dd>{result.authenticated ? 'Yes' : 'No'}</dd></div>
            <div><dt>Balance</dt><dd>{displayValue(result.balance)}</dd></div>
          </dl>

          {result.last_error && <p className="nin-error-message">{result.last_error}</p>}

          <div className="nin-raw-response">
            <h2>Full Provider Response Body</h2>
            <pre>{formattedBody || 'Empty response body'}</pre>
          </div>
        </section>
      )}
    </div>
  )
}
