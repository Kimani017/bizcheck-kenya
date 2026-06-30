import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { BusinessCard } from './Home'

const CATEGORIES = ['All', 'Electronics', 'Fashion', 'Food', 'Phones', 'Home', 'Beauty', 'Other']

export default function Directory({ onSelectBusiness, goToSubmit }) {
  const [businesses, setBusinesses] = useState([])
  const [activeCat, setActiveCat] = useState('All')
  const [loading, setLoading] = useState(true)

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
        <h2>Trusted sellers</h2>
        <button className="btn-small" onClick={goToSubmit}>+ List your business</button>
      </div>
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
        <p className="muted">Loading…</p>
      ) : businesses.length === 0 ? (
        <div className="empty-state"><p>No verified sellers in this category yet.</p></div>
      ) : (
        <div className="biz-grid">
          {businesses.map((b) => (
            <BusinessCard key={b.id} business={b} onClick={() => onSelectBusiness(b)} />
          ))}
        </div>
      )}
    </div>
  )
}
