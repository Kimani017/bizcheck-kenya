import { useState } from 'react'
import { supabase } from '../supabase'

export default function ReportForm({ onDone, prefill }) {
  const [step, setStep] = useState(prefill ? 'form' : 'search') // search → select → form
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedBusiness, setSelectedBusiness] = useState(prefill || null)
  const [form, setForm] = useState({
    business_name: prefill?.name || '',
    phone: prefill?.phone || '',
    handle: prefill?.fb_handle || prefill?.tiktok_handle || '',
    scam_type: '',
    description: '',
    amount_lost: '',
    reporter_phone: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchResults([])
    const q = searchQuery.trim()

    // Try RPC search first
    const { data: rpcData, error: rpcError } = await supabase.rpc('search_businesses', { query: q })

    if (!rpcError && rpcData && rpcData.length > 0) {
      setSearchResults(rpcData)
      setSearching(false)
      return
    }

    // Fallback: direct ilike query if RPC returns nothing or errors
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('businesses')
      .select('*')
      .in('status', ['verified', 'flagged'])
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%,mpesa_till.ilike.%${q}%,fb_handle.ilike.%${q}%,tiktok_handle.ilike.%${q}%`)
      .order('trust_score', { ascending: false })

    setSearching(false)
    if (fallbackError) { console.error(fallbackError); setSearchResults([]); return }
    setSearchResults(fallbackData || [])
  }

  function selectBusiness(biz) {
    setSelectedBusiness(biz)
    setForm(f => ({
      ...f,
      business_name: biz.name,
      phone: biz.phone || '',
      handle: biz.fb_handle || biz.tiktok_handle || '',
    }))
    setStep('form')
  }

  function useNewForm() {
    setSelectedBusiness(null)
    setForm(f => ({ ...f, business_name: searchQuery }))
    setStep('form')
  }

  async function handleSubmit() {
    if (!form.business_name.trim() || !form.scam_type) {
      setError('Please fill in the business name and select what happened.')
      return
    }
    setSubmitting(true)
    setError('')

    const { error: insertError } = await supabase.from('reports').insert({
      business_id: selectedBusiness?.id || null,
      business_name: form.business_name,
      scam_type: form.scam_type,
      description: form.description || null,
      amount_lost: form.amount_lost ? parseFloat(form.amount_lost) : null,
      reporter_phone: form.reporter_phone || null,
    })

    setSubmitting(false)
    if (insertError) { setError('Something went wrong. Please try again.'); return }
    alert('✓ Report submitted — our team will review within 24hrs')
    onDone()
  }

  // ── STEP 1: SEARCH ──
  if (step === 'search') {
    return (
      <div className="section" style={{ maxWidth: 580 }}>
        <h2 style={{ marginBottom: 6 }}>Report a scammer</h2>
        <p className="muted" style={{ marginBottom: 24 }}>
          First, search for the business to see if it's already on BizCheck. If it's there, select it. If not, you can still file a report.
        </p>

        <div className="search-wrap" style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Search business name, phone, M-Pesa till, @handle…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch}>{searching ? 'Searching…' : 'Search'}</button>
        </div>

        {/* SEARCH RESULTS */}
        {searchResults.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: '#5F5E5A', marginBottom: 12 }}>
              Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} — select the business you want to report:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {searchResults.map((b) => {
                const trustColor = b.trust_score > 70 ? '#1D9E75' : b.trust_score > 40 ? '#EF9F27' : '#E24B4A'
                return (
                  <div
                    key={b.id}
                    onClick={() => selectBusiness(b)}
                    style={{
                      background: '#fff', border: `1.5px solid ${b.status === 'flagged' ? '#F7C1C1' : '#E5E3DC'}`,
                      borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#E24B4A'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = b.status === 'flagged' ? '#F7C1C1' : '#E5E3DC'}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 15, color: '#2C2C2A' }}>{b.name}</span>
                        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: b.status === 'verified' ? '#E1F5EE' : '#FCEBEB', color: b.status === 'verified' ? '#085041' : '#A32D2D' }}>
                          {b.status === 'verified' ? '✓ Verified' : '⚠ Flagged'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#888780' }}>{b.category}{b.phone ? ` · ${b.phone}` : ''}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#F1EFE8' }}>
                          <div style={{ height: 4, borderRadius: 2, background: trustColor, width: `${b.trust_score}%` }} />
                        </div>
                        <span style={{ fontSize: 11, color: trustColor, fontWeight: 600, flexShrink: 0 }}>{b.trust_score}% trust</span>
                      </div>
                    </div>
                    <div style={{ color: '#E24B4A', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                      Report →
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* NO RESULTS */}
        {searchResults.length === 0 && searchQuery.trim() && !searching && (
          <div style={{ background: '#FFFBEB', border: '1px solid #E5C97E', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
            <p style={{ color: '#854D0E', fontSize: 14, marginBottom: 8 }}>
              ⚠ No results found for "<strong>{searchQuery}</strong>"
            </p>
            <p style={{ color: '#5F5E5A', fontSize: 13, marginBottom: 12 }}>
              This business isn't on BizCheck yet. You can still file a report and our team will investigate.
            </p>
            <button
              onClick={useNewForm}
              style={{ padding: '9px 20px', background: '#E24B4A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              🚩 Report this scammer anyway →
            </button>
          </div>
        )}

        {/* SKIP SEARCH */}
        <button className="link-btn" style={{ color: '#888780', fontSize: 13 }} onClick={useNewForm}>
          Skip search — report a scammer not on BizCheck →
        </button>
      </div>
    )
  }

  // ── STEP 2: REPORT FORM ──
  return (
    <div className="section" style={{ maxWidth: 580 }}>
      {/* Back to search */}
      {!prefill && (
        <button className="link-btn" onClick={() => setStep('search')} style={{ marginBottom: 16 }}>
          ← Back to search
        </button>
      )}

      <h2 style={{ marginBottom: 6 }}>Report a scammer</h2>
      <p className="muted" style={{ marginBottom: 20 }}>
        Your report is reviewed by our team and the community. Verified reports are published to protect others.
      </p>

      {/* Pre-filled banner if reporting a known business */}
      {selectedBusiness && (
        <div className="banner banner-warn" style={{ marginBottom: 20 }}>
          <strong>⚠ Reporting: {selectedBusiness.name}</strong>
          <p>Details pre-filled from the BizCheck listing. Add more info below.</p>
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="form-group">
        <label>Business / seller name</label>
        <input
          value={form.business_name}
          onChange={(e) => update('business_name', e.target.value)}
          placeholder="Name they used"
          readOnly={!!selectedBusiness}
          style={selectedBusiness ? { background: '#F1EFE8', color: '#5F5E5A' } : {}}
        />
      </div>

      <div className="form-group">
        <label>Phone number or M-Pesa till</label>
        <input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="0712 345 678 or Till 123456" />
      </div>

      <div className="form-group">
        <label>Social media handle</label>
        <input value={form.handle} onChange={(e) => update('handle', e.target.value)} placeholder="Facebook / TikTok / Instagram" />
      </div>

      {/* Show extra details if known business */}
      {selectedBusiness && (selectedBusiness.mpesa_till || selectedBusiness.fb_handle || selectedBusiness.tiktok_handle) && (
        <div className="detail-rows" style={{ marginBottom: 16 }}>
          {selectedBusiness.mpesa_till && <div className="detail-row"><span>M-Pesa till</span><span>{selectedBusiness.mpesa_till}</span></div>}
          {selectedBusiness.fb_handle && <div className="detail-row"><span>Facebook</span><span>{selectedBusiness.fb_handle}</span></div>}
          {selectedBusiness.tiktok_handle && <div className="detail-row"><span>TikTok</span><span>{selectedBusiness.tiktok_handle}</span></div>}
        </div>
      )}

      <div className="form-group">
        <label>What happened? *</label>
        <div className="radio-group">
          {[
            ['no_delivery', 'Paid but never received goods'],
            ['fake_product', 'Received fake / different product'],
            ['ghost_seller', 'Seller disappeared after payment'],
            ['other', 'Other'],
          ].map(([value, label]) => (
            <label className="radio-opt" key={value}>
              <input type="radio" name="scam-type" value={value} checked={form.scam_type === value} onChange={(e) => update('scam_type', e.target.value)} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>Describe what happened (optional)</label>
        <textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={3} placeholder="Tell us more — the more detail the better…" />
      </div>

      <div className="form-group">
        <label>Amount lost (optional)</label>
        <input type="number" value={form.amount_lost} onChange={(e) => update('amount_lost', e.target.value)} placeholder="Ksh 0" />
      </div>

      <div className="form-group">
        <label>Your phone (kept private)</label>
        <input value={form.reporter_phone} onChange={(e) => update('reporter_phone', e.target.value)} placeholder="0712 000 000" />
      </div>

      <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Submitting…' : '🚩 Submit report'}
      </button>
    </div>
  )
}
