import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import RubiksLoader from './RubiksLoader'
import Icon from './Icon'
import { formatChecks, formatKsh, checksToKsh, kshToChecks, swapFeeKsh, SWAP_FEE_PERCENT } from './checksUtils'

const GREEN = '#1D9E75'
const GREEN_DARK = '#0F6E56'

const CREDIT_PACKAGES = [
  { credits: 5,  ksh: 50,  label: '5 searches',  popular: false },
  { credits: 20, ksh: 150, label: '20 searches', popular: true  },
  { credits: 50, ksh: 300, label: '50 searches', popular: false },
]

const SUBSCRIPTION_PLANS = [
  {
    type: 'full_control',
    label: 'Full Control',
    desc: 'Product catalog, AI photos, market posting, QR storefront, visual search, full analytics',
    monthly_ksh: 2500,
    annual_ksh: 24000,
  },
]

export default function CreditStorePage({ currentUser, businessMode, onBack, onOpenWallet }) {
  const [wallet, setWallet] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('credits')
  const [payMethod, setPayMethod] = useState('checks')
  const [billing, setBilling] = useState('monthly')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pesapalUrl, setPesapalUrl] = useState(null)   // set → modal opens

  useEffect(() => { load() }, [currentUser?.id])

  async function load() {
    if (!currentUser?.id) return
    setLoading(true)
    const { data: w } = await supabase.from('wallets').select('*').eq('user_id', currentUser.id).maybeSingle()
    setWallet(w || { balance: 0 })
    setLoading(false)
  }

  // ── Checks path (instant) ────────────────────────────────────────────

  async function buyCreditsWithChecks(pkg) {
    setBusy(`credits-${pkg.credits}`)
    setError('')
    setNotice('')
    const { error: rpcError } = await supabase.rpc('buy_credits_with_checks', {
      p_credits: pkg.credits,
      p_checks_cost: kshToChecks(pkg.ksh),
    })
    setBusy(null)
    if (rpcError) {
      setError(rpcError.message.toLowerCase().includes('insufficient')
        ? `You need ${formatChecks(kshToChecks(pkg.ksh))} but only have ${formatChecks(wallet?.balance || 0)}.`
        : 'Purchase failed: ' + rpcError.message)
      return
    }
    setNotice(`✓ ${pkg.credits} search credits added to your account.`)
    load()
  }

  async function buySubscriptionWithChecks(plan) {
    if (!businessMode?.id) { setError('Switch to your business account first.'); return }
    const ksh = billing === 'annual' ? plan.annual_ksh : plan.monthly_ksh
    const checks = kshToChecks(ksh)
    setBusy(`sub-${plan.type}-${billing}`)
    setError('')
    setNotice('')
    const { error: rpcError } = await supabase.rpc('pay_subscription_with_checks', {
      p_business_id: businessMode.id,
      p_plan_type: plan.type,
      p_billing_cycle: billing,
      p_checks_cost: checks,
    })
    setBusy(null)
    if (rpcError) {
      setError(rpcError.message.toLowerCase().includes('insufficient')
        ? `You need ${formatChecks(checks)} but only have ${formatChecks(wallet?.balance || 0)}.`
        : 'Could not activate plan: ' + rpcError.message)
      return
    }
    setNotice(`✓ ${plan.label} plan activated${billing === 'annual' ? ' for 1 year' : ' for this month'}.`)
    load()
  }

  // ── PesaPal path (M-Pesa / card / bank) ─────────────────────────────
  // Opens PesaPal's own payment screen as an iframe modal — no redirect.
  // The user picks M-Pesa, Visa, Mastercard, Equity, Coop, etc. on
  // PesaPal's page. Once they pay, the IPN webhook fires and credits the
  // Checks to their wallet automatically. No pre-deposit step.

  async function openPesapalModal(ksh) {
    setBusy('pesapal')
    setError('')
    setNotice('')

    const { data, error: fnError } = await supabase.functions.invoke('initiate-deposit', {
      body: { amount_ksh: ksh },
    })
    setBusy(null)

    if (fnError || data?.error) {
      let detail = data?.error || fnError?.message
      try { const body = await fnError?.context?.json(); if (body?.error) detail = body.error } catch {}
      setError('Could not open payment page: ' + detail)
      return
    }

    setPesapalUrl(data.redirect_url)
  }

  function closePesapalModal() {
    setPesapalUrl(null)
    setNotice('Payment submitted. Your Checks will appear once the payment confirms — this usually takes a few seconds for M-Pesa, or a moment for cards.')
    load()
  }

  if (loading) return <RubiksLoader label="Loading…" />

  const balance = Number(wallet?.balance || 0)

  return (
    <div className="section" style={{ maxWidth: 520, textAlign: 'left' }}>
      {onBack && <button className="link-btn" onClick={onBack}>← Back</button>}
      <h2 style={{ marginBottom: 4 }}>Buy Credits & Plans</h2>

      {/* Balance pill */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#EAF8F3', border: '1px solid #BEE9DA', borderRadius: 999, padding: '6px 14px', marginBottom: 18, fontSize: 13 }}>
        <span style={{ color: GREEN_DARK, fontWeight: 700 }}>Wallet: {formatChecks(balance)}</span>
        <button onClick={onOpenWallet} style={{ background: 'none', border: 'none', color: GREEN, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
          Top up
        </button>
      </div>

      {error && (
        <div style={{ background: '#FCEBEB', border: '1px solid #F7C1C1', color: '#A32D2D', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {error}
          {error.includes('only have') && (
            <> <button onClick={onOpenWallet} style={{ background: 'none', border: 'none', color: GREEN_DARK, fontWeight: 700, cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}>
              Deposit now →
            </button></>
          )}
        </div>
      )}
      {notice && (
        <div style={{ background: '#EAF8F3', border: '1px solid #BEE9DA', color: GREEN_DARK, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {notice}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        {[['credits', 'Search Credits'], ['subscriptions', 'Business Plans']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => { setTab(id); setError(''); setNotice('') }}
            style={{ padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: tab === id ? GREEN : 'var(--text-muted)', borderBottom: tab === id ? `3px solid ${GREEN}` : '3px solid transparent' }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Payment method */}
      <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Pay with</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
        {[
          ['checks', 'Checks', `${formatChecks(balance)} available`],
          ['pesapal', 'M-Pesa / Card / Bank', `+${SWAP_FEE_PERCENT}% swap fee`],
        ].map(([id, label, sub]) => (
          <button
            key={id}
            onClick={() => setPayMethod(id)}
            style={{
              padding: '10px 8px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              border: payMethod === id ? `2px solid ${GREEN}` : '1px solid var(--border)',
              background: payMethod === id ? '#EAF8F3' : 'var(--surface)',
              color: payMethod === id ? GREEN_DARK : 'var(--text)',
              gridColumn: id === 'pesapal' ? 'span 2' : 'span 1',
            }}
          >
            {label}
            <div style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
          </button>
        ))}
      </div>

      {payMethod === 'pesapal' && (
        <div style={{ background: '#EAF8F3', border: '1px solid #BEE9DA', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: GREEN_DARK }}>
          PesaPal will open inside the app. Choose M-Pesa for an instant STK push to your phone, or pay by Visa, Mastercard, Airtel Money, Equity or Coop Bank — all supported. Your Checks are credited automatically once payment confirms.
        </div>
      )}

      {/* ── CREDITS ── */}
      {tab === 'credits' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {CREDIT_PACKAGES.map((pkg) => {
            const checks = kshToChecks(pkg.ksh)
            const canAfford = balance >= checks
            const isBusy = busy === `credits-${pkg.credits}`
            const totalKsh = pkg.ksh + (payMethod === 'pesapal' ? swapFeeKsh(pkg.ksh) : 0)

            return (
              <div key={pkg.credits} style={{ border: `1px solid ${pkg.popular ? GREEN : 'var(--border)'}`, borderRadius: 14, padding: 16, background: 'var(--surface)', position: 'relative' }}>
                {pkg.popular && (
                  <span style={{ position: 'absolute', top: -10, left: 16, background: GREEN, color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '2px 10px', borderRadius: 999 }}>
                    Most popular
                  </span>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 15 }}>{pkg.label}</p>
                    <p className="muted" style={{ fontSize: 13 }}>Search and verify businesses</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontWeight: 800, fontSize: 16, color: GREEN_DARK }}>{formatKsh(pkg.ksh)}</p>
                    {payMethod === 'checks' && <p className="muted" style={{ fontSize: 12 }}>{formatChecks(checks)}</p>}
                    {payMethod === 'pesapal' && swapFeeKsh(pkg.ksh) > 0 && (
                      <p className="muted" style={{ fontSize: 11 }}>+{formatKsh(swapFeeKsh(pkg.ksh))} swap fee</p>
                    )}
                  </div>
                </div>

                <button
                  disabled={isBusy || busy === 'pesapal' || (payMethod === 'checks' && !canAfford)}
                  onClick={() => {
                    if (payMethod === 'checks') buyCreditsWithChecks(pkg)
                    else openPesapalModal(totalKsh)
                  }}
                  style={{
                    width: '100%', border: 'none', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 700,
                    background: (payMethod === 'checks' && !canAfford) ? 'var(--hover-bg)' : GREEN,
                    color: (payMethod === 'checks' && !canAfford) ? 'var(--text-muted)' : '#fff',
                    cursor: isBusy || (payMethod === 'checks' && !canAfford) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isBusy || busy === 'pesapal' ? 'Opening payment…' :
                   payMethod === 'checks' && !canAfford ? `Need ${formatChecks(checks - balance)} more` :
                   payMethod === 'pesapal' ? `Pay ${formatKsh(totalKsh)} — choose method` :
                   'Buy with Checks'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── SUBSCRIPTIONS ── */}
      {tab === 'subscriptions' && (
        <div>
          {!businessMode && (
            <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              Switch to your business account to manage a subscription.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {[['monthly', 'Monthly'], ['annual', 'Annual (save ~20%)']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setBilling(id)}
                style={{
                  flex: 1, padding: '9px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: billing === id ? `2px solid ${GREEN}` : '1px solid var(--border)',
                  background: billing === id ? '#EAF8F3' : 'var(--surface)',
                  color: billing === id ? GREEN_DARK : 'var(--text)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {SUBSCRIPTION_PLANS.map((plan) => {
            const ksh = billing === 'annual' ? plan.annual_ksh : plan.monthly_ksh
            const checks = kshToChecks(ksh)
            const canAfford = balance >= checks
            const isBusy = busy === `sub-${plan.type}-${billing}`
            const totalKsh = ksh + (payMethod === 'pesapal' ? swapFeeKsh(ksh) : 0)

            return (
              <div key={plan.type} style={{ border: `1px solid ${GREEN}`, borderRadius: 14, padding: 18, background: 'var(--surface)', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                    <p style={{ fontWeight: 800, fontSize: 16 }}>{plan.label}</p>
                    <p className="muted" style={{ fontSize: 13 }}>{plan.desc}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontWeight: 800, fontSize: 17, color: GREEN_DARK }}>{formatKsh(ksh)}</p>
                    <p className="muted" style={{ fontSize: 11.5 }}>per {billing === 'annual' ? 'year' : 'month'}</p>
                    {payMethod === 'checks' && <p className="muted" style={{ fontSize: 12 }}>{formatChecks(checks)}</p>}
                    {payMethod === 'pesapal' && swapFeeKsh(ksh) > 0 && (
                      <p className="muted" style={{ fontSize: 11 }}>+{formatKsh(swapFeeKsh(ksh))} swap fee</p>
                    )}
                  </div>
                </div>

                <button
                  disabled={!businessMode || isBusy || busy === 'pesapal' || (payMethod === 'checks' && !canAfford)}
                  onClick={() => {
                    if (payMethod === 'checks') buySubscriptionWithChecks(plan)
                    else openPesapalModal(totalKsh)
                  }}
                  style={{
                    width: '100%', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700,
                    background: !businessMode || (payMethod === 'checks' && !canAfford) ? 'var(--hover-bg)' : GREEN,
                    color: !businessMode || (payMethod === 'checks' && !canAfford) ? 'var(--text-muted)' : '#fff',
                    cursor: !businessMode || isBusy || (payMethod === 'checks' && !canAfford) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isBusy || busy === 'pesapal' ? 'Opening payment…' :
                   !businessMode ? 'Switch to business account first' :
                   payMethod === 'checks' && !canAfford ? `Need ${formatChecks(checks - balance)} more` :
                   payMethod === 'pesapal' ? `Pay ${formatKsh(totalKsh)} — choose method` :
                   `Activate ${billing === 'annual' ? 'annual' : 'monthly'} plan`}
                </button>
              </div>
            )
          })}

          <p className="muted" style={{ fontSize: 12 }}>
            Subscriptions extend from your current expiry — paying early never wastes time.
          </p>
        </div>
      )}

      {/* ── PESAPAL PAYMENT MODAL ── */}
      {pesapalUrl && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <p style={{ fontWeight: 700, fontSize: 15 }}>Pay securely</p>
              <p className="muted" style={{ fontSize: 12 }}>Powered by PesaPal</p>
            </div>

            <iframe
              src={pesapalUrl}
              title="PesaPal payment"
              style={{ width: '100%', height: 480, border: 'none' }}
              allow="payment"
            />

            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', background: '#F9F9F9' }}>
              <button
                onClick={closePesapalModal}
                style={{ width: '100%', background: GREEN, color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                Done — I completed the payment
              </button>
              <button
                onClick={() => setPesapalUrl(null)}
                style={{ width: '100%', background: 'none', border: 'none', padding: '10px', marginTop: 4, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
