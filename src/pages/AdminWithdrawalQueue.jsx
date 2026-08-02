import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import RubiksLoader from './RubiksLoader'
import { formatChecks, formatKsh } from './checksUtils'

const GREEN = '#1D9E75'

// Withdrawals aren't automated yet (PesaPal's standard API only collects
// money, not pays it out — that needs Openfloat or Daraja B2C, set up
// separately). Until then, an admin sends the M-Pesa payment manually from
// the business account, then marks it here.
export default function AdminWithdrawalQueue({ onBack }) {
  const [withdrawals, setWithdrawals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [filter, setFilter] = useState('pending')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('withdrawals')
      .select('*, profiles(username, phone)')
      .order('created_at', { ascending: true })

    if (err) setError('Could not load withdrawals: ' + err.message)
    setWithdrawals(data || [])
    setLoading(false)
  }

  async function markPaid(w) {
    const reference = window.prompt('M-Pesa confirmation code for this payout:')
    if (!reference || !reference.trim()) return

    setBusyId(w.id)
    setError('')
    const { error: err } = await supabase
      .from('withdrawals')
      .update({ status: 'paid', provider_reference: reference.trim(), processed_at: new Date().toISOString() })
      .eq('id', w.id)
    setBusyId(null)

    if (err) { setError(err.message); return }
    load()
  }

  async function markFailed(w) {
    const reason = window.prompt('Why did this payout fail? (Coins will be returned to the user)')
    if (reason === null) return

    setBusyId(w.id)
    setError('')
    const { error: err } = await supabase.rpc('fail_withdrawal', {
      p_withdrawal_id: w.id,
      p_reason: reason || 'Payout failed',
    })
    setBusyId(null)

    if (err) { setError(err.message); return }
    load()
  }

  if (loading) return <RubiksLoader label="Loading withdrawals…" />

  const visible = filter === 'pending' ? withdrawals.filter((w) => w.status === 'pending') : withdrawals
  const totalPending = withdrawals.filter((w) => w.status === 'pending').reduce((s, w) => s + Number(w.amount_ksh), 0)

  return (
    <div className="section" style={{ maxWidth: 600, textAlign: 'left' }}>
      {onBack && <button className="link-btn" onClick={onBack}>← Back</button>}
      <h2 style={{ marginBottom: 4 }}>Withdrawal Requests</h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
        Not automated yet — send the M-Pesa payment yourself, then mark it here.
      </p>
      {totalPending > 0 && (
        <p style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 16 }}>
          {formatKsh(totalPending)} waiting to be paid out
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`subtab-btn ${filter === 'pending' ? 'on' : ''}`} onClick={() => setFilter('pending')}>Pending</button>
        <button className={`subtab-btn ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All</button>
      </div>

      {error && (
        <div style={{ background: '#FCEBEB', border: '1px solid #F7C1C1', color: '#A32D2D', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="muted">Nothing here.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map((w) => {
            const busy = busyId === w.id
            return (
              <div key={w.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 14 }}>@{w.profiles?.username || 'user'}</p>
                    <p className="muted" style={{ fontSize: 12.5 }}>Pay to: {w.phone}</p>
                  </div>
                  <StatusPill status={w.status} />
                </div>
                <p style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>
                  {formatKsh(w.amount_ksh)} <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>({formatChecks(w.checks_amount)})</span>
                </p>
                {w.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => markPaid(w)}
                      disabled={busy}
                      style={{ background: GREEN, color: '#fff', border: 'none', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Mark as paid
                    </button>
                    <button
                      onClick={() => markFailed(w)}
                      disabled={busy}
                      style={{ background: 'none', border: '1px solid #F7C1C1', color: '#A32D2D', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Mark failed (return coins)
                    </button>
                  </div>
                )}
                {w.provider_reference && (
                  <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Ref: {w.provider_reference}</p>
                )}
                {w.failure_reason && (
                  <p style={{ fontSize: 11.5, marginTop: 8, color: '#A32D2D' }}>Failed: {w.failure_reason}</p>
                )}
                <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                  Requested {new Date(w.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }) {
  const map = {
    pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
    processing: { bg: '#DBEAFE', color: '#1E40AF', label: 'Processing' },
    paid: { bg: '#D1FAE5', color: '#065F46', label: 'Paid' },
    failed: { bg: '#FEE2E2', color: '#991B1B', label: 'Failed' },
  }
  const s = map[status] || map.pending
  return <span style={{ background: s.bg, color: s.color, fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>{s.label}</span>
}
