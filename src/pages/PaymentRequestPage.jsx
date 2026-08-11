import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import RubiksLoader from './RubiksLoader'
import { formatChecks, formatKsh, checksToKsh, kshToChecks } from './checksUtils'

const GREEN = '#1D9E75'
const GREEN_DARK = '#0F6E56'

// Payment requests — for agreeing on a custom amount off-catalog.
// The seller creates a request (by the buyer's username), the buyer
// accepts to create a real three-key escrow order, or declines.
// Shown as two sub-sections: incoming requests (buyer) and sent requests
// (seller, if they own a business).
export default function PaymentRequestsPage({ currentUser, businessMode, onBack, onOpenWallet, onViewOrder }) {
  const [incoming, setIncoming] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)

  // New request form (shown only if in businessMode)
  const [showForm, setShowForm] = useState(false)
  const [buyerUsername, setBuyerUsername] = useState('')
  const [description, setDescription] = useState('')
  const [amountKsh, setAmountKsh] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => { load() }, [currentUser?.id, businessMode?.id])

  async function load() {
    if (!currentUser?.id) return
    setLoading(true)
    setError('')

    const [{ data: inc }, { data: out }] = await Promise.all([
      supabase
        .from('payment_requests')
        .select('*, businesses(name, logo_url)')
        .eq('buyer_id', currentUser.id)
        .order('created_at', { ascending: false }),
      businessMode?.id
        ? supabase
            .from('payment_requests')
            .select('*, profiles!payment_requests_buyer_id_fkey(username)')
            .eq('business_id', businessMode.id)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])

    setIncoming(inc || [])
    setOutgoing(out || [])
    setLoading(false)
  }

  async function accept(req) {
    setBusyId(req.id)
    setError('')
    setNotice('')

    const { data: orderId, error: rpcError } = await supabase.rpc('accept_payment_request', {
      p_request_id: req.id,
    })
    setBusyId(null)

    if (rpcError) {
      if (rpcError.message.toLowerCase().includes('insufficient')) {
        setError(`Not enough Checks. You need ${formatChecks(req.amount_checks * 1.03)} (including 3% platform fee).`)
      } else {
        setError('Could not accept: ' + rpcError.message)
      }
      return
    }

    setNotice('Order placed — your Checks are held safely until everyone confirms delivery.')
    load()
    if (orderId) onViewOrder?.()
  }

  async function decline(req) {
    if (!window.confirm('Decline this payment request?')) return
    setBusyId(req.id)
    const { error: rpcError } = await supabase.rpc('decline_payment_request', { p_request_id: req.id })
    setBusyId(null)
    if (rpcError) { setError('Error: ' + rpcError.message); return }
    load()
  }

  async function cancelRequest(req) {
    if (!window.confirm('Cancel this request?')) return
    setBusyId(req.id)
    const { error: rpcError } = await supabase.rpc('decline_payment_request', { p_request_id: req.id })
    setBusyId(null)
    if (rpcError) { setError('Error: ' + rpcError.message); return }
    load()
  }

  async function sendRequest() {
    const checks = kshToChecks(Number(amountKsh))
    if (!buyerUsername.trim()) { setError('Enter the buyer's username.'); return }
    if (!description.trim()) { setError('Describe what this payment is for.'); return }
    if (!checks || checks <= 0) { setError('Enter a valid amount.'); return }

    setSending(true)
    setError('')
    setNotice('')

    const { error: rpcError } = await supabase.rpc('create_payment_request', {
      p_business_id: businessMode.id,
      p_buyer_username: buyerUsername.trim().replace(/^@/, ''),
      p_description: description.trim(),
      p_amount_checks: checks,
    })
    setSending(false)

    if (rpcError) { setError('Could not send: ' + rpcError.message); return }

    setNotice(`Payment request sent to @${buyerUsername.trim().replace(/^@/, '')}.`)
    setBuyerUsername('')
    setDescription('')
    setAmountKsh('')
    setShowForm(false)
    load()
  }

  if (loading) return <RubiksLoader label="Loading payment requests…" />

  const pendingIncoming = incoming.filter((r) => r.status === 'pending')

  return (
    <div className="section" style={{ maxWidth: 560, textAlign: 'left' }}>
      {onBack && <button className="link-btn" onClick={onBack}>← Back</button>}
      <h2 style={{ marginBottom: 4 }}>Payment Requests</h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
        Agree on a price, then create a safe escrow order — no need for a listed product.
      </p>

      {error && (
        <div style={{ background: '#FCEBEB', border: '1px solid #F7C1C1', color: '#A32D2D', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {error}
          {error.includes('enough Checks') && (
            <> <button onClick={onOpenWallet} style={{ background: 'none', border: 'none', color: GREEN_DARK, fontWeight: 700, cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}>Top up now</button></>
          )}
        </div>
      )}
      {notice && (
        <div style={{ background: '#EAF8F3', border: '1px solid #BEE9DA', color: GREEN_DARK, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {notice}
        </div>
      )}

      {/* ── INCOMING (buyer side) ── */}
      <div style={{ marginBottom: 28 }}>
        <h4 style={{ marginBottom: 10 }}>
          Requests for you
          {pendingIncoming.length > 0 && (
            <span style={{ marginLeft: 8, background: '#FCEBEB', color: '#A32D2D', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
              {pendingIncoming.length} pending
            </span>
          )}
        </h4>

        {incoming.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No payment requests yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {incoming.map((req) => {
              const busy = busyId === req.id
              const buyerTotal = Math.round(req.amount_checks * 1.03 * 100) / 100
              const expired = new Date(req.expires_at) < new Date()
              const status = expired && req.status === 'pending' ? 'expired' : req.status

              return (
                <div key={req.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 14 }}>{req.businesses?.name}</p>
                      <p className="muted" style={{ fontSize: 13 }}>{req.description}</p>
                    </div>
                    <StatusPill status={status} />
                  </div>

                  <div style={{ background: 'var(--hover-bg)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span className="muted">Agreed amount</span>
                      <span style={{ fontWeight: 600 }}>{formatChecks(req.amount_checks)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span className="muted">Platform fee (3%)</span>
                      <span style={{ fontWeight: 600 }}>{formatChecks(Math.round((buyerTotal - req.amount_checks) * 100) / 100)}</span>
                    </div>
                    <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                      <span style={{ fontWeight: 700 }}>You pay</span>
                      <span style={{ fontWeight: 800, color: GREEN_DARK }}>{formatChecks(buyerTotal)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{formatKsh(checksToKsh(buyerTotal))}</div>
                  </div>

                  {req.status === 'pending' && !expired && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => accept(req)}
                        disabled={busy}
                        style={{ flex: 1, background: GREEN, color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
                      >
                        {busy ? 'Processing…' : 'Accept & pay into escrow'}
                      </button>
                      <button
                        onClick={() => decline(req)}
                        disabled={busy}
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 16px', fontSize: 13, cursor: 'pointer', color: 'var(--text-muted)' }}
                      >
                        Decline
                      </button>
                    </div>
                  )}

                  <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
                    Sent {new Date(req.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {req.status === 'pending' && !expired && ` · expires ${new Date(req.expires_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}`}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── OUTGOING (seller/business side) ── */}
      {businessMode && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h4 style={{ margin: 0 }}>Requests you've sent</h4>
            <button
              onClick={() => { setShowForm(!showForm); setError(''); setNotice('') }}
              style={{ background: GREEN, color: '#fff', border: 'none', borderRadius: 20, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              {showForm ? 'Cancel' : '+ New request'}
            </button>
          </div>

          {showForm && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 16 }}>
              <h4 style={{ marginBottom: 14 }}>New payment request</h4>

              <label style={labelStyle}>Buyer's BizCheck username</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>@</span>
                <input
                  type="text"
                  placeholder="username"
                  value={buyerUsername.replace(/^@/, '')}
                  onChange={(e) => setBuyerUsername(e.target.value.replace(/^@/, ''))}
                  style={inputStyle}
                />
              </div>

              <label style={{ ...labelStyle, marginTop: 12 }}>What is this payment for?</label>
              <input
                type="text"
                placeholder="e.g. Custom order — 2 dozen samosas"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={inputStyle}
              />

              <label style={{ ...labelStyle, marginTop: 12 }}>Amount (KSh)</label>
              <input
                type="number"
                inputMode="numeric"
                placeholder="e.g. 2400"
                value={amountKsh}
                onChange={(e) => setAmountKsh(e.target.value)}
                style={inputStyle}
              />
              {Number(amountKsh) > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
                  = {formatChecks(kshToChecks(Number(amountKsh)))} · buyer pays {formatChecks(Math.round(kshToChecks(Number(amountKsh)) * 1.03 * 100) / 100)} (incl. 3% fee) · you receive {formatChecks(Math.round(kshToChecks(Number(amountKsh)) * 0.97 * 100) / 100)} (after 3% fee)
                </div>
              )}

              <button
                onClick={sendRequest}
                disabled={sending}
                style={{ marginTop: 14, width: '100%', background: GREEN, color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.7 : 1 }}
              >
                {sending ? 'Sending…' : 'Send request'}
              </button>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                Requests expire after 7 days if not accepted. Maximum KSh 50,000 per request.
              </p>
            </div>
          )}

          {outgoing.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>No requests sent yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {outgoing.map((req) => {
                const expired = new Date(req.expires_at) < new Date()
                const status = expired && req.status === 'pending' ? 'expired' : req.status
                const busy = busyId === req.id
                const netPayout = Math.round(req.amount_checks * 0.97 * 100) / 100

                return (
                  <div key={req.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 14 }}>@{req.profiles?.username || 'user'}</p>
                        <p className="muted" style={{ fontSize: 13 }}>{req.description}</p>
                      </div>
                      <StatusPill status={status} />
                    </div>
                    <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
                      {formatChecks(netPayout)} <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>you receive</span>
                    </p>
                    <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                      Requested {formatChecks(req.amount_checks)} · buyer pays {formatChecks(Math.round(req.amount_checks * 1.03 * 100) / 100)}
                    </p>
                    {req.status === 'pending' && !expired && (
                      <button
                        onClick={() => cancelRequest(req)}
                        disabled={busy}
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', color: 'var(--text-muted)' }}
                      >
                        Cancel request
                      </button>
                    )}
                    {req.order_id && (
                      <button
                        onClick={() => onViewOrder?.()}
                        style={{ background: 'none', border: 'none', padding: 0, color: GREEN, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                      >
                        View order →
                      </button>
                    )}
                    <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
                      Sent {new Date(req.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }) {
  const map = {
    pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
    accepted: { bg: '#D1FAE5', color: '#065F46', label: 'Accepted' },
    declined: { bg: '#FEE2E2', color: '#991B1B', label: 'Declined' },
    cancelled: { bg: '#F3F4F6', color: '#6B7280', label: 'Cancelled' },
    expired: { bg: '#F3F4F6', color: '#6B7280', label: 'Expired' },
  }
  const s = map[status] || map.pending
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

const labelStyle = { fontSize: 12.5, color: 'var(--text-muted)', display: 'block', marginBottom: 5, fontWeight: 600 }
const inputStyle = { width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }
