import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { SkeletonList } from './Skeleton'

export default function Pleads({ onBack, onSelectBusiness }) {
  const [requests, setRequests] = useState([])
  const [bannedBusinesses, setBannedBusinesses] = useState([])
  const [loading, setLoading] = useState(true)
  const [banCode, setBanCode] = useState(null)
  const [showCode, setShowCode] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Lock screen — only the person who knows the superadmin's own Admin ID can enter
  const [unlocked, setUnlocked] = useState(false)
  const [enteredCode, setEnteredCode] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState('')

  async function tryUnlock() {
    if (!enteredCode.trim()) { setUnlockError('Please enter your Admin ID.'); return }
    setUnlocking(true)
    setUnlockError('')

    // Server-side verification with brute-force lockout protection
    const { error } = await supabase.rpc('verify_own_admin_code', { p_code: enteredCode.trim().toUpperCase() })

    setUnlocking(false)

    if (error) {
      setUnlockError(error.message.includes('Too many') ? '⏱ ' + error.message : '✗ Invalid Admin ID. Access denied.')
      return
    }

    setUnlocked(true)
    loadAll()
  }

  if (!unlocked) {
    return (
      <div className="section" style={{ maxWidth: 480 }}>
        <button className="link-btn" onClick={onBack}>← Back</button>
        <div style={{ maxWidth: 400, margin: '30px auto', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
          <h3 style={{ marginBottom: 6, color: 'var(--text-strong)' }}>Superadmin access only</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
            Enter your personal Admin ID to unlock the Pleads section. Only the true superadmin knows this code.
          </p>
          {unlockError && <div className="form-error" style={{ marginBottom: 14 }}>{unlockError}</div>}
          <input
            value={enteredCode}
            onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && tryUnlock()}
            placeholder="ADM-XXXXXXXX"
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 15, textAlign: 'center', letterSpacing: 2, fontFamily: 'monospace', background: 'var(--surface)', color: 'var(--text)', marginBottom: 12 }}
          />
          <button className="btn-primary" onClick={tryUnlock} disabled={unlocking}>
            {unlocking ? 'Verifying…' : '🔓 Unlock Pleads'}
          </button>
        </div>
      </div>
    )
  }


  async function loadAll() {
    setLoading(true)
    const [reqRes, bannedRes, codeRes] = await Promise.all([
      supabase.from('unban_requests').select('*, businesses(name, category, status)').order('created_at', { ascending: false }),
      supabase.from('businesses').select('*').eq('status', 'banned').order('updated_at', { ascending: false }),
      supabase.from('ban_authorization').select('code').eq('id', 1).single(),
    ])
    setRequests(reqRes.data || [])
    setBannedBusinesses(bannedRes.data || [])
    setBanCode(codeRes.data?.code || null)
    setLoading(false)
  }

  async function approve(req) {
    if (!confirm(`Unban "${req.businesses?.name}"? Its status will return to verified.`)) return
    const { error } = await supabase.rpc('approve_unban_request', { p_request_id: req.id })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }

  async function reject(req) {
    const note = prompt('Reason for rejecting this plead (internal note):')
    if (note === null) return
    const { error } = await supabase.rpc('reject_unban_request', { p_request_id: req.id, p_note: note })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }

  async function regenerateCode() {
    if (!confirm('Generate a new ban authorization code? The old code will stop working immediately.')) return
    setRegenerating(true)
    const { data, error } = await supabase.rpc('regenerate_ban_code')
    setRegenerating(false)
    if (error) { alert('Error: ' + error.message); return }
    setBanCode(data)
    setShowCode(true)
  }

  if (loading) return <div className="section" style={{ maxWidth: 820 }}><h2 style={{ marginBottom: 20 }}>Pleads</h2><SkeletonList count={5} /></div>

  const pending = requests.filter(r => r.status === 'pending')

  return (
    <div className="section" style={{ maxWidth: 820 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ marginBottom: 6 }}>Pleads</h2>
          <p className="muted" style={{ marginBottom: 20 }}>Businesses requesting to be unbanned, and the master ban authorization code for other admins.</p>
        </div>
        <button className="btn-ghost-small" onClick={() => { setUnlocked(false); setEnteredCode(''); }}>🔒 Lock Pleads</button>
      </div>

      {/* BAN AUTHORIZATION CODE PANEL */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-strong)' }}>🔑 Ban authorization code</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Other admins need this code from you to ban a business. Keep it private.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {showCode ? (
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, background: 'var(--hover-bg)', padding: '6px 12px', borderRadius: 8 }}>{banCode}</span>
            ) : (
              <button className="btn-ghost-small" onClick={() => setShowCode(true)}>👁 Show code</button>
            )}
            <button className="btn-ghost-small" onClick={regenerateCode} disabled={regenerating}>{regenerating ? 'Generating…' : '🔄 Regenerate'}</button>
          </div>
        </div>
      </div>

      {/* PENDING PLEADS */}
      <h3 style={{ marginBottom: 12 }}>Pending unban requests ({pending.length})</h3>
      {pending.length === 0 ? (
        <p className="muted" style={{ marginBottom: 24 }}>No pending pleads.</p>
      ) : (
        <div className="admin-list" style={{ marginBottom: 24 }}>
          {pending.map((r) => (
            <div className="admin-row" key={r.id} style={{ flexWrap: 'wrap' }}>
              <div>
                <button onClick={() => onSelectBusiness?.(r.businesses)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                  <strong style={{ color: '#1D9E75', textDecoration: 'underline' }}>{r.businesses?.name || 'Unknown business'}</strong>
                </button>
                <span className="badge badge-danger" style={{ marginLeft: 8 }}>banned</span>
                {r.message && <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text)' }}>"{r.message}"</div>}
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Requested {new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <div className="admin-actions">
                <button className="btn-small" onClick={() => approve(r)}>Approve unban</button>
                <button className="btn-ghost-small" onClick={() => reject(r)}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ALL BANNED BUSINESSES (superadmin-only master list) */}
      <h3 style={{ marginBottom: 12 }}>All banned businesses ({bannedBusinesses.length})</h3>
      {bannedBusinesses.length === 0 ? (
        <p className="muted">No banned businesses.</p>
      ) : (
        <div className="admin-list">
          {bannedBusinesses.map((b) => {
            const hasPending = pending.some(r => r.business_id === b.id)
            return (
              <div className="admin-row" key={b.id}>
                <div>
                  <button onClick={() => onSelectBusiness?.(b)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                    <strong style={{ color: '#1D9E75', textDecoration: 'underline' }}>{b.name}</strong>
                  </button>
                  <span className="badge badge-danger" style={{ marginLeft: 8 }}>banned</span>
                  {hasPending && <span className="badge badge-pending" style={{ marginLeft: 8 }}>Pending plead</span>}
                  <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>{b.category}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
