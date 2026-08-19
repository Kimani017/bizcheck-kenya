import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

export default function LoginOtp({ currentUser, onVerified }) {
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)
  const sentOnceRef = useRef(false)

  useEffect(() => {
    if (!sentOnceRef.current) {
      sentOnceRef.current = true
      sendCode()
    }
  }, [])

  async function sendCode() {
    setSending(true)
    setError('')
    const { data: newCode, error: genError } = await supabase.rpc('generate_login_otp')
    if (genError) { setSending(false); setError('Could not generate code: ' + genError.message); return }

    const { data: sessionData } = await supabase.auth.getSession()
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-login-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({ email: currentUser.email, name: currentUser.user_metadata?.name, code: newCode }),
      })
    } catch (e) {
      // Even if email sending fails to report, the code is still valid server-side
    }
    setSending(false)
  }

  async function verify() {
    if (!code.trim()) { setError('Please enter the code from your email.'); return }
    setVerifying(true)
    setError('')
    const { error: verifyError } = await supabase.rpc('verify_login_otp', { p_code: code.trim() })
    setVerifying(false)
    if (verifyError) {
      setError(verifyError.message.includes('Too many') ? '⏱ ' + verifyError.message : '✗ Invalid or expired code.')
      return
    }
    onVerified()
  }

  async function resend() {
    setResent(false)
    await sendCode()
    setResent(true)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div style={{ maxWidth: 400, width: '100%', background: 'var(--surface)', borderRadius: 16, padding: 32, border: '1px solid var(--border)', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>📧</div>
        <h2 style={{ fontSize: 20, marginBottom: 6, color: 'var(--text-strong)' }}>Check your email</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          {sending ? 'Sending a login code to ' : 'A login code was sent to '}<strong>{currentUser.email}</strong>
        </p>

        {error && <div className="form-error">{error}</div>}
        {resent && <div className="vote-msg">✓ New code sent!</div>}

        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && verify()}
          placeholder="6-digit code"
          maxLength={6}
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 20, textAlign: 'center', letterSpacing: 6, fontFamily: 'monospace', background: 'var(--surface-2)', color: 'var(--text)', marginBottom: 14, boxSizing: 'border-box' }}
        />
        <button className="btn-primary" onClick={verify} disabled={verifying || sending} style={{ marginBottom: 10 }}>
          {verifying ? 'Verifying…' : 'Verify code'}
        </button>
        <button className="link-btn" onClick={resend} disabled={sending}>Resend code</button>
      </div>
    </div>
  )
}
