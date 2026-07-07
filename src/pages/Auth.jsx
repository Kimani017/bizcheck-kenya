import { useState } from 'react'
import { supabase } from '../supabase'

export default function Auth({ onAuthed, initialMode }) {
  const [mode, setMode] = useState(initialMode || 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState(null)

  function reset() { setError(''); setMessage('') }

  function switchMode(newMode) {
    setMode(newMode)
    setEmail(''); setPassword(''); setConfirmPassword('')
    setName(''); setUsername(''); setPhone('')
    setUsernameAvailable(null)
    reset()
  }

  function getErrorMessage(err) {
    if (!err) return 'Something went wrong. Please try again.'
    const msg = typeof err.message === 'string' ? err.message.toLowerCase() : ''
    if (msg.includes('email not confirmed')) return 'Please confirm your email first — check your inbox for a confirmation link.'
    if (msg.includes('invalid login') || msg.includes('invalid email or password')) return 'Incorrect email or password. Please try again.'
    if (msg.includes('user already registered') || msg.includes('already been registered')) return 'This email is already registered. Please log in instead.'
    if (msg.includes('password should be')) return 'Password must be at least 6 characters.'
    if (msg.includes('rate limit') || msg.includes('email rate')) return 'Too many attempts. Please wait a few minutes and try again.'
    if (msg.includes('smtp') || msg.includes('unable to validate') || err.status === 500) return 'We could not send a confirmation email right now. Please try again in a moment.'
    if (typeof err.message === 'string') return err.message
    return 'Something went wrong. Please try again.'
  }

  async function checkUsername(value) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, '')
    setUsername(cleaned)
    if (cleaned.length < 3) { setUsernameAvailable(null); return }
    setCheckingUsername(true)
    const { data } = await supabase.from('profiles').select('id').ilike('username', cleaned).maybeSingle()
    setCheckingUsername(false)
    setUsernameAvailable(!data)
  }

  async function handleSignup() {
    if (!name.trim()) { setError('Please enter your full name.'); return }
    if (!username.trim() || username.length < 3) { setError('Please enter a username of at least 3 characters.'); return }
    if (usernameAvailable === false) { setError('That username is taken. Please choose another.'); return }
    if (!phone.trim()) { setError('Please enter your phone number.'); return }
    if (!email.trim()) { setError('Please enter your email address.'); return }
    if (!password) { setError('Please enter a password.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }

    setLoading(true); reset()

    const { data, error: signupError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name, phone, username } },
    })

    setLoading(false)

    if (signupError) { setError(getErrorMessage(signupError)); return }

    // Save username to profile
    if (data?.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: email.trim(),
        name,
        phone: phone || null,
        username,
        notifications_enabled: notificationsEnabled,
      })
    }

    if (data?.user && !data?.session) {
      setMessage('✓ Account created! Check your email for a confirmation link, then come back to log in.')
      switchMode('login')
      return
    }

    if (data?.session) { onAuthed(); return }

    setMessage('✓ Account created! You can now log in.')
    switchMode('login')
  }

  async function handleLogin() {
    if (!email.trim()) { setError('Please enter your email address.'); return }
    if (!password) { setError('Please enter your password.'); return }
    setLoading(true); reset()

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(), password,
    })

    setLoading(false)
    if (loginError) { setError(getErrorMessage(loginError)); return }
    onAuthed()
  }

  async function handleForgotPassword() {
    if (!email.trim()) { setError('Please enter your email address.'); return }
    setLoading(true); reset()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    setLoading(false)
    if (resetError) { setError(getErrorMessage(resetError)); return }
    setMessage('✓ Password reset link sent to ' + email.trim() + '. Check your inbox.')
  }

  async function handleSubmit() {
    if (mode === 'signup') await handleSignup()
    else if (mode === 'login') await handleLogin()
    else await handleForgotPassword()
  }

  async function handleGoogleSignIn() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://bizcheck-kenya.vercel.app' },
    })
    if (error) setError('Google sign-in failed. Please try again.')
  }

  return (
    <div className="section" style={{ maxWidth: 420, margin: '0 auto' }}>
      <h2>
        {mode === 'login' ? 'Log in to BizCheck' : mode === 'signup' ? 'Create an account' : 'Reset your password'}
      </h2>
      <p className="muted" style={{ marginBottom: 20 }}>
        {mode === 'login' && 'Log in to vote on businesses and submit listings.'}
        {mode === 'signup' && 'Join BizCheck Kenya to help keep online sellers honest.'}
        {mode === 'forgot' && 'Enter your email and we will send you a reset link.'}
      </p>

      {error && <div className="form-error">{typeof error === 'string' ? error : 'Something went wrong. Please try again.'}</div>}
      {message && <div className="vote-msg">{typeof message === 'string' ? message : 'Done!'}</div>}

      {mode === 'signup' && (
        <>
          <div className="form-group">
            <label>Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Wanjiru" onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
          </div>

          <div className="form-group">
            <label>Username</label>
            <div style={{ position: 'relative' }}>
              <input
                value={username}
                onChange={(e) => checkUsername(e.target.value)}
                placeholder="e.g. wanjiru254"
                style={{ paddingLeft: 28 }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }}>@</span>
              {checkingUsername && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-muted)' }}>checking…</span>}
              {!checkingUsername && usernameAvailable === true && username.length >= 3 && (
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#1D9E75', fontWeight: 600 }}>✓ Available</span>
              )}
              {!checkingUsername && usernameAvailable === false && (
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#E24B4A', fontWeight: 600 }}>✗ Taken</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Only letters, numbers and underscores. Min 3 characters.</div>
          </div>

          <div className="form-group">
            <label>Phone number (optional)</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
          </div>
        </>
      )}

      <div className="form-group">
        <label>Email address *</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
      </div>

      {mode !== 'forgot' && (
        <div className="form-group">
          <label>Password</label>
          <div className="input-wrap">
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
            <button type="button" className="toggle-pw" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
          </div>
        </div>
      )}

      {mode === 'signup' && (
        <div className="form-group">
          <label>Confirm password</label>
          <div className="input-wrap">
            <input type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
            <button type="button" className="toggle-pw" onClick={() => setShowConfirm(!showConfirm)}>{showConfirm ? 'Hide' : 'Show'}</button>
          </div>
        </div>
      )}

      {mode === 'signup' && (
        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="notif-opt-in"
            checked={notificationsEnabled}
            onChange={(e) => setNotificationsEnabled(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <label htmlFor="notif-opt-in" style={{ margin: 0, fontSize: 13, cursor: 'pointer' }}>
            🔔 Notify me about violations, unread messages, and app updates
          </label>
        </div>
      )}

      <button className="btn-primary" onClick={handleSubmit} disabled={loading || (mode === 'signup' && usernameAvailable === false)}>
        {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
      </button>

      {mode !== 'forgot' && (
        <>
          <div className="auth-divider"><span>or</span></div>
          <button className="btn-google" onClick={handleGoogleSignIn}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 6.294C4.672 4.167 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </>
      )}

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {mode === 'login' && (
          <>
            <button className="link-btn" onClick={() => switchMode('signup')}>Don't have an account? Sign up →</button>
            <button className="link-btn" style={{ color: 'var(--text-muted)' }} onClick={() => switchMode('forgot')}>Forgot your password?</button>
          </>
        )}
        {mode === 'signup' && <button className="link-btn" onClick={() => switchMode('login')}>Already have an account? Log in →</button>}
        {mode === 'forgot' && <button className="link-btn" onClick={() => switchMode('login')}>← Back to login</button>}
      </div>
    </div>
  )
}
