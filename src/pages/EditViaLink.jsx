import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

const CATEGORIES = ['Electronics', 'Fashion', 'Food', 'Phones', 'Home', 'Beauty', 'Other']

export default function EditViaLink({ token, currentUser, onDone }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [linkInfo, setLinkInfo] = useState(null) // { target_type, target_business_id, seconds_remaining }
  const [business, setBusiness] = useState(null)
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    openLink()
    return () => clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    if (secondsLeft <= 0) return
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(timerRef.current); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [secondsLeft > 0])

  async function openLink() {
    setLoading(true)
    setError('')
    const { data, error: openError } = await supabase.rpc('open_edit_link', { p_token: token })
    setLoading(false)

    if (openError) { setError(openError.message); return }

    const info = data[0]
    setLinkInfo(info)
    setSecondsLeft(info.seconds_remaining)

    if (info.target_type === 'business') {
      const { data: biz } = await supabase.from('businesses').select('*').eq('id', info.target_business_id).single()
      setBusiness(biz)
      setForm({
        name: biz.name, category: biz.category, location: biz.location || '',
        description: biz.description || '', phone: biz.phone || '', mpesa_till: biz.mpesa_till || '',
        fb_handle: biz.fb_handle || '', tiktok_handle: biz.tiktok_handle || '', instagram_handle: biz.instagram_handle || '',
      })
    } else {
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single()
      setProfile(prof)
      setForm({ name: prof.name || '', phone: prof.phone || '', email: prof.email || '' })
    }
  }

  function update(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function save() {
    if (secondsLeft <= 0) { setError('This link has expired.'); return }
    setSaving(true)
    setError('')

    if (linkInfo.target_type === 'business') {
      const { error: saveError } = await supabase.from('businesses').update(form).eq('id', linkInfo.target_business_id)
      setSaving(false)
      if (saveError) { setError('Error saving: ' + saveError.message); return }
    } else {
      const { error: saveError } = await supabase.from('profiles').update(form).eq('id', currentUser.id)
      setSaving(false)
      if (saveError) { setError('Error saving: ' + saveError.message); return }
    }
    setSaved(true)
  }

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}><p className="muted">Opening secure link…</p></div>
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
        <div style={{ maxWidth: 400, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>⏱️</div>
          <h3 style={{ marginBottom: 8, color: 'var(--text-strong)' }}>Link unavailable</h3>
          <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>{error}</p>
          <button className="btn-primary" onClick={onDone}>Go to BizCheck →</button>
        </div>
      </div>
    )
  }

  if (saved) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
        <div style={{ maxWidth: 400, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
          <h3 style={{ marginBottom: 8, color: 'var(--text-strong)' }}>Changes saved!</h3>
          <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>Your information has been updated successfully.</p>
          <button className="btn-primary" onClick={onDone}>Continue to BizCheck →</button>
        </div>
      </div>
    )
  }

  const inp = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }
  const lbl = { fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 6, display: 'block' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>
            {linkInfo.target_type === 'business' ? `Edit "${business?.name}"` : 'Edit your personal info'}
          </h2>
          <span style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
            background: secondsLeft > 60 ? '#E1F5EE' : '#FCEBEB', color: secondsLeft > 60 ? '#085041' : '#A32D2D',
          }}>
            ⏱ {mins}:{secs.toString().padStart(2, '0')}
          </span>
        </div>

        {error && <div className="form-error">{error}</div>}

        {linkInfo.target_type === 'business' ? (
          <>
            <div className="form-group"><label style={lbl}>Business name</label><input style={inp} value={form.name} onChange={(e) => update('name', e.target.value)} /></div>
            <div className="form-group"><label style={lbl}>Category</label><select style={inp} value={form.category} onChange={(e) => update('category', e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
            <div className="form-group"><label style={lbl}>Location</label><input style={inp} value={form.location} onChange={(e) => update('location', e.target.value)} /></div>
            <div className="form-group"><label style={lbl}>Description</label><textarea style={{ ...inp, resize: 'vertical' }} rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} /></div>
            <div className="form-group"><label style={lbl}>Phone</label><input style={inp} value={form.phone} onChange={(e) => update('phone', e.target.value)} /></div>
            <div className="form-group"><label style={lbl}>M-Pesa till</label><input style={inp} value={form.mpesa_till} onChange={(e) => update('mpesa_till', e.target.value)} /></div>
            <div className="form-group"><label style={lbl}>Facebook</label><input style={inp} value={form.fb_handle} onChange={(e) => update('fb_handle', e.target.value)} /></div>
            <div className="form-group"><label style={lbl}>TikTok</label><input style={inp} value={form.tiktok_handle} onChange={(e) => update('tiktok_handle', e.target.value)} /></div>
            <div className="form-group"><label style={lbl}>Instagram</label><input style={inp} value={form.instagram_handle} onChange={(e) => update('instagram_handle', e.target.value)} /></div>
          </>
        ) : (
          <>
            <div className="form-group"><label style={lbl}>Full name</label><input style={inp} value={form.name} onChange={(e) => update('name', e.target.value)} /></div>
            <div className="form-group"><label style={lbl}>Phone</label><input style={inp} value={form.phone} onChange={(e) => update('phone', e.target.value)} /></div>
            <div className="form-group"><label style={lbl}>Email</label><input style={inp} value={form.email} onChange={(e) => update('email', e.target.value)} /></div>
          </>
        )}

        <button className="btn-primary" onClick={save} disabled={saving || secondsLeft <= 0} style={{ marginTop: 8 }}>
          {saving ? 'Saving…' : secondsLeft <= 0 ? 'Link expired' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
