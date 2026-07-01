import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function UserProfile({ profileUserId, currentUser, isAdmin, onBack }) {
  const [profile, setProfile] = useState(null)
  const [reviews, setReviews] = useState([])
  const [votes, setVotes] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  const isOwner = currentUser?.id === profileUserId
  const canSeePrivate = isOwner || isAdmin

  useEffect(() => {
    loadProfile()
  }, [profileUserId])

  async function loadProfile() {
    setLoading(true)
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileUserId)
      .single()
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

  if (loading) return <div className="section"><p className="muted">Loading profile…</p></div>
  if (!profile) return <div className="section"><p className="muted">Profile not found.</p></div>

  const joinDate = new Date(profile.created_at).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })

  return (
    <div className="section" style={{ maxWidth: 580 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>

      {/* PUBLIC SECTION — visible to all logged-in users */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div className="review-avatar" style={{ width: 56, height: 56, fontSize: 22 }}>
          {(profile.name || 'U')[0].toUpperCase()}
        </div>
        <div>
          <h2 style={{ fontSize: 20, marginBottom: 2 }}>{profile.name || 'BizCheck User'}</h2>
          <div className="muted">Member since {joinDate}</div>
          {profile.role === 'admin' && <span className="badge badge-verified" style={{ marginTop: 4 }}>Admin</span>}
        </div>
      </div>

      {/* PRIVATE SECTION — only owner and admin */}
      {canSeePrivate ? (
        <>
          <div className="detail-rows" style={{ marginBottom: 20 }}>
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
              <div className="dashboard-stat-num">{votes.length}</div>
              <div className="dashboard-stat-label">Votes cast</div>
            </div>
            <div className="dashboard-stat">
              <div className="dashboard-stat-num">{reports.length}</div>
              <div className="dashboard-stat-label">Reports filed</div>
            </div>
          </div>

          {/* REVIEW HISTORY */}
          {reviews.length > 0 && (
            <>
              <h3 style={{ marginBottom: 12 }}>Review history</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {reviews.map((r) => (
                  <div key={r.id} className="review-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: 14 }}>{r.businesses?.name || 'Unknown business'}</span>
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
              <h3 style={{ marginBottom: 12 }}>Vote history</h3>
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
              <h3 style={{ marginBottom: 12 }}>Reports filed</h3>
              <div className="detail-rows">
                {reports.map((r) => (
                  <div key={r.id} className="detail-row">
                    <span>{r.business_name}</span>
                    <span className={`badge ${r.status === 'verified' ? 'badge-danger' : 'badge-pending'}`}>
                      {r.status}
                    </span>
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
