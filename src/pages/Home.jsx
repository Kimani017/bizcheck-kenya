import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { SkeletonCard } from './Skeleton'
import { cache, keys, tags, TTL } from '../cache'

const SAFETY_TIPS = [
  '💡 Always verify a till number on BizCheck before sending money.',
  '💡 Be cautious of sellers who refuse M-Pesa and insist on untraceable payment.',
  '💡 A deal that looks too good to be true usually is — check the trust score first.',
  '💡 Never pay a "reservation fee" to a seller you have not verified.',
  '💡 Check reviews from other buyers before making large purchases.',
]

function CountUp({ target }) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!target) { setValue(0); return }
    let frame
    const duration = 1200
    const start = performance.now()
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1)
      setValue(Math.floor(progress * target))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target])
  return <>{value.toLocaleString()}</>
}

function Marquee({ businesses, direction, onSelectBusiness }) {
  if (businesses.length === 0) return null
  if (businesses.length < 3) {
    return (
      <div className="biz-grid">
        {businesses.map((b) => (
          <BusinessCard key={b.id} business={b} onClick={() => onSelectBusiness(b)} />
        ))}
      </div>
    )
  }
  const loop = [...businesses, ...businesses]
  return (
    <div className="marquee">
      <div className={`marquee-track ${direction === 'ltr' ? 'marquee-ltr' : 'marquee-rtl'}`}>
        {loop.map((b, i) => (
          <div className="marquee-item" key={`${b.id}-${i}`}>
            <BusinessCard business={b} onClick={() => onSelectBusiness(b)} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Home({ onSelectBusiness, goToReport, currentUser }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [recent, setRecent] = useState([])
  const [flagged, setFlagged] = useState([])
  const [loading, setLoading] = useState(false)
  const [listsLoading, setListsLoading] = useState(true)
  const [searchTimeout, setSearchTimeout] = useState(null)
  const [stats, setStats] = useState({ verified: 0, flagged: 0, reports: 0 })
  const [tipIndex, setTipIndex] = useState(0)

  useEffect(() => {
    loadLists()
    loadStats()
    const tipTimer = setInterval(() => setTipIndex((i) => (i + 1) % SAFETY_TIPS.length), 6000)
    return () => clearInterval(tipTimer)
  }, [currentUser?.id])

  async function loadLists() {
    // Paint instantly from cache if we have it — no spinner on revisit.
    const cached = cache.peek(keys.businesses(currentUser?.id, 'All'))
    if (cached) { setRecent(cached); setListsLoading(false) }

    const [ranked, flaggedData] = await Promise.all([
      cache.get(
        keys.businesses(currentUser?.id, 'All'),
        () => supabase.rpc('get_ranked_businesses', {
          p_user_id:  currentUser?.id ?? null,
          p_category: null,
          p_limit:    12,
          p_offset:   0,
        }).then(r => r.data || []),
        { ttl: TTL.BUSINESSES, tags: [tags.BUSINESSES] }
      ),
      cache.get(
        'businesses:flagged',
        () => supabase.from('businesses').select('*')
          .in('status', ['flagged', 'scam'])
          .order('updated_at', { ascending: false })
          .limit(12)
          .then(r => r.data || []),
        { ttl: TTL.BUSINESSES, tags: [tags.BUSINESSES] }
      ),
    ])

    setRecent(ranked)
    setFlagged(flaggedData)
    setListsLoading(false)
  }

  async function loadStats() {
    // Was three COUNT(*) queries on every page load. Now one indexed read from
    // the cached_home_stats table, refreshed by cron every 10 minutes.
    const s = await cache.get(
      keys.homeStats(),
      async () => {
        const { data, error } = await supabase.rpc('get_home_stats')
        if (!error && data?.[0]) {
          return {
            verified: data[0].verified_count || 0,
            flagged:  data[0].flagged_count  || 0,
            reports:  data[0].report_count   || 0,
          }
        }
        // Fallback for the window before the cache table is first populated.
        const [v, f, r] = await Promise.all([
          supabase.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'verified'),
          supabase.from('businesses').select('id', { count: 'exact', head: true }).in('status', ['flagged', 'scam', 'banned']),
          supabase.from('reports').select('id', { count: 'exact', head: true }),
        ])
        return { verified: v.count || 0, flagged: f.count || 0, reports: r.count || 0 }
      },
      { ttl: TTL.STATIC }
    )
    setStats(s)
  }

  async function handleSearch(overrideQuery) {
    const q = (overrideQuery || query).trim()
    if (!q) return
    setLoading(true)

    // Search results are cached per query string — retyping the same search,
    // or going back to it, costs nothing.
    const merged = await cache.get(
      `search:${q.toLowerCase()}`,
      async () => {
        const { data: rpcData, error: rpcError } = await supabase.rpc('search_businesses', { query: q })

        if (!rpcError && rpcData && rpcData.length > 0) {
          const { data: bannedData } = await supabase
            .from('businesses').select('*')
            .eq('status', 'banned')
            .ilike('name', `%${q}%`)
          const seen = new Set(rpcData.map((b) => b.id))
          return [...rpcData, ...(bannedData || []).filter((b) => !seen.has(b.id))]
        }

        const { data: fallbackData } = await supabase
          .from('businesses').select('*')
          .in('status', ['verified', 'flagged', 'scam', 'banned'])
          .or(`name.ilike.%${q}%,phone.ilike.%${q}%,mpesa_till.ilike.%${q}%,fb_handle.ilike.%${q}%,tiktok_handle.ilike.%${q}%`)
          .order('trust_score', { ascending: false })
        return fallbackData || []
      },
      { ttl: TTL.BUSINESSES, tags: [tags.BUSINESSES] }
    )

    setLoading(false)
    setResults(merged)
  }

  return (
    <div>
      {/* HERO */}
      <div className="hero" style={{ position: 'relative', overflow: 'hidden' }}>
        <svg viewBox="0 0 200 200" aria-hidden="true" style={{ position: 'absolute', right: -30, top: -30, width: 220, height: 220, opacity: 0.07, pointerEvents: 'none' }}>
          <path d="M100 10 L170 40 V100 C170 150 140 180 100 195 C60 180 30 150 30 100 V40 Z" fill="#1D9E75" />
          <path d="M70 100 L92 122 L135 75" stroke="#fff" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <svg viewBox="0 0 200 200" aria-hidden="true" style={{ position: 'absolute', left: -50, bottom: -60, width: 200, height: 200, opacity: 0.05, pointerEvents: 'none' }}>
          <circle cx="100" cy="100" r="90" fill="none" stroke="#1D9E75" strokeWidth="16" />
          <circle cx="100" cy="100" r="55" fill="none" stroke="#1D9E75" strokeWidth="10" />
        </svg>

        <div className="hero-badge">🇰🇪 Trusted by Kenyans</div>
        <h1>Is this seller legit?</h1>
        <p>Search any business, phone number, M-Pesa till, or social handle before you buy.</p>

        <div className="search-wrap">
          <input
            type="text"
            placeholder="Business name, 0712 345 678, @seller_name…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (searchTimeout) clearTimeout(searchTimeout)
              if (!e.target.value.trim()) { setResults(null); return }
              const t = setTimeout(() => handleSearch(e.target.value), 300)
              setSearchTimeout(t)
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={() => handleSearch()}>{loading ? 'Searching…' : 'Check'}</button>
        </div>

        <div className="hero-stats">
          <div className="hero-stat"><span className="hero-stat-num"><CountUp target={stats.verified} /></span><span className="hero-stat-label">Verified businesses</span></div>
          <div className="hero-stat"><span className="hero-stat-num"><CountUp target={stats.flagged} /></span><span className="hero-stat-label">Scammers flagged</span></div>
          <div className="hero-stat"><span className="hero-stat-num"><CountUp target={stats.reports} /></span><span className="hero-stat-label">Community reports</span></div>
        </div>
      </div>

      <div className="safety-tip-banner" key={tipIndex}>
        {SAFETY_TIPS[tipIndex]}
      </div>

      {results !== null && (
        <div className="section">
          <h2>Search results ({results.length})</h2>
          {results.length === 0 ? (
            <div className="empty-state">
              <p>No results for "{query}".</p>
              <button className="link-btn" onClick={goToReport}>Was this a scammer? Report it here →</button>
            </div>
          ) : (
            <div className="biz-grid">
              {results.map((b) => (
                <BusinessCard key={b.id} business={b} onClick={() => onSelectBusiness(b)} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="section">
        <h2>✅ Top businesses</h2>
        {listsLoading ? (
          <div className="biz-grid">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : recent.length === 0 ? (
          <p className="muted">No verified businesses yet.</p>
        ) : (
          <Marquee businesses={recent} direction="ltr" onSelectBusiness={onSelectBusiness} />
        )}
      </div>

      <div className="section">
        <h2>⚠ Recently reported</h2>
        {listsLoading ? (
          <div className="biz-grid">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : flagged.length === 0 ? (
          <p className="muted">No flagged businesses yet.</p>
        ) : (
          <Marquee businesses={flagged} direction="rtl" onSelectBusiness={onSelectBusiness} />
        )}
      </div>

      <div className="section">
        <h2>How BizCheck works</h2>
        <div className="how-grid">
          <div className="how-card">
            <div className="how-icon">🔍</div>
            <h3>1. Search</h3>
            <p>Look up any seller by name, phone, M-Pesa till, or social handle before you pay.</p>
          </div>
          <div className="how-card">
            <div className="how-icon">📊</div>
            <h3>2. Check the score</h3>
            <p>See their trust score, community votes, and real reviews from other buyers.</p>
          </div>
          <div className="how-card">
            <div className="how-icon">🚩</div>
            <h3>3. Report scams</h3>
            <p>Been scammed? Report it and protect the next Kenyan from losing their money.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Shared by Home, Directory, and search results.
// Uses logo_url — businesses has no photo_url column, which is why every card
// used to render the 🏢 fallback.
export function BusinessCard({ business, onClick }) {
  const trustColor = business.trust_score > 70 ? '#1D9E75'
    : business.trust_score > 40 ? '#EF9F27' : '#E24B4A'
  const initial   = (business.name || 'B')[0].toUpperCase()
  const avatarUrl = business.logo_url || business.photo_url || null

  return (
    <div className={`biz-card ${business.status === 'flagged' ? 'flagged' : ''}`} onClick={onClick}>
      <div className="biz-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              loading="lazy"
              style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1.5px solid var(--border)' }}
            />
          ) : (
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--hover-bg)', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, color: 'var(--text-muted)', flexShrink: 0 }}>
              {initial}
            </div>
          )}
          <div className="biz-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{business.name}</div>
        </div>
        <span className={`badge ${business.status === 'verified' ? 'badge-verified' : 'badge-danger'}`}>
          {business.status === 'verified' ? 'Verified'
            : business.status === 'banned' ? '🚫 Banned' : 'Flagged'}
        </span>
      </div>
      <div className="biz-cat">{business.category}</div>
      <div className="trust-bar-wrap">
        <div className="trust-label">
          <span>Trust score</span>
          <span style={{ color: trustColor, fontWeight: 500 }}>{business.trust_score}%</span>
        </div>
        <div className="trust-bar">
          <div className="trust-fill" style={{ width: `${business.trust_score}%`, background: trustColor }} />
        </div>
      </div>
      <div className="biz-meta">{business.phone}</div>
    </div>
  )
}
