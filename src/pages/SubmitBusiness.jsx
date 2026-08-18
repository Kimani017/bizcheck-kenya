import { useState } from 'react'
import { supabase } from '../supabase'
import RubiksLoader from './RubiksLoader'
import { SUBSCRIPTION, formatChecks } from './checksUtils'

const CATEGORIES = ['Electronics', 'Fashion', 'Food', 'Phones', 'Home', 'Beauty', 'Other']

const STEPS = ['Your business', 'Contact & location', 'Online presence', 'Review & submit']

export default function SubmitBusiness({ currentUser, onDone }) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)

  const [form, setForm] = useState({
    name:           '',
    category:       '',
    description:    '',
    phone:          '',
    mpesa_till:     '',
    location:       '',
    owner_email:    currentUser?.email || '',
    fb_handle:      '',
    tiktok_handle:  '',
    instagram_handle: '',
    twitter_handle: '',
    website:        '',
    bizcode:        '',
  })

  function set(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  function handleLogo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('Logo must be under 2MB.'); return }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setError('')
  }

  function canProceed() {
    if (step === 0) return form.name.length >= 3 && form.category && form.description.length >= 20
    if (step === 1) return form.phone.length >= 9 && form.location.length > 0
    return true
  }

  async function submit() {
    setSaving(true)
    setError('')
    try {
      let logo_url = null

      if (logoFile) {
        const ext  = logoFile.name.split('.').pop()
        const path = `business-logos/${currentUser.id}-${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('business-documents')
          .upload(path, logoFile, { upsert: true })
        if (upErr) throw new Error('Logo upload failed: ' + upErr.message)
        const { data: urlData } = supabase.storage
          .from('business-documents')
          .getPublicUrl(path)
        logo_url = urlData?.publicUrl || null
      }

      const payload = {
        owner_id:         currentUser.id,
        owner_email:      form.owner_email || currentUser.email,
        name:             form.name.trim(),
        category:         form.category,
        description:      form.description.trim(),
        phone:            form.phone.trim(),
        mpesa_till:       form.mpesa_till.trim() || null,
        location:         form.location.trim(),
        fb_handle:        form.fb_handle.trim()        || null,
        tiktok_handle:    form.tiktok_handle.trim()    || null,
        instagram_handle: form.instagram_handle.trim() || null,
        twitter_handle:   form.twitter_handle.trim()   || null,
        website:          form.website.trim()          || null,
        bizcode:          form.bizcode.trim()          || null,
        logo_url,
        status:              'pending',
        subscription_status: 'unlisted',
        trust_score:         50,
      }

      const { error: insertErr } = await supabase.from('businesses').insert(payload)
      if (insertErr) throw insertErr

      setSubmitted(true)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Success screen ───────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="section" style={{ maxWidth: 520, textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
        <h2 style={{ marginBottom: 8 }}>Application submitted!</h2>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
          We will review your business within 30 minutes. Once approved, you will
          see a prompt to pay the listing fee of{' '}
          <strong>{formatChecks(SUBSCRIPTION.LISTING_FEE_CHECKS)}</strong> (KSh{' '}
          {SUBSCRIPTION.LISTING_FEE_CHECKS * 100}) to go live on BizCheck.
        </p>

        <div style={{ background: 'var(--hover-bg)', borderRadius: 14, padding: 18, marginBottom: 24, textAlign: 'left' }}>
          <p style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>What happens next:</p>
          {[
            ['🔍', 'Auto-review checks your business details (within 30 min)'],
            ['✅', 'If approved, you pay the 2.27 Check listing fee'],
            ['🚀', '7-day free trial starts — no commission, full access'],
            ['📅', 'After trial: 3 Checks/month + 2% commission on sales'],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 13 }}>
              <span>{icon}</span>
              <span className="muted">{text}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onDone}
          style={{ background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
        >
          Back to BizCheck
        </button>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  return (
    <div className="section" style={{ maxWidth: 520 }}>
      <h2 style={{ marginBottom: 4 }}>List your business</h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
        Listing fee: {formatChecks(SUBSCRIPTION.LISTING_FEE_CHECKS)} · paid after review · 7-day free trial included
      </p>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1 }}>
            <div style={{ height: 4, borderRadius: 99, background: i <= step ? '#1D9E75' : 'var(--border)' }} />
            <p style={{ fontSize: 10, marginTop: 4, color: i === step ? '#1D9E75' : 'var(--text-muted)', fontWeight: i === step ? 600 : 400 }}>
              {s}
            </p>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Step 0: Business details ──────────────────────────────────────── */}
      {step === 0 && (
        <>
          <Field label="Business name *">
            <input value={form.name} onChange={set('name')} placeholder="e.g. Wanjiku Electronics" style={inputStyle} />
            {form.name.length > 0 && form.name.length < 3 && (
              <p style={{ fontSize: 11, color: '#A32D2D', marginTop: 3 }}>At least 3 characters</p>
            )}
          </Field>

          <Field label="Category *">
            <select value={form.category} onChange={set('category')} style={inputStyle}>
              <option value="">Select a category</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="Description * (min 20 characters)">
            <textarea
              value={form.description}
              onChange={set('description')}
              placeholder="Tell customers what you sell, what makes you different, delivery options..."
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <p style={{ fontSize: 11, color: form.description.length >= 20 ? '#1D9E75' : 'var(--text-muted)', marginTop: 3 }}>
              {form.description.length}/20 minimum
            </p>
          </Field>

          <Field label="Business logo (optional, max 2MB)">
            {logoPreview && (
              <img src={logoPreview} alt="Logo preview"
                style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', marginBottom: 10, border: '2px solid var(--border)' }} />
            )}
            <input type="file" accept="image/*" onChange={handleLogo}
              style={{ fontSize: 13, color: 'var(--text-muted)' }} />
          </Field>
        </>
      )}

      {/* ── Step 1: Contact & location ────────────────────────────────────── */}
      {step === 1 && (
        <>
          <Field label="Phone number *">
            <input value={form.phone} onChange={set('phone')} placeholder="07XX XXX XXX" style={inputStyle} />
          </Field>

          <Field label="M-Pesa till number (optional)">
            <input value={form.mpesa_till} onChange={set('mpesa_till')} placeholder="e.g. 123456" style={inputStyle} />
          </Field>

          <Field label="Location / town *">
            <input value={form.location} onChange={set('location')} placeholder="e.g. Nairobi CBD, Mombasa Road" style={inputStyle} />
          </Field>

          <Field label="Business email (optional)">
            <input type="email" value={form.owner_email} onChange={set('owner_email')} placeholder="business@example.com" style={inputStyle} />
          </Field>

          <Field label="BizCode — your unique handle (optional)">
            <input value={form.bizcode} onChange={set('bizcode')} placeholder="e.g. wanjiku-electronics" style={inputStyle} />
            <p className="muted" style={{ fontSize: 11, marginTop: 3 }}>Letters, numbers, and hyphens only</p>
          </Field>
        </>
      )}

      {/* ── Step 2: Online presence ───────────────────────────────────────── */}
      {step === 2 && (
        <>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            Add your social media handles so customers can verify you. All optional.
          </p>
          <Field label="Facebook page"><input value={form.fb_handle}        onChange={set('fb_handle')}        placeholder="@YourPage"  style={inputStyle} /></Field>
          <Field label="TikTok"><input          value={form.tiktok_handle}    onChange={set('tiktok_handle')}    placeholder="@handle"    style={inputStyle} /></Field>
          <Field label="Instagram"><input       value={form.instagram_handle} onChange={set('instagram_handle')} placeholder="@handle"    style={inputStyle} /></Field>
          <Field label="Twitter / X"><input     value={form.twitter_handle}   onChange={set('twitter_handle')}   placeholder="@handle"    style={inputStyle} /></Field>
          <Field label="Website"><input         value={form.website}          onChange={set('website')}          placeholder="https://..."style={inputStyle} /></Field>
        </>
      )}

      {/* ── Step 3: Review ────────────────────────────────────────────────── */}
      {step === 3 && (
        <>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            Review your details before submitting. After submission our system
            will review your business within 30 minutes.
          </p>

          {[
            ['Business name',  form.name],
            ['Category',       form.category],
            ['Phone',          form.phone],
            ['M-Pesa till',    form.mpesa_till || '—'],
            ['Location',       form.location],
            ['Facebook',       form.fb_handle || '—'],
            ['TikTok',         form.tiktok_handle || '—'],
            ['Instagram',      form.instagram_handle || '—'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span className="muted">{label}</span>
              <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
            </div>
          ))}

          <div style={{ background: '#EAF8F3', border: '1px solid #BEE9DA', borderRadius: 12, padding: 16, marginTop: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0F6E56', marginBottom: 8 }}>
              After submission
            </p>
            <p style={{ fontSize: 13, color: '#0F6E56', lineHeight: 1.6 }}>
              Once auto-review approves your business, you will be asked to pay
              the <strong>2.27 Check listing fee</strong>. You can pay immediately
              if you have Checks, or deposit first and it will be deducted automatically.
              Your 7-day free trial starts the moment the fee is paid.
            </p>
          </div>
        </>
      )}

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            style={{ flex: 1, background: 'none', border: '1px solid var(--border)', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text)' }}
          >
            Back
          </button>
        )}

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => { setError(''); setStep(step + 1) }}
            disabled={!canProceed()}
            style={{ flex: 1, background: canProceed() ? '#1D9E75' : 'var(--hover-bg)', color: canProceed() ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, cursor: canProceed() ? 'pointer' : 'not-allowed' }}
          >
            Continue
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={saving}
            style={{ flex: 1, background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Submitting…' : 'Submit application'}
          </button>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '1px solid var(--border)', fontSize: 14,
  background: 'var(--surface)', color: 'var(--text)',
}
