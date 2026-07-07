import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { SkeletonList } from './Skeleton'

export default function UserActivity({ onBack }) {
  const [scamReports, setScamReports] = useState([])
  const [userReports, setUserReports] = useState([])
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)

    const [scamRes, userRepRes] = await Promise.all([
      supabase.from('reports').select('*').neq('cancel_status', 'none').order('created_at', { ascending: false }),
      supabase.from('user_reports').select('*').neq('cancel_status', 'none').order('created_at', { ascending: false }),
    ])

    const scam = scamRes.data || []
    const userRep = userRepRes.data || []
    setScamReports(scam)
    setUserReports(userRep)

    // Collect every profile id we need to label (reporter + reported), fetch once, merge client-side
    const ids = new Set()
    scam.forEach((r) => { if (r.reporter_id) ids.add(r.reporter_id) })
    userRep.forEach((r) => { if (r.reporter_id) ids.add(r.reporter_id); if (r.reported_user_id) ids.add(r.reported_user_id) })

    if (ids.size > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', Array.from(ids))
      const map = {}
      profiles?.forEach((p) => { map[p.id] = p })
      setProfilesById(map)
    }

    setLoading(false)
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
