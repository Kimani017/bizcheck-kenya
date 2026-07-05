import { useState } from 'react'
import { supabase } from '../supabase'

const CATEGORIES = ['Electronics', 'Fashion', 'Food', 'Phones', 'Home', 'Beauty', 'Other']

export default function BusinessApplicationForm({ currentUser, onDone, onCancel }) {
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [biz, setBiz] = useState({
    name: '', location: '', location_type: 'permanent', category: 'Electronics',
    description: '', opening_time: '', closing_time: '', other_branches: '', business_username: '',
  })
  const [personal, setPersonal] = useState({
    owner_name: '', owner_id_number: '', owner_age: '', owner_email: currentUser.email || '', owner_phone: '',
  })
  const [docs, setDocs] = useState({ idPhoto: null, permitPhoto: null, registrationPhoto: null })

  function updateBiz(f, v) { setBiz(b => ({ ...b, [f]: v })) }
  function updatePersonal(f, v) { setPersonal(p => ({ ...p, [f]: v })) }

  function validateStep1() {
    if (!biz.name.trim()) return 'Please enter your business name.'
    if (!biz.location.trim()) return 'Please enter your business location.'
    if (!biz.description.trim()) return 'Please add a description.'
    if (!biz.business_username.trim()) return 'Please choose a business username.'
    return null
  }
  function validateStep2() {
    if (!personal.owner_name.trim()) return 'Please enter your full name.'
    if (!personal.owner_id_number.trim()) return 'Please enter your ID number.'
    if (!personal.owner_age || personal.owner_age < 18) return 'You must be 18 or older to register a business.'
    if (!personal.owner_email.trim()) return 'Please enter your email.'
    if (!personal.owner_phone.trim()) return 'Please enter your phone number.'
    return null
  }

  function nextStep() {
    const err = step === 1 ? validateStep1() : validateStep2()
    if (err) { setError(err); return }
    setError('')
    setStep(step + 1)
  }

  async function submit() {
    if (!docs.idPhoto) { setError('Please upload a photo of your national ID.'); return }
    if (!docs.permitPhoto) { setError('Please upload your business permit.'); return }

    setSubmitting(true)
    setError('')

    async function upload(file, label) {
      const ext = file.name.split('.').pop()
      const path = `${currentUser.id}/${label}-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('business-documents').upload(path, file)
      if (uploadError) throw uploadError
      return path
    }

    try {
      const idPhotoPath = await upload(docs.idPhoto, 'id')
      const permitPhotoPath = await upload(docs.permitPhoto, 'permit')
      const registrationPhotoPath = docs.registrationPhoto ? await upload(docs.registrationPhoto, 'registration') : null

      const { error: insertError } = await supabase.from('submissions').insert({
        submitter_id: currentUser.id,
        name: biz.name, category: biz.category, location: biz.location,
        location_type: biz.location_type, description: biz.description,
        opening_time: biz.opening_time, closing_time: biz.closing_time,
        other_branches: biz.other_branches, business_username: biz.business_username,
        owner_name: personal.owner_name, owner_id_number: personal.owner_id_number,
        owner_age: parseInt(personal.owner_age), owner_email: personal.owner_email, owner_phone: personal.owner_phone,
        id_photo_url: idPhotoPath, permit_photo_url: permitPhotoPath, registration_photo_url: registrationPhotoPath,
      })
      if (insertError) throw insertError

      onDone()
    } catch (e) {
      setError('Error submitting: ' + e.message)
    }
    setSubmitting(false)
  }

  const inp = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }
  const lbl = { fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 6, display: 'block' }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, maxWidth: 520 }}>
      {/* STEP INDICATOR */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[1, 2, 3].map((s) => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 4, background: s <= step ? '#1D9E75' : 'var(--hover-bg)' }} />
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        Step {step} of 3 — {step === 1 ? 'Business details' : step === 2 ? 'Personal info' : 'Verification documents'}
      </div>

      {error && <div className="form-error">{error}</div>}

      {/* STEP 1 */}
      {step === 1 && (
        <>
          <div className="form-group"><label style={lbl}>Business name *</label><input style={inp} value={biz.name} onChange={(e) => updateBiz('name', e.target.value)} placeholder="e.g. Nairobi Tech Hub" /></div>

          <div className="form-group">
            <label style={lbl}>Location type</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="radio" checked={biz.location_type === 'permanent'} onChange={() => updateBiz('location_type', 'permanent')} /> Permanent location
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="radio" checked={biz.location_type === 'live'} onChange={() => updateBiz('location_type', 'live')} /> Live location (freelancer)
              </label>
            </div>
          </div>

          <div className="form-group"><label style={lbl}>{biz.location_type === 'live' ? 'Current location' : 'Business location'} *</label><input style={inp} value={biz.location} onChange={(e) => updateBiz('location', e.target.value)} placeholder="e.g. Westlands, Nairobi" /></div>

          <div className="form-group"><label style={lbl}>Category</label><select style={inp} value={biz.category} onChange={(e) => updateBiz('category', e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>

          <div className="form-group"><label style={lbl}>Description *</label><textarea style={{ ...inp, resize: 'vertical' }} rows={3} value={biz.description} onChange={(e) => updateBiz('description', e.target.value)} placeholder="What do you sell and how do you operate?" /></div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label style={lbl}>Opening time</label><input style={inp} value={biz.opening_time} onChange={(e) => updateBiz('opening_time', e.target.value)} placeholder="8:00 AM" /></div>
            <div className="form-group"><label style={lbl}>Closing time</label><input style={inp} value={biz.closing_time} onChange={(e) => updateBiz('closing_time', e.target.value)} placeholder="6:00 PM" /></div>
          </div>

          <div className="form-group"><label style={lbl}>Other branches (optional)</label><input style={inp} value={biz.other_branches} onChange={(e) => updateBiz('other_branches', e.target.value)} placeholder="e.g. Also at CBD, Westlands" /></div>

          <div className="form-group">
            <label style={lbl}>Business username *</label>
            <div style={{ position: 'relative' }}>
              <input style={{ ...inp, paddingLeft: 26 }} value={biz.business_username} onChange={(e) => updateBiz('business_username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="yourbusiness" />
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>@</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>This will show publicly once your business is verified.</div>
          </div>

          <button className="btn-primary" onClick={nextStep} style={{ marginTop: 8 }}>Continue →</button>
        </>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <>
          <div className="form-group"><label style={lbl}>Full name (as on your ID) *</label><input style={inp} value={personal.owner_name} onChange={(e) => updatePersonal('owner_name', e.target.value)} /></div>
          <div className="form-group"><label style={lbl}>National ID number *</label><input style={inp} value={personal.owner_id_number} onChange={(e) => updatePersonal('owner_id_number', e.target.value)} /></div>
          <div className="form-group"><label style={lbl}>Age *</label><input type="number" style={inp} value={personal.owner_age} onChange={(e) => updatePersonal('owner_age', e.target.value)} /></div>
          <div className="form-group"><label style={lbl}>Email *</label><input type="email" style={inp} value={personal.owner_email} onChange={(e) => updatePersonal('owner_email', e.target.value)} /></div>
          <div className="form-group"><label style={lbl}>Phone number *</label><input style={inp} value={personal.owner_phone} onChange={(e) => updatePersonal('owner_phone', e.target.value)} /></div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn-ghost-small" onClick={() => setStep(1)}>← Back</button>
            <button className="btn-primary" onClick={nextStep} style={{ flex: 1 }}>Continue →</button>
          </div>
        </>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            Upload clear photos of your documents. Our admin team will review them against the personal details you provided.
          </p>
          <div className="form-group"><label style={lbl}>National ID (front side) *</label><input type="file" accept="image/*" style={inp} onChange={(e) => setDocs(d => ({ ...d, idPhoto: e.target.files[0] }))} /></div>
          <div className="form-group"><label style={lbl}>Business permit *</label><input type="file" accept="image/*" style={inp} onChange={(e) => setDocs(d => ({ ...d, permitPhoto: e.target.files[0] }))} /></div>
          <div className="form-group"><label style={lbl}>Registration form (optional)</label><input type="file" accept="image/*" style={inp} onChange={(e) => setDocs(d => ({ ...d, registrationPhoto: e.target.files[0] }))} /></div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn-ghost-small" onClick={() => setStep(2)}>← Back</button>
            <button className="btn-primary" onClick={submit} disabled={submitting} style={{ flex: 1 }}>
              {submitting ? 'Submitting…' : 'Submit application'}
            </button>
          </div>
        </>
      )}

      {onCancel && step === 1 && (
        <button className="link-btn" style={{ marginTop: 12 }} onClick={onCancel}>Cancel</button>
      )}
    </div>
  )
}
