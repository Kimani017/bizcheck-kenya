import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const TABS = ['My Business', 'Personal Info', 'History Log']

export default function UserProfile({ profileUserId, currentUser, isAdmin, onBack }) {
  const [activeTab, setActiveTab] = useState('My Business')
  const [profile, setProfile] = useState(null)
  const [businesses, setBusinesses] = useState([])
  const [reviews, setReviews] = useState([])
  const [votes, setVotes] = useState([])
  const [viewedBusinesses, setViewedBusinesses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showBusinessForm, setShowBusinessForm] = useState(false)

  const isOwner = currentUser?.id === profileUserId
  const canSeePrivate = isOwner || isAdmin

  useEffect(() => { loadAll() }, [profileUserId])

  async function loadAll() {
    setLoading(true)
    const { data: profileData } = await supabase
      .from('profiles').select('*').eq('id', profileUserId).single()
    setProfile(profileData)

    // Load businesses owned by this user
    const { data: bizData } = await supabase
      .from('businesses').select('*').eq('owner_id', profileUserId)
    setBusinesses(bizData || [])

    if (canSeePrivate) {
      const [revRes, voteRes, viewRes] = await Promise.all([
        supabase.from('reviews').select('*, businesses(name, category)').eq('reviewer_id', profileUserId).order('created_at', { ascending: false }),
        supabase.from('votes').select('*, businesses(name)').eq('user_id', profileUserId).order('created_at', { ascending: false }),
        supabase.from('profile_views').select('*, businesses(name, category, status)').eq('viewer_id', profileUserId).order('created_at', { ascending: false }).limit(50),
      ])
      setReviews(revRes.data || [])
      setVotes(voteRes.data || [])
      setViewedBusinesses(viewRes.data || [])
    }
    setLoading(false)
  }

  if (loading) return <div className="section"><p className="muted">Loading profile…</p></div>
  if (!profile) return <div className="section"><p className="muted">Profile not found.</p></div>

  const joinDate = new Date(profile.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })

  // Filter tabs based on permissions
  const visibleTabs = canSeePrivate ? TABS : ['My Business']

  return (
    <div className="section" style={{ maxWidth: 680 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>

      {/* PROFILE HEADER */}
      <div className="profile-header">
        <div className="profile-avatar-lg">
          {(profile.name || 'U')[0].toUpperCase()}
        </div>
        <div>
          <h2 style={{ fontSize: 22, marginBottom: 2 }}>@{profile.username || 'user'}</h2>
          <div className="muted" style={{ fontSize: 13 }}>Member since {joinDate}</div>
          {profile.role === 'admin' && <span className="badge badge-verified" style={{ marginTop: 6, display: 'inline-block' }}>Admin</span>}
        </div>
      </div>

      {/* TABS */}
      <div className="profile-tabs">
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            className={`profile-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ===================== MY BUSINESS TAB ===================== */}
      {activeTab === 'My Business' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3>My businesses</h3>
            <button className="btn-small" onClick={() => setShowBusinessForm(!showBusinessForm)}>
              {showBusinessForm ? 'Cancel' : '+ List a business'}
            </button>
          </div>

          {/* BUSINESS REGISTRATION FORM */}
          {showBusinessForm && (
            <BusinessForm
              currentUser={currentUser}
              onSubmitted={() => { setShowBusinessForm(false); loadAll() }}
            />
          )}

          {/* LISTED BUSINESSES */}
          {businesses.length === 0 && !showBusinessForm ? (
            <div className="empty-state">
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
              <p>You haven't listed any businesses yet.</p>
              <button className="link-btn" style={{ margin: '12px auto 0' }} onClick={() => setShowBusinessForm(true)}>
                List your business →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {businesses.map((b) => (
                <BusinessCard key={b.id} business={b} onRefresh={loadAll} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================== PERSONAL INFO TAB ===================== */}
      {activeTab === 'Personal Info' && canSeePrivate && (
        <div>
          <h3 style={{ marginBottom: 16 }}>Personal information</h3>
          <div className="detail-rows">
            <div className="detail-row"><span>Full name</span><span>{profile.name || '—'}</span></div>
            <div className="detail-row"><span>Username</span><span style={{ fontWeight: 500 }}>@{profile.username || '—'}</span></div>
            <div className="detail-row"><span>Phone</span><span>{profile.phone || '—'}</span></div>
            <div className="detail-row"><span>Email</span><span>{profile.email || '—'}</span></div>
            <div className="detail-row"><span>Role</span><span style={{ textTransform: 'capitalize' }}>{profile.role}</span></div>
            <div className="detail-row"><span>Date joined</span><span>{joinDate}</span></div>
            <div className="detail-row"><span>Account status</span><span className={`badge ${profile.is_banned ? 'badge-danger' : 'badge-verified'}`}>{profile.is_banned ? 'Banned' : 'Active'}</span></div>
          </div>
        </div>
      )}

      {/* ===================== HISTORY LOG TAB ===================== */}
      {activeTab === 'History Log' && canSeePrivate && (
        <div>
          {/* ACTIVITY SUMMARY */}
          <div className="dashboard-stats" style={{ marginBottom: 24 }}>
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
              <div className="dashboard-stat-num">{viewedBusinesses.length}</div>
              <div className="dashboard-stat-label">Profiles viewed</div>
            </div>
          </div>

          {/* REVIEWS HISTORY */}
          {reviews.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 12 }}>Reviews written ({reviews.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {reviews.map((r) => (
                  <div key={r.id} className="review-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: 14 }}>{r.businesses?.name || 'Unknown business'}</span>
                      <span style={{ color: '#F5A623' }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                    </div>
                    {r.review_text && <p style={{ fontSize: 13, color: '#5F5E5A', lineHeight: 1.5 }}>{r.review_text}</p>}
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      {new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VOTES HISTORY */}
          {votes.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 12 }}>Votes cast ({votes.length})</h3>
              <div className="detail-rows">
                {votes.map((v) => (
                  <div key={v.id} className="detail-row">
                    <span>{v.businesses?.name || 'Unknown'}</span>
                    <div style={{ display: 'flex', align: 'center', gap: 8 }}>
                      <span className={`badge ${v.vote_type === 'legit' ? 'badge-verified' : 'badge-danger'}`}>
                        {v.vote_type === 'legit' ? '👍 Legit' : '👎 Scam'}
                      </span>
                      <span className="muted" style={{ fontSize: 11, alignSelf: 'center' }}>
                        {new Date(v.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEWED BUSINESSES */}
          {viewedBusinesses.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 12 }}>Businesses viewed ({viewedBusinesses.length})</h3>
              <div className="detail-rows">
                {viewedBusinesses.map((v) => (
                  <div key={v.id} className="detail-row">
                    <span>{v.businesses?.name || 'Unknown'}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className={`badge ${v.businesses?.status === 'verified' ? 'badge-verified' : 'badge-danger'}`}>
                        {v.businesses?.status || '—'}
                      </span>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {new Date(v.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {reviews.length === 0 && votes.length === 0 && viewedBusinesses.length === 0 && (
            <div className="empty-state">
              <p>No activity yet. Start by searching for a business!</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ===================== BUSINESS REGISTRATION FORM =====================
function BusinessForm({ currentUser, onSubmitted }) {
  const CATEGORIES = ['Electronics', 'Fashion', 'Food', 'Phones', 'Home', 'Beauty', 'Other']
  const [form, setForm] = useState({
    name: '', category: 'Electronics', location: '', description: '',
    phone: '', mpesa_till: '', fb_handle: '', tiktok_handle: '', instagram_handle: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Please enter your business name.'); return }
    if (!form.location.trim()) { setError('Please enter your business location.'); return }
    if (!form.description.trim()) { setError('Please add a description of your business.'); return }

    setSubmitting(true); setError('')

    // Submit to submissions table for admin approval
    const { error: insertError } = await supabase.from('submissions').insert({
      submitter_id: currentUser.id,
      name: form.name,
      category: form.category,
      description: form.description,
      phone: form.phone || null,
      mpesa_till: form.mpesa_till || null,
      fb_handle: form.fb_handle || null,
      tiktok_handle: form.tiktok_handle || null,
      instagram_handle: form.instagram_handle || null,
    })

    // Also add location to the submission note since submissions table doesn't have location yet
    setSubmitting(false)

    if (insertError) { setError('Something went wrong. Please try again.'); return }

    alert('✓ Business submitted for review! Our admin team will verify and list it within 24hrs.')
    onSubmitted()
  }

  return (
    <div className="review-write-box" style={{ marginBottom: 20 }}>
      <h3 style={{ marginBottom: 4 }}>List your business</h3>
      <p className="muted" style={{ marginBottom: 16 }}>Fill in your business details. Our team will review and verify within 24hrs.</p>

      {error && <div className="form-error">{error}</div>}

      <div className="form-group">
        <label>Business name *</label>
        <input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Nairobi Tech Hub" />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Category</label>
          <select value={form.category} onChange={(e) => update('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Location *</label>
          <input value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="e.g. Westlands, Nairobi" />
        </div>
      </div>

      <div className="form-group">
        <label>Description *</label>
        <textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={3} placeholder="Tell customers what you sell and how you operate..." />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Phone number</label>
          <input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="0712 345 678" />
        </div>
        <div className="form-group">
          <label>M-Pesa till</label>
          <input value={form.mpesa_till} onChange={(e) => update('mpesa_till', e.target.value)} placeholder="Till 123456" />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Facebook handle</label>
          <input value={form.fb_handle} onChange={(e) => update('fb_handle', e.target.value)} placeholder="@yourpage" />
        </div>
        <div className="form-group">
          <label>TikTok handle</label>
          <input value={form.tiktok_handle} onChange={(e) => update('tiktok_handle', e.target.value)} placeholder="@yourhandle" />
        </div>
      </div>

      <div className="form-group">
        <label>Instagram handle</label>
        <input value={form.instagram_handle} onChange={(e) => update('instagram_handle', e.target.value)} placeholder="@yourhandle" />
      </div>

      <button className="btn-primary" style={{ width: 'auto', padding: '10px 28px' }} onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit for review'}
      </button>
    </div>
  )
}

// ===================== OWNED BUSINESS CARD =====================
function BusinessCard({ business, onRefresh }) {
  const trustColor = business.trust_score > 70 ? '#1D9E75' : business.trust_score > 40 ? '#EF9F27' : '#E24B4A'

  return (
    <div className="biz-card" style={{ cursor: 'default' }}>
      <div className="biz-top">
        <div>
          <div className="biz-name">{business.name}</div>
          <div className="biz-cat">{business.category} · {business.location || 'No location'}</div>
        </div>
        <span className={`badge ${business.status === 'verified' ? 'badge-verified' : business.status === 'flagged' ? 'badge-danger' : 'badge-pending'}`}>
          {business.status}
        </span>
      </div>
      {business.description && <p style={{ fontSize: 13, color: '#5F5E5A', margin: '8px 0', lineHeight: 1.5 }}>{business.description}</p>}
      <div className="trust-bar-wrap">
        <div className="trust-label">
          <span>Trust score</span>
          <span style={{ color: trustColor, fontWeight: 500 }}>{business.trust_score}%</span>
        </div>
        <div className="trust-bar">
          <div className="trust-fill" style={{ width: `${business.trust_score}%`, background: trustColor }}></div>
        </div>
      </div>
      <div className="biz-meta" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {business.phone && <span>📞 {business.phone}</span>}
        {business.mpesa_till && <span>💳 {business.mpesa_till}</span>}
        {business.fb_handle && <span>📘 {business.fb_handle}</span>}
        {business.view_count > 0 && <span>👁 {business.view_count} views</span>}
        {business.review_count > 0 && <span>⭐ {business.avg_rating?.toFixed(1)} ({business.review_count} reviews)</span>}
      </div>
    </div>
  )
}
