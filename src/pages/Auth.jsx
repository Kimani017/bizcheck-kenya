import { useState } from 'react'
import { supabase } from '../supabase'

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  function reset() {
    setError('')
    setMessage('')
  }

  async function handleSubmit() {
    reset()

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.')
      return
    }

    if (mode === 'signup' && password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)

    if (mode === 'signup') {
      const { data, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { phone, name },
        },
      })

      setLoading(false)

      if (signupError) {
        setError(signupError.message || 'Something went wrong. Please try again.')
        return
      }

      // Email confirmation ON — session is null, user needs to confirm
      if (data?.user && !data.session) {
        setMessage('✓ Account created! Check your email inbox (and spam folder) for a confirmation link, then come back to log in.')
        setMode('login')
        setEmail('')
        setPassword('')
        return
      }

      // Email confirmation OFF — already logged in
      if (data?.session) {
        if (data.user) {
          await supabase.from('profiles').update({ name, phone }).eq('id', data.user.id)
        }
        onAuthed()
        return
      }

      setMessage('✓ Account created! You can now log in.')
      setMode('login')

    } else {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password })

      setLoading(false)

      if (loginError) {
        if (loginError.message.toLowerCase().includes('email not confirmed')) {
          setError('Please confirm your email first — check your inbox for the confirmation link we sent you.')
        } else if (loginError.message.toLowerCase().includes('invalid login')) {
          setError('Incorrect email or password. Please try again.')
        } else {
          setError(loginError.message || 'Login failed. Please try again.')
        }
        return
      }

      if (data.user) {
        await supabase.from('profiles').update({ name: data.user.user_metadata?.name, phone: data.user.user_metadata?.phone }).eq('id', data.user.id)
      }

      onAuthed()
    }
  }

  return (
    <div className="section" style={{ maxWidth: 420, margin: '0 auto' }}>
      <h2>{mode === 'login' ? 'Log in' : 'Create an account'}</h2>
      <p className="muted" style={{ marginBottom: 20 }}>
        {mode === 'login'
          ? 'Log in to vote on businesses and submit listings.'
          : 'Join BizCheck Kenya to help keep online sellers honest.'}
      </p>

      {error && <div className="form-error">{error}</div>}
      {message && <div className="vote-msg">{message}</div>}

      {mode === 'signup' && (
        <>
          <div className="form-group">
            <label>Full name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Irya Kym"
            />
          </div>
          <div className="form-group">
            <label>Phone number</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0726 **** ***"
            />
          </div>
        </>
      )}

      <div className="form-group">
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
      </div>

      <div className="form-group">
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
      </div>

      <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
        {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
      </button>

      <button
        className="link-btn"
        style={{ marginTop: 14, textAlign: 'center', width: '100%' }}
        onClick={() => {
          setMode(mode === 'login' ? 'signup' : 'login')
          reset()
        }}
      >
        {mode === 'login' ? "Don't have an account? Sign up →" : 'Already have an account? Log in →'}
      </button>
    </div>
  )
}
