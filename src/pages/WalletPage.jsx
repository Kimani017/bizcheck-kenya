import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import RubiksLoader from './RubiksLoader'
import { formatChecks, formatKsh, checksToKsh, kshToChecks, KSH_PER_CHECK } from './checksUtils'
import { cache, TTL } from '../cache'

const GREEN = '#1D9E75'
const GREEN_DARK = '#0F6E56'

// ── Floating deposit/withdraw form ───────────────────────────────────────────
// Exported so BuyProductModal can open it directly without navigating away.
export function WalletActionModal({ mode, currentUser, onClose, onDone }) {
  const [amountKsh, setAmountKsh] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  if (!mode) return null

  async function handleDeposit() {
    const ksh = Number(amountKsh)
    if (!ksh || ksh < KSH_PER_CHECK) {
      setError(`Minimum deposit is ${formatKsh(KSH_PER_CHECK)} (1 Check).`)
      return
    }
    if (!phone.trim()) { setError('Enter the phone number to pay from.'); return }

    setBusy(true)
    setError('')
    try {
      const { data, error: fnError } = await supabase.functions.invoke('initiate-deposit', {
        body: { amount_ksh: ksh, phone: phone.trim() },
      })
      if (fnError) {
        let detail = fnError.message
        try { const body = await fnError.context.json(); if (body?.error) detail = body.error } catch {}
        throw new Error(detail)
      }
      if (data?.error) throw new Error(data.error)

      // Invalidate wallet cache so balance refreshes on next load
      cache.invalidate(`wallet:${currentUser?.id}`)

      setNotice('Check your phone and approve the M-Pesa prompt. Your Checks appear once payment confirms.')
      setAmountKsh('')
      setTimeout(() => { onDone?.(); onClose?.() }, 3000)
    } catch (err) {
      setError('Deposit failed: ' + (err?.message || 'Unknown error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleWithdraw() {
    const ksh = Number(amountKsh)
    const checks = kshToChecks(ksh)
    if (!checks || checks <= 0) { setError('Enter a valid amount.'); return }
    if (!phone.trim()) { setError('Enter the phone number to receive the money.'); return }

    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('request_withdrawal', {
      p_checks: checks,
      p_phone: phone.trim(),
    })
    setBusy(false)

    if (rpcError) { setError('Withdrawal failed: ' + rpcError.message); return }

    cache.invalidate(`wallet:${currentUser?.id}`)
    setNotice('Withdrawal requested. It will be sent to your phone once processed.')
    setAmountKsh('')
    setTimeout(() => { onDone?.(); onClose?.() }, 3000)
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 70 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: 24, maxWidth: 480, width: '100%', maxHeight: '80vh', overflowY: 'auto', textAlign: 'left' }}
      >
        <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 999, margin: '0 auto 18px' }} />

        <h3 style={{ marginBottom: 16 }}>
          {mode === 'deposit' ? '💰 Deposit Checks' : '📤 Withdraw to M-Pesa'}
        </h3>

        {error && (
          <div style={{ background: '#FCEBEB', border: '1px solid #F7C1C1', color: '#A32D2D', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}
        {notice && (
          <div style={{ background: '#EAF8F3', border: '1px solid #BEE9DA', color: GREEN_DARK, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
            {notice}
          </div>
        )}

        <label style={labelStyle}>Amount in KSh</label>
        <input
          type="number"
          inputMode="numeric"
          placeholder="e.g. 500"
          value={amountKsh}
          onChange={(e) => setAmountKsh(e.target.value)}
          style={inputStyle}
          autoFocus
        />
        {Number(amountKsh) > 0 && (
          <p className="muted" style={{ fontSize: 12.5, marginTop: -8, marginBottom: 12 }}>
            = {formatChecks(kshToChecks(Number(amountKsh)))}
          </p>
        )}

        <label style={labelStyle}>
          {mode === 'deposit' ? 'Pay from this M-Pesa number' : 'Send to this M-Pesa number'}
        </label>
        <input
          type="tel"
          placeholder="07XX XXX XXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={inputStyle}
        />

        <button
          onClick={mode === 'deposit' ? handleDeposit : handleWithdraw}
          disabled={busy}
          style={{ marginTop: 8, width: '100%', background: GREEN, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Please wait…' : mode === 'deposit' ? 'Continue to M-Pesa payment' : 'Request withdrawal'}
        </button>

        <button
          onClick={onClose}
          style={{ width: '100%', background: 'none', border: 'none', padding: '12px', marginTop: 6, fontSize: 13.5, color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main WalletPage ───────────────────────────────────────────────────────────
export default function WalletPage({ currentUser, onBack }) {
  const [wallet, setWallet] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [actionMode, setActionMode] = useState(null) // 'deposit' | 'withdraw'

  useEffect(() => { load() }, [currentUser?.id])

  async function load(forceRefresh = false) {
    if (!currentUser?.id) return
    setLoading(true)
    setError('')

    if (forceRefresh) {
      cache.invalidate(`wallet:${currentUser.id}`)
      cache.invalidate(`wallet_entries:${currentUser.id}`)
    }

    const [w, e] = await Promise.all([
      cache.get(
        `wallet:${currentUser.id}`,
        () => supabase.from('wallets').select('*').eq('user_id', currentUser.id)
               .maybeSingle().then(r => r.data || { balance: 0, held: 0 }),
        { ttl: TTL.WALLET }
      ),
      cache.get(
        `wallet_entries:${currentUser.id}`,
        () => supabase.from('wallet_entries').select('*').eq('user_id', currentUser.id)
               .order('created_at', { ascending: false }).limit(50)
               .then(r => r.data || []),
        { ttl: TTL.WALLET }
      ),
    ])

    setWallet(w)
    setEntries(e)
    setLoading(false)
  }

  if (loading) return <RubiksLoader label="Loading your wallet…" />

  const balance = Number(wallet?.balance || 0)
  const held = Number(wallet?.held || 0)

  return (
    <div className="section" style={{ maxWidth: 560, textAlign: 'left' }}>
      {onBack && <button className="link-btn" onClick={onBack}>← Back</button>}

      <h2 style={{ marginBottom: 4 }}>Your Checks</h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
        1 Check = {formatKsh(KSH_PER_CHECK)}. Checks you spend on an order are held safely until you confirm delivery.
      </p>

      {/* BALANCE CARD */}
      <div style={{ background: `linear-gradient(140deg, ${GREEN_DARK}, ${GREEN})`, borderRadius: 18, padding: 22, color: '#fff', marginBottom: 16 }}>
        <p style={{ fontSize: 12, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>Available</p>
        <p style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.1 }}>{formatChecks(balance)}</p>
        <p style={{ fontSize: 13, opacity: 0.9, marginBottom: held > 0 ? 14 : 0 }}>{formatKsh(checksToKsh(balance))}</p>
        {held > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 10, padding: '8px 12px', fontSize: 12.5 }}>
            🔒 {formatChecks(held)} held in open orders
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <button
          onClick={() => setActionMode('deposit')}
          style={{ flex: 1, background: GREEN, color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          Deposit
        </button>
        <button
          onClick={() => setActionMode('withdraw')}
          style={{ flex: 1, background: 'none', border: '1px solid var(--border)', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: 'var(--text)' }}
        >
          Withdraw
        </button>
      </div>

      {error && (
        <div style={{ background: '#FCEBEB', border: '1px solid #F7C1C1', color: '#A32D2D', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ background: '#EAF8F3', border: '1px solid #BEE9DA', color: GREEN_DARK, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {notice}
        </div>
      )}

      {/* LEDGER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h4>Transaction history</h4>
        <button
          onClick={() => load(true)}
          style={{ background: 'none', border: 'none', fontSize: 12, color: GREEN, cursor: 'pointer', fontWeight: 600 }}
        >
          Refresh
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>Nothing here yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {entries.map((e) => {
            const positive = Number(e.amount) > 0
            return (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600 }}>{labelForKind(e.kind)}</p>
                  {e.note && <p className="muted" style={{ fontSize: 12 }}>{e.note}</p>}
                  <p className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    {new Date(e.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: positive ? GREEN_DARK : '#A32D2D' }}>
                    {positive ? '+' : ''}{formatChecks(e.amount)}
                  </p>
                  <p className="muted" style={{ fontSize: 11 }}>bal {formatChecks(e.balance_after)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Floating action modal */}
      <WalletActionModal
        mode={actionMode}
        currentUser={currentUser}
        onClose={() => setActionMode(null)}
        onDone={() => load(true)}
      />
    </div>
  )
}

const labelStyle = { fontSize: 12.5, color: 'var(--text-muted)', display: 'block', marginBottom: 5, fontWeight: 600 }
const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10, marginBottom: 12,
  border: '1px solid var(--border)', fontSize: 14,
  background: 'var(--surface)', color: 'var(--text)',
}

function labelForKind(kind) {
  const map = {
    deposit: 'Deposit',
    order_hold: 'Held for order',
    order_release: 'Payment received',
    order_refund: 'Refund',
    withdrawal_request: 'Withdrawal',
    withdrawal_failed: 'Withdrawal returned',
    admin_adjustment: 'Adjustment by admin',
    credit_purchase: 'Credit purchase',
    subscription_payment: 'Subscription',
  }
  return map[kind] || kind
}
