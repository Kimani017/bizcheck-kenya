import { useState } from 'react'
import { supabase } from '../supabase'

export default function SetUsername({ user, onDone }) {
  const [username, setUsername] = useState('')
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function checkUsername(value) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, '')
    setUsername(cleaned)
    setAvailable(null)
    if (cleaned.length < 3) return
    setChecking(true)
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', cleaned)
      .single()
    setChecking(false)
    setAvailable(!data)
  }

  async function saveUsername() {
    if (!username || username.length < 3) { setError('Username must be at least 3 characters.'); return }
    if (available === false) { setError('That username is taken. Please choose another.'); return }
    setSaving(true)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ username })
      .eq('id', user.id)
    setSaving(false)
    if (updateError) { setError('Error saving username. Please try again.'); return }
    onDone()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div style={{ maxWidth: 400, width: '100%', background: 'var(--surface)', borderRadius: 16, padding: 32, border: '1px solid #E5E3DC' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 50, background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 24 }}>👋</div>
          <h2 style={{ fontSize: 20, marginBottom: 6 }}>One last step!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Choose a username for your BizCheck account. This is what others will see.</p>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-group">
          <label>Your username</label>
          <div style={{ position: 'relative' }}>
            <input
              value={username}
              onChange={(e) => checkUsername(e.target.value)}
              placeholder="e.g. wanjiru254"
              style={{ width: '100%', padding: '10px 14px', paddingLeft: 28, borderRadius: 8, border: '1px solid #E5E3DC', fontSize: 15 }}
              onKeyDown={(e) => e.key === 'Enter' && saveUsername()}
            />
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 15 }}>@</span>
            {checking && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-muted)' }}>checking…</span>}
            {!checking && available === true && username.length >= 3 && (
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#1D9E75', fontWeight: 600 }}>✓ Available</span>
            )}
            {!checking && available === false && (
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#E24B4A', fontWeight: 600 }}>✗ Taken</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Only letters, numbers and underscores. Min 3 characters.</div>
        </div>

        <button
          className="btn-primary"
          onClick={saveUsername}
          disabled={saving || available === false || username.length < 3}
        >
          {saving ? 'Saving…' : 'Set username & continue →'}
        </button>
      </div>
    </div>
  )
}
