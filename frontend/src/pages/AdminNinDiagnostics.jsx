import { useState } from 'react'
import toast from 'react-hot-toast'
import { Activity, BadgeCheck, RefreshCw, WalletCards } from 'lucide-react'
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

  const runAction = async (action, successMessage) => {
    setLoading(true)
    try {
      const response = await action()
      setResult(response)
      if (response.authenticated || response.success) toast.success(successMessage)
      else toast.error(response.last_error || response.message || 'NIN provider test failed')
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

  const testProvider = () => runAction(adminAPI.testNinProvider, 'NIN provider test completed')
  const checkBalance = () => runAction(adminAPI.checkNinProviderBalance, 'Balance check completed')
  const runTestVerification = () => runAction(adminAPI.runTestNinVerification, 'NIN verification test completed')

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

      <div className="nin-diagnostic-actions">
        <button type="button" className="nin-test-button" onClick={testProvider} disabled={loading}>
          <RefreshCw size={18} className={loading ? 'spin' : ''} />
          Test Provider Now
        </button>
        <button type="button" className="nin-test-button secondary" onClick={checkBalance} disabled={loading}>
          <WalletCards size={18} />
          Check Balance
        </button>
      </div>

      <section className="nin-verification-test-card">
        <div>
          <p className="admin-eyebrow">Verification workflow only</p>
          <h2>NIN Verification Test</h2>
          <p>Runs the same backend verification service used by rider onboarding with sample NIN 22021091960.</p>
        </div>
        <button type="button" className="nin-test-button" onClick={runTestVerification} disabled={loading}>
          <BadgeCheck size={18} />
          Run NIN Verification Test
        </button>
      </section>

      {result && (
        <section className="nin-result-panel">
          <dl className="nin-result-grid">
            <div><dt>Provider URL</dt><dd>{displayValue(result.provider_url || result.base_url)}</dd></div>
            <div><dt>Request URL</dt><dd>{displayValue(result.request_url || result.provider_url)}</dd></div>
            <div><dt>Provider Name</dt><dd>{displayValue(result.provider)}</dd></div>
            <div><dt>API key loaded</dt><dd>{result.api_key_loaded ? `Yes (${result.api_key_masked})` : 'No'}</dd></div>
            <div><dt>Balance Check Result</dt><dd>{displayValue(result.balance_request_status || result.balance?.message || result.message)}</dd></div>
            <div><dt>HTTP status code</dt><dd>{displayValue(result.http_status_code)}</dd></div>
            <div><dt>Authenticated</dt><dd>{result.authenticated ? 'Yes' : 'No'}</dd></div>
            <div><dt>Balance</dt><dd>{displayValue(result.balance)}</dd></div>
            <div><dt>Last Verification Attempt</dt><dd><pre className="nin-inline-json">{JSON.stringify(result.last_verification_attempt ?? 'Not available', null, 2)}</pre></dd></div>
            <div><dt>Last Verification Error</dt><dd><pre className="nin-inline-json">{JSON.stringify(result.last_verification_error ?? result.last_error ?? 'Not available', null, 2)}</pre></dd></div>
            <div><dt>Failure Stage</dt><dd>{displayValue(result.failure_stage)}</dd></div>
            <div><dt>Provider Error Message</dt><dd>{displayValue(result.provider_error_message || result.message || result.last_error)}</dd></div>
            <div><dt>Shared Backend Service</dt><dd>{displayValue(result.shared_service)}</dd></div>
          </dl>

          {result.last_error && <p className="nin-error-message">{result.last_error}</p>}

          <div className="nin-raw-response">
            <h2>Request Payload</h2>
            <pre>{JSON.stringify(result.request_payload ?? 'Not available', null, 2)}</pre>
          </div>

          <div className="nin-raw-response">
            <h2>Request Headers Used</h2>
            <pre>{JSON.stringify(result.request_headers_used ?? 'Not available', null, 2)}</pre>
          </div>

          <div className="nin-raw-response">
            <h2>Full Provider Response Body</h2>
            <pre>{formattedBody || 'Empty response body'}</pre>
          </div>

          <div className="nin-raw-response">
            <h2>Parsed Provider Response Body</h2>
            <pre>{JSON.stringify(result.parsed_response_body ?? 'Not available', null, 2)}</pre>
          </div>
        </section>
      )}
    </div>
  )
}
