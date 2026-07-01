import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function UserProfile({ profileUserId, currentUser, isAdmin, onBack }) {
  const [profile, setProfile] = useState(null)
  const [reviews, setReviews] = useState([])
  const [votes, setVotes] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [usernameAvailable, setUsernameAvailable] = useState(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const isOwner = currentUser?.id === profileUserId
  const canSeePrivate = isOwner || isAdmin

  useEffect(() => { loadProfile() }, [profileUserId])

  async function loadProfile() {
    setLoading(true)
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', profileUserId).single()
    setProfile(profileData)

    if (canSeePrivate) {
      const [revRes, voteRes, repRes] = await Promise.all([
        supabase.from('reviews').select('*, businesses(name)').eq('reviewer_id', profileUserId).order('created_at', { ascending: false }),
        supabase.from('votes').select('*, businesses(name)').eq('user_id', profileUserId).order('created_at', { ascending: false }),
        supabase.from('reports').select('*').eq('reporter_id', profileUserId).order('created_at', { ascending: false }),
      ])
      setReviews(revRes.data || [])
      setVotes(voteRes.data || [])
      setReports(repRes.data || [])
    }
    setLoading(false)
  }

  async function checkUsername(value) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, '')
    setNewUsername(cleaned)
    if (cleaned.length < 3 || cleaned === profile?.username) { setUsernameAvailable(null); return }
    setCheckingUsername(true)
    const { data } = await supabase.from('profiles').select('id').eq('username', cleaned).single()
    setCheckingUsername(false)
    setUsernameAvailable(!data)
  }

  async function saveUsername() {
    if (!newUsername || newUsername.length < 3) return
    if (usernameAvailable === false) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ username: newUsername }).eq('id', profileUserId)
    setSaving(false)
    if (error) { setSaveMsg('Error saving username.'); return }
    setSaveMsg('✓ Username updated!')
    setEditingUsername(false)
    loadProfile()
  }

  if (loading) return <div className="section"><p className="muted">Loading profile…</p></div>
  if (!profile) return <div className="section"><p className="muted">Profile not found.</p></div>

  const joinDate = new Date(profile.created_at).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })

  return (
    <div className="section" style={{ maxWidth: 580 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>

      {/* PROFILE HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div className="review-avatar" style={{ width: 60, height: 60, fontSize: 24 }}>
          {(profile.name || 'U')[0].toUpperCase()}
        </div>
        <div>
          {/* USERNAME — public */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 20 }}>@{profile.username || 'unknown'}</h2>
            {profile.role === 'admin' && <span className="badge badge-verified">Admin</span>}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>Member since {joinDate}</div>

          {/* Edit username button — only owner */}
          {isOwner && (
            <button className="link-btn" style={{ margin: 0, marginTop: 4, fontSize: 12 }} onClick={() => { setEditingUsername(!editingUsername); setNewUsername(profile.username || '') }}>
              {editingUsername ? 'Cancel' : '✏️ Change username'}
            </button>
          )}
        </div>
      </div>

      {/* USERNAME EDIT */}
      {editingUsername && (
        <div className="review-write-box" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 10 }}>Change username</h3>
          {saveMsg && <div className="vote-msg" style={{ marginBottom: 10 }}>{saveMsg}</div>}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <input
              value={newUsername}
              onChange={(e) => checkUsername(e.target.value)}
              placeholder="newusername"
              style={{ width: '100%', padding: '10px 14px', paddingLeft: 28, borderRadius: 8, border: '1px solid #E5E3DC', fontSize: 14 }}
            />
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#888780' }}>@</span>
            {checkingUsername && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#888780' }}>checking…</span>}
            {!checkingUsername && usernameAvailable === true && newUsername.length >= 3 && newUsername !== profile.username && (
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#1D9E75', fontWeight: 600 }}>✓ Available</span>
            )}
            {!checkingUsername && usernameAvailable === false && (
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#E24B4A', fontWeight: 600 }}>✗ Taken</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#888780', marginBottom: 10 }}>Only letters, numbers and underscores. Min 3 characters.</div>
          <button className="btn-primary" style={{ width: 'auto', padding: '9px 20px' }} onClick={saveUsername} disabled={saving || usernameAvailable === false || newUsername.length < 3}>
            {saving ? 'Saving…' : 'Save username'}
          </button>
        </div>
      )}

      {/* PRIVATE SECTION — owner and admin only */}
      {canSeePrivate ? (
        <>
          <h3 style={{ marginBottom: 10 }}>Account details</h3>
          <div className="detail-rows" style={{ marginBottom: 20 }}>
            <div className="detail-row"><span>Username</span><span style={{ fontWeight: 500 }}>@{profile.username || '—'}</span></div>
            <div className="detail-row"><span>Full name</span><span>{profile.name || '—'}</span></div>
            <div className="detail-row"><span>Phone</span><span>{profile.phone || '—'}</span></div>
            <div className="detail-row"><span>Email</span><span>{profile.email || '—'}</span></div>
            <div className="detail-row"><span>Role</span><span>{profile.role}</span></div>
            <div className="detail-row"><span>Joined</span><span>{joinDate}</span></div>
          </div>

          {/* ACTIVITY SUMMARY */}
          <div className="dashboard-stats" style={{ marginBottom: 20 }}>
            <div className="dashboard-stat">
              <div className="dashboard-stat-num">{reviews.length}</div>
              <div className="dashboard-stat-label">Reviews written</div>
            </div>
            <div className="dashboard-stat">
              <div className="dashboard-stat-num">{votes.filter(v => v.vote_type === 'legit').length}</div>
              <div className="dashboard-stat-label">Legit votes</div>
            </div>
            <div className="dashboard-stat">
              <div className="dashboard-stat-num">{votes.filter(v => v.vote_type === 'scam').length}</div>
              <div className="dashboard-stat-label">Scam votes</div>
            </div>
            <div className="dashboard-stat">
              <div className="dashboard-stat-num">{reports.length}</div>
              <div className="dashboard-stat-label">Reports filed</div>
            </div>
          </div>

          {/* REVIEW HISTORY */}
          {reviews.length > 0 && (
            <>
              <h3 style={{ marginBottom: 10 }}>Review history</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {reviews.map((r) => (
                  <div key={r.id} className="review-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: 14 }}>{r.businesses?.name || 'Unknown'}</span>
                      <span style={{ color: '#F5A623' }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                    </div>
                    {r.review_text && <p style={{ fontSize: 13, color: '#5F5E5A' }}>{r.review_text}</p>}
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* VOTES LOG */}
          {votes.length > 0 && (
            <>
              <h3 style={{ marginBottom: 10 }}>Vote history</h3>
              <div className="detail-rows" style={{ marginBottom: 20 }}>
                {votes.map((v) => (
                  <div key={v.id} className="detail-row">
                    <span>{v.businesses?.name || 'Unknown'}</span>
                    <span className={`badge ${v.vote_type === 'legit' ? 'badge-verified' : 'badge-danger'}`}>
                      {v.vote_type === 'legit' ? '👍 Legit' : '👎 Scam'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* REPORTS LOG */}
          {reports.length > 0 && (
            <>
              <h3 style={{ marginBottom: 10 }}>Reports filed</h3>
              <div className="detail-rows">
                {reports.map((r) => (
                  <div key={r.id} className="detail-row">
                    <span>{r.business_name}</span>
                    <span className={`badge ${r.status === 'verified' ? 'badge-danger' : 'badge-pending'}`}>{r.status}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {reviews.length === 0 && votes.length === 0 && reports.length === 0 && (
            <p className="muted">No activity yet.</p>
          )}
        </>
      ) : (
        <p className="muted">This user's details are private.</p>
      )}
    </div>
  )
}
