import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { BusinessCard } from './Home'
import { SkeletonGrid } from './Skeleton'
import B2BChat from './B2BChat'
import ProductsMarketFeed from './ProductsMarketFeed'
import { chargeBusinessCredits } from './CreditGate'

const CATEGORIES = ['All', 'Electronics', 'Fashion', 'Food', 'Phones', 'Home', 'Beauty', 'Other']

export default function Directory({ onSelectBusiness, goToSubmit, businessMode, initialMarketSubtab, initialB2BTarget, onInsufficientCredits }) {
  const [businesses, setBusinesses] = useState([])
  const [activeCat, setActiveCat] = useState('All')
  const [loading, setLoading] = useState(true)
  const [marketSubtab, setMarketSubtab] = useState(initialMarketSubtab || 'browse') // browse | doBiz | b2b

  useEffect(() => {
    loadBusinesses()
  }, [activeCat])

  async function loadBusinesses() {
    setLoading(true)
    let q = supabase.from('businesses').select('*').eq('status', 'verified').order('trust_score', { ascending: false })
    if (activeCat !== 'All') q = q.eq('category', activeCat)
    const { data, error } = await q
    if (error) console.error(error)
    setBusinesses(data || [])
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
          <button className={`subtab-btn ${marketSubtab === 'products' ? 'on' : ''}`} onClick={() => setMarketSubtab('products')}>
            Products
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

      {/* DO BIZ — search for a business to message */}
      {businessMode && marketSubtab === 'doBiz' && (
        <DoBizSearch myBusiness={businessMode} onSelectBusiness={onSelectBusiness} onInsufficientCredits={onInsufficientCredits} />
      )}

      {/* B2B MESSAGES — embedded conversation list + chat */}
      {businessMode && marketSubtab === 'b2b' && (
        <B2BChat myBusiness={businessMode} initialTargetBusiness={initialB2BTarget} onBack={() => setMarketSubtab('browse')} onInsufficientCredits={onInsufficientCredits} />
      )}

      {/* PRODUCTS IN THE MARKET */}
      {marketSubtab === 'products' && (
        <ProductsMarketFeed onSelectBusiness={onSelectBusiness} />
      )}

      {/* NORMAL BROWSE GRID */}
      {marketSubtab === 'browse' && (
        <>
          <div className="filter-row">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                className={`filter-btn ${activeCat === c ? 'on' : ''}`}
                onClick={() => setActiveCat(c)}
              >
                {c}
              </button>
            ))}
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

// ── DO BIZ — search a business, click its card to message it ──
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
    setSearching(true)

    const charge = await chargeBusinessCredits(myBusiness.id, 'search_business', 0.5)
    if (!charge.ok) {
      setSearching(false)
      if (charge.insufficientCredits) { onInsufficientCredits?.(); return }
      alert('Error: ' + charge.error)
      return
    }

    const { data } = await supabase
      .from('businesses')
      .select('*')
      .eq('status', 'verified')
      .neq('id', myBusiness.id)
      .ilike('name', `%${q.trim()}%`)
      .order('trust_score', { ascending: false })
      .limit(10)
    setResults(data || [])
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
            <span style={{ color: '#1D9E75', fontSize: 13, fontWeight: 600 }}>View & Message →</span>
          </div>
        ))}
      </div>
    </div>
  )
}
