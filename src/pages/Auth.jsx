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

  async function handleSubmit() {
    setError('')
    setMessage('')

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.')
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

setMessage('✓ Account created! Please check your email inbox (and spam folder) for a confirmation link before logging in.')
      // Update profile with name/phone (the DB trigger creates the row, this fills in extra fields)
      if (data.user) {
        await supabase.from('profiles').update({ name, phone }).eq('id', data.user.id)
      }

      setMessage('Account created! Check your email to confirm, then log in.')
      setMode('login')
    } else {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)

      if (loginError) {
        setError(loginError.message)
        return
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
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Wanjiru" />
          </div>
          <div className="form-group">
            <label>Phone number</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" />
          </div>
        </>
      )}

      <div className="form-group">
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>

      <div className="form-group">
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
      </div>

      <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
        {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
      </button>

      <button
        className="link-btn"
        style={{ marginTop: 14, textAlign: 'center' }}
        onClick={() => {
          setMode(mode === 'login' ? 'signup' : 'login')
          setError('')
          setMessage('')
        }}
      >
        {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
      </button>
    </div>
  )
}
