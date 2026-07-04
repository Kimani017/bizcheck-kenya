import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { SkeletonList } from './Skeleton'

export default function AdminProfiles({ onSelectBusiness, onSelectUser, currentUser, onApply }) {
  const [tab, setTab] = useState('businesses') // businesses | users | applications | personal
  const [businesses, setBusinesses] = useState([])
  const [users, setUsers] = useState([])
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [isSuperadmin, setIsSuperadmin] = useState(false)

  const [adminCode, setAdminCode] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState('')
  const [personalInfo, setPersonalInfo] = useState(null)
  const [expandedAdminId, setExpandedAdminId] = useState(null)
  const [editingAdminId, setEditingAdminId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => { loadAll() }, [])

  // Auto-lock Personal Info the moment they switch to another tab within this page
  useEffect(() => {
    if (tab !== 'personal' && personalInfo !== null) {
      setPersonalInfo(null)
      setAdminCode('')
      setExpandedAdminId(null)
    }
  }, [tab])

  // Auto-lock if the browser tab/window loses focus or this component unmounts
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        setPersonalInfo(null)
        setAdminCode('')
        setExpandedAdminId(null)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      setPersonalInfo(null)
    }
  }, [])

  async function loadAll() {
    setLoading(true)
    const [bizRes, userRes, meRes, appRes] = await Promise.all([
      supabase.from('businesses').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name, username, role, created_at').order('created_at', { ascending: false }),
      supabase.from('profiles').select('role').eq('id', currentUser.id).single(),
      supabase.from('admin_applications').select('*, profiles!admin_applications_user_id_fkey(name, username, email)').order('created_at', { ascending: false }),
    ])
    setBusinesses(bizRes.data || [])
    setUsers(userRes.data || [])
    setIsSuperadmin(meRes.data?.role === 'superadmin')
    setApplications(appRes.data || [])
    setLoading(false)
  }

  async function unlockPersonalInfo() {
    if (!adminCode.trim()) { setUnlockError('Please enter your Admin ID.'); return }
    setUnlocking(true)
    setUnlockError('')
    const { data, error } = await supabase.rpc('get_personal_info', { p_code: adminCode.trim() })
    setUnlocking(false)
    if (error) {
      setUnlockError(
        error.message.includes('Too many') ? '⏱ ' + error.message :
        error.message.includes('Invalid') ? '✗ Invalid Admin ID. Access denied.' :
        'Error: ' + error.message
      )
      return
    }
    setPersonalInfo(data || [])
  }

  // Superadmin sends the admin application form to a user
  async function inviteUser(u) {
    if (!confirm(`Send @${u.username || u.name} an admin application form? They must fill it in before you can approve them.`)) return
    const { error } = await supabase.rpc('invite_admin_application', { p_target: u.id })
    if (error) { alert('Error: ' + error.message); return }
    alert(`✓ Invitation sent. @${u.username || u.name} will see the application form the next time they log in.`)
    loadAll()
  }

  async function demoteUser(u) {
    if (!confirm(`Remove admin rights from @${u.username || u.name}?`)) return
    const { error } = await supabase.rpc('demote_admin', { p_target: u.id })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }

  // Superadmin approves a submitted application — generates code and emails it
  async function approveApplication(app) {
    if (!confirm(`Approve @${app.profiles?.username || app.official_name}? This will email them their secret admin activation code.`)) return
    const { data: code, error } = await supabase.rpc('approve_admin_application', { p_application_id: app.id })
    if (error) { alert('Error: ' + error.message); return }

    // Send the code via email through our Edge Function
    const { data: sessionData } = await supabase.auth.getSession()
    const res = await fetch('https://ubjndgyukfhngytfabnw.supabase.co/functions/v1/send-admin-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify({ email: app.email, name: app.official_name, code }),
    })

    if (!res.ok) {
      alert(`Approved, but the email failed to send. Share this code with them manually:\n\n${code}`)
    } else {
      alert(`✓ Approved! An email with their activation code has been sent to ${app.email}.`)
    }
    loadAll()
  }

  async function cancelInvite(app) {
    if (!confirm(`Cancel the pending invitation to @${app.profiles?.username || 'this user'}? They will no longer see the application form.`)) return
    const { error } = await supabase.rpc('cancel_admin_invite', { p_application_id: app.id })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }

  function startEdit(p) {
    setEditingAdminId(p.id)
    setEditForm({
      name: p.name || '', email: p.email || '', phone: p.phone || '',
      national_id: p.national_id || '', application_id: p.application_id || null,
    })
  }

  async function saveAdminEdit(personId) {
    setSavingEdit(true)
    const { error: profileError } = await supabase.from('profiles').update({
      name: editForm.name, email: editForm.email, phone: editForm.phone,
    }).eq('id', personId)

    let appError = null
    if (editForm.application_id) {
      const { error } = await supabase.from('admin_applications').update({
        official_name: editForm.name, email: editForm.email, phone: editForm.phone, id_number: editForm.national_id,
      }).eq('id', editForm.application_id)
      appError = error
    }

    setSavingEdit(false)
    if (profileError || appError) { alert('Error saving: ' + (profileError?.message || appError?.message)); return }
    setEditingAdminId(null)
    unlockPersonalInfo() // refresh with the same code already entered
  }

  async function cancelApproval(app) {
    if (!confirm(`Cancel approval for @${app.profiles?.username || app.official_name}? Their activation code will stop working immediately.`)) return
    const { error } = await supabase.rpc('cancel_admin_approval', { p_application_id: app.id })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }

  async function rejectApplication(app) {
    const note = prompt('Reason for rejection (shown internally only):')
    if (note === null) return
    const { error } = await supabase.rpc('reject_admin_application', { p_application_id: app.id, p_note: note })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }

  async function viewIdPhoto(path) {
    const { data, error } = await supabase.storage.from('admin-id-photos').createSignedUrl(path, 300)
    if (error) { alert('Error loading photo: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  if (loading) return <div className="section" style={{ maxWidth: 820 }}><h2 style={{ marginBottom: 20 }}>Profiles</h2><SkeletonList count={6} /></div>

  const pendingApps = applications.filter(a => a.status === 'submitted')

  return (
    <div className="section" style={{ maxWidth: 820 }}>
      <h2 style={{ marginBottom: 20 }}>Profiles</h2>

      <div className="filter-row" style={{ marginBottom: 20 }}>
        {[
          ['businesses', `Businesses (${businesses.length})`],
          ['users', `Users (${users.length})`],
          ...(isSuperadmin ? [['applications', `Admin Applications${pendingApps.length ? ` (${pendingApps.length})` : ''}`]] : []),
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
                {b.admin_reviewed && (
                  <span title="Reviewed and verified by BizCheck admin" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: '#1877F2', marginLeft: 6, verticalAlign: 'middle' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                )}
                <span className={`badge ${b.status === 'verified' ? 'badge-verified' : b.status === 'scam' || b.status === 'flagged' ? 'badge-danger' : 'badge-pending'}`} style={{ marginLeft: 8 }}>{b.status}</span>
                <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)' }}>👁 {b.view_count || 0} view{b.view_count === 1 ? '' : 's'}</span>
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
          {users.map((u) => {
            const app = applications.find(a => a.user_id === u.id)
            return (
              <div className="admin-row" key={u.id}>
                <div>
                  <button onClick={() => onSelectUser(u.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                    <strong style={{ color: '#1D9E75', textDecoration: 'underline' }}>@{u.username || 'no-username'}</strong>
                  </button>
                  {u.role !== 'user' && <span className="badge badge-verified" style={{ marginLeft: 8, textTransform: 'capitalize' }}>{u.role}</span>}
                  {app && app.status !== 'activated' && (
                    <span className="badge badge-pending" style={{ marginLeft: 8, textTransform: 'capitalize' }}>Application: {app.status}</span>
                  )}
                  <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                    {u.name || '—'} · Joined {new Date(u.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                {isSuperadmin && u.id !== currentUser.id && (
                  <div className="admin-actions">
                    {!['admin', 'superadmin'].includes(u.role) && !app && <button className="btn-ghost-small" onClick={() => inviteUser(u)}>Send admin application</button>}
                    {!['admin', 'superadmin'].includes(u.role) && app && app.status === 'rejected' && <button className="btn-ghost-small" onClick={() => inviteUser(u)}>Re-invite</button>}
                    {u.role === 'admin' && <button className="btn-ghost-small" style={{ color: '#E24B4A' }} onClick={() => demoteUser(u)}>Remove admin</button>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ══════ ADMIN APPLICATIONS (superadmin review) ══════ */}
      {tab === 'applications' && isSuperadmin && (
        <div className="admin-list">
          {applications.length === 0 ? <p className="muted">No applications yet.</p> : applications.map((app) => (
            <div className="admin-row" key={app.id} style={{ flexWrap: 'wrap' }}>
              <div style={{ width: '100%' }}>
                <strong>@{app.profiles?.username || 'user'}</strong>
                <span className={`badge ${app.status === 'submitted' ? 'badge-pending' : app.status === 'approved' ? 'badge-verified' : app.status === 'rejected' ? 'badge-danger' : 'badge-pending'}`} style={{ marginLeft: 8, textTransform: 'capitalize' }}>
                  {app.status}
                </span>

                {app.status === 'submitted' && (
                  <div style={{ marginTop: 10, background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                    <div><strong>Official name:</strong> {app.official_name}</div>
                    <div><strong>ID number:</strong> {app.id_number}</div>
                    <div><strong>Date of birth:</strong> {app.date_of_birth}</div>
                    <div><strong>Email:</strong> {app.email}</div>
                    <div><strong>Phone:</strong> {app.phone}</div>
                    {app.id_photo_url && (
                      <button className="link-btn" style={{ margin: '4px 0 0', fontSize: 13 }} onClick={() => viewIdPhoto(app.id_photo_url)}>
                        🪪 View ID photo →
                      </button>
                    )}
                  </div>
                )}

                {app.status === 'invited' && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Waiting for user to fill in and submit the form.</div>}
                {app.status === 'approved' && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Activation code emailed to {app.email} — waiting for them to activate.</div>}
                {app.status === 'rejected' && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Rejected{app.review_note ? `: ${app.review_note}` : ''}</div>}
                {app.status === 'activated' && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>✓ Active admin since {new Date(app.activated_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
              </div>

              {app.status === 'invited' && (
                <div className="admin-actions">
                  <button className="btn-ghost-small" style={{ color: '#E24B4A' }} onClick={() => cancelInvite(app)}>Cancel invite</button>
                </div>
              )}

              {app.status === 'submitted' && (
                <div className="admin-actions">
                  <button className="btn-small" onClick={() => approveApplication(app)}>Approve & send code</button>
                  <button className="btn-ghost-small" onClick={() => rejectApplication(app)}>Reject</button>
                </div>
              )}

              {app.status === 'approved' && (
                <div className="admin-actions">
                  <button className="btn-small" onClick={() => approveApplication(app)}>Resend code email</button>
                  <button className="btn-ghost-small" style={{ color: '#E24B4A' }} onClick={() => cancelApproval(app)}>Cancel approval</button>
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
            <h3 style={{ marginBottom: 6, color: 'var(--text-strong)' }}>Encrypted admin records</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
              {isSuperadmin
                ? "As superadmin, you'll see every verified admin's sensitive details (including national ID) hidden until you click on them."
                : "You'll see only your own personal details here. Only the superadmin can view other admins' information."}
              {' '}Enter your Admin ID to decrypt and view.
            </p>
            {unlockError && <div className="form-error" style={{ marginBottom: 14 }}>{unlockError}</div>}
            <input
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && unlockPersonalInfo()}
              type="password"
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
              <span className="badge badge-verified">🔓 Unlocked — verified admins only</span>
              <button className="btn-ghost-small" onClick={() => { setPersonalInfo(null); setAdminCode(''); setExpandedAdminId(null) }}>🔒 Lock again</button>
            </div>
            {personalInfo.length === 0 ? (
              <p className="muted">No verified admins yet.</p>
            ) : (
              <div className="admin-list">
                {personalInfo.map((p) => {
                  const isOpen = expandedAdminId === p.id
                  return (
                    <div key={p.id} className="admin-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                      <button
                        onClick={() => setExpandedAdminId(isOpen ? null : p.id)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
                      >
                        <span>
                          <strong>@{p.username || 'no-username'}</strong>
                          <span className="badge badge-verified" style={{ marginLeft: 8, textTransform: 'capitalize' }}>{p.role}</span>
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{isOpen ? '▲ Hide details' : '▼ View details'}</span>
                      </button>

                      {isOpen && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                          {editingAdminId === p.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div>
                                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Full name</label>
                                <input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Email</label>
                                <input value={editForm.email} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Phone</label>
                                <input value={editForm.phone} onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>National ID</label>
                                <input value={editForm.national_id} onChange={(e) => setEditForm(f => ({ ...f, national_id: e.target.value }))} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn-small" onClick={() => saveAdminEdit(p.id)} disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save changes'}</button>
                                <button className="btn-ghost-small" onClick={() => setEditingAdminId(null)}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="muted" style={{ fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginBottom: 12 }}>
                                <span>👤 {p.name || '—'}</span>
                                <span>✉️ {p.email || '—'}</span>
                                <span>📞 {p.phone || '—'}</span>
                                <span style={{ fontWeight: 600, color: 'var(--text)' }}>🪪 ID: {p.national_id || 'Not provided'}</span>
                                <span>📅 Admin since {new Date(p.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn-ghost-small" onClick={() => startEdit(p)}>✏️ Edit info</button>
                                {p.role === 'admin' && isSuperadmin && (
                                  <button className="btn-ghost-small" style={{ color: '#E24B4A' }} onClick={async () => {
                                    if (!confirm(`Remove admin rights from @${p.username}? This immediately revokes their access.`)) return
                                    const { error } = await supabase.rpc('demote_admin', { p_target: p.id })
                                    if (error) { alert('Error: ' + error.message); return }
                                    unlockPersonalInfo()
                                    loadAll()
                                  }}>🗑 Remove admin</button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}
