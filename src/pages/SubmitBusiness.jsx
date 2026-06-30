import { useState } from 'react'
import { supabase } from '../supabase'

const CATEGORIES = ['Electronics', 'Fashion', 'Food', 'Phones', 'Home', 'Beauty', 'Other']

export default function SubmitBusiness({ onDone }) {
  const [form, setForm] = useState({
    name: '',
    category: 'Electronics',
    description: '',
    phone: '',
    mpesa_till: '',
    fb_handle: '',
    tiktok_handle: '',
    instagram_handle: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setError('Please enter your business name.')
      return
    }
    if (!form.phone.trim() && !form.mpesa_till.trim()) {
      setError('Please add at least a phone number or M-Pesa till.')
      return
    }

    setSubmitting(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setSubmitting(false)
      setError('Please log in before submitting a business.')
      return
    }

    const { error: insertError } = await supabase.from('submissions').insert({
      submitter_id: user.id,
      name: form.name,
      category: form.category,
      description: form.description || null,
      phone: form.phone || null,
      mpesa_till: form.mpesa_till || null,
      fb_handle: form.fb_handle || null,
      tiktok_handle: form.tiktok_handle || null,
      instagram_handle: form.instagram_handle || null,
    })

    setSubmitting(false)

    if (insertError) {
      console.error(insertError)
      setError('Something went wrong submitting your business. Please try again.')
      return
    }

    alert('✓ Submitted! Your business is pending admin review.')
    onDone()
  }

  return (
    <div className="section" style={{ maxWidth: 580 }}>
      <h2>List your business</h2>
      <p className="muted">Submit your details for community verification and admin review.</p>

      {error && <div className="form-error">{error}</div>}

      <div className="form-group">
        <label>Business name</label>
        <input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Nairobi Tech Hub" />
      </div>

      <div className="form-group">
        <label>Category</label>
        <select value={form.category} onChange={(e) => update('category', e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Description (optional)</label>
        <textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={3} placeholder="What do you sell? How long have you operated?" />
      </div>

      <div className="form-group">
        <label>Phone number</label>
        <input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="0712 345 678" />
      </div>

      <div className="form-group">
        <label>M-Pesa till / paybill</label>
        <input value={form.mpesa_till} onChange={(e) => update('mpesa_till', e.target.value)} placeholder="Till 123456" />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Facebook page</label>
          <input value={form.fb_handle} onChange={(e) => update('fb_handle', e.target.value)} placeholder="@yourpage or URL" />
        </div>
        <div className="form-group">
          <label>TikTok handle</label>
          <input value={form.tiktok_handle} onChange={(e) => update('tiktok_handle', e.target.value)} placeholder="@yourhandle" />
        </div>
      </div>

      <div className="form-group">
        <label>Instagram handle (optional)</label>
        <input value={form.instagram_handle} onChange={(e) => update('instagram_handle', e.target.value)} placeholder="@yourhandle" />
      </div>

      <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit for review'}
      </button>
    </div>
  )
}
