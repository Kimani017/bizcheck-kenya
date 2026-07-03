import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const TABS = [
  { id: 'business', label: 'My Business', icon: '🏢' },
  { id: 'personal', label: 'Personal Info', icon: '👤' },
  { id: 'history', label: 'History Log', icon: '📋' },
]

const CATEGORIES = ['Electronics', 'Fashion', 'Food', 'Phones', 'Home', 'Beauty', 'Other']

// Theme colors per tab
const THEMES = {
  business: {
    bg: '#F0FAF6',
    header: 'linear-gradient(135deg, #085041 0%, #1D9E75 100%)',
    accent: '#1D9E75',
    light: '#E1F5EE',
    text: '#085041',
    border: '#9FE1CB',
  },
  personal: {
    bg: '#F0FAFA',
    header: 'linear-gradient(135deg, #0D6E82 0%, #17A2B8 100%)',
    accent: '#17A2B8',
    light: '#E0F7FA',
    text: '#0D6E82',
    border: '#80DEEA',
  },
  history: {
    bg: '#F5F6F7',
    header: "linear-gradient(135deg, #37474F 0%, #546E7A 100%)",
    accent: '#546E7A',
    light: '#ECEFF1',
    text: '#37474F',
    border: '#B0BEC5',
  },
}

export default function UserProfile({ profileUserId, currentUser, isAdmin, onBack }) {
  const [activeTab, setActiveTab] = useState('business')
  const [profile, setProfile] = useState(null)
  const [businesses, setBusinesses] = useState([])
  const [reviews, setReviews] = useState([])
  const [votes, setVotes] = useState([])
  const [viewedBusinesses, setViewedBusinesses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showBusinessForm, setShowBusinessForm] = useState(false)

  const isOwner = currentUser?.id === profileUserId
  const canSeePrivate = isOwner || isAdmin
  const theme = THEMES[activeTab] || THEMES.business

  useEffect(() => {
    if (profileUserId) loadAll()
  }, [profileUserId, currentUser?.id])

  async function loadAll() {
    setLoading(true)
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles').select('*').eq('id', profileUserId).single()

      if (profileError || !profileData) {
        setLoading(false)
        return
      }
      setProfile(profileData)

      // Fetch businesses and submissions in parallel
      const [bizRes, subRes] = await Promise.all([
        supabase.from('businesses').select('*').eq('owner_id', profileUserId),
        supabase.from('submissions').select('*').eq('submitter_id', profileUserId).eq('status', 'pending'),
      ])

      const approvedBiz = (bizRes.data || [])
      const pendingSubs = (subRes.data || []).map(s => ({
        ...s,
        status: 'pending',
        trust_score: 0,
        legit_votes: 0,
        scam_votes: 0,
        view_count: 0,
        review_count: 0,
        avg_rating: 0,
        is_submission: true,
      }))
      setBusinesses([...approvedBiz, ...pendingSubs])

      // Only load private data if user has permission
      const shouldLoadPrivate = (currentUser?.id === profileUserId) || isAdmin
      if (shouldLoadPrivate) {
        const [revRes, voteRes, viewRes] = await Promise.all([
          supabase.from('reviews').select('*, businesses(name, category)').eq('reviewer_id', profileUserId).order('created_at', { ascending: false }),
          supabase.from('votes').select('*, businesses(name)').eq('user_id', profileUserId).order('created_at', { ascending: false }),
          supabase.from('profile_views').select('*, businesses(name, category, status)').eq('viewer_id', profileUserId).order('created_at', { ascending: false }).limit(30),
        ])
        setReviews(revRes.data || [])
        setVotes(voteRes.data || [])
        setViewedBusinesses(viewRes.data || [])
      }
    } catch (err) {
      console.error('UserProfile loadAll error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <p style={{ color: '#888780' }}>Loading profile…</p>
    </div>
  )
  if (!profile) return <div className="section"><p className="muted">Profile not found.</p></div>

  const joinDate = new Date(profile.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })
  const visibleTabs = canSeePrivate ? TABS : [TABS[0]]

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', overflowX: 'hidden' }}>
      <div style={{ padding: '12px 16px' }}>
        <button className="link-btn" onClick={onBack}>← Back</button>
      </div>

      {/* PROFILE HERO BANNER */}
      <div style={{ background: theme.header, padding: '32px 24px 80px', position: 'relative', transition: 'background 0.4s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            border: '3px solid rgba(255,255,255,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>
            {(profile.name || 'U')[0].toUpperCase()}
          </div>
          <div>
            <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
              @{profile.username || 'user'}
            </h2>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
              {profile.name} · Member since {joinDate}
            </div>
            {profile.role === 'admin' && (
              <span style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 11, padding: '2px 10px', borderRadius: 20, marginTop: 6, display: 'inline-block', fontWeight: 600 }}>
                Admin
              </span>
            )}
          </div>
        </div>
      </div>

      {/* TABS — overlapping the banner */}
      <div style={{ margin: '-48px 12px 0', position: 'relative', zIndex: 10 }}>
        <div style={{
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
          overflow: 'hidden',
        }}>
          {/* TAB BUTTONS */}
          <div style={{ display: 'flex', borderBottom: '1px solid #F1EFE8' }}>
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, padding: '16px 8px',
                  border: 'none', background: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  color: activeTab === tab.id ? THEMES[tab.id].accent : '#888780',
                  borderBottom: activeTab === tab.id ? `3px solid ${THEMES[tab.id].accent}` : '3px solid transparent',
                  transition: 'all 0.2s', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 6,
                }}
              >
                <span style={{ fontSize: 16 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB CONTENT */}
          <div style={{ background: theme.bg, padding: 24, minHeight: 400, transition: 'background 0.3s' }}>

            {/* ======= MY BUSINESS TAB ======= */}
            {activeTab === 'business' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div>
                    <h3 style={{ color: theme.text, fontSize: 18, marginBottom: 4 }}>My Businesses</h3>
                    <p style={{ color: '#5F5E5A', fontSize: 13 }}>Businesses you own or manage on BizCheck</p>
                  </div>
                  <button
                    onClick={() => setShowBusinessForm(!showBusinessForm)}
                    style={{
                      padding: '9px 18px', background: theme.accent, color: '#fff',
                      border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    {showBusinessForm ? '✕ Cancel' : '+ List a business'}
                  </button>
                </div>

                {showBusinessForm && (
                  <BusinessForm
                    currentUser={currentUser}
                    theme={theme}
                    onSubmitted={() => { setShowBusinessForm(false); loadAll() }}
                  />
                )}

                {businesses.length === 0 && !showBusinessForm ? (
                  <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <div style={{ fontSize: 52, marginBottom: 16 }}>🏢</div>
                    <h4 style={{ color: theme.text, marginBottom: 8 }}>No businesses listed yet</h4>
                    <p style={{ color: '#888780', fontSize: 14, marginBottom: 20 }}>List your business to get verified and reach more customers.</p>
                    <button
                      onClick={() => setShowBusinessForm(true)}
                      style={{ padding: '10px 24px', background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                    >
                      List your business →
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {businesses.map((b) => (
                      <OwnedBusinessCard key={b.id} business={b} theme={theme} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ======= PERSONAL INFO TAB ======= */}
            {activeTab === 'personal' && canSeePrivate && (
              <div>
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ color: theme.text, fontSize: 18, marginBottom: 4 }}>Personal Information</h3>
                  <p style={{ color: '#5F5E5A', fontSize: 13 }}>Only visible to you and admins</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'Full name', value: profile.name, icon: '👤' },
                    { label: 'Username', value: `@${profile.username || '—'}`, icon: '🏷️' },
                    { label: 'Phone number', value: profile.phone, icon: '📞' },
                    { label: 'Email address', value: profile.email, icon: '✉️' },
                    { label: 'Role', value: profile.role, icon: '🔑' },
                    { label: 'Date joined', value: joinDate, icon: '📅' },
                    { label: 'Account status', value: profile.is_banned ? 'Banned' : 'Active', icon: '✅', isBadge: true, badgeType: profile.is_banned ? 'danger' : 'verified' },
                  ].map(({ label, value, icon, isBadge, badgeType }) => (
                    <div key={label} style={{
                      background: '#fff', borderRadius: 12, padding: '14px 18px',
                      border: `1px solid ${theme.border}`,
                      display: 'flex', alignItems: 'center', gap: 14,
                    }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: theme.light,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, flexShrink: 0,
                      }}>
                        {icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#888780', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{label}</div>
                        {isBadge ? (
                          <span className={`badge ${badgeType === 'verified' ? 'badge-verified' : 'badge-danger'}`}>{value}</span>
                        ) : (
                          <div style={{ fontSize: 15, color: '#2C2C2A', fontWeight: 500 }}>{value || '—'}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ======= HISTORY LOG TAB ======= */}
            {activeTab === 'history' && canSeePrivate && (
              <div>
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ color: theme.text, fontSize: 18, marginBottom: 4 }}>Activity History</h3>
                  <p style={{ color: '#5F5E5A', fontSize: 13 }}>Your reviews, votes and businesses you've viewed</p>
                </div>

                {/* STATS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 24 }}>
                  {[
                    { num: reviews.length, label: 'Reviews written', icon: '⭐' },
                    { num: votes.filter(v => v.vote_type === 'legit').length, label: 'Legit votes', icon: '👍' },
                    { num: votes.filter(v => v.vote_type === 'scam').length, label: 'Scam votes', icon: '👎' },
                    { num: viewedBusinesses.length, label: 'Profiles viewed', icon: '👁' },
                  ].map(({ num, label, icon }) => (
                    <div key={label} style={{ background: '#fff', border: `1px solid ${theme.border}`, borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22 }}>{icon}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: theme.accent, margin: '4px 0 2px' }}>{num}</div>
                      <div style={{ fontSize: 11, color: '#888780' }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* REVIEWS */}
                {reviews.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <h4 style={{ color: theme.text, marginBottom: 12, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                      ⭐ Reviews written <span style={{ color: '#888780', fontWeight: 400 }}>({reviews.length})</span>
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {reviews.map((r) => (
                        <div key={r.id} style={{ background: '#fff', border: `1px solid ${theme.border}`, borderRadius: 10, padding: '12px 16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 14, color: '#2C2C2A' }}>{r.businesses?.name || 'Unknown business'}</span>
                            <span style={{ color: '#F5A623', fontSize: 14 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                          </div>
                          {r.review_text && <p style={{ fontSize: 13, color: '#5F5E5A', lineHeight: 1.6, marginBottom: 4 }}>{r.review_text}</p>}
                          <div style={{ fontSize: 11, color: '#888780' }}>
                            {new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* VOTES */}
                {votes.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <h4 style={{ color: theme.text, marginBottom: 12, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                      🗳️ Votes cast <span style={{ color: '#888780', fontWeight: 400 }}>({votes.length})</span>
                    </h4>
                    <div style={{ background: '#fff', border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden' }}>
                      {votes.map((v, i) => (
                        <div key={v.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 16px', gap: 12,
                          borderBottom: i < votes.length - 1 ? `1px solid ${theme.light}` : 'none',
                        }}>
                          <span style={{ fontSize: 14, color: '#2C2C2A' }}>{v.businesses?.name || 'Unknown'}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            <span className={`badge ${v.vote_type === 'legit' ? 'badge-verified' : 'badge-danger'}`}>
                              {v.vote_type === 'legit' ? '👍 Legit' : '👎 Scam'}
                            </span>
                            <span style={{ fontSize: 11, color: '#888780' }}>
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
                    <h4 style={{ color: theme.text, marginBottom: 12, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                      👁 Profiles viewed <span style={{ color: '#888780', fontWeight: 400 }}>({viewedBusinesses.length})</span>
                    </h4>
                    <div style={{ background: '#fff', border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden' }}>
                      {viewedBusinesses.map((v, i) => (
                        <div key={v.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 16px', gap: 12,
                          borderBottom: i < viewedBusinesses.length - 1 ? `1px solid ${theme.light}` : 'none',
                        }}>
                          <span style={{ fontSize: 14, color: '#2C2C2A' }}>{v.businesses?.name || 'Unknown'}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            <span className={`badge ${v.businesses?.status === 'verified' ? 'badge-verified' : 'badge-danger'}`}>
                              {v.businesses?.status || '—'}
                            </span>
                            <span style={{ fontSize: 11, color: '#888780' }}>
                              {new Date(v.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {reviews.length === 0 && votes.length === 0 && viewedBusinesses.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <div style={{ fontSize: 52, marginBottom: 16 }}>📋</div>
                    <h4 style={{ color: theme.text, marginBottom: 8 }}>No activity yet</h4>
                    <p style={{ color: '#888780', fontSize: 14 }}>Start by searching for a business to review or vote on.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div style={{ height: 32 }} />
    </div>
  )
}

// ======= BUSINESS FORM =======
function BusinessForm({ currentUser, theme, onSubmitted }) {
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
    if (!form.description.trim()) { setError('Please add a description.'); return }

    setSubmitting(true); setError('')

    const { error: insertError } = await supabase.from('submissions').insert({
      submitter_id: currentUser.id,
      name: form.name, category: form.category,
      location: form.location || null,
      description: form.description,
      phone: form.phone || null, mpesa_till: form.mpesa_till || null,
      fb_handle: form.fb_handle || null, tiktok_handle: form.tiktok_handle || null,
      instagram_handle: form.instagram_handle || null,
    })

    setSubmitting(false)
    if (insertError) { setError('Something went wrong. Please try again.'); return }
    alert('✓ Business submitted! Our team will verify and list it within 24hrs.')
    onSubmitted()
  }

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 14, fontFamily: 'inherit', background: '#fff', color: '#2C2C2A', outline: 'none' }
  const labelStyle = { fontSize: 13, color: '#5F5E5A', marginBottom: 6, display: 'block', fontWeight: 500 }

  return (
    <div style={{ background: '#fff', border: `1px solid ${theme.border}`, borderRadius: 14, padding: 24, marginBottom: 20 }}>
      <h3 style={{ color: theme.text, marginBottom: 4, fontSize: 16 }}>List your business</h3>
      <p style={{ color: '#888780', fontSize: 13, marginBottom: 18 }}>Our team will review and verify your business within 24hrs.</p>

      {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Business name *</label>
          <input style={inputStyle} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Nairobi Tech Hub" />
        </div>
        <div>
          <label style={labelStyle}>Category</label>
          <select style={inputStyle} value={form.category} onChange={(e) => update('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Location *</label>
        <input style={inputStyle} value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="e.g. Westlands, Nairobi" />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Description *</label>
        <textarea style={{ ...inputStyle, resize: 'vertical' }} value={form.description} onChange={(e) => update('description', e.target.value)} rows={3} placeholder="Tell customers what you sell and how you operate..." />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Phone number</label>
          <input style={inputStyle} value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="0712 345 678" />
        </div>
        <div>
          <label style={labelStyle}>M-Pesa till</label>
          <input style={inputStyle} value={form.mpesa_till} onChange={(e) => update('mpesa_till', e.target.value)} placeholder="Till 123456" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div>
          <label style={labelStyle}>Facebook</label>
          <input style={inputStyle} value={form.fb_handle} onChange={(e) => update('fb_handle', e.target.value)} placeholder="@yourpage" />
        </div>
        <div>
          <label style={labelStyle}>TikTok</label>
          <input style={inputStyle} value={form.tiktok_handle} onChange={(e) => update('tiktok_handle', e.target.value)} placeholder="@yourhandle" />
        </div>
        <div>
          <label style={labelStyle}>Instagram</label>
          <input style={inputStyle} value={form.instagram_handle} onChange={(e) => update('instagram_handle', e.target.value)} placeholder="@yourhandle" />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{ padding: '11px 28px', background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
      >
        {submitting ? 'Submitting…' : 'Submit for review'}
      </button>
    </div>
  )
}

// ======= OWNED BUSINESS CARD =======
function OwnedBusinessCard({ business, theme }) {
  const trustColor = business.trust_score > 70 ? '#1D9E75' : business.trust_score > 40 ? '#EF9F27' : '#E24B4A'
  const isPending = business.is_submission || business.status === 'pending'

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${isPending ? '#E5C97E' : theme.border}`,
      borderRadius: 14, padding: 20,
      opacity: isPending ? 0.9 : 1,
    }}>
      {/* Pending banner */}
      {isPending && (
        <div style={{
          background: '#FFFBEB', border: '1px solid #E5C97E',
          borderRadius: 8, padding: '8px 12px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 13, color: '#854D0E',
        }}>
          <span>⏳</span>
          <span><strong>Pending review</strong> — our admin team will verify your business within 24hrs.</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#2C2C2A', marginBottom: 3 }}>{business.name}</div>
          <div style={{ fontSize: 12, color: '#888780' }}>{business.category} · 📍 {business.location || 'No location set'}</div>
        </div>
        <span className={`badge ${
          business.status === 'verified' ? 'badge-verified' :
          business.status === 'flagged' ? 'badge-danger' :
          'badge-pending'
        }`} style={{ flexShrink: 0 }}>
          {business.status}
        </span>
      </div>

      {business.description && (
        <p style={{ fontSize: 13, color: '#5F5E5A', lineHeight: 1.6, marginBottom: 12 }}>{business.description}</p>
      )}

      {!isPending && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888780', marginBottom: 4 }}>
            <span>Trust score</span>
            <span style={{ color: trustColor, fontWeight: 600 }}>{business.trust_score}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: '#F1EFE8' }}>
            <div style={{ height: 5, borderRadius: 3, background: trustColor, width: `${business.trust_score}%` }}></div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: '#5F5E5A', paddingTop: 10, borderTop: `1px solid ${theme.light}` }}>
        {business.phone && <span>📞 {business.phone}</span>}
        {business.mpesa_till && <span>💳 {business.mpesa_till}</span>}
        {business.fb_handle && <span>📘 {business.fb_handle}</span>}
        {!isPending && business.view_count > 0 && <span>👁 {business.view_count} views</span>}
        {!isPending && business.review_count > 0 && <span>⭐ {business.avg_rating?.toFixed(1)} ({business.review_count} reviews)</span>}
      </div>
    </div>
  )
}
