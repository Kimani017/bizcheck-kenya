import { useState } from 'react'
import { supabase } from '../supabase'

export default function EnterAdminCode({ onActivated, onBack }) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function activate() {
    if (!code.trim()) { setError('Please enter your admin code.'); return }
    setSubmitting(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('activate_admin_with_code', { p_code: code.trim().toUpperCase() })
    setSubmitting(false)
    if (rpcError) { setError('✗ Invalid or expired code. Please check your email and try again.'); return }
    onActivated()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div style={{ maxWidth: 400, width: '100%', background: 'var(--surface)', borderRadius: 16, padding: 32, border: '1px solid var(--border)', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🔑</div>
        <h2 style={{ fontSize: 20, marginBottom: 6, color: 'var(--text-strong)' }}>Activate admin access</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>Enter the secret admin code sent to your email.</p>

        {error && <div className="form-error">{error}</div>}

        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && activate()}
          placeholder="ADM-XXXXXXXX"
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 16, textAlign: 'center', letterSpacing: 2, fontFamily: 'monospace', background: 'var(--surface)', color: 'var(--text)', marginBottom: 14 }}
        />
        <button className="btn-primary" onClick={activate} disabled={submitting} style={{ marginBottom: 10 }}>
          {submitting ? 'Verifying…' : 'Activate admin access'}
        </button>
        <button className="link-btn" onClick={onBack}>← Back to home</button>
      </div>
    </div>
  )
}
