import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('FoodNova page error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ maxWidth: 900, margin: '80px auto', padding: '24px', background: '#fff', border: '1px solid #eee', borderRadius: 16 }}>
          <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
          <p>The page hit an error instead of loading. Please refresh once. If it continues, use the button below to return to your orders.</p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.href = '/orders'
            }}
            style={{ background: '#e85d04', color: '#fff', border: 0, padding: '12px 18px', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}
          >
            Go to Orders
          </button>
          {this.state.error?.message && (
            <p style={{ marginTop: 16, color: '#777', fontSize: 13 }}>Error: {this.state.error.message}</p>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
