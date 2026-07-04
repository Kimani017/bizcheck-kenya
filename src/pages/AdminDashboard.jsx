import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { SkeletonList } from './Skeleton'

const FLAG_THRESHOLD = 6
const SCAM_THRESHOLD = 10

export default function AdminDashboard({ onSelectBusiness, onSelectUser }) {
  const [mainTab, setMainTab] = useState('businesses') // businesses | reports | verification | chat
  const [chatThreads, setChatThreads] = useState([])
  const [activeThreadUserId, setActiveThreadUserId] = useState(null)
  const [threadMessages, setThreadMessages] = useState([])
  const [chatText, setChatText] = useState('')
  const [bizSubTab, setBizSubTab] = useState('verified') // verified | flagged | scam
  const [reportSubTab, setReportSubTab] = useState('pending') // pending | reported | log

  const [businesses, setBusinesses] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(null)
  const [currentAdminId, setCurrentAdminId] = useState(null)

  useEffect(() => { checkAdmin() }, [])

  // Live updates for support chat — new messages appear instantly
  useEffect(() => {
    if (!currentAdminId) return
    const channel = supabase
      .channel('admin-support-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload) => {
        loadChatThreads()
        if (payload.new.thread_user_id === activeThreadUserId) {
          setThreadMessages((prev) => [...prev, payload.new])
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentAdminId, activeThreadUserId])

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setIsAdmin(false); return }
    setCurrentAdminId(user.id)
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const admin = profile && ['admin', 'superadmin'].includes(profile.role)
    setIsAdmin(admin)
    if (admin) loadAll()
  }

  async function loadAll() {
    setLoading(true)
    const [bizRes, subRes, repRes] = await Promise.all([
      supabase.from('businesses').select('*').order('unique_reporter_count', { ascending: false }),
      supabase.from('submissions').select('*, profiles(name, email, username)').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('reports').select('*, businesses(name, status, unique_reporter_count)').order('created_at', { ascending: false }),
    ])
    setBusinesses(bizRes.data || [])
    setSubmissions(subRes.data || [])
    setReports(repRes.data || [])
    await loadChatThreads()
    setLoading(false)
  }

  // ── SUPPORT CHAT ──
  async function loadChatThreads() {
    const { data } = await supabase
      .from('support_messages')
      .select('*, profiles!support_messages_thread_user_id_fkey(name, username, email)')
      .order('created_at', { ascending: false })

    // Group into threads by thread_user_id, keep latest message + unread count
    const grouped = {}
    ;(data || []).forEach((m) => {
      if (!grouped[m.thread_user_id]) {
        grouped[m.thread_user_id] = {
          userId: m.thread_user_id,
          profile: m.profiles,
          lastMessage: m,
          unreadCount: 0,
        }
      }
      if (!m.is_read && m.sender_id === m.thread_user_id) {
        grouped[m.thread_user_id].unreadCount++
      }
    })
    setChatThreads(Object.values(grouped).sort((a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at)))
  }

  async function openThread(userId) {
    setActiveThreadUserId(userId)
    const { data } = await supabase
      .from('support_messages')
      .select('*')
      .eq('thread_user_id', userId)
      .order('created_at', { ascending: true })
    setThreadMessages(data || [])

    // Mark unread messages as read
    await supabase.from('support_messages')
      .update({ is_read: true })
      .eq('thread_user_id', userId)
      .eq('sender_id', userId)
      .eq('is_read', false)
    loadChatThreads()
  }

  async function sendChatReply() {
    if (!chatText.trim() || !activeThreadUserId) return
    const { error } = await supabase.from('support_messages').insert({
      sender_id: currentAdminId,
      thread_user_id: activeThreadUserId,
      message: chatText.trim(),
      is_read: true,
    })
    if (error) { alert('Error: ' + error.message); return }
    setChatText('')
    openThread(activeThreadUserId)
  }

  // ── STATUS CHANGE (via safe RPC function with audit log) ──
  async function setBusinessStatus(businessId, status) {
    const { error } = await supabase.rpc('admin_set_business_status', {
      p_business_id: businessId, p_status: status, p_admin_id: currentAdminId,
    })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }

  // ── SUBMISSIONS ──
  async function approveSubmission(sub) {
    const { data: existing } = await supabase.from('businesses').select('id').ilike('name', sub.name).single()

    if (existing) {
      const { error } = await supabase.from('businesses').update({
        category: sub.category, description: sub.description, phone: sub.phone,
        mpesa_till: sub.mpesa_till, fb_handle: sub.fb_handle, tiktok_handle: sub.tiktok_handle,
        instagram_handle: sub.instagram_handle, owner_id: sub.submitter_id, status: 'verified',
      }).eq('id', existing.id)
      if (error) { alert('Error: ' + error.message); return }
    } else {
      const { error } = await supabase.from('businesses').insert({
        name: sub.name, category: sub.category, description: sub.description,
        phone: sub.phone, mpesa_till: sub.mpesa_till, fb_handle: sub.fb_handle,
        tiktok_handle: sub.tiktok_handle, instagram_handle: sub.instagram_handle,
        location: sub.location, owner_id: sub.submitter_id, status: 'verified',
      })
      if (error) { alert('Error: ' + error.message); return }
    }

    await supabase.from('submissions').update({
      status: 'approved', reviewed_by: currentAdminId, reviewed_at: new Date().toISOString(),
    }).eq('id', sub.id)

    await supabase.from('audit_log').insert({
      admin_id: currentAdminId, action_type: 'approve_submission', target_table: 'submissions', target_id: sub.id,
    })
    loadAll()
  }

  async function rejectSubmission(sub) {
    await supabase.from('submissions').update({
      status: 'rejected', reviewed_by: currentAdminId, reviewed_at: new Date().toISOString(),
    }).eq('id', sub.id)
    await supabase.from('audit_log').insert({
      admin_id: currentAdminId, action_type: 'reject_submission', target_table: 'submissions', target_id: sub.id,
    })
    loadAll()
  }

  // ── REPORTS ──
  async function dismissReport(report) {
    await supabase.from('reports').update({
      status: 'dismissed', reviewed_by: currentAdminId, reviewed_at: new Date().toISOString(),
    }).eq('id', report.id)
    await supabase.from('audit_log').insert({
      admin_id: currentAdminId, action_type: 'dismiss_report', target_table: 'reports', target_id: report.id,
    })
    loadAll()
  }

  async function acknowledgeReport(report) {
    let businessId = report.business_id

    if (!businessId) {
      // First-ever report on this name — create a stored record so future reports link to it
      const { data: newBiz, error } = await supabase.from('businesses').insert({
        name: report.business_name, category: 'Other', status: 'pending',
        description: `Stored from scam report: ${report.description || report.scam_type}`,
      }).select().single()
      if (error) { alert('Error: ' + error.message); return }
      businessId = newBiz.id
      await supabase.from('reports').update({ business_id: businessId }).eq('id', report.id)
    }

    await supabase.from('reports').update({
      status: 'verified', reviewed_by: currentAdminId, reviewed_at: new Date().toISOString(),
    }).eq('id', report.id)

    await supabase.from('audit_log').insert({
      admin_id: currentAdminId, action_type: 'verify_report', target_table: 'reports', target_id: report.id,
    })
    loadAll()
  }

  function getFullBusiness(businessId) {
    return businesses.find(b => b.id === businessId) || null
  }

  if (isAdmin === null) return <div className="section"><p className="muted">Checking access…</p></div>
  if (isAdmin === false) return <div className="section"><p className="muted">You don't have admin access.</p></div>
  if (loading) return <div className="section" style={{ maxWidth: 920 }}><h2 style={{ marginBottom: 20 }}>Admin Dashboard</h2><SkeletonList count={6} /></div>

  // ── Derived data ──
  const verifiedBiz = businesses.filter(b => b.status === 'verified')
  const flaggedBiz = businesses.filter(b => b.status === 'flagged')
  const scamBiz = businesses.filter(b => b.status === 'scam')
  const pendingReports = reports.filter(r => r.status === 'pending')

  // Businesses that have been reported at all (grouped)
  const reportedBusinessMap = {}
  reports.forEach(r => {
    if (!r.business_id) return
    if (!reportedBusinessMap[r.business_id]) {
      reportedBusinessMap[r.business_id] = {
        business: r.businesses,
        businessId: r.business_id,
        reportCount: 0,
        reports: [],
      }
    }
    reportedBusinessMap[r.business_id].reportCount++
    reportedBusinessMap[r.business_id].reports.push(r)
  })
  const reportedBusinesses = Object.values(reportedBusinessMap).sort(
    (a, b) => (b.business?.unique_reporter_count || 0) - (a.business?.unique_reporter_count || 0)
  )

  const needsReviewCount = businesses.filter(b =>
    (b.unique_reporter_count >= FLAG_THRESHOLD && b.status === 'verified') ||
    (b.unique_reporter_count >= SCAM_THRESHOLD && b.status !== 'scam')
  ).length

  return (
    <div className="section" style={{ maxWidth: 920 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Admin Dashboard</h2>
        {needsReviewCount > 0 && (
          <span style={{ background: '#FCEBEB', color: '#A32D2D', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
            🔔 {needsReviewCount} business{needsReviewCount !== 1 ? 'es' : ''} need review
          </span>
        )}
      </div>

      {/* MAIN TABS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[
          ['businesses', 'All Businesses'],
          ['reports', 'Reports'],
          ['verification', `Business Verification${submissions.length ? ` (${submissions.length})` : ''}`],
          ['chat', `Support Chat${chatThreads.reduce((s, t) => s + t.unreadCount, 0) ? ` (${chatThreads.reduce((s, t) => s + t.unreadCount, 0)})` : ''}`],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setMainTab(id)}
            style={{
              padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 700,
              color: mainTab === id ? '#1D9E75' : 'var(--text-muted)',
              borderBottom: mainTab === id ? '3px solid #1D9E75' : '3px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════ ALL BUSINESSES ══════════════ */}
      {mainTab === 'businesses' && (
        <div>
          <div className="filter-row" style={{ marginBottom: 18 }}>
            {[
              ['verified', `Verified (${verifiedBiz.length})`],
              ['flagged', `Flagged (${flaggedBiz.length})`],
              ['scam', `Scammers (${scamBiz.length})`],
            ].map(([id, label]) => (
              <button key={id} className={`filter-btn ${bizSubTab === id ? 'on' : ''}`} onClick={() => setBizSubTab(id)}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(bizSubTab === 'verified' ? verifiedBiz : bizSubTab === 'flagged' ? flaggedBiz : scamBiz).map((b) => (
              <BusinessAdminRow key={b.id} business={b} onSetStatus={setBusinessStatus} thresholds={{ FLAG_THRESHOLD, SCAM_THRESHOLD }} onSelectBusiness={onSelectBusiness} onSelectUser={onSelectUser} />
            ))}
            {(bizSubTab === 'verified' ? verifiedBiz : bizSubTab === 'flagged' ? flaggedBiz : scamBiz).length === 0 && (
              <p className="muted">No businesses in this category.</p>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ REPORTS ══════════════ */}
      {mainTab === 'reports' && (
        <div>
          <div className="filter-row" style={{ marginBottom: 18 }}>
            {[
              ['pending', `Pending Reports (${pendingReports.length})`],
              ['reported', `Businesses Reported (${reportedBusinesses.length})`],
              ['log', `Report Log (${reports.length})`],
            ].map(([id, label]) => (
              <button key={id} className={`filter-btn ${reportSubTab === id ? 'on' : ''}`} onClick={() => setReportSubTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {/* PENDING REPORTS */}
          {reportSubTab === 'pending' && (
            pendingReports.length === 0 ? <p className="muted">No pending reports.</p> :
            <div className="admin-list">
              {pendingReports.map((r) => (
                <div className="admin-row" key={r.id}>
                  <div>
                    <strong>{r.business_name}</strong> <span className="muted">— {r.scam_type.replace('_', ' ')}</span>
                    {r.businesses && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                        ({r.businesses.unique_reporter_count} unique reporter{r.businesses.unique_reporter_count !== 1 ? 's' : ''} so far)
                      </span>
                    )}
                    {r.amount_lost && <div className="muted" style={{ fontSize: 13 }}>Lost: Ksh {r.amount_lost}</div>}
                    {r.description && <div style={{ fontSize: 13, marginTop: 4 }}>{r.description}</div>}
                  </div>
                  <div className="admin-actions">
                    <button className="btn-small" onClick={() => acknowledgeReport(r)}>Acknowledge & store</button>
                    <button className="btn-ghost-small" onClick={() => dismissReport(r)}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* BUSINESSES REPORTED */}
          {reportSubTab === 'reported' && (
            reportedBusinesses.length === 0 ? <p className="muted">No businesses have been reported yet.</p> :
            <div className="admin-list">
              {reportedBusinesses.map((rb) => {
                const biz = rb.business
                const count = biz?.unique_reporter_count || rb.reportCount
                const needsFlagReview = count >= FLAG_THRESHOLD && biz?.status === 'verified'
                const needsScamReview = count >= SCAM_THRESHOLD && biz?.status !== 'scam'
                return (
                  <div className="admin-row" key={rb.businessId} style={{ flexWrap: 'wrap' }}>
                    <div>
                      <button
                        onClick={() => {
                          const full = getFullBusiness(rb.businessId)
                          if (full) onSelectBusiness?.(full)
                        }}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <strong style={{ color: '#1D9E75', textDecoration: 'underline' }}>{biz?.name || 'Unknown business'}</strong>
                      </button>
                      <span className={`badge ${biz?.status === 'verified' ? 'badge-verified' : biz?.status === 'scam' ? 'badge-danger' : 'badge-pending'}`} style={{ marginLeft: 8 }}>
                        {biz?.status}
                      </span>
                      {getFullBusiness(rb.businessId)?.owner_id && (
                        <button
                          onClick={() => onSelectUser?.(getFullBusiness(rb.businessId).owner_id)}
                          className="link-btn"
                          style={{ display: 'inline', margin: 0, marginLeft: 8, fontSize: 12 }}
                        >
                          👤 View owner profile
                        </button>
                      )}
                      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                        {count} unique reporter{count !== 1 ? 's' : ''} · {rb.reportCount} total report{rb.reportCount !== 1 ? 's' : ''}
                      </div>
                      {needsScamReview && (
                        <div style={{ color: '#A32D2D', fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                          🚨 {SCAM_THRESHOLD}+ reporters reached — consider marking as scam
                        </div>
                      )}
                      {!needsScamReview && needsFlagReview && (
                        <div style={{ color: '#854D0E', fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                          ⚠ {FLAG_THRESHOLD}+ reporters reached — consider flagging
                        </div>
                      )}
                    </div>
                    <div className="admin-actions">
                      {biz?.status !== 'flagged' && <button className="btn-ghost-small" onClick={() => setBusinessStatus(rb.businessId, 'flagged')}>Mark flagged</button>}
                      {biz?.status !== 'scam' && <button className="btn-small" style={{ background: '#A32D2D' }} onClick={() => setBusinessStatus(rb.businessId, 'scam')}>Mark scam</button>}
                      {biz?.status !== 'verified' && <button className="btn-ghost-small" onClick={() => setBusinessStatus(rb.businessId, 'verified')}>Restore verified</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* REPORT LOG */}
          {reportSubTab === 'log' && (
            reports.length === 0 ? <p className="muted">No reports have been filed yet.</p> :
            <div className="admin-list">
              {reports.map((r) => (
                <div className="admin-row" key={r.id}>
                  <div>
                    <strong>{r.business_name}</strong>
                    <span className={`badge ${r.status === 'verified' ? 'badge-danger' : r.status === 'dismissed' ? 'badge-verified' : 'badge-pending'}`} style={{ marginLeft: 8 }}>
                      {r.status}
                    </span>
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      Reason: {r.scam_type.replace('_', ' ')} {r.amount_lost && `· Lost Ksh ${r.amount_lost}`}
                    </div>
                    {r.description && <div style={{ fontSize: 13, marginTop: 4 }}>{r.description}</div>}
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      Filed {new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ BUSINESS VERIFICATION ══════════════ */}
      {mainTab === 'verification' && (
        submissions.length === 0 ? <p className="muted">No pending business verifications.</p> :
        <div className="admin-list">
          {submissions.map((s) => (
            <div className="admin-row" key={s.id}>
              <div>
                <strong>{s.name}</strong> <span className="muted">— {s.category}</span>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {s.location && `📍 ${s.location} · `}{s.phone} {s.mpesa_till && `· ${s.mpesa_till}`} {s.fb_handle && `· ${s.fb_handle}`}
                </div>
                {s.description && <div style={{ fontSize: 13, marginTop: 4 }}>{s.description}</div>}
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Submitted by:{' '}
                  {s.submitter_id ? (
                    <button onClick={() => onSelectUser?.(s.submitter_id)} className="link-btn" style={{ display: 'inline', margin: 0, fontSize: 12 }}>
                      {s.profiles?.name || s.profiles?.username || 'Unknown'} →
                    </button>
                  ) : (s.profiles?.name || s.profiles?.username || 'Unknown')}
                  {' · '}{new Date(s.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <div className="admin-actions">
                <button className="btn-small" onClick={() => approveSubmission(s)}>Approve</button>
                <button className="btn-ghost-small" onClick={() => rejectSubmission(s)}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════ SUPPORT CHAT ══════════════ */}
      {mainTab === 'chat' && (
        <div style={{ display: 'flex', gap: 16, height: 520 }}>
          {/* THREAD LIST */}
          <div style={{ width: 260, flexShrink: 0, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
              Conversations ({chatThreads.length})
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {chatThreads.length === 0 ? (
                <p className="muted" style={{ padding: 14, fontSize: 13 }}>No support messages yet.</p>
              ) : chatThreads.map((t) => (
                <button
                  key={t.userId}
                  onClick={() => openThread(t.userId)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none',
                    borderBottom: '1px solid var(--border)',
                    background: activeThreadUserId === t.userId ? 'var(--hover-bg)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 13 }}>{t.profile?.name || t.profile?.username || 'User'}</strong>
                    {t.unreadCount > 0 && (
                      <span style={{ background: '#E24B4A', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 6px' }}>{t.unreadCount}</span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.lastMessage.message}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ACTIVE THREAD */}
          <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!activeThreadUserId ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p className="muted">Select a conversation to view messages.</p>
              </div>
            ) : (
              <>
                <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
                  {chatThreads.find(t => t.userId === activeThreadUserId)?.profile?.name || 'User'}
                  <button className="link-btn" style={{ display: 'inline', margin: 0, marginLeft: 10, fontSize: 12 }} onClick={() => onSelectUser?.(activeThreadUserId)}>
                    View profile →
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {threadMessages.map((m) => {
                    const isMeAdmin = !m.is_bot && m.sender_id !== m.thread_user_id
                    const isBot = m.is_bot
                    return (
                      <div key={m.id} style={{ display: 'flex', justifyContent: isMeAdmin ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                          maxWidth: '70%', padding: '10px 14px', borderRadius: 14,
                          background: isMeAdmin ? '#1D9E75' : 'var(--hover-bg)',
                          color: isMeAdmin ? '#fff' : 'var(--text)', fontSize: 14,
                          border: isBot ? '1.5px solid #17A2B8' : 'none',
                        }}>
                          {isBot && <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 2, color: '#17A2B8' }}>🤖 Bot auto-reply</div>}
                          {m.message}
                          <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>
                            {new Date(m.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                  <input
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendChatReply()}
                    placeholder="Reply…"
                    style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }}
                  />
                  <button
                    onClick={sendChatReply}
                    style={{ padding: '10px 20px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Business row in "All Businesses" tab ──
function BusinessAdminRow({ business: b, onSetStatus, thresholds, onSelectBusiness, onSelectUser }) {
  const needsFlagReview = b.unique_reporter_count >= thresholds.FLAG_THRESHOLD && b.status === 'verified'
  const needsScamReview = b.unique_reporter_count >= thresholds.SCAM_THRESHOLD && b.status !== 'scam'

  return (
    <div className="admin-row" style={{ flexWrap: 'wrap' }}>
      <div>
        <button
          onClick={() => onSelectBusiness?.(b)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
        >
          <strong style={{ color: '#1D9E75', textDecoration: 'underline' }}>{b.name}</strong>
        </button>
        <span className="muted"> — {b.category}</span>
        {b.owner_id && (
          <button
            onClick={() => onSelectUser?.(b.owner_id)}
            className="link-btn"
            style={{ display: 'inline', margin: 0, marginLeft: 8, fontSize: 12 }}
          >
            👤 View owner profile
          </button>
        )}
        <div className="muted" style={{ fontSize: 13 }}>
          Trust: {b.trust_score}% · {b.legit_votes} legit / {b.scam_votes} scam votes · {b.unique_reporter_count} unique reporters
        </div>
        {needsScamReview && <div style={{ color: '#A32D2D', fontSize: 12, fontWeight: 700, marginTop: 4 }}>🚨 Reached scam threshold ({thresholds.SCAM_THRESHOLD}+ reporters)</div>}
        {!needsScamReview && needsFlagReview && <div style={{ color: '#854D0E', fontSize: 12, fontWeight: 700, marginTop: 4 }}>⚠ Reached flag threshold ({thresholds.FLAG_THRESHOLD}+ reporters)</div>}
      </div>
      <div className="admin-actions">
        {b.status !== 'verified' && <button className="btn-ghost-small" onClick={() => onSetStatus(b.id, 'verified')}>Verify</button>}
        {b.status !== 'flagged' && <button className="btn-ghost-small" onClick={() => onSetStatus(b.id, 'flagged')}>Flag</button>}
        {b.status !== 'scam' && <button className="btn-small" style={{ background: '#A32D2D' }} onClick={() => onSetStatus(b.id, 'scam')}>Mark scam</button>}
        {b.status !== 'banned' && <button className="btn-ghost-small" onClick={() => onSetStatus(b.id, 'banned')}>Ban</button>}
      </div>
    </div>
  )
}
