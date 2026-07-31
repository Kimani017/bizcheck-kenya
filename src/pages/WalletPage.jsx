import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import RubiksLoader from './RubiksLoader'
import Icon from './Icon'
import { formatChecks, formatKsh, checksToKsh, kshToChecks, KSH_PER_CHECK } from './checksUtils'

const GREEN = '#1D9E75'
const GREEN_DARK = '#0F6E56'

export default function WalletPage({ currentUser, onBack }) {
  const [wallet, setWallet] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mode, setMode] = useState(null) // 'deposit' | 'withdraw'
  const [amountKsh, setAmountKsh] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [currentUser?.id])

  async function load() {
    if (!currentUser?.id) return
    setLoading(true)
    setError('')

    const [{ data: w }, { data: e }] = await Promise.all([
      supabase.from('wallets').select('*').eq('user_id', currentUser.id).maybeSingle(),
      supabase.from('wallet_entries').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(50),
    ])

    // A wallet row is created on first use — treat "none yet" as zero
    setWallet(w || { balance: 0, held: 0 })
    setEntries(e || [])
    setLoading(false)
  }

  async function handleDeposit() {
    const ksh = Number(amountKsh)
    if (!ksh || ksh < KSH_PER_CHECK) {
      setError(`Minimum deposit is ${formatKsh(KSH_PER_CHECK)} (1 Check).`)
      return
    }
    if (!phone.trim()) { setError('Enter the phone number to pay from.'); return }

    setBusy(true)
    setError('')
    setNotice('')
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

      setNotice('Check your phone and approve the payment prompt. Your Checks appear here once the payment confirms.')
      setAmountKsh('')
      setMode(null)
      setTimeout(load, 4000)
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
    if (checks > Number(wallet?.balance || 0)) { setError('You do not have that many Checks available.'); return }
    if (!phone.trim()) { setError('Enter the phone number to receive the money.'); return }

    setBusy(true)
    setError('')
    setNotice('')
    const { error: rpcError } = await supabase.rpc('request_withdrawal', {
      p_checks: checks,
      p_phone: phone.trim(),
    })
    setBusy(false)

    if (rpcError) { setError('Withdrawal failed: ' + rpcError.message); return }

    setNotice('Withdrawal requested. It will be sent to your phone once processed.')
    setAmountKsh('')
    setMode(null)
    load()
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
        <p style={{ fontSize: 13, opacity: 0.9, marginBottom: 14 }}>{formatKsh(checksToKsh(balance))}</p>

        {held > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 10, padding: '8px 12px', fontSize: 12.5 }}>
            🔒 {formatChecks(held)} held in open orders
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <button
          onClick={() => { setMode(mode === 'deposit' ? null : 'deposit'); setError(''); setNotice('') }}
          style={{ flex: 1, background: GREEN, color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          Deposit
        </button>
        <button
          onClick={() => { setMode(mode === 'withdraw' ? null : 'withdraw'); setError(''); setNotice('') }}
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

      {mode && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 20 }}>
          <h4 style={{ marginBottom: 12 }}>{mode === 'deposit' ? 'Deposit to your wallet' : 'Withdraw to M-Pesa'}</h4>

          <label style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Amount in KSh
          </label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 1200"
            value={amountKsh}
            onChange={(e) => setAmountKsh(e.target.value)}
            style={inputStyle}
          />
          {Number(amountKsh) > 0 && (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 4, marginBottom: 12 }}>
              = {formatChecks(kshToChecks(Number(amountKsh)))}
            </p>
          )}

          <label style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'block', marginBottom: 5, marginTop: 10, fontWeight: 600 }}>
            {mode === 'deposit' ? 'Pay from this number' : 'Send to this number'}
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
            style={{ marginTop: 14, width: '100%', background: GREEN, color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Please wait…' : mode === 'deposit' ? 'Continue to payment' : 'Request withdrawal'}
          </button>
        </div>
      )}

      {/* LEDGER */}
      <h4 style={{ marginBottom: 10 }}>Transaction history</h4>
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
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
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
  }
  return map[kind] || kind
}
