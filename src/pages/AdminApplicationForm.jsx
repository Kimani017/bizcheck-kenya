import { useState } from 'react'
import { supabase } from '../supabase'

export default function AdminApplicationForm({ currentUser, onDone }) {
  const [form, setForm] = useState({
    official_name: '', id_number: '', date_of_birth: '',
    email: currentUser.email || '', phone: '',
  })
  const [idPhoto, setIdPhoto] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function update(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function submit() {
    if (!form.official_name.trim()) { setError('Please enter your official full name.'); return }
    if (!form.id_number.trim()) { setError('Please enter your national ID number.'); return }
    if (!idPhoto) { setError('Please upload a photo of your ID for verification.'); return }
    if (!form.date_of_birth) { setError('Please enter your date of birth.'); return }
    if (!form.email.trim()) { setError('Please enter your email.'); return }
    if (!form.phone.trim()) { setError('Please enter your phone number.'); return }

    setSubmitting(true)
    setError('')

    // Upload ID photo to private storage
    const fileExt = idPhoto.name.split('.').pop()
    const filePath = `${currentUser.id}/id-${Date.now()}.${fileExt}`
    const { error: uploadError } = await supabase.storage.from('admin-id-photos').upload(filePath, idPhoto)

    if (uploadError) { setSubmitting(false); setError('Error uploading ID photo: ' + uploadError.message); return }

    const { error: updateError } = await supabase.from('admin_applications').update({
      official_name: form.official_name,
      id_number: form.id_number,
      id_photo_url: filePath,
      date_of_birth: form.date_of_birth,
      email: form.email,
      phone: form.phone,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }).eq('user_id', currentUser.id)

    setSubmitting(false)
    if (updateError) { setError('Error submitting: ' + updateError.message); return }
    onDone()
  }

  const inp = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }
  const lbl = { fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 6, display: 'block' }

  return (
    <div className="section" style={{ maxWidth: 480 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🛡️</div>
          <h2 style={{ fontSize: 20, marginBottom: 6 }}>Admin Application</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            You've been invited to apply for admin access. Please fill in your details accurately — they will be verified before approval.
          </p>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-group">
          <label style={lbl}>Official full name *</label>
          <input style={inp} value={form.official_name} onChange={(e) => update('official_name', e.target.value)} placeholder="As shown on your ID" />
        </div>

        <div className="form-group">
          <label style={lbl}>National ID number *</label>
          <input style={inp} value={form.id_number} onChange={(e) => update('id_number', e.target.value)} placeholder="e.g. 12345678" />
        </div>

        <div className="form-group">
          <label style={lbl}>Photo of your ID (front side) *</label>
          <input type="file" accept="image/*" onChange={(e) => setIdPhoto(e.target.files[0])} style={inp} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>This is kept private and only visible to the superadmin for verification.</div>
        </div>

        <div className="form-group">
          <label style={lbl}>Date of birth *</label>
          <input type="date" style={inp} value={form.date_of_birth} onChange={(e) => update('date_of_birth', e.target.value)} />
        </div>

        <div className="form-group">
          <label style={lbl}>Email *</label>
          <input type="email" style={inp} value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@example.com" />
        </div>

        <div className="form-group">
          <label style={lbl}>Phone number *</label>
          <input style={inp} value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="0712 345 678" />
        </div>

        <button className="btn-primary" onClick={submit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit application'}
        </button>
      </div>
    </div>
  )
}
