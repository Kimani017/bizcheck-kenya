import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import RubiksLoader from './RubiksLoader'
import { formatChecks, formatKsh, checksToKsh, statusInfo, pendingKeys } from './checksUtils'

const GREEN = '#1D9E75'

export default function MyOrdersPage({ currentUser, onBack, onSelectBusiness }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => { load() }, [currentUser?.id])

  async function load() {
    if (!currentUser?.id) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('orders')
      .select('*, businesses(id, name, logo_url)')
      .eq('buyer_id', currentUser.id)
      .order('created_at', { ascending: false })

    if (err) setError('Could not load your orders: ' + err.message)
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

  function confirmReceived(order) {
    if (!window.confirm(
      `Confirm you have received "${order.product_name}"?\n\n` +
      'This is one of three confirmations needed before the seller is paid.'
    )) return
    run(order.id, () => supabase.rpc('confirm_order_received', { p_order_id: order.id }))
  }

  function cancelOrder(order) {
    const reason = window.prompt('Cancel this order? Tell us why (optional):')
    if (reason === null) return
    run(order.id, () => supabase.rpc('cancel_order_before_shipping', { p_order_id: order.id, p_reason: reason || null }))
  }

  function requestReview(order) {
    const reason = window.prompt('Describe the problem so an admin can review it:')
    if (!reason || reason.trim().length < 5) {
      if (reason !== null) setError('Please give a bit more detail so an admin can help.')
      return
    }
    run(order.id, () => supabase.rpc('request_order_review', { p_order_id: order.id, p_reason: reason.trim() }))
  }

  if (loading) return <RubiksLoader label="Loading your orders…" />

  return (
    <div className="section" style={{ maxWidth: 560, textAlign: 'left' }}>
      {onBack && <button className="link-btn" onClick={onBack}>← Back</button>}
      <h2 style={{ marginBottom: 4 }}>My Orders</h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
        Your Checks stay held until you, the seller and a BizCheck admin all confirm.
      </p>

      {error && (
        <div style={{ background: '#FCEBEB', border: '1px solid #F7C1C1', color: '#A32D2D', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      {orders.length === 0 ? (
        <p className="muted">You haven't placed any orders yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {orders.map((o) => {
            const s = statusInfo(o.status)
            const missing = pendingKeys(o)
            const isOpen = ['held', 'shipped', 'admin_review'].includes(o.status)
            const busy = busyId === o.id

            return (
              <div key={o.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 14.5 }}>{o.product_name}</p>
                    <button
                      onClick={() => o.businesses && onSelectBusiness?.(o.businesses)}
                      style={{ background: 'none', border: 'none', padding: 0, fontSize: 12.5, color: GREEN, cursor: 'pointer' }}
                    >
                      {o.businesses?.name}
                    </button>
                  </div>
                  <span style={{ background: s.bg, color: s.color, fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                    {s.label}
                  </span>
                </div>

                <p style={{ fontSize: 13.5, marginBottom: 4 }}>
                  {o.quantity} × {formatChecks(o.unit_price_checks)}
                  {o.size ? ` · ${o.size}` : ''}{o.color ? ` · ${o.color}` : ''}
                </p>
                <p style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>
                  {formatChecks(o.total_checks)}
                  <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}> · {formatKsh(checksToKsh(o.total_checks))}</span>
                </p>

                {s.buyerHint && <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{s.buyerHint}</p>}

                {o.review_reason && o.status === 'admin_review' && (
                  <p style={{ fontSize: 12.5, background: '#FFEDD5', color: '#7C2D12', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                    Reason: {o.review_reason}
                  </p>
                )}

                {isOpen && <KeyProgress order={o} missing={missing} />}

                {isOpen && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {!o.buyer_confirmed_at && (
                      <button
                        onClick={() => confirmReceived(o)}
                        disabled={busy}
                        style={{ background: GREEN, color: '#fff', border: 'none', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                      >
                        {busy ? 'Working…' : 'I received it'}
                      </button>
                    )}
                    {o.status === 'held' && (
                      <button
                        onClick={() => cancelOrder(o)}
                        disabled={busy}
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, cursor: 'pointer', color: 'var(--text-muted)' }}
                      >
                        Cancel
                      </button>
                    )}
                    {o.status !== 'admin_review' && (
                      <button
                        onClick={() => requestReview(o)}
                        disabled={busy}
                        style={{ background: 'none', border: 'none', padding: '8px 4px', fontSize: 12.5, cursor: 'pointer', color: '#A32D2D', fontWeight: 600 }}
                      >
                        Report a problem
                      </button>
                    )}
                  </div>
                )}

                <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
                  Ordered {new Date(o.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Shows which of the three release confirmations are done
export function KeyProgress({ order }) {
  const keys = [
    { label: 'You', done: !!order.buyer_confirmed_at },
    { label: 'Seller', done: !!order.seller_confirmed_at },
    { label: 'BizCheck', done: !!order.admin_confirmed_at },
  ]
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
      {keys.map((k) => (
        <div
          key={k.label}
          style={{
            flex: 1,
            background: k.done ? '#EAF8F3' : 'var(--hover-bg)',
            border: `1px solid ${k.done ? '#BEE9DA' : 'var(--border)'}`,
            borderRadius: 9,
            padding: '6px 8px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 11, fontWeight: 700, color: k.done ? '#0F6E56' : 'var(--text-muted)' }}>
            {k.done ? '✓ ' : ''}{k.label}
          </p>
        </div>
      ))}
    </div>
  )
}
