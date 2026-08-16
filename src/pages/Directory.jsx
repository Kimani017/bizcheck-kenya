import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { BusinessCard } from './Home'
import { SkeletonGrid } from './Skeleton'
import B2BChat from './B2BChat'
import { chargeBusinessCredits } from './CreditGate'
import { cache, keys, tags, TTL } from '../cache'

const CATEGORIES = ['All', 'Electronics', 'Fashion', 'Food', 'Phones', 'Home', 'Beauty', 'Other']

export default function Directory({ onSelectBusiness, goToSubmit, businessMode, currentUser, initialMarketSubtab, initialB2BTarget, onInsufficientCredits }) {
  const [businesses, setBusinesses] = useState([])
  const [activeCat, setActiveCat] = useState('All')
  const [loading, setLoading] = useState(true)
  const [marketSubtab, setMarketSubtab] = useState(initialMarketSubtab || 'browse')

  useEffect(() => { loadBusinesses() }, [activeCat, currentUser?.id])

  async function loadBusinesses(force = false) {
    const key = keys.businesses(currentUser?.id, activeCat)

    // Paint from cache first. Switching between category tabs you have already
    // visited becomes instant instead of a spinner each time.
    const cached = cache.peek(key)
    if (cached && !force) { setBusinesses(cached); setLoading(false) }
    else setLoading(true)

    const data = await cache.get(
      key,
      () => supabase.rpc('get_ranked_businesses', {
        p_user_id:  currentUser?.id ?? null,
        p_category: activeCat === 'All' ? null : activeCat,
        p_limit:    60,
        p_offset:   0,
      }).then(r => r.data || []),
      { ttl: TTL.BUSINESSES, tags: [tags.BUSINESSES], force }
    )

    setBusinesses(data)
    setLoading(false)
  }

  return (
    <div className="section">
      <div className="section-header-row">
        <h2>Market</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className={`subtab-btn ${marketSubtab === 'browse' ? 'on' : ''}`} onClick={() => setMarketSubtab('browse')}>
            Businesses
          </button>
          {businessMode && (
            <>
              <button className={`subtab-btn ${marketSubtab === 'doBiz' ? 'on' : ''}`} onClick={() => setMarketSubtab('doBiz')}>
                Do Biz
              </button>
              <button className={`subtab-btn ${marketSubtab === 'b2b' ? 'on' : ''}`} onClick={() => setMarketSubtab('b2b')}>
                B2B Messages
              </button>
            </>
          )}
          {!businessMode && (
            <button className="btn-small" onClick={goToSubmit}>+ List your business</button>
          )}
        </div>
      </div>

      {businessMode && marketSubtab === 'doBiz' && (
        <DoBizSearch myBusiness={businessMode} onSelectBusiness={onSelectBusiness} onInsufficientCredits={onInsufficientCredits} />
      )}

      {businessMode && marketSubtab === 'b2b' && (
        <B2BChat myBusiness={businessMode} initialTargetBusiness={initialB2BTarget} onBack={() => setMarketSubtab('browse')} onInsufficientCredits={onInsufficientCredits} />
      )}

      {marketSubtab === 'browse' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div className="filter-row">
              {CATEGORIES.map((c) => (
                <button key={c} className={`filter-btn ${activeCat === c ? 'on' : ''}`} onClick={() => setActiveCat(c)}>
                  {c}
                </button>
              ))}
            </div>
            <button
              onClick={() => loadBusinesses(true)}
              style={{ background: 'none', border: 'none', fontSize: 12, color: '#1D9E75', cursor: 'pointer', fontWeight: 600 }}
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <SkeletonGrid count={6} />
          ) : businesses.length === 0 ? (
            <div className="empty-state"><p>No verified sellers in this category yet.</p></div>
          ) : (
            <div className="biz-grid">
              {businesses.map((b) => (
                <BusinessCard key={b.id} business={b} onClick={() => onSelectBusiness(b)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DoBizSearch({ myBusiness, onSelectBusiness, onInsufficientCredits }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchTimeout, setSearchTimeout] = useState(null)

  function handleChange(value) {
    setQuery(value)
    if (searchTimeout) clearTimeout(searchTimeout)
    if (!value.trim()) { setResults([]); return }
    const t = setTimeout(() => search(value), 300)
    setSearchTimeout(t)
  }

  async function search(q) {
    const cacheKey = `b2bsearch:${myBusiness.id}:${q.trim().toLowerCase()}`

    // Cached results are free — the business is NOT charged credits for a
    // search it already paid for in this session. Charging twice for the same
    // query would be a real billing bug.
    const cached = cache.peek(cacheKey)
    if (cached) { setResults(cached); return }

    setSearching(true)

    const charge = await chargeBusinessCredits(myBusiness.id, 'search_business', 0.5)
    if (!charge.ok) {
      setSearching(false)
      if (charge.insufficientCredits) { onInsufficientCredits?.(); return }
      alert('Error: ' + charge.error)
      return
    }

    const data = await cache.get(
      cacheKey,
      () => supabase
        .from('businesses').select('*')
        .eq('status', 'verified')
        .neq('id', myBusiness.id)
        .ilike('name', `%${q.trim()}%`)
        .order('trust_score', { ascending: false })
        .limit(10)
        .then(r => r.data || []),
      { ttl: TTL.BUSINESSES, tags: [tags.BUSINESSES] }
    )

    setResults(data)
    setSearching(false)
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <p className="muted" style={{ marginBottom: 14 }}>Search for a business to start a B2B conversation.</p>
      <div className="search-wrap" style={{ marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Search business name…"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
        />
      </div>

      {searching && <p className="muted">Searching…</p>}

      {!searching && query.trim() && results.length === 0 && (
        <p className="muted">No businesses found matching "{query}".</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {results.map((b) => (
          <div
            key={b.id}
            onClick={() => onSelectBusiness(b)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>🏢 {b.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{b.category}{b.location ? ` · ${b.location}` : ''}</div>
            </div>
            <span style={{ color: '#1D9E75', fontSize: 13, fontWeight: 600 }}>View &amp; Message →</span>
          </div>
        ))}
      </div>
    </div>
  )
}
