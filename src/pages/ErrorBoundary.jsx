import { Component } from 'react'
import { reportError } from '../errors'

// Catches render crashes anywhere below it. Without this, one bad component
// unmounts the whole React tree and the user gets a white screen with no
// explanation and no way back.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, sent: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    reportError(error, this.props.context || 'react-render', {
      componentStack: (info?.componentStack || '').slice(0, 2000),
    })
    this.setState({ sent: true })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        padding: '40px 24px', textAlign: 'center', maxWidth: 420,
        margin: '40px auto', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 16,
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>😕</div>
        <h3 style={{ marginBottom: 8 }}>This page hit a problem</h3>
        <p className="muted" style={{ fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
          {this.state.sent
            ? "We've been told about it and will fix it. Nothing you did caused this."
            : 'Something went wrong displaying this page.'}
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => this.setState({ hasError: false, sent: false })}
            style={{ background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
          <button
            onClick={() => { window.location.hash = '#home'; window.location.reload() }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text)' }}
          >
            Go home
          </button>
        </div>

        <p className="muted" style={{ fontSize: 12, marginTop: 18 }}>
          Still stuck? Email support@bizcheckkenya.com
        </p>
      </div>
    )
  }
}
