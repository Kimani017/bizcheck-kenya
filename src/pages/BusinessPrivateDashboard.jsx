import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

function StarDisplay({ rating, size = 14 }) {
  return (
    <span>
      {[1,2,3,4,5].map((s) => (
        <span key={s} style={{ color: s <= rating ? '#F5A623' : '#E5E3DC', fontSize: size }}>★</span>
      ))}
    </span>
  )
}

export default function BusinessPrivateDashboard({ business, onBack, currentUser }) {
  const [biz, setBiz] = useState(business)
  const [reviews, setReviews] = useState([])
  const [views, setViews] = useState([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    location: business.location || '',
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
    const [revRes, viewRes, bizRes] = await Promise.all([
      supabase.from('reviews').select('*, profiles(name)').eq('business_id', biz.id).order('created_at', { ascending: false }),
      supabase.from('profile_views').select('*').eq('business_id', biz.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('businesses').select('*').eq('id', biz.id).single(),
    ])
    setReviews(revRes.data || [])
    setViews(viewRes.data || [])
    if (bizRes.data) setBiz(bizRes.data)
  }

  async function saveEdits() {
    setSaving(true)
    await supabase.from('businesses').update(form).eq('id', biz.id)
    setSaving(false)
    setEditing(false)
    loadData()
  }

  // Group views by day
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
          <h3 style={{ marginBottom: 14 }}>Edit business details</h3>
          {[
            ['location', 'Location', 'e.g. Westlands, Nairobi'],
            ['description', 'Description', 'Tell customers about your business'],
            ['phone', 'Phone number', '0712 345 678'],
            ['mpesa_till', 'M-Pesa till', 'Till 123456'],
            ['fb_handle', 'Facebook handle', '@yourpage'],
            ['tiktok_handle', 'TikTok handle', '@yourhandle'],
            ['instagram_handle', 'Instagram handle', '@yourhandle'],
          ].map(([field, label, placeholder]) => (
            <div className="form-group" key={field}>
              <label style={{ fontSize: 13, color: '#5F5E5A', marginBottom: 6, display: 'block', fontWeight: 500 }}>{label}</label>
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

      {/* REVIEWS RECEIVED */}
      <h3 style={{ marginBottom: 12 }}>Reviews received ({reviews.length})</h3>
      {reviews.length === 0 ? (
        <p className="muted">No reviews yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reviews.map((r) => (
            <div key={r.id} className="review-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{r.profiles?.name || 'Anonymous'}</div>
                <StarDisplay rating={r.rating} />
              </div>
              {r.review_text && <p style={{ fontSize: 13, color: '#5F5E5A' }}>{r.review_text}</p>}
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
