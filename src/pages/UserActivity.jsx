import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { SkeletonList } from './Skeleton'

export default function UserActivity({ onBack }) {
  const [scamReports, setScamReports] = useState([])
  const [userReports, setUserReports] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)
  const [spammers, setSpammers] = useState([]) // enriched with profile + business info

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)

    const [scamRes, userRepRes, spamRes] = await Promise.all([
      supabase.from('reports').select('*').neq('cancel_status', 'none').order('created_at', { ascending: false }),
      supabase.from('user_reports').select('*').neq('cancel_status', 'none').order('created_at', { ascending: false }),
      supabase.rpc('get_business_spammers'),
    ])

    const scam = scamRes.data || []
    const userRep = userRepRes.data || []
    setScamReports(scam)
    setUserReports(userRep)

    // Collect every profile id we need to label (reporter + reported), fetch once, merge client-side
    const ids = new Set()
    scam.forEach((r) => { if (r.reporter_id) ids.add(r.reporter_id) })
    userRep.forEach((r) => { if (r.reporter_id) ids.add(r.reporter_id); if (r.reported_user_id) ids.add(r.reported_user_id) })

    const spamRows = spamRes.data || []
    spamRows.forEach((s) => ids.add(s.user_id))

    let profileMap = {}
    if (ids.size > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, username, warned_count, restricted_count, is_banned').in('id', Array.from(ids))
      profiles?.forEach((p) => { profileMap[p.id] = p })
      setProfilesById(profileMap)
    }

    // Enrich spam rows with business names
    if (spamRows.length > 0) {
      const bizIds = Array.from(new Set(spamRows.map((s) => s.business_id)))
      const { data: bizList } = await supabase.from('businesses').select('id, name').in('id', bizIds)
      const bizMap = {}
      bizList?.forEach((b) => { bizMap[b.id] = b })

      setSpammers(spamRows.map((s) => ({
        ...s,
        profile: profileMap[s.user_id],
        business: bizMap[s.business_id],
      })))
    } else {
      setSpammers([])
    }

    setLoading(false)
  }

  function recommendedAction(profile) {
    if (!profile) return 'warn'
    if ((profile.warned_count || 0) >= 1 && (profile.restricted_count || 0) >= 1) return 'ban'
    if ((profile.warned_count || 0) >= 1) return 'restrict'
    return 'warn'
  }

  async function applyAction(action, userId, businessId) {
    const label = action === 'warn' ? 'warn (15 days, no votes/reviews)' : action === 'restrict' ? 'restrict (45 days, no reviews)' : 'PERMANENTLY BAN (account deleted)'
    if (!confirm(`Apply "${label}" to this user?${action === 'ban' ? ' This cannot be undone.' : ''}`)) return

    let error = null
    if (action === 'warn') ({ error } = await supabase.rpc('warn_user', { p_user_id: userId, p_business_id: businessId }))
    else if (action === 'restrict') ({ error } = await supabase.rpc('restrict_user', { p_user_id: userId, p_business_id: businessId }))
    else if (action === 'ban') ({ error } = await supabase.rpc('ban_user_permanently', { p_user_id: userId, p_business_id: businessId }))

    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }

  async function confirmScamCancel(id) {
    const { error } = await supabase.rpc('confirm_cancel_scam_report', { p_report_id: id })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }
  async function rejectScamCancel(id) {
    const { error } = await supabase.rpc('reject_cancel_scam_report', { p_report_id: id })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }
  async function confirmUserCancel(id) {
    const { error } = await supabase.rpc('confirm_cancel_user_report', { p_report_id: id })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }
  async function rejectUserCancel(id) {
    const { error } = await supabase.rpc('reject_cancel_user_report', { p_report_id: id })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }

  function usernameFor(id) {
    return profilesById[id]?.username ? `@${profilesById[id].username}` : 'user'
  }

  if (loading) return <div className="section" style={{ maxWidth: 820 }}>{onBack && <h2 style={{ marginBottom: 20 }}>User Activity</h2>}<SkeletonList count={4} /></div>

  return (
    <div className="section" style={{ maxWidth: 820 }}>
      {onBack && <button className="link-btn" onClick={onBack}>← Back</button>}
      <h2 style={{ marginBottom: 6 }}>User Activity</h2>
      <p className="muted" style={{ marginBottom: 20 }}>Report cancellation requests awaiting your decision, and their history.</p>

      {/* SPAM DETECTION — users hitting the same business 3+ times within 5 minutes */}
      <h3 style={{ marginBottom: 12 }}>⚠ Spam alerts ({spammers.length})</h3>
      {spammers.length === 0 ? (
        <p className="muted" style={{ marginBottom: 24 }}>No spam activity detected.</p>
      ) : (
        <div className="admin-list" style={{ marginBottom: 24 }}>
          {spammers.map((s) => {
            const rec = recommendedAction(s.profile)
            const alreadyBanned = s.profile?.is_banned
            return (
              <div className="admin-row" key={`${s.user_id}-${s.business_id}`} style={{ flexWrap: 'wrap' }}>
                <div>
                  <strong>@{s.profile?.username || 'user'}</strong>
                  <span className="badge badge-danger" style={{ marginLeft: 8 }}>{s.event_count} actions in {'<'}5 min</span>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    Targeted: {s.business?.name || 'Unknown business'}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    Previously: {s.profile?.warned_count || 0} warning(s), {s.profile?.restricted_count || 0} restriction(s)
                  </div>
                </div>
                {!alreadyBanned && (
                  <div className="admin-actions" style={{ flexWrap: 'wrap' }}>
                    <button
                      className="btn-small"
                      style={{ background: rec === 'ban' ? '#A32D2D' : rec === 'restrict' ? '#EF9F27' : '#1D9E75' }}
                      onClick={() => applyAction(rec, s.user_id, s.business_id)}
                    >
                      Apply recommended: {rec === 'warn' ? 'Warn' : rec === 'restrict' ? 'Restrict' : 'Ban'}
                    </button>
                    <button className="btn-ghost-small" onClick={() => applyAction('warn', s.user_id, s.business_id)}>Warn</button>
                    <button className="btn-ghost-small" disabled={(s.profile?.warned_count || 0) < 1} onClick={() => applyAction('restrict', s.user_id, s.business_id)}>Restrict</button>
                    <button className="btn-ghost-small" style={{ color: '#A32D2D' }} disabled={(s.profile?.warned_count || 0) < 1 || (s.profile?.restricted_count || 0) < 1} onClick={() => applyAction('ban', s.user_id, s.business_id)}>Ban</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <h3 style={{ marginBottom: 12 }}>Scam report cancellations ({scamReports.length})</h3>
      {scamReports.length === 0 ? (
        <p className="muted" style={{ marginBottom: 24 }}>No cancellation activity.</p>
      ) : (
        <div className="admin-list" style={{ marginBottom: 24 }}>
          {scamReports.map((r) => (
            <div className="admin-row" key={r.id}>
              <div>
                <strong>{r.business_name}</strong>
                <span className={`badge ${r.cancel_status === 'confirmed' ? 'badge-verified' : 'badge-pending'}`} style={{ marginLeft: 8 }}>
                  {r.cancel_status === 'confirmed' ? 'Cancelled' : 'Cancellation requested'}
                </span>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  Reported by {usernameFor(r.reporter_id)} · {r.scam_type?.replace('_', ' ')}
                </div>
              </div>
              {r.cancel_status === 'requested' && (
                <div className="admin-actions">
                  <button className="btn-small" onClick={() => confirmScamCancel(r.id)}>Confirm cancellation</button>
                  <button className="btn-ghost-small" onClick={() => rejectScamCancel(r.id)}>Keep report</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginBottom: 12 }}>User report cancellations ({userReports.length})</h3>
      {userReports.length === 0 ? (
        <p className="muted">No cancellation activity.</p>
      ) : (
        <div className="admin-list">
          {userReports.map((r) => (
            <div className="admin-row" key={r.id}>
              <div>
                <strong>{usernameFor(r.reported_user_id)}</strong>
                <span className={`badge ${r.cancel_status === 'confirmed' ? 'badge-verified' : 'badge-pending'}`} style={{ marginLeft: 8 }}>
                  {r.cancel_status === 'confirmed' ? 'Cancelled' : 'Cancellation requested'}
                </span>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  Reported by {usernameFor(r.reporter_id)} · {r.reason}
                </div>
              </div>
              {r.cancel_status === 'requested' && (
                <div className="admin-actions">
                  <button className="btn-small" onClick={() => confirmUserCancel(r.id)}>Confirm cancellation</button>
                  <button className="btn-ghost-small" onClick={() => rejectUserCancel(r.id)}>Keep report</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
