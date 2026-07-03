import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const TABS = [
  { id: 'business', label: 'My Business', icon: '🏢' },
  { id: 'personal', label: 'Personal Info', icon: '👤' },
  { id: 'history', label: 'History Log', icon: '📋' },
]

const CATEGORIES = ['Electronics', 'Fashion', 'Food', 'Phones', 'Home', 'Beauty', 'Other']

const THEMES = {
  business: {
    gradient: 'linear-gradient(135deg, #052E1C 0%, #1D9E75 100%)',
    accent: '#1D9E75',
    accentDark: '#085041',
    accentLight: '#E1F5EE',
    accentBorder: '#9FE1CB',
    bg: '#F0FAF6',
    cardBorder: '#C8EDE0',
    text: '#085041',
    tabActive: '#1D9E75',
    statBg: 'linear-gradient(135deg, #1D9E75, #085041)',
  },
  personal: {
    gradient: 'linear-gradient(135deg, #063A45 0%, #17A2B8 100%)',
    accent: '#17A2B8',
    accentDark: '#0D6E82',
    accentLight: '#E0F7FA',
    accentBorder: '#80DEEA',
    bg: '#F0FBFC',
    cardBorder: '#B2EBF2',
    text: '#0D6E82',
    tabActive: '#17A2B8',
    statBg: 'linear-gradient(135deg, #17A2B8, #0D6E82)',
  },
  history: {
    gradient: 'linear-gradient(135deg, #1C2526 0%, #546E7A 100%)',
    accent: '#546E7A',
    accentDark: '#37474F',
    accentLight: '#ECEFF1',
    accentBorder: '#B0BEC5',
    bg: '#F5F6F7',
    cardBorder: '#CFD8DC',
    text: '#37474F',
    tabActive: '#546E7A',
    statBg: 'linear-gradient(135deg, #546E7A, #37474F)',
  },
}

export default function UserProfile({ profileUserId, currentUser, isAdmin, onBack, onSelectBusiness }) {
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
  const T = THEMES[activeTab] || THEMES.business

  useEffect(() => {
    if (profileUserId) loadAll()
  }, [profileUserId, currentUser?.id])

  async function loadAll() {
    setLoading(true)
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles').select('*').eq('id', profileUserId).single()
      if (profileError || !profileData) { setLoading(false); return }
      setProfile(profileData)

      const [bizRes, subRes] = await Promise.all([
        supabase.from('businesses').select('*').eq('owner_id', profileUserId),
        supabase.from('submissions').select('*').eq('submitter_id', profileUserId).eq('status', 'pending'),
      ])
      const pendingSubs = (subRes.data || []).map(s => ({
        ...s, status: 'pending', trust_score: 0, legit_votes: 0,
        scam_votes: 0, view_count: 0, review_count: 0, avg_rating: 0, is_submission: true,
      }))
      setBusinesses([...(bizRes.data || []), ...pendingSubs])

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
      console.error('UserProfile error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #E5E3DC', borderTop: '3px solid #1D9E75', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }}></div>
        <p style={{ color: '#888780', fontSize: 14 }}>Loading profile…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
  if (!profile) return <div className="section"><p className="muted">Profile not found.</p></div>

  const joinDate = new Date(profile.created_at).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
  const visibleTabs = canSeePrivate ? TABS : [TABS[0]]
  const initial = (profile.name || profile.username || 'U')[0].toUpperCase()

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', overflowX: 'hidden', background: T.bg, minHeight: '100vh', transition: 'background 0.4s' }}>

      {/* ── HERO BANNER ── */}
      <div style={{ background: T.gradient, padding: '0 0 72px', transition: 'background 0.4s', position: 'relative' }}>
        {/* Back button */}
        <div style={{ padding: '14px 18px' }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 20, padding: '6px 14px', fontSize: 13, cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
            ← Back
          </button>
        </div>

        {/* Avatar + name */}
        <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '3px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: '#fff', flexShrink: 0, backdropFilter: 'blur(4px)' }}>
            {initial}
          </div>
          <div>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 3 }}>@{profile.username || 'user'}</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{profile.name} · Since {joinDate}</div>
            {profile.role === 'admin' && (
              <span style={{ marginTop: 6, display: 'inline-block', background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, letterSpacing: '0.5px' }}>ADMIN</span>
            )}
          </div>
        </div>

        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -20, right: -20, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 30, right: 40, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
      </div>

      {/* ── FLOATING CARD ── */}
      <div style={{ margin: '-52px 14px 0', position: 'relative', zIndex: 10 }}>
        <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', overflow: 'hidden' }}>

          {/* TAB ROW */}
          <div style={{ display: 'flex', background: '#fff' }}>
            {visibleTabs.map((tab) => {
              const isActive = activeTab === tab.id
              const tabTheme = THEMES[tab.id]
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: 1, padding: '15px 6px 12px',
                    border: 'none', cursor: 'pointer',
                    background: isActive ? tabTheme.accentLight : '#fff',
                    borderBottom: isActive ? `3px solid ${tabTheme.accent}` : '3px solid transparent',
                    color: isActive ? tabTheme.accentDark : '#888780',
                    fontSize: 12, fontWeight: 700,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    transition: 'all 0.2s',
                    letterSpacing: '0.3px',
                  }}
                >
                  <span style={{ fontSize: 20 }}>{tab.icon}</span>
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* ── MY BUSINESS ── */}
          {activeTab === 'business' && (
            <div style={{ background: T.bg, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ color: T.accentDark, fontSize: 17, marginBottom: 2 }}>My Businesses</h3>
                  <p style={{ color: '#888780', fontSize: 12 }}>Businesses you own on BizCheck</p>
                </div>
                <button
                  onClick={() => setShowBusinessForm(!showBusinessForm)}
                  style={{ padding: '8px 16px', background: showBusinessForm ? '#fff' : T.accent, color: showBusinessForm ? T.accent : '#fff', border: `1.5px solid ${T.accent}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  {showBusinessForm ? '✕ Cancel' : '+ List a business'}
                </button>
              </div>

              {showBusinessForm && <BusinessForm currentUser={currentUser} theme={T} onSubmitted={() => { setShowBusinessForm(false); loadAll() }} />}

              {businesses.length === 0 && !showBusinessForm ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: '#fff', borderRadius: 14, border: `1.5px dashed ${T.accentBorder}` }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🏢</div>
                  <h4 style={{ color: T.accentDark, marginBottom: 8, fontSize: 15 }}>No businesses listed yet</h4>
                  <p style={{ color: '#888780', fontSize: 13, marginBottom: 18 }}>List your business to get verified and reach more customers across Kenya.</p>
                  <button onClick={() => setShowBusinessForm(true)} style={{ padding: '10px 24px', background: T.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    List your business →
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {businesses.map((b) => (
                    <OwnedBizCard
                      key={b.id}
                      business={b}
                      theme={T}
                      onClick={
                        // Only clickable if it's an approved business (not a pending submission)
                        !b.is_submission && b.status !== 'pending' && onSelectBusiness
                          ? () => onSelectBusiness(b)
                          : null
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── PERSONAL INFO ── */}
          {activeTab === 'personal' && canSeePrivate && (
            <div style={{ background: T.bg, padding: 20 }}>
              <div style={{ marginBottom: 18 }}>
                <h3 style={{ color: T.accentDark, fontSize: 17, marginBottom: 2 }}>Personal Information</h3>
                <p style={{ color: '#888780', fontSize: 12 }}>Private — visible only to you and admins</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { icon: '🏷️', label: 'Username', value: `@${profile.username || '—'}` },
                  { icon: '👤', label: 'Full name', value: profile.name },
                  { icon: '📞', label: 'Phone', value: profile.phone },
                  { icon: '✉️', label: 'Email', value: profile.email },
                  { icon: '🔑', label: 'Role', value: profile.role },
                  { icon: '📅', label: 'Date joined', value: joinDate },
                  { icon: '✅', label: 'Status', value: profile.is_banned ? 'Banned' : 'Active', isBadge: true, badgeOk: !profile.is_banned },
                ].map(({ icon, label, value, isBadge, badgeOk }) => (
                  <div key={label} style={{ background: '#fff', borderRadius: 12, padding: '12px 16px', border: `1px solid ${T.cardBorder}`, display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: T.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      {icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: T.accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 2 }}>{label}</div>
                      {isBadge ? (
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: badgeOk ? '#E1F5EE' : '#FCEBEB', color: badgeOk ? '#085041' : '#A32D2D' }}>{value}</span>
                      ) : (
                        <div style={{ fontSize: 14, color: '#2C2C2A', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '—'}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── HISTORY LOG ── */}
          {activeTab === 'history' && canSeePrivate && (
            <div style={{ background: T.bg, padding: 20 }}>
              <div style={{ marginBottom: 18 }}>
                <h3 style={{ color: T.accentDark, fontSize: 17, marginBottom: 2 }}>Activity History</h3>
                <p style={{ color: '#888780', fontSize: 12 }}>Your reviews, votes and businesses you've viewed</p>
              </div>

              {/* STAT CARDS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 22 }}>
                {[
                  { num: reviews.length, label: 'Reviews written', icon: '⭐' },
                  { num: votes.filter(v => v.vote_type === 'legit').length, label: 'Legit votes', icon: '👍' },
                  { num: votes.filter(v => v.vote_type === 'scam').length, label: 'Scam votes', icon: '👎' },
                  { num: viewedBusinesses.length, label: 'Profiles viewed', icon: '👁️' },
                ].map(({ num, label, icon }) => (
                  <div key={label} style={{ background: T.statBg, borderRadius: 14, padding: '16px 14px', color: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 24 }}>{icon}</div>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{num}</div>
                      <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* REVIEWS */}
              {reviews.length > 0 && (
                <Section title="Reviews written" count={reviews.length} icon="⭐" theme={T}>
                  {reviews.map((r) => (
                    <div key={r.id} style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', border: `1px solid ${T.cardBorder}`, marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: '#2C2C2A' }}>{r.businesses?.name || 'Unknown'}</span>
                        <span style={{ color: '#F5A623', fontSize: 14, flexShrink: 0 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                      </div>
                      {r.review_text && <p style={{ fontSize: 13, color: '#5F5E5A', lineHeight: 1.6, marginBottom: 4 }}>{r.review_text}</p>}
                      <div style={{ fontSize: 11, color: '#888780' }}>{new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    </div>
                  ))}
                </Section>
              )}

              {/* VOTES */}
              {votes.length > 0 && (
                <Section title="Votes cast" count={votes.length} icon="🗳️" theme={T}>
                  <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${T.cardBorder}`, overflow: 'hidden' }}>
                    {votes.map((v, i) => (
                      <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < votes.length - 1 ? `1px solid ${T.accentLight}` : 'none', gap: 10 }}>
                        <span style={{ fontSize: 13, color: '#2C2C2A', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.businesses?.name || 'Unknown'}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: v.vote_type === 'legit' ? '#E1F5EE' : '#FCEBEB', color: v.vote_type === 'legit' ? '#085041' : '#A32D2D' }}>
                            {v.vote_type === 'legit' ? '👍 Legit' : '👎 Scam'}
                          </span>
                          <span style={{ fontSize: 10, color: '#888780' }}>{new Date(v.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* VIEWED */}
              {viewedBusinesses.length > 0 && (
                <Section title="Profiles viewed" count={viewedBusinesses.length} icon="👁️" theme={T}>
                  <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${T.cardBorder}`, overflow: 'hidden' }}>
                    {viewedBusinesses.map((v, i) => (
                      <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < viewedBusinesses.length - 1 ? `1px solid ${T.accentLight}` : 'none', gap: 10 }}>
                        <span style={{ fontSize: 13, color: '#2C2C2A', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.businesses?.name || 'Unknown'}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: v.businesses?.status === 'verified' ? '#E1F5EE' : '#FCEBEB', color: v.businesses?.status === 'verified' ? '#085041' : '#A32D2D' }}>
                            {v.businesses?.status || '—'}
                          </span>
                          <span style={{ fontSize: 10, color: '#888780' }}>{new Date(v.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {reviews.length === 0 && votes.length === 0 && viewedBusinesses.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: '#fff', borderRadius: 14, border: `1.5px dashed ${T.accentBorder}` }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                  <h4 style={{ color: T.accentDark, marginBottom: 8 }}>No activity yet</h4>
                  <p style={{ color: '#888780', fontSize: 13 }}>Start by searching for a business to review or vote on.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div style={{ height: 32 }} />
    </div>
  )
}

// ── SECTION HEADER ──
function Section({ title, count, icon, theme, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: theme.accentDark }}>{title}</h4>
        <span style={{ fontSize: 12, color: '#888780', fontWeight: 400 }}>({count})</span>
      </div>
      {children}
    </div>
  )
}

// ── OWNED BUSINESS CARD ──
function OwnedBizCard({ business, theme, onClick }) {
  const trustColor = business.trust_score > 70 ? '#1D9E75' : business.trust_score > 40 ? '#EF9F27' : '#E24B4A'
  const isPending = business.is_submission || business.status === 'pending'
  const isClickable = !!onClick

  return (
    <div
      onClick={onClick || undefined}
      style={{
        background: '#fff', borderRadius: 14, padding: 18,
        border: `1.5px solid ${isPending ? '#E5C97E' : theme.cardBorder}`,
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
      onMouseEnter={(e) => { if (isClickable) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = theme.accent } }}
      onMouseLeave={(e) => { if (isClickable) { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = theme.cardBorder } }}
    >
      {isPending && (
        <div style={{ background: '#FFFBEB', border: '1px solid #E5C97E', borderRadius: 8, padding: '8px 12px', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#854D0E' }}>
          <span style={{ flexShrink: 0 }}>⏳</span>
          <span><strong>Pending review</strong> — our admin team will verify your business within 24hrs.</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#2C2C2A', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{business.name}</div>
          <div style={{ fontSize: 12, color: '#888780' }}>{business.category}{business.location ? ` · 📍 ${business.location}` : ''}</div>
        </div>
        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, flexShrink: 0, background: business.status === 'verified' ? '#E1F5EE' : business.status === 'flagged' ? '#FCEBEB' : '#FFFBEB', color: business.status === 'verified' ? '#085041' : business.status === 'flagged' ? '#A32D2D' : '#854D0E' }}>
          {business.status}
        </span>
      </div>

      {business.description && (
        <p style={{ fontSize: 13, color: '#5F5E5A', lineHeight: 1.6, marginBottom: 10 }}>{business.description}</p>
      )}

      {!isPending && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888780', marginBottom: 4 }}>
            <span>Trust score</span>
            <span style={{ color: trustColor, fontWeight: 700 }}>{business.trust_score}%</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: '#F1EFE8' }}>
            <div style={{ height: 5, borderRadius: 3, background: trustColor, width: `${business.trust_score}%`, transition: 'width 0.5s' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: '#5F5E5A', paddingTop: 10, borderTop: `1px solid ${theme.accentLight}` }}>
        {business.phone && <span>📞 {business.phone}</span>}
        {business.mpesa_till && <span>💳 {business.mpesa_till}</span>}
        {business.fb_handle && <span>📘 {business.fb_handle}</span>}
        {!isPending && business.view_count > 0 && <span>👁 {business.view_count} views</span>}
        {!isPending && business.review_count > 0 && <span>⭐ {business.avg_rating?.toFixed(1)} ({business.review_count})</span>}
      </div>

      {isClickable && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${theme.accentLight}`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, fontSize: 12, color: theme.accent, fontWeight: 600 }}>
          View full profile & reviews →
        </div>
      )}
    </div>
  )
}

// ── BUSINESS FORM ──
function BusinessForm({ currentUser, theme, onSubmitted }) {
  const [form, setForm] = useState({ name: '', category: 'Electronics', location: '', description: '', phone: '', mpesa_till: '', fb_handle: '', tiktok_handle: '', instagram_handle: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Please enter your business name.'); return }
    if (!form.location.trim()) { setError('Please enter your business location.'); return }
    if (!form.description.trim()) { setError('Please add a description.'); return }
    setSubmitting(true); setError('')
    const { error: e } = await supabase.from('submissions').insert({
      submitter_id: currentUser.id, name: form.name, category: form.category,
      location: form.location || null, description: form.description,
      phone: form.phone || null, mpesa_till: form.mpesa_till || null,
      fb_handle: form.fb_handle || null, tiktok_handle: form.tiktok_handle || null,
      instagram_handle: form.instagram_handle || null,
    })
    setSubmitting(false)
    if (e) { setError('Something went wrong. Please try again.'); return }
    alert('✓ Business submitted! Our team will verify and list it within 24hrs.')
    onSubmitted()
  }

  const inp = { width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${theme.accentBorder}`, fontSize: 14, fontFamily: 'inherit', background: '#fff', color: '#2C2C2A', outline: 'none', boxSizing: 'border-box' }
  const lbl = { fontSize: 12, color: theme.accentDark, marginBottom: 5, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }

  return (
    <div style={{ background: theme.accentLight, border: `1.5px solid ${theme.accentBorder}`, borderRadius: 14, padding: 20, marginBottom: 18 }}>
      <h3 style={{ color: theme.accentDark, marginBottom: 4, fontSize: 15 }}>List your business</h3>
      <p style={{ color: '#5F5E5A', fontSize: 12, marginBottom: 16 }}>Our team will review and verify within 24hrs.</p>

      {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
        <div><label style={lbl}>Business name *</label><input style={inp} value={form.name} onChange={e => update('name', e.target.value)} placeholder="e.g. Nairobi Tech Hub" /></div>
        <div><label style={lbl}>Category</label><select style={inp} value={form.category} onChange={e => update('category', e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
      </div>
      <div style={{ marginBottom: 12 }}><label style={lbl}>Location *</label><input style={inp} value={form.location} onChange={e => update('location', e.target.value)} placeholder="e.g. Westlands, Nairobi" /></div>
      <div style={{ marginBottom: 12 }}><label style={lbl}>Description *</label><textarea style={{ ...inp, resize: 'vertical' }} value={form.description} onChange={e => update('description', e.target.value)} rows={3} placeholder="Tell customers what you sell..." /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
        <div><label style={lbl}>Phone</label><input style={inp} value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="0712 345 678" /></div>
        <div><label style={lbl}>M-Pesa till</label><input style={inp} value={form.mpesa_till} onChange={e => update('mpesa_till', e.target.value)} placeholder="Till 123456" /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div><label style={lbl}>Facebook</label><input style={inp} value={form.fb_handle} onChange={e => update('fb_handle', e.target.value)} placeholder="@yourpage" /></div>
        <div><label style={lbl}>TikTok</label><input style={inp} value={form.tiktok_handle} onChange={e => update('tiktok_handle', e.target.value)} placeholder="@yourhandle" /></div>
        <div><label style={lbl}>Instagram</label><input style={inp} value={form.instagram_handle} onChange={e => update('instagram_handle', e.target.value)} placeholder="@yourhandle" /></div>
      </div>
      <button onClick={handleSubmit} disabled={submitting} style={{ padding: '11px 28px', background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}>
        {submitting ? 'Submitting…' : 'Submit for review →'}
      </button>
    </div>
  )
}
