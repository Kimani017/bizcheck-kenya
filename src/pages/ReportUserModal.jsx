import { useState } from 'react'
import { supabase } from '../supabase'

const REASONS = [
  'Harassment or abusive language',
  'Harsh or inappropriate review content',
  'Threatening messages',
  'Spam or scam attempt',
  'Other',
]

export default function ReportUserModal({ reportedUserId, reportedUsername, businessId, currentUser, onClose }) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit() {
    if (!reason) { setError('Please select a reason.'); return }
    setSubmitting(true)
    setError('')
    const { error: insertError } = await supabase.from('user_reports').insert({
      reporter_id: currentUser.id,
      reported_user_id: reportedUserId,
      business_id: businessId || null,
      reason,
      details: details || null,
    })
    setSubmitting(false)
    if (insertError) { setError('Error submitting: ' + insertError.message); return }
    setDone(true)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, maxWidth: 400, width: '100%', border: '1px solid var(--border)' }}>
        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <h3 style={{ marginBottom: 8, color: 'var(--text-strong)' }}>Report submitted</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>Our admin team will review @{reportedUsername}'s behavior.</p>
            <button className="btn-primary" onClick={onClose}>Close</button>
          </div>
        ) : (
          <>
            <h3 style={{ marginBottom: 4 }}>🚩 Report @{reportedUsername}</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Tell us what happened — our admin team will review this.</p>

            {error && <div className="form-error">{error}</div>}

            <div className="form-group">
              <label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 6, display: 'block' }}>Reason *</label>
              {REASONS.map((r) => (
                <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
                  <input type="radio" checked={reason === r} onChange={() => setReason(r)} /> {r}
                </label>
              ))}
            </div>

            <div className="form-group">
              <label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 6, display: 'block' }}>Details (optional)</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                placeholder="Describe what happened..."
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={submit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit report'}</button>
              <button className="btn-ghost-small" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
