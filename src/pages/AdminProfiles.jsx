import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { SkeletonList } from './Skeleton'

export default function AdminProfiles({ onSelectBusiness, onSelectUser, currentUser }) {
  const [tab, setTab] = useState('businesses') // businesses | users | personal
  const [businesses, setBusinesses] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [isSuperadmin, setIsSuperadmin] = useState(false)

  // Personal info lock state
  const [adminCode, setAdminCode] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState('')
  const [personalInfo, setPersonalInfo] = useState(null) // null = locked

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [bizRes, userRes, meRes] = await Promise.all([
      supabase.from('businesses').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name, username, role, created_at').order('created_at', { ascending: false }),
      supabase.from('profiles').select('role').eq('id', currentUser.id).single(),
    ])
    setBusinesses(bizRes.data || [])
    setUsers(userRes.data || [])
    setIsSuperadmin(meRes.data?.role === 'superadmin')
    setLoading(false)
  }

  async function unlockPersonalInfo() {
    if (!adminCode.trim()) { setUnlockError('Please enter your Admin ID.'); return }
    setUnlocking(true)
    setUnlockError('')
    const { data, error } = await supabase.rpc('get_personal_info', { p_code: adminCode.trim() })
    setUnlocking(false)
    if (error) {
      setUnlockError(error.message.includes('Invalid') ? '✗ Invalid Admin ID. Access denied.' : 'Error: ' + error.message)
      return
    }
    setPersonalInfo(data || [])
  }

  async function promoteUser(u) {
    if (!confirm(`Make @${u.username || u.name} an admin? They will get a new Admin ID.`)) return
    const { data, error } = await supabase.rpc('promote_to_admin', { p_target: u.id })
    if (error) { alert('Error: ' + error.message); return }
    alert(`✓ @${u.username || u.name} is now an admin.\n\nTheir Admin ID is:\n\n${data}\n\nShare this with them securely — it will NOT be shown again.`)
    loadAll()
  }

  async function demoteUser(u) {
    if (!confirm(`Remove admin rights from @${u.username || u.name}?`)) return
    const { error } = await supabase.rpc('demote_admin', { p_target: u.id })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }

  if (loading) return <div className="section" style={{ maxWidth: 820 }}><h2 style={{ marginBottom: 20 }}>Profiles</h2><SkeletonList count={6} /></div>

  return (
    <div className="section" style={{ maxWidth: 820 }}>
      <h2 style={{ marginBottom: 20 }}>Profiles</h2>

      <div className="filter-row" style={{ marginBottom: 20 }}>
        {[
          ['businesses', `Businesses (${businesses.length})`],
          ['users', `Users (${users.length})`],
          ['personal', '🔒 Personal Info'],
        ].map(([id, label]) => (
          <button key={id} className={`filter-btn ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* ══════ BUSINESSES ══════ */}
      {tab === 'businesses' && (
        <div className="admin-list">
          {businesses.length === 0 ? <p className="muted">No businesses yet.</p> : businesses.map((b) => (
            <div className="admin-row" key={b.id}>
              <div>
                <button onClick={() => onSelectBusiness(b)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                  <strong style={{ color: '#1D9E75', textDecoration: 'underline' }}>{b.name}</strong>
                </button>
                <span className={`badge ${b.status === 'verified' ? 'badge-verified' : b.status === 'scam' || b.status === 'flagged' ? 'badge-danger' : 'badge-pending'}`} style={{ marginLeft: 8 }}>{b.status}</span>
                <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                  {b.category} · Joined {new Date(b.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════ USERS ══════ */}
      {tab === 'users' && (
        <div className="admin-list">
          {users.map((u) => (
            <div className="admin-row" key={u.id}>
              <div>
                <button onClick={() => onSelectUser(u.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                  <strong style={{ color: '#1D9E75', textDecoration: 'underline' }}>@{u.username || 'no-username'}</strong>
                </button>
                {u.role !== 'user' && <span className="badge badge-verified" style={{ marginLeft: 8, textTransform: 'capitalize' }}>{u.role}</span>}
                <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                  {u.name || '—'} · Joined {new Date(u.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              {isSuperadmin && u.id !== currentUser.id && (
                <div className="admin-actions">
                  {u.role === 'user' && <button className="btn-ghost-small" onClick={() => promoteUser(u)}>Make admin</button>}
                  {u.role === 'admin' && <button className="btn-ghost-small" style={{ color: '#E24B4A' }} onClick={() => demoteUser(u)}>Remove admin</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══════ PERSONAL INFO (LOCKED) ══════ */}
      {tab === 'personal' && (
        personalInfo === null ? (
          <div style={{ maxWidth: 420, margin: '30px auto', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32 }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
            <h3 style={{ marginBottom: 6, color: 'var(--text-strong)' }}>Encrypted personal data</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
              This section contains sensitive user details including national ID numbers. Enter your Admin ID to decrypt and view.
            </p>
            {unlockError && <div className="form-error" style={{ marginBottom: 14 }}>{unlockError}</div>}
            <input
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && unlockPersonalInfo()}
              placeholder="ADM-XXXXXXXX"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 15, textAlign: 'center', letterSpacing: 2, fontFamily: 'monospace', background: 'var(--surface)', color: 'var(--text)', marginBottom: 12 }}
            />
            <button className="btn-primary" onClick={unlockPersonalInfo} disabled={unlocking}>
              {unlocking ? 'Verifying…' : '🔓 Unlock'}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span className="badge badge-verified">🔓 Unlocked — handle with care</span>
              <button className="btn-ghost-small" onClick={() => { setPersonalInfo(null); setAdminCode('') }}>🔒 Lock again</button>
            </div>
            <div className="admin-list">
              {personalInfo.map((p) => (
                <div className="admin-row" key={p.id}>
                  <div style={{ width: '100%' }}>
                    <strong>@{p.username || 'no-username'}</strong>
                    <span className="muted" style={{ marginLeft: 8, textTransform: 'capitalize' }}>({p.role})</span>
                    <div className="muted" style={{ fontSize: 13, marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                      <span>👤 {p.name || '—'}</span>
                      <span>✉️ {p.email || '—'}</span>
                      <span>📞 {p.phone || '—'}</span>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>🪪 ID: {p.national_id || 'Not provided'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  )
}
