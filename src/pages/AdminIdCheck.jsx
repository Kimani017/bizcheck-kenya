import { useState } from 'react'
import { supabase } from '../supabase'

export default function AdminIdCheck({ onVerified }) {
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  async function verify() {
    if (!code.trim()) { setError('Please enter your Admin ID.'); return }
    setVerifying(true)
    setError('')
    const { error: verifyError } = await supabase.rpc('verify_own_admin_code', { p_code: code.trim().toUpperCase() })
    setVerifying(false)
    if (verifyError) {
      setError(verifyError.message.includes('Too many') ? '⏱ ' + verifyError.message : '✗ Invalid Admin ID.')
      return
    }
    onVerified()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div style={{ maxWidth: 400, width: '100%', background: 'var(--surface)', borderRadius: 16, padding: 32, border: '1px solid var(--border)', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🛡️</div>
        <h2 style={{ fontSize: 20, marginBottom: 6, color: 'var(--text-strong)' }}>Confirm your Admin ID</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>Final step — enter your personal Admin ID to finish logging in.</p>

        {error && <div className="form-error">{error}</div>}

        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && verify()}
          placeholder="ADM-XXXXXXXX"
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 16, textAlign: 'center', letterSpacing: 2, fontFamily: 'monospace', background: 'var(--surface-2)', color: 'var(--text)', marginBottom: 14, boxSizing: 'border-box' }}
        />
        <button className="btn-primary" onClick={verify} disabled={verifying}>
          {verifying ? 'Verifying…' : 'Complete login'}
        </button>
      </div>
    </div>
  )
}
