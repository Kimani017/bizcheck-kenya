import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import RubiksLoader from './RubiksLoader'
import { formatChecks, formatKsh, checksToKsh, statusInfo } from './checksUtils'
import { KeyProgress } from './MyOrdersPage'

const GREEN = '#1D9E75'

export default function BusinessOrdersTab({ business, currentUser }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [filter, setFilter] = useState('open') // 'open' | 'all'

  useEffect(() => { load() }, [business?.id])

  async function load() {
    if (!business?.id) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('orders')
      .select('*, profiles!orders_buyer_id_fkey(username)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })

    if (err) {
      // Fall back without the profile join if the relationship name differs
      const { data: plain } = await supabase
        .from('orders').select('*').eq('business_id', business.id)
        .order('created_at', { ascending: false })
      setOrders(plain || [])
    } else {
      setOrders(data || [])
    }
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

  function markShipped(order) {
    if (!window.confirm(`Mark "${order.product_name}" as shipped?`)) return
    run(order.id, () => supabase.rpc('mark_order_shipped', { p_order_id: order.id }))
  }

  function confirmDelivery(order) {
    if (!window.confirm(
      `Confirm you delivered "${order.product_name}"?\n\n` +
      'This is one of three confirmations needed before you are paid.'
    )) return
    run(order.id, () => supabase.rpc('seller_confirm_delivery', { p_order_id: order.id }))
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

  const openStatuses = ['held', 'shipped', 'admin_review']
  const visible = filter === 'open' ? orders.filter((o) => openStatuses.includes(o.status)) : orders

  const pendingEarnings = orders
    .filter((o) => openStatuses.includes(o.status))
    .reduce((sum, o) => sum + Number(o.total_checks), 0)

  return (
    <div style={{ textAlign: 'left' }}>
      <h3 style={{ marginBottom: 2 }}>Orders</h3>
      <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Payment is held by BizCheck until you, the buyer and an admin all confirm.
      </p>

      {pendingEarnings > 0 && (
        <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ fontSize: 12.5, color: '#92400E', fontWeight: 600 }}>Awaiting release</p>
          <p style={{ fontSize: 20, fontWeight: 800, color: '#92400E' }}>{formatChecks(pendingEarnings)}</p>
          <p style={{ fontSize: 12, color: '#92400E' }}>{formatKsh(checksToKsh(pendingEarnings))}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`subtab-btn ${filter === 'open' ? 'on' : ''}`} onClick={() => setFilter('open')}>Open</button>
        <button className={`subtab-btn ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All</button>
      </div>

      {error && (
        <div style={{ background: '#FCEBEB', border: '1px solid #F7C1C1', color: '#A32D2D', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="muted">{filter === 'open' ? 'No open orders.' : 'No orders yet.'}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visible.map((o) => {
            const s = statusInfo(o.status)
            const busy = busyId === o.id
            const isOpen = openStatuses.includes(o.status)

            return (
              <div key={o.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 14.5 }}>{o.product_name}</p>
                    <p className="muted" style={{ fontSize: 12.5 }}>
                      {o.quantity} × {formatChecks(o.unit_price_checks)}
                      {o.profiles?.username ? ` · @${o.profiles.username}` : ''}
                    </p>
                  </div>
                  <span style={{ background: s.bg, color: s.color, fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                    {s.label}
                  </span>
                </div>

                <p style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>
                  {formatChecks(o.total_checks)}
                  <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}> · {formatKsh(checksToKsh(o.total_checks))}</span>
                </p>

                {(o.size || o.color || o.delivery_note) && (
                  <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
                    {[o.size, o.color, o.delivery_note].filter(Boolean).join(' · ')}
                  </p>
                )}

                {s.sellerHint && <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{s.sellerHint}</p>}

                {o.review_reason && o.status === 'admin_review' && (
                  <p style={{ fontSize: 12.5, background: '#FFEDD5', color: '#7C2D12', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                    Reason: {o.review_reason}
                  </p>
                )}

                {isOpen && <KeyProgress order={o} />}

                {isOpen && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {o.status === 'held' && (
                      <button
                        onClick={() => markShipped(o)}
                        disabled={busy}
                        style={{ background: GREEN, color: '#fff', border: 'none', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                      >
                        {busy ? 'Working…' : 'Mark as shipped'}
                      </button>
                    )}
                    {!o.seller_confirmed_at && (
                      <button
                        onClick={() => confirmDelivery(o)}
                        disabled={busy}
                        style={{ background: o.status === 'held' ? 'none' : GREEN, color: o.status === 'held' ? 'var(--text)' : '#fff', border: o.status === 'held' ? '1px solid var(--border)' : 'none', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                      >
                        Confirm delivered
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
                  {new Date(o.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
