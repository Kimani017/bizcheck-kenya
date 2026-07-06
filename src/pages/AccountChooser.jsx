import { useState } from 'react'
import { supabase } from '../supabase'

export default function AccountChooser({ businesses, onChoosePersonal, onChooseBusiness }) {
  const [selectedBiz, setSelectedBiz] = useState(businesses.length === 1 ? businesses[0] : null)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  async function verify() {
    if (!code.trim()) { setError('Please enter your business code.'); return }
    setVerifying(true)
    setError('')
    const { error: verifyError } = await supabase.rpc('verify_bizcode', { p_business_id: selectedBiz.id, p_code: code.trim().toUpperCase() })
    setVerifying(false)
    if (verifyError) {
      setError(verifyError.message.includes('Too many') ? '⏱ ' + verifyError.message : '✗ Invalid business code.')
      return
    }
    onChooseBusiness(selectedBiz)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%', background: 'var(--surface)', borderRadius: 16, padding: 32, border: '1px solid var(--border)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>👋</div>
          <h2 style={{ fontSize: 20, marginBottom: 6, color: 'var(--text-strong)' }}>How do you want to log in?</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>You have a verified business — choose which account to use.</p>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button
            onClick={onChoosePersonal}
            style={{ flex: 1, padding: '16px 12px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'center' }}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>👤</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Personal</div>
          </button>
          <div style={{ flex: 1, padding: '16px 12px', borderRadius: 12, border: '1.5px solid #1D9E75', background: '#E1F5EE', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🏢</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#085041' }}>Bizyangu</div>
          </div>
        </div>

        {businesses.length > 1 && (
          <div className="form-group">
            <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>Which business in Bizyangu?</label>
            <select
              value={selectedBiz?.id || ''}
              onChange={(e) => setSelectedBiz(businesses.find(b => b.id === e.target.value))}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            >
              <option value="">Select a business…</option>
              {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        {selectedBiz && (
          <>
            {error && <div className="form-error">{error}</div>}
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && verify()}
              placeholder="BIZ-XXXXXXXX"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 15, textAlign: 'center', letterSpacing: 2, fontFamily: 'monospace', background: 'var(--surface-2)', color: 'var(--text)', marginBottom: 12, boxSizing: 'border-box' }}
            />
            <button className="btn-primary" onClick={verify} disabled={verifying}>
              {verifying ? 'Verifying…' : `Enter as ${selectedBiz.name} →`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
