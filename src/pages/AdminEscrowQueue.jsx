import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import RubiksLoader from './RubiksLoader'
import { formatChecks, formatKsh, checksToKsh, statusInfo, pendingKeys } from './checksUtils'

const GREEN = '#1D9E75'

// Admin-side escrow queue. This is the third release key — no seller gets
// paid without an admin approving here.
export default function AdminEscrowQueue({ onBack }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [filter, setFilter] = useState('needs_admin')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('orders')
      .select('*, businesses(name)')
      .in('status', ['held', 'shipped', 'admin_review'])
      .order('created_at', { ascending: true })

    if (err) setError('Could not load orders: ' + err.message)
    setOrders(data || [])
    setLoading(false)
  }

  async function run(orderId, fn) {
    setBusyId(orderId)
    setError('')
    const { error: err } = await fn()
    setBusyId(null)
    if (err) { setError(err.message); return }
    load()
  }

  function approveRelease(order) {
    const missing = pendingKeys(order).filter((k) => k !== 'admin')
    const warning = missing.length
      ? `\n\nNote: ${missing.join(' and ')} have not confirmed yet. Your approval will be recorded, but the money only moves once everyone has confirmed.`
      : '\n\nBuyer and seller have both confirmed. Approving now will release the payment.'

    if (!window.confirm(`Approve release of ${formatChecks(order.total_checks)} for "${order.product_name}"?${warning}`)) return
    run(order.id, () => supabase.rpc('admin_confirm_release', { p_order_id: order.id }))
  }

  function refundBuyer(order) {
    const reason = window.prompt(`Refund ${formatChecks(order.total_checks)} to the buyer. Reason:`)
    if (!reason || reason.trim().length < 3) {
      if (reason !== null) setError('Please give a reason for the refund.')
      return
    }
    run(order.id, () => supabase.rpc('admin_refund_order', { p_order_id: order.id, p_reason: reason.trim() }))
  }

  if (loading) return <RubiksLoader label="Loading the escrow queue…" />

  const needsAdmin = orders.filter(
    (o) => o.status === 'admin_review' || (o.buyer_confirmed_at && o.seller_confirmed_at && !o.admin_confirmed_at)
  )
  const visible = filter === 'needs_admin' ? needsAdmin : orders

  const totalHeld = orders.reduce((sum, o) => sum + Number(o.total_checks), 0)

  return (
    <div className="section" style={{ maxWidth: 640, textAlign: 'left' }}>
      {onBack && <button className="link-btn" onClick={onBack}>← Back</button>}
      <h2 style={{ marginBottom: 4 }}>Escrow Queue</h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Nothing is paid out without an approval here.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
        <Stat label="Open orders" value={orders.length} />
        <Stat label="Need you" value={needsAdmin.length} accent />
        <Stat label="Value held" value={formatChecks(totalHeld)} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`subtab-btn ${filter === 'needs_admin' ? 'on' : ''}`} onClick={() => setFilter('needs_admin')}>
          Needs review ({needsAdmin.length})
        </button>
        <button className={`subtab-btn ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
          All open ({orders.length})
        </button>
      </div>

      {error && (
        <div style={{ background: '#FCEBEB', border: '1px solid #F7C1C1', color: '#A32D2D', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="muted">Nothing waiting on you right now.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visible.map((o) => {
            const s = statusInfo(o.status)
            const busy = busyId === o.id
            const flagged = o.status === 'admin_review'

            return (
              <div
                key={o.id}
                style={{
                  border: `1px solid ${flagged ? '#FDBA74' : 'var(--border)'}`,
                  borderLeft: `4px solid ${flagged ? '#EA580C' : GREEN}`,
                  borderRadius: 14, padding: 16, background: 'var(--surface)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 14.5 }}>{o.product_name}</p>
                    <p className="muted" style={{ fontSize: 12.5 }}>{o.businesses?.name} · {o.quantity} item(s)</p>
                  </div>
                  <span style={{ background: s.bg, color: s.color, fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                    {s.label}
                  </span>
                </div>

                <p style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
                  {formatChecks(o.total_checks)}
                  <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}> · {formatKsh(checksToKsh(o.total_checks))}</span>
                </p>

                {o.review_reason && (
                  <p style={{ fontSize: 12.5, background: '#FFEDD5', color: '#7C2D12', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                    <strong>Flagged:</strong> {o.review_reason}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <KeyChip label="Buyer" done={!!o.buyer_confirmed_at} />
                  <KeyChip label="Seller" done={!!o.seller_confirmed_at} />
                  <KeyChip label="Admin" done={!!o.admin_confirmed_at} />
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!o.admin_confirmed_at && (
                    <button
                      onClick={() => approveRelease(o)}
                      disabled={busy}
                      style={{ background: GREEN, color: '#fff', border: 'none', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      {busy ? 'Working…' : 'Approve release'}
                    </button>
                  )}
                  <button
                    onClick={() => refundBuyer(o)}
                    disabled={busy}
                    style={{ background: 'none', border: '1px solid #F7C1C1', color: '#A32D2D', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Refund buyer
                  </button>
                </div>

                <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
                  Ordered {new Date(o.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {o.shipped_at && ` · shipped ${new Date(o.shipped_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}`}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div style={{
      background: accent ? '#FFEDD5' : 'var(--surface)',
      border: `1px solid ${accent ? '#FDBA74' : 'var(--border)'}`,
      borderRadius: 12, padding: '12px 10px',
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent ? '#7C2D12' : 'var(--text-strong)' }}>{value}</div>
      <div className="muted" style={{ fontSize: 11 }}>{label}</div>
    </div>
  )
}

function KeyChip({ label, done }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
      background: done ? '#EAF8F3' : 'var(--hover-bg)',
      color: done ? '#0F6E56' : 'var(--text-muted)',
      border: `1px solid ${done ? '#BEE9DA' : 'var(--border)'}`,
    }}>
      {done ? '✓ ' : '○ '}{label}
    </span>
  )
}
