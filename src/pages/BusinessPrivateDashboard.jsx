import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import ReportUserModal from './ReportUserModal'
import { chargeBusinessCredits } from './CreditGate'

function StarDisplay({ rating, size = 14 }) {
  return (
    <span>
      {[1,2,3,4,5].map((s) => (
        <span key={s} style={{ color: s <= rating ? '#F5A623' : 'var(--border)', fontSize: size }}>★</span>
      ))}
    </span>
  )
}

export default function BusinessPrivateDashboard({ business, onBack, currentUser, onInsufficientCredits, onOpenPricing }) {
  const [biz, setBiz] = useState(business)
  const [reviews, setReviews] = useState([])
  const [replies, setReplies] = useState({}) // { review_id: [replies] }
  const [views, setViews] = useState([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    description: business.description || '',
    phone: business.phone || '',
    mpesa_till: business.mpesa_till || '',
    fb_handle: business.fb_handle || '',
    tiktok_handle: business.tiktok_handle || '',
    instagram_handle: business.instagram_handle || '',
  })
  const [saving, setSaving] = useState(false)
  const [activityLog, setActivityLog] = useState([])
  const [scamReportsMade, setScamReportsMade] = useState([])
  const [userReportsMade, setUserReportsMade] = useState([])
  const [statsUnlocked, setStatsUnlocked] = useState(false)
  const [checkingStats, setCheckingStats] = useState(true)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  useEffect(() => {
    loadData()
    unlockStats()
  }, [])

  async function unlockStats() {
    setCheckingStats(true)
    const isFullControl = business.plan_type === 'full_control' && business.plan_status === 'active'
    if (isFullControl) {
      setStatsUnlocked(true)
      setCheckingStats(false)
      return
    }
    const charge = await chargeBusinessCredits(business.id, 'view_profile_views', 0.75)
    if (charge.ok) {
      setStatsUnlocked(true)
    } else if (charge.insufficientCredits) {
      setStatsUnlocked(false)
    }
    setCheckingStats(false)
  }

  async function uploadPhoto(file) {
    setUploadingPhoto(true)
    const charge = await chargeBusinessCredits(biz.id, 'upload_photo', 0.25)
    if (!charge.ok) {
      setUploadingPhoto(false)
      if (charge.insufficientCredits) { onInsufficientCredits?.(); return }
      alert('Error: ' + charge.error)
      return
    }

    const ext = file.name.split('.').pop()
    const path = `${currentUser.id}/photo-${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('business-photos').upload(path, file)
    if (uploadError) { setUploadingPhoto(false); alert('Upload error: ' + uploadError.message); return }

    const { data: urlData } = supabase.storage.from('business-photos').getPublicUrl(path)
    await supabase.from('businesses').update({ photo_url: urlData.publicUrl }).eq('id', biz.id)
    setUploadingPhoto(false)
    loadData()
  }

  async function loadData() {
    const [revRes, viewRes, bizRes, replyRes, activityRes, scamRepRes, userRepRes] = await Promise.all([
      supabase.from('reviews').select('*, profiles(name, username)').eq('business_id', biz.id).order('created_at', { ascending: false }),
      supabase.from('profile_views').select('*').eq('business_id', biz.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('businesses').select('*').eq('id', biz.id).single(),
      supabase.from('review_replies').select('*, profiles(name, username)').eq('business_id', biz.id).order('created_at', { ascending: true }),
      supabase.from('business_activity_log').select('*, profiles(name, username)').eq('business_id', biz.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('reports').select('*').eq('reporter_id', currentUser.id).order('created_at', { ascending: false }),
      supabase.from('user_reports').select('*').eq('reporter_id', currentUser.id).order('created_at', { ascending: false }),
    ])
    setReviews(revRes.data || [])
    setViews(viewRes.data || [])
    if (bizRes.data) setBiz(bizRes.data)
    setScamReportsMade(scamRepRes.data || [])
    setUserReportsMade(userRepRes.data || [])
    setActivityLog(activityRes.data || [])

    // Group replies by review_id
    const grouped = {}
    ;(replyRes.data || []).forEach((r) => {
      if (!grouped[r.review_id]) grouped[r.review_id] = []
      grouped[r.review_id].push(r)
    })
    setReplies(grouped)
  }

  async function saveEdits() {
    setSaving(true)
    await supabase.from('businesses').update(form).eq('id', biz.id)
    setSaving(false)
    setEditing(false)
    loadData()
  }

  async function cancelScamReport(id) {
    if (!confirm('Request cancellation of this report? An admin will review your request.')) return
    const { error } = await supabase.rpc('request_cancel_scam_report', { p_report_id: id })
    if (error) { alert('Error: ' + error.message); return }
    loadData()
  }

  async function cancelUserReport(id) {
    if (!confirm('Request cancellation of this report? An admin will review your request.')) return
    const { error } = await supabase.rpc('request_cancel_user_report', { p_report_id: id })
    if (error) { alert('Error: ' + error.message); return }
    loadData()
  }

  const viewsByDay = views.reduce((acc, v) => {
    const day = new Date(v.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
    acc[day] = (acc[day] || 0) + 1
    return acc
  }, {})

  const cardClicks = views.filter(v => v.view_type === 'card_click').length
  const profileViews = views.filter(v => v.view_type === 'profile_view').length
  const trustColor = biz.trust_score > 70 ? '#1D9E75' : biz.trust_score > 40 ? '#EF9F27' : '#E24B4A'

  // If this business has been banned, show a plead screen instead of the normal dashboard
  if (biz.status === 'banned') {
    return <BannedBusinessScreen business={biz} currentUser={currentUser} onBack={onBack} />
  }

  return (
    <div className="section" style={{ maxWidth: 680 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
            {biz.photo_url ? (
              <img src={biz.photo_url} alt={biz.name} style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--hover-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🏢</div>
            )}
            <label style={{ position: 'absolute', bottom: -4, right: -4, width: 22, height: 22, borderRadius: '50%', background: '#1D9E75', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 11 }}>
              📷
              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingPhoto} onChange={(e) => e.target.files[0] && uploadPhoto(e.target.files[0])} />
            </label>
          </div>
          <div>
            <h2 style={{ fontSize: 22, marginBottom: 4 }}>{biz.name}</h2>
            <span className="muted">Private business dashboard</span>
          </div>
        </div>
        <button className="btn-small" onClick={() => setEditing(!editing)}>
          {editing ? 'Cancel' : '✏️ Edit profile'}
        </button>
      </div>

      {/* AVAILABLE CREDITS */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Available credits</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1D9E75' }}>
            {biz.plan_type === 'full_control' && biz.plan_status === 'active' ? '🟣 Unlimited (Full Control)' : `${biz.credits ?? 0} credits`}
          </div>
        </div>
        {!(biz.plan_type === 'full_control' && biz.plan_status === 'active') && (
          <button className="btn-small" onClick={onOpenPricing}>Buy more credits</button>
        )}
      </div>

      {/* EDIT FORM */}
      {editing && (
        <div className="review-write-box" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 6 }}>Edit business details</h3>
          <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
            Business name, category and location are locked after verification. Contact support to change these.
          </p>

          <div style={{ background: 'var(--hover-bg)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>🔒 Business name</span>
              <span style={{ fontWeight: 500 }}>{biz.name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>🔒 Category</span>
              <span style={{ fontWeight: 500 }}>{biz.category}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>🔒 Location</span>
              <span style={{ fontWeight: 500 }}>{biz.location || '—'}</span>
            </div>
          </div>

          {[
            ['description', 'Description', 'Tell customers about your business'],
            ['phone', 'Phone number', '0712 345 678'],
            ['mpesa_till', 'M-Pesa till', 'Till 123456'],
            ['fb_handle', 'Facebook handle', '@yourpage'],
            ['tiktok_handle', 'TikTok handle', '@yourhandle'],
            ['instagram_handle', 'Instagram handle', '@yourhandle'],
          ].map(([field, label, placeholder]) => (
            <div className="form-group" key={field}>
              <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block', fontWeight: 500 }}>{label}</label>
              {field === 'description' ? (
                <textarea value={form[field]} onChange={(e) => setForm(f => ({ ...f, [field]: e.target.value }))} placeholder={placeholder} rows={3} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E3DC', fontSize: 14, fontFamily: 'inherit' }} />
              ) : (
                <input value={form[field]} onChange={(e) => setForm(f => ({ ...f, [field]: e.target.value }))} placeholder={placeholder} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E3DC', fontSize: 14 }} />
              )}
            </div>
          ))}
          <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={saveEdits} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}

      {/* STATS OVERVIEW */}
      {checkingStats ? (
        <p className="muted" style={{ marginBottom: 20 }}>Loading stats…</p>
      ) : !statsUnlocked ? (
        <div style={{ textAlign: 'center', padding: '30px 20px', background: 'var(--surface)', border: '1.5px dashed var(--border)', borderRadius: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🔒</div>
          <h4 style={{ marginBottom: 6 }}>Unlock your business stats</h4>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>You don't have enough credits to view your business stats right now. Top up to see your views, ratings, and trust score.</p>
          <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={onOpenPricing}>Buy credits →</button>
        </div>
      ) : (
        <div className="dashboard-stats">
          <div className="dashboard-stat">
            <div className="dashboard-stat-num">{profileViews + cardClicks}</div>
            <div className="dashboard-stat-label">Total views</div>
          </div>
          <div className="dashboard-stat">
            <div className="dashboard-stat-num">{profileViews}</div>
            <div className="dashboard-stat-label">Profile views</div>
          </div>
          <div className="dashboard-stat">
            <div className="dashboard-stat-num">{cardClicks}</div>
            <div className="dashboard-stat-label">Card clicks</div>
          </div>
          <div className="dashboard-stat">
            <div className="dashboard-stat-num" style={{ color: '#F5A623' }}>{biz.avg_rating > 0 ? biz.avg_rating.toFixed(1) : '—'}</div>
            <div className="dashboard-stat-label">Avg rating</div>
          </div>
          <div className="dashboard-stat">
            <div className="dashboard-stat-num" style={{ color: trustColor }}>{biz.trust_score}%</div>
            <div className="dashboard-stat-label">Trust score</div>
          </div>
          <div className="dashboard-stat">
            <div className="dashboard-stat-num">{biz.review_count}</div>
            <div className="dashboard-stat-label">Reviews</div>
          </div>
        </div>
      )}

      {/* PRIVATE BUSINESS DETAILS */}
      <h3 style={{ marginBottom: 12, marginTop: 24 }}>Business details (private)</h3>
      <div className="detail-rows" style={{ marginBottom: 20 }}>
        <div className="detail-row"><span>Business name</span><span>{biz.name}</span></div>
        <div className="detail-row"><span>Category</span><span>{biz.category}</span></div>
        <div className="detail-row"><span>Location</span><span>{biz.location || '—'}</span></div>
        <div className="detail-row"><span>Phone</span><span>{biz.phone || '—'}</span></div>
        <div className="detail-row"><span>M-Pesa till</span><span>{biz.mpesa_till || '—'}</span></div>
        <div className="detail-row"><span>Status</span><span className={`badge ${biz.status === 'verified' ? 'badge-verified' : 'badge-danger'}`}>{biz.status}</span></div>
        <div className="detail-row"><span>Listed since</span><span>{new Date(biz.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
      </div>

      {/* VIEW LOG */}
      <h3 style={{ marginBottom: 12 }}>View log (last 100)</h3>
      {Object.keys(viewsByDay).length === 0 ? (
        <p className="muted" style={{ marginBottom: 20 }}>No views yet.</p>
      ) : (
        <div className="detail-rows" style={{ marginBottom: 20 }}>
          {Object.entries(viewsByDay).slice(0, 10).map(([day, count]) => (
            <div className="detail-row" key={day}>
              <span>{day}</span>
              <span style={{ fontWeight: 500 }}>{count} view{count !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      )}

      {/* RECENT ACTIVITY — audit trail of every change to this listing */}
      <h3 style={{ marginBottom: 12 }}>Recent activity</h3>
      {activityLog.length === 0 ? (
        <p className="muted" style={{ marginBottom: 20 }}>No changes have been made to your listing yet.</p>
      ) : (
        <div className="detail-rows" style={{ marginBottom: 20 }}>
          {activityLog.map((a) => {
            const actorLabel = a.actor_id === currentUser.id
              ? 'You'
              : (a.profiles?.username ? `@${a.profiles.username}` : 'BizCheck admin')
            return (
              <div className="detail-row" key={a.id}>
                <span>
                  <strong>{a.field_changed}</strong> changed by {actorLabel}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {new Date(a.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' '}
                  {new Date(a.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* REPORTS MADE — reports this owner has filed, with cancel option */}
      <h3 style={{ marginBottom: 12 }}>Reports made</h3>
      {scamReportsMade.length === 0 && userReportsMade.length === 0 ? (
        <p className="muted" style={{ marginBottom: 20 }}>You haven't made any reports yet.</p>
      ) : (
        <div className="admin-list" style={{ marginBottom: 20 }}>
          {scamReportsMade.map((r) => (
            <div className="admin-row" key={`scam-${r.id}`}>
              <div>
                <strong>{r.business_name}</strong>
                <span className="badge badge-pending" style={{ marginLeft: 8 }}>Scam report</span>
                {r.cancel_status === 'requested' && <span className="badge badge-pending" style={{ marginLeft: 8 }}>Cancellation pending</span>}
                {r.cancel_status === 'confirmed' && <span className="badge badge-danger" style={{ marginLeft: 8 }}>Cancelled</span>}
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {r.scam_type?.replace('_', ' ')} · {new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              {r.cancel_status === 'none' && (
                <button className="btn-ghost-small" style={{ color: '#E24B4A' }} onClick={() => cancelScamReport(r.id)}>Cancel report</button>
              )}
            </div>
          ))}
          {userReportsMade.map((r) => (
            <div className="admin-row" key={`user-${r.id}`}>
              <div>
                <strong>User report</strong>
                <span className="badge badge-pending" style={{ marginLeft: 8 }}>{r.reason}</span>
                {r.cancel_status === 'requested' && <span className="badge badge-pending" style={{ marginLeft: 8 }}>Cancellation pending</span>}
                {r.cancel_status === 'confirmed' && <span className="badge badge-danger" style={{ marginLeft: 8 }}>Cancelled</span>}
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              {r.cancel_status === 'none' && (
                <button className="btn-ghost-small" style={{ color: '#E24B4A' }} onClick={() => cancelUserReport(r.id)}>Cancel report</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* REVIEWS + REPLY THREAD */}
      <h3 style={{ marginBottom: 12 }}>Reviews received ({reviews.length})</h3>
      {reviews.length === 0 ? (
        <p className="muted">No reviews yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {reviews.map((r) => (
            <ReviewWithThread
              key={r.id}
              review={r}
              existingReplies={replies[r.id] || []}
              currentUser={currentUser}
              businessId={biz.id}
              onReplyPosted={loadData}
              onInsufficientCredits={onInsufficientCredits}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── REVIEW CARD WITH REPLY THREAD (owner replies from here directly) ──
function ReviewWithThread({ review, existingReplies, currentUser, businessId, onReplyPosted, onInsufficientCredits }) {
  const [showReplyBox, setShowReplyBox] = useState(false)
  const [message, setMessage] = useState('')
  const [posting, setPosting] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [threadOpen, setThreadOpen] = useState(existingReplies.length > 0 && existingReplies.length <= 2)

  async function postReply() {
    if (!message.trim()) return
    setPosting(true)

    const charge = await chargeBusinessCredits(businessId, 'reply_to_review', 0.25)
    if (!charge.ok) {
      setPosting(false)
      if (charge.insufficientCredits) { onInsufficientCredits?.(); return }
      alert('Error: ' + charge.error)
      return
    }

    const { error } = await supabase.from('review_replies').insert({
      review_id: review.id,
      business_id: businessId,
      author_id: currentUser.id,
      message: message.trim(),
    })
    setPosting(false)
    if (error) { alert('Error posting reply: ' + error.message); return }
    setMessage('')
    setShowReplyBox(false)
    onReplyPosted()
  }

  return (
    <div className="review-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>@{review.profiles?.username || review.profiles?.name || 'user'}</div>
        <StarDisplay rating={review.rating} />
      </div>
      {review.review_text && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{review.review_text}</p>}
      <div className="muted" style={{ fontSize: 11, marginTop: 4, marginBottom: existingReplies.length > 0 ? 10 : 0 }}>
        {new Date(review.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>

      {/* Rollup/rolldown toggle for the reply thread */}
      {existingReplies.length > 0 && (
        <button
          onClick={() => setThreadOpen(!threadOpen)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: threadOpen ? 8 : 0,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, color: '#1D9E75', padding: 0,
          }}
        >
          <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: threadOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
          {threadOpen ? 'Hide' : 'Show'} {existingReplies.length} {existingReplies.length === 1 ? 'reply' : 'replies'}
        </button>
      )}

      {/* REPLY THREAD — public, shows both owner and customer replies */}
      {existingReplies.length > 0 && threadOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginLeft: 16, borderLeft: '2px solid #E5E3DC', paddingLeft: 12 }}>
          {existingReplies.map((rep) => {
            const isMe = rep.author_id === currentUser.id
            return (
              <div key={rep.id} style={{ background: isMe ? '#F0FAF6' : 'var(--surface-2)', border: `1px solid ${isMe ? '#C8EDE0' : 'var(--border)'}`, borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isMe ? '#085041' : 'var(--text-muted)' }}>
                    {isMe ? '🏢 You (business)' : `💬 @${rep.profiles?.username || 'user'}`}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(rep.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text)' }}>{rep.message}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* REPLY + REPORT BUTTONS */}
      {!showReplyBox ? (
        <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
          <button className="link-btn" style={{ margin: 0, fontSize: 12, color: '#1D9E75' }} onClick={() => setShowReplyBox(true)}>
            💬 {existingReplies.length > 0 ? 'Add another reply' : 'Reply to this review'}
          </button>
          <button className="link-btn" style={{ margin: 0, fontSize: 12, color: '#E24B4A' }} onClick={() => setShowReportModal(true)}>
            🚩 Report this user
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="Write a public reply — visible to everyone..."
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E3DC', fontSize: 13, fontFamily: 'inherit', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ width: 'auto', padding: '7px 18px', fontSize: 13 }} onClick={postReply} disabled={posting}>
              {posting ? 'Posting…' : 'Post reply'}
            </button>
            <button className="btn-ghost-small" onClick={() => { setShowReplyBox(false); setMessage('') }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showReportModal && (
        <ReportUserModal
          reportedUserId={review.reviewer_id}
          reportedUsername={review.profiles?.username || 'user'}
          businessId={businessId}
          currentUser={currentUser}
          onClose={() => setShowReportModal(false)}
          onInsufficientCredits={onInsufficientCredits}
        />
      )}
    </div>
  )
}

// ── Shown to the owner instead of the dashboard when their business is banned ──
function BannedBusinessScreen({ business, currentUser, onBack }) {
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [existingRequest, setExistingRequest] = useState(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => { checkExisting() }, [])

  async function checkExisting() {
    const { data } = await supabase
      .from('unban_requests')
      .select('*')
      .eq('business_id', business.id)
      .eq('requested_by', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setExistingRequest(data || null)
    setChecked(true)
  }

  async function submitPlea() {
    if (!message.trim()) { alert('Please explain why this business should be unbanned.'); return }
    setSubmitting(true)
    const { error } = await supabase.from('unban_requests').insert({
      business_id: business.id,
      requested_by: currentUser.id,
      message: message.trim(),
    })
    setSubmitting(false)
    if (error) { alert('Error submitting: ' + error.message); return }
    checkExisting()
  }

  return (
    <div className="section" style={{ maxWidth: 560 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>

      <div style={{ background: '#FCEBEB', border: '1px solid #F7C1C1', borderRadius: 16, padding: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🚫</div>
        <h2 style={{ fontSize: 20, marginBottom: 6, color: '#A32D2D' }}>{business.name} has been banned</h2>
        <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
          This business was banned from BizCheck Kenya for violating our trust and safety guidelines. It is no longer visible to the public.
        </p>

        {!checked ? (
          <p className="muted">Loading…</p>
        ) : existingRequest ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', textAlign: 'left' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              Your plea: <span className={`badge ${existingRequest.status === 'approved' ? 'badge-verified' : existingRequest.status === 'rejected' ? 'badge-danger' : 'badge-pending'}`}>{existingRequest.status}</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>"{existingRequest.message}"</p>
            {existingRequest.status === 'rejected' && existingRequest.review_note && (
              <p style={{ fontSize: 13, color: '#A32D2D' }}>Admin note: {existingRequest.review_note}</p>
            )}
            {existingRequest.status === 'pending' && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Your plea is under review by our team.</p>
            )}
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', textAlign: 'left' }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 6, display: 'block' }}>
              Explain why this business should be unbanned
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Tell our team what happened and why you believe this ban should be reversed..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'inherit', marginBottom: 12, background: 'var(--surface)', color: 'var(--text)' }}
            />
            <button className="btn-primary" onClick={submitPlea} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit plea to be unbanned'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
