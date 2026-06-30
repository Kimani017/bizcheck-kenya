import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Home({ onSelectBusiness, goToReport }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [recent, setRecent] = useState([])
  const [flagged, setFlagged] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadLists()
  }, [])

  async function loadLists() {
    const { data: verifiedData } = await supabase
      .from('businesses')
      .select('*')
      .eq('status', 'verified')
      .order('created_at', { ascending: false })
      .limit(4)

    const { data: flaggedData } = await supabase
      .from('businesses')
      .select('*')
      .eq('status', 'flagged')
      .order('updated_at', { ascending: false })
      .limit(4)

    setRecent(verifiedData || [])
    setFlagged(flaggedData || [])
  }

  async function handleSearch() {
    if (!query.trim()) return
    setLoading(true)
    const { data, error } = await supabase.rpc('search_businesses', { query })
    setLoading(false)
    if (error) {
      console.error(error)
      setResults([])
      return
    }
    setResults(data || [])
  }

  return (
    <div>
      <div className="hero">
        <h1>Is this seller legit?</h1>
        <p>Search any business, phone number, M-Pesa till, or social handle before you buy.</p>
        <div className="search-wrap">
          <input
            type="text"
            placeholder="Business name, 0712 345 678, @seller_name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch}>{loading ? 'Searching…' : 'Check'}</button>
        </div>
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
        <h2>Recently verified</h2>
        <div className="biz-grid">
          {recent.map((b) => (
            <BusinessCard key={b.id} business={b} onClick={() => onSelectBusiness(b)} />
          ))}
          {recent.length === 0 && <p className="muted">No verified businesses yet.</p>}
        </div>
      </div>

      <div className="section">
        <h2>⚠ Recently reported</h2>
        <div className="biz-grid">
          {flagged.map((b) => (
            <BusinessCard key={b.id} business={b} onClick={() => onSelectBusiness(b)} />
          ))}
          {flagged.length === 0 && <p className="muted">No flagged businesses yet.</p>}
        </div>
      </div>
    </div>
  )
}

export function BusinessCard({ business, onClick }) {
  const trustColor = business.trust_score > 70 ? '#1D9E75' : business.trust_score > 40 ? '#EF9F27' : '#E24B4A'
  return (
    <div className={`biz-card ${business.status === 'flagged' ? 'flagged' : ''}`} onClick={onClick}>
      <div className="biz-top">
        <div className="biz-name">{business.name}</div>
        <span className={`badge ${business.status === 'verified' ? 'badge-verified' : 'badge-danger'}`}>
          {business.status === 'verified' ? 'Verified' : 'Flagged'}
        </span>
      </div>
      <div className="biz-cat">{business.category}</div>
      <div className="trust-bar-wrap">
        <div className="trust-label">
          <span>Trust score</span>
          <span style={{ color: trustColor, fontWeight: 500 }}>{business.trust_score}%</span>
        </div>
        <div className="trust-bar">
          <div className="trust-fill" style={{ width: `${business.trust_score}%`, background: trustColor }}></div>
        </div>
      </div>
      <div className="biz-meta">{business.phone}</div>
    </div>
  )
}
