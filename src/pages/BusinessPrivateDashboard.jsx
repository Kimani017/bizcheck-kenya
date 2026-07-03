import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

function StarDisplay({ rating, size = 14 }) {
  return (
    <span>
      {[1,2,3,4,5].map((s) => (
        <span key={s} style={{ color: s <= rating ? '#F5A623' : 'var(--border)', fontSize: size }}>★</span>
      ))}
    </span>
  )
}

export default function BusinessPrivateDashboard({ business, onBack, currentUser }) {
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

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [revRes, viewRes, bizRes, replyRes] = await Promise.all([
      supabase.from('reviews').select('*, profiles(name, username)').eq('business_id', biz.id).order('created_at', { ascending: false }),
      supabase.from('profile_views').select('*').eq('business_id', biz.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('businesses').select('*').eq('id', biz.id).single(),
      supabase.from('review_replies').select('*, profiles(name, username)').eq('business_id', biz.id).order('created_at', { ascending: true }),
    ])
    setReviews(revRes.data || [])
    setViews(viewRes.data || [])
    if (bizRes.data) setBiz(bizRes.data)

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

  const viewsByDay = views.reduce((acc, v) => {
    const day = new Date(v.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
    acc[day] = (acc[day] || 0) + 1
    return acc
  }, {})

  const cardClicks = views.filter(v => v.view_type === 'card_click').length
  const profileViews = views.filter(v => v.view_type === 'profile_view').length
  const trustColor = biz.trust_score > 70 ? '#1D9E75' : biz.trust_score > 40 ? '#EF9F27' : '#E24B4A'

  return (
    <div className="section" style={{ maxWidth: 680 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, marginBottom: 4 }}>🏢 {biz.name}</h2>
          <span className="muted">Private business dashboard</span>
        </div>
        <button className="btn-small" onClick={() => setEditing(!editing)}>
          {editing ? 'Cancel' : '✏️ Edit profile'}
        </button>
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
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── REVIEW CARD WITH REPLY THREAD (owner replies from here directly) ──
function ReviewWithThread({ review, existingReplies, currentUser, businessId, onReplyPosted }) {
  const [showReplyBox, setShowReplyBox] = useState(false)
  const [message, setMessage] = useState('')
  const [posting, setPosting] = useState(false)
  const [threadOpen, setThreadOpen] = useState(existingReplies.length > 0 && existingReplies.length <= 2)

  async function postReply() {
    if (!message.trim()) return
    setPosting(true)
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

      {/* REPLY BUTTON / FORM — right here in the dashboard */}
      {!showReplyBox ? (
        <button className="link-btn" style={{ margin: '10px 0 0', fontSize: 12, color: '#1D9E75' }} onClick={() => setShowReplyBox(true)}>
          💬 {existingReplies.length > 0 ? 'Add another reply' : 'Reply to this review'}
        </button>
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
    </div>
  )
}
