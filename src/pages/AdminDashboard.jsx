import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function AdminDashboard() {
  const [tab, setTab] = useState('submissions')
  const [submissions, setSubmissions] = useState([])
  const [reports, setReports] = useState([])
  const [businesses, setBusinesses] = useState([])
  const [reportFilter, setReportFilter] = useState('pending') // pending | verified | dismissed | all
  const [bizFilter, setBizFilter] = useState('all') // all | verified | flagged | banned | pending
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(null)

  useEffect(() => {
    checkAdmin()
  }, [])

  useEffect(() => {
    if (isAdmin) loadReports()
  }, [reportFilter, isAdmin])

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setIsAdmin(false)
      return
    }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const admin = profile && ['admin', 'superadmin'].includes(profile.role)
    setIsAdmin(admin)
    if (admin) loadAll()
  }

  async function loadAll() {
    setLoading(true)
    const [subRes, bizRes] = await Promise.all([
      supabase.from('submissions').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('businesses').select('*').order('trust_score', { ascending: false }),
    ])
    setSubmissions(subRes.data || [])
    setBusinesses(bizRes.data || [])
    await loadReports()
    setLoading(false)
  }

  async function loadReports() {
    let q = supabase.from('reports').select('*').order('created_at', { ascending: false })
    if (reportFilter !== 'all') q = q.eq('status', reportFilter)
    const { data } = await q
    setReports(data || [])
  }

  async function approveSubmission(sub) {
    const { data: { user } } = await supabase.auth.getUser()

    const { error: insertError } = await supabase.from('businesses').insert({
      name: sub.name,
      category: sub.category,
      description: sub.description,
      phone: sub.phone,
      mpesa_till: sub.mpesa_till,
      fb_handle: sub.fb_handle,
      tiktok_handle: sub.tiktok_handle,
      instagram_handle: sub.instagram_handle,
      logo_url: sub.logo_url,
      status: 'verified',
    })

    if (insertError) {
      alert('Error approving: ' + insertError.message)
      return
    }

    await supabase.from('submissions').update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', sub.id)

    await supabase.from('audit_log').insert({
      admin_id: user.id,
      action_type: 'approve_submission',
      target_table: 'submissions',
      target_id: sub.id,
    })

    loadAll()
  }

  async function rejectSubmission(sub) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('submissions').update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', sub.id)

    await supabase.from('audit_log').insert({
      admin_id: user.id,
      action_type: 'reject_submission',
      target_table: 'submissions',
      target_id: sub.id,
    })

    loadAll()
  }

  // Verify a report: flags the linked business, OR creates a new
  // flagged business record if the report wasn't linked to one yet.
  async function verifyReport(report) {
    const { data: { user } } = await supabase.auth.getUser()
    let businessId = report.business_id

    if (businessId) {
      // Already linked to an existing business — just flag it
      await supabase.from('businesses').update({ status: 'flagged' }).eq('id', businessId)
    } else {
      // No matching business yet — create one so it shows up as flagged
      const { data: newBiz, error: createError } = await supabase
        .from('businesses')
        .insert({
          name: report.business_name,
          category: 'Other',
          phone: null,
          status: 'flagged',
          description: `Auto-created from a verified scam report: ${report.description || report.scam_type}`,
        })
        .select()
        .single()

      if (createError) {
        alert('Error creating flagged business: ' + createError.message)
        return
      }
      businessId = newBiz.id

      // Link the report to the newly created business
      await supabase.from('reports').update({ business_id: businessId }).eq('id', report.id)
    }

    await supabase.from('reports').update({
      status: 'verified',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', report.id)

    await supabase.from('audit_log').insert({
      admin_id: user.id,
      action_type: 'verify_report',
      target_table: 'reports',
      target_id: report.id,
    })

    loadAll()
  }

  async function dismissReport(report) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('reports').update({
      status: 'dismissed',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', report.id)

    await supabase.from('audit_log').insert({
      admin_id: user.id,
      action_type: 'dismiss_report',
      target_table: 'reports',
      target_id: report.id,
    })

    loadAll()
  }

  async function banBusiness(biz) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('businesses').update({ status: 'banned' }).eq('id', biz.id)
    await supabase.from('audit_log').insert({
      admin_id: user.id,
      action_type: 'ban_business',
      target_table: 'businesses',
      target_id: biz.id,
    })
    loadAll()
  }

  async function unbanBusiness(biz, newStatus) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('businesses').update({ status: newStatus }).eq('id', biz.id)
    await supabase.from('audit_log').insert({
      admin_id: user.id,
      action_type: 'unban_user',
      target_table: 'businesses',
      target_id: biz.id,
      note: `Unbanned, restored to status: ${newStatus}`,
    })
    loadAll()
  }

  if (isAdmin === null) return <div className="section"><p className="muted">Checking access…</p></div>
  if (isAdmin === false) return <div className="section"><p className="muted">You don't have admin access.</p></div>

  return (
    <div className="section">
      <h2>Admin dashboard</h2>
      <div className="filter-row">
        <button className={`filter-btn ${tab === 'submissions' ? 'on' : ''}`} onClick={() => setTab('submissions')}>
          Pending submissions ({submissions.length})
        </button>
        <button className={`filter-btn ${tab === 'reports' ? 'on' : ''}`} onClick={() => setTab('reports')}>
          Reports
        </button>
        <button className={`filter-btn ${tab === 'businesses' ? 'on' : ''}`} onClick={() => setTab('businesses')}>
          All businesses ({businesses.length})
        </button>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {tab === 'submissions' && (
            submissions.length === 0 ? <p className="muted">No pending submissions.</p> :
            <div className="admin-list">
              {submissions.map((s) => (
                <div className="admin-row" key={s.id}>
                  <div>
                    <strong>{s.name}</strong> <span className="muted">— {s.category}</span>
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      {s.phone} {s.mpesa_till && `· ${s.mpesa_till}`} {s.fb_handle && `· ${s.fb_handle}`}
                    </div>
                    {s.description && <div style={{ fontSize: 13, marginTop: 4 }}>{s.description}</div>}
                  </div>
                  <div className="admin-actions">
                    <button className="btn-small" onClick={() => approveSubmission(s)}>Approve</button>
                    <button className="btn-ghost-small" onClick={() => rejectSubmission(s)}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'reports' && (
            <>
              <div className="filter-row" style={{ marginBottom: 14 }}>
                {['pending', 'verified', 'dismissed', 'all'].map((f) => (
                  <button
                    key={f}
                    className={`filter-btn ${reportFilter === f ? 'on' : ''}`}
                    onClick={() => setReportFilter(f)}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              {reports.length === 0 ? <p className="muted">No {reportFilter !== 'all' ? reportFilter : ''} reports.</p> :
              <div className="admin-list">
                {reports.map((r) => (
                  <div className="admin-row" key={r.id}>
                    <div>
                      <strong>{r.business_name}</strong> <span className="muted">— {r.scam_type.replace('_', ' ')}</span>
                      <span className={`badge ${r.status === 'verified' ? 'badge-danger' : r.status === 'dismissed' ? 'badge-verified' : 'badge-pending'}`} style={{ marginLeft: 8 }}>
                        {r.status}
                      </span>
                      {r.amount_lost && <div className="muted" style={{ fontSize: 13 }}>Lost: Ksh {r.amount_lost}</div>}
                      {r.description && <div style={{ fontSize: 13, marginTop: 4 }}>{r.description}</div>}
                    </div>
                    {r.status === 'pending' && (
                      <div className="admin-actions">
                        <button className="btn-small" onClick={() => verifyReport(r)}>Verify & flag</button>
                        <button className="btn-ghost-small" onClick={() => dismissReport(r)}>Dismiss</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>}
            </>
          )}

          {tab === 'businesses' && (
            <>
              <div className="filter-row" style={{ marginBottom: 14 }}>
                {['all', 'verified', 'flagged', 'banned', 'pending'].map((f) => (
                  <button
                    key={f}
                    className={`filter-btn ${bizFilter === f ? 'on' : ''}`}
                    onClick={() => setBizFilter(f)}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <div className="admin-list">
                {businesses.filter(b => bizFilter === 'all' || b.status === bizFilter).map((b) => (
                  <div className="admin-row" key={b.id}>
                    <div>
                      <strong>{b.name}</strong> <span className="muted">— {b.category}</span>
                      <div className="muted" style={{ fontSize: 13 }}>
                        Status: {b.status} · Trust: {b.trust_score}% · {b.legit_votes} legit / {b.scam_votes} scam
                      </div>
                    </div>
                    <div className="admin-actions">
                      {b.status !== 'banned' ? (
                        <button className="btn-ghost-small" onClick={() => banBusiness(b)}>Ban</button>
                      ) : (
                        <>
                          <button className="btn-small" onClick={() => unbanBusiness(b, 'verified')}>Unban → Verified</button>
                          <button className="btn-ghost-small" onClick={() => unbanBusiness(b, 'flagged')}>Unban → Flagged</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {businesses.filter(b => bizFilter === 'all' || b.status === bizFilter).length === 0 && (
                  <p className="muted">No businesses with this status.</p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
