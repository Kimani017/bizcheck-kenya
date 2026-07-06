import { useState } from 'react'
import { supabase } from '../supabase'

export default function AccountChooser({ businesses, currentUser, onChoosePersonal, onChooseBusiness }) {
  const [selectedBiz, setSelectedBiz] = useState(businesses.length === 1 ? businesses[0] : null)
  const [step, setStep] = useState('code') // code | otp
  const [code, setCode] = useState('')
  const [otp, setOtp] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [sendingOtp, setSendingOtp] = useState(false)

  async function verifyBizcode() {
    if (!code.trim()) { setError('Please enter your business code.'); return }
    setVerifying(true)
    setError('')
    const { error: verifyError } = await supabase.rpc('verify_bizcode', { p_business_id: selectedBiz.id, p_code: code.trim().toUpperCase() })
    setVerifying(false)
    if (verifyError) {
      setError(verifyError.message.includes('Too many') ? '⏱ ' + verifyError.message : '✗ Invalid business code.')
      return
    }
    await sendOtp()
  }

  async function sendOtp() {
    setSendingOtp(true)
    setError('')
    const { data: otpCode, error: genError } = await supabase.rpc('generate_business_login_otp', { p_business_id: selectedBiz.id })
    if (genError) {
      setSendingOtp(false)
      setError('Could not generate verification code: ' + genError.message)
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    try {
      await fetch('https://ubjndgyukfhngytfabnw.supabase.co/functions/v1/send-login-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionData.session.access_token}` },
        body: JSON.stringify({ email: currentUser.email, name: selectedBiz.owner_name, code: otpCode }),
      })
    } catch (e) {
      // even if the email fails to send, the code is still valid server-side
    }
    setSendingOtp(false)
    setStep('otp')
  }

  async function verifyOtp() {
    if (!otp.trim()) { setError('Please enter the code sent to your email.'); return }
    setVerifying(true)
    setError('')
    const { error: verifyError } = await supabase.rpc('verify_business_login_otp', { p_code: otp.trim() })
    setVerifying(false)
    if (verifyError) {
      setError(verifyError.message.includes('Too many') ? '⏱ ' + verifyError.message : '✗ Invalid or expired code.')
      return
    }
    onChooseBusiness(selectedBiz)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%', background: 'var(--surface)', borderRadius: 16, padding: 32, border: '1px solid var(--border)' }}>

        {step === 'code' && (
          <>
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
                  onKeyDown={(e) => e.key === 'Enter' && verifyBizcode()}
                  placeholder="BIZ-XXXXXXXX"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 15, textAlign: 'center', letterSpacing: 2, fontFamily: 'monospace', background: 'var(--surface-2)', color: 'var(--text)', marginBottom: 12, boxSizing: 'border-box' }}
                />
                <button className="btn-primary" onClick={verifyBizcode} disabled={verifying || sendingOtp}>
                  {verifying ? 'Verifying…' : sendingOtp ? 'Sending verification code…' : `Enter as ${selectedBiz.name} →`}
                </button>
              </>
            )}
          </>
        )}

        {step === 'otp' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>📧</div>
              <h2 style={{ fontSize: 20, marginBottom: 6, color: 'var(--text-strong)' }}>Verify it's you</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                For extra security, we sent a code to <strong>{currentUser.email}</strong> to confirm this Bizyangu login.
              </p>
            </div>

            {error && <div className="form-error">{error}</div>}

            <input
              type="password"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && verifyOtp()}
              placeholder="6-digit code"
              maxLength={6}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 20, textAlign: 'center', letterSpacing: 6, fontFamily: 'monospace', background: 'var(--surface-2)', color: 'var(--text)', marginBottom: 14, boxSizing: 'border-box' }}
            />
            <button className="btn-primary" onClick={verifyOtp} disabled={verifying} style={{ marginBottom: 10 }}>
              {verifying ? 'Verifying…' : 'Confirm & enter Bizyangu →'}
            </button>
            <button className="link-btn" onClick={sendOtp} disabled={sendingOtp}>Resend code</button>
          </>
        )}
      </div>
    </div>
  )
}
