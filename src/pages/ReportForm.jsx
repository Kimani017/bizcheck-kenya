import { useState } from 'react'
import { supabase } from '../supabase'
export default function ReportForm({ onDone }) {
  const [form, setForm] = useState({
    business_name: '',
    phone: '',
    handle: '',
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

      {error && <div className="form-error">{error}</div>}

      <div className="form-group">
        <label>Business / seller name</label>
        <input value={form.business_name} onChange={(e) => update('business_name', e.target.value)} placeholder="Name they used e.g. 'Apple Store Kenya'" />
      </div>

      <div className="form-group">
        <label>Phone number or M-Pesa till</label>
        <input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="0712 345 678 or Till 123456" />
      </div>

      <div className="form-group">
        <label>Social media handle</label>
        <input value={form.handle} onChange={(e) => update('handle', e.target.value)} placeholder="Facebook / TikTok / Instagram" />
      </div>

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
        <textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={3} placeholder="Tell us more…" />
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
        {submitting ? 'Submitting…' : 'Submit report'}
      </button>
    </div>
  )
}
