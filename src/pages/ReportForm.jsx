import { useState } from 'react'
import { supabase } from '../supabase'

export default function ReportForm({ onDone, prefill }) {
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

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit() {
    if (!form.business_name.trim() || !form.scam_type) {
      setError('Please fill in the business name and select what happened.')
      return
    }
    setSubmitting(true)
    setError('')

    const { error: insertError } = await supabase.from('reports').insert({
      business_id: prefill?.id || null,
      business_name: form.business_name,
      scam_type: form.scam_type,
      description: form.description || null,
      amount_lost: form.amount_lost ? parseFloat(form.amount_lost) : null,
      reporter_phone: form.reporter_phone || null,
    })

    setSubmitting(false)

    if (insertError) {
      console.error(insertError)
      setError('Something went wrong submitting your report. Please try again.')
      return
    }

    alert('✓ Report submitted — our team will review within 24hrs')
    onDone()
  }

  return (
    <div className="section" style={{ maxWidth: 580 }}>
      <h2>Report a scammer</h2>
      <p className="muted">Your report is reviewed by our team and the community. Verified reports are published to protect others.</p>

      {/* Show banner if reporting a known business */}
      {prefill && (
        <div className="banner banner-warn" style={{ marginTop: 16 }}>
          <strong>Reporting: {prefill.name}</strong>
          <p>We have pre-filled the details from this business listing. Add more info below.</p>
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="form-group">
        <label>Business / seller name</label>
        <input
          value={form.business_name}
          onChange={(e) => update('business_name', e.target.value)}
          placeholder="Name they used e.g. 'Apple Store Kenya'"
          readOnly={!!prefill}
          style={prefill ? { background: '#F1EFE8', color: '#5F5E5A' } : {}}
        />
      </div>

      <div className="form-group">
        <label>Phone number or M-Pesa till</label>
        <input
          value={form.phone}
          onChange={(e) => update('phone', e.target.value)}
          placeholder="0712 345 678 or Till 123456"
        />
      </div>

      <div className="form-group">
        <label>Social media handle</label>
        <input
          value={form.handle}
          onChange={(e) => update('handle', e.target.value)}
          placeholder="Facebook / TikTok / Instagram"
        />
      </div>

      {/* Show extra prefilled details if reporting a known business */}
      {prefill && (
        <div className="detail-rows" style={{ marginBottom: 16 }}>
          {prefill.mpesa_till && <div className="detail-row"><span>M-Pesa till</span><span>{prefill.mpesa_till}</span></div>}
          {prefill.fb_handle && <div className="detail-row"><span>Facebook</span><span>{prefill.fb_handle}</span></div>}
          {prefill.tiktok_handle && <div className="detail-row"><span>TikTok</span><span>{prefill.tiktok_handle}</span></div>}
          {prefill.description && <div className="detail-row"><span>Description</span><span>{prefill.description}</span></div>}
        </div>
      )}

      <div className="form-group">
        <label>What happened?</label>
        <div className="radio-group">
          {[
            ['no_delivery', 'Paid but never received goods'],
            ['fake_product', 'Received fake / different product'],
            ['ghost_seller', 'Seller disappeared after payment'],
            ['other', 'Other'],
          ].map(([value, label]) => (
            <label className="radio-opt" key={value}>
              <input
                type="radio"
                name="scam-type"
                value={value}
                checked={form.scam_type === value}
                onChange={(e) => update('scam_type', e.target.value)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>Describe what happened (optional)</label>
        <textarea
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          rows={3}
          placeholder="Tell us more — the more detail the better..."
        />
      </div>

      <div className="form-group">
        <label>Amount lost (optional)</label>
        <input
          type="number"
          value={form.amount_lost}
          onChange={(e) => update('amount_lost', e.target.value)}
          placeholder="Ksh 0"
        />
      </div>

      <div className="form-group">
        <label>Your phone (kept private)</label>
        <input
          value={form.reporter_phone}
          onChange={(e) => update('reporter_phone', e.target.value)}
          placeholder="0712 000 000"
        />
      </div>

      <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit report'}
      </button>
    </div>
  )
}
