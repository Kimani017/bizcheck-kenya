import { useState } from 'react'
import { supabase } from '../supabase'
import { WalletActionModal } from './WalletPage'
import { SUBSCRIPTION, formatChecks, formatKsh } from './checksUtils'

const GREEN      = '#1D9E75'
const GREEN_DARK = '#0F6E56'
const ORANGE     = '#EF9F27'
const RED        = '#E24B4A'

// ── Drop this anywhere inside BusinessPrivateDashboard ───────────────────────
// Shows the right message and action depending on where in the listing flow
// the business currently sits.
//
//   approved    → pay now or deposit first
//   fee_pending → waiting for enough balance; offer to deposit
//   trial       → trial countdown
//   suspended   → renew to come back online
//
// Usage:
//   <ListingFeeBanner
//     business={business}
//     currentUser={currentUser}
//     onStatusChange={(updated) => setSelectedBusiness(updated)}
//   />

export default function ListingFeeBanner({ business, currentUser, onStatusChange }) {
  const [paying, setPaying]         = useState(false)
  const [depositOpen, setDepositOpen] = useState(false)
  const [error, setError]           = useState('')
  const [notice, setNotice]         = useState('')

  const status = business?.subscription_status

  if (!status || status === 'unlisted' || status === 'active') return null

  async function payFee() {
    setPaying(true)
    setError('')
    setNotice('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('pay_listing_fee', {
        p_business_id: business.id,
      })
      if (rpcErr) throw rpcErr

      if (data?.paid) {
        setNotice('🎉 Listing fee paid! Your business is now live on BizCheck.')
        // Refresh business data so the banner disappears
        const { data: updated } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', business.id)
          .single()
        if (updated) onStatusChange?.(updated)
      } else {
        // Not enough balance — switch to fee_pending, offer deposit
        setNotice(
          `You need ${formatChecks(data?.shortfall ?? 0)} more. ` +
          `Deposit and the fee will be paid automatically.`
        )
        setDepositOpen(true)
        const { data: updated } = await supabase
          .from('businesses').select('*').eq('id', business.id).single()
        if (updated) onStatusChange?.(updated)
      }
    } catch (err) {
      setError(err.message?.includes('INSUFFICIENT_BALANCE')
        ? `Not enough Checks. Deposit ${formatChecks(SUBSCRIPTION.LISTING_FEE_CHECKS)} to pay the listing fee.`
        : err.message || 'Something went wrong. Please try again.')
    } finally {
      setPaying(false)
    }
  }

  function trialDaysLeft() {
    if (!business.subscription_trial_ends_at) return 7
    const ms = new Date(business.subscription_trial_ends_at) - new Date()
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
  }

  return (
    <>
      {/* ── APPROVED — needs to pay listing fee ─────────────────────────── */}
      {status === 'approved' && (
        <Banner color={GREEN}>
          <BannerIcon>✅</BannerIcon>
          <div style={{ flex: 1 }}>
            <BannerTitle>Your business has been approved!</BannerTitle>
            <BannerBody>
              Pay the one-time listing fee of{' '}
              <strong>{formatChecks(SUBSCRIPTION.LISTING_FEE_CHECKS)}</strong>{' '}
              ({formatKsh(SUBSCRIPTION.LISTING_FEE_CHECKS * 100)}) to go live on BizCheck
              and start your 7-day free trial.
            </BannerBody>
            {error  && <AlertBox type="error">{error}</AlertBox>}
            {notice && <AlertBox type="success">{notice}</AlertBox>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <BannerButton onClick={payFee} disabled={paying} primary>
                {paying ? 'Processing…' : `Pay ${formatChecks(SUBSCRIPTION.LISTING_FEE_CHECKS)} now`}
              </BannerButton>
              <BannerButton onClick={() => setDepositOpen(true)}>
                Deposit Checks first
              </BannerButton>
            </div>
          </div>
        </Banner>
      )}

      {/* ── FEE PENDING — waiting for deposit ───────────────────────────── */}
      {status === 'fee_pending' && (
        <Banner color={ORANGE}>
          <BannerIcon>⏳</BannerIcon>
          <div style={{ flex: 1 }}>
            <BannerTitle>Waiting for listing fee payment</BannerTitle>
            <BannerBody>
              Your business is approved. Once you deposit at least{' '}
              <strong>{formatChecks(SUBSCRIPTION.LISTING_FEE_CHECKS)}</strong>{' '}
              ({formatKsh(SUBSCRIPTION.LISTING_FEE_CHECKS * 100)}), the fee will be
              deducted automatically and your business will go live instantly.
            </BannerBody>
            {error  && <AlertBox type="error">{error}</AlertBox>}
            {notice && <AlertBox type="success">{notice}</AlertBox>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <BannerButton onClick={() => setDepositOpen(true)} primary>
                Deposit Checks
              </BannerButton>
              <BannerButton onClick={payFee} disabled={paying}>
                {paying ? 'Checking…' : 'Try paying now'}
              </BannerButton>
            </div>
          </div>
        </Banner>
      )}

      {/* ── TRIAL — countdown ────────────────────────────────────────────── */}
      {status === 'trial' && (
        <Banner color={GREEN}>
          <BannerIcon>🚀</BannerIcon>
          <div style={{ flex: 1 }}>
            <BannerTitle>
              Free trial — {trialDaysLeft()} day{trialDaysLeft() !== 1 ? 's' : ''} left
            </BannerTitle>
            <BannerBody>
              You have full access, zero commission on sales. After your trial,
              keep it going for just{' '}
              <strong>{formatChecks(3)}/month</strong> + 2% commission on completed sales.
              Keep at least 3 Checks in your wallet for auto-renewal.
            </BannerBody>
          </div>
        </Banner>
      )}

      {/* ── SUSPENDED — payment failed ───────────────────────────────────── */}
      {status === 'suspended' && (
        <Banner color={RED}>
          <BannerIcon>⚠️</BannerIcon>
          <div style={{ flex: 1 }}>
            <BannerTitle>Business suspended — insufficient balance</BannerTitle>
            <BannerBody>
              Your monthly subscription of <strong>{formatChecks(3)}</strong> could not
              be collected. Your business is hidden from the directory until renewed.
              Deposit at least 3 Checks and your subscription will auto-renew.
            </BannerBody>
            {error  && <AlertBox type="error">{error}</AlertBox>}
            {notice && <AlertBox type="success">{notice}</AlertBox>}
            <BannerButton onClick={() => setDepositOpen(true)} primary style={{ marginTop: 12 }}>
              Deposit to reactivate
            </BannerButton>
          </div>
        </Banner>
      )}

      {/* ── NEEDS REVIEW — fields incomplete ────────────────────────────── */}
      {status === 'unlisted' && business.auto_review_issues?.length > 0 && (
        <Banner color={ORANGE}>
          <BannerIcon>📋</BannerIcon>
          <div style={{ flex: 1 }}>
            <BannerTitle>Your application needs a few fixes</BannerTitle>
            <BannerBody>
              Our auto-review found the following issues. Fix them and we will
              re-review within 30 minutes:
            </BannerBody>
            <ul style={{ margin: '8px 0 0 16px', fontSize: 13, color: 'var(--text)' }}>
              {business.auto_review_issues.map((issue) => (
                <li key={issue} style={{ marginBottom: 4 }}>{issue}</li>
              ))}
            </ul>
          </div>
        </Banner>
      )}

      {/* Floating deposit modal */}
      {depositOpen && (
        <WalletActionModal
          mode="deposit"
          currentUser={currentUser}
          onClose={() => setDepositOpen(false)}
          onDone={() => {
            setDepositOpen(false)
            setNotice('Deposit received. If your balance now covers the listing fee, your business will go live automatically.')
          }}
        />
      )}
    </>
  )
}

// ── Small layout helpers ──────────────────────────────────────────────────────
function Banner({ color, children }) {
  return (
    <div style={{
      display: 'flex', gap: 14, padding: 18,
      background: color + '12',
      border: `1.5px solid ${color}40`,
      borderRadius: 14, marginBottom: 20,
    }}>
      {children}
    </div>
  )
}

function BannerIcon({ children }) {
  return <div style={{ fontSize: 24, flexShrink: 0, marginTop: 2 }}>{children}</div>
}

function BannerTitle({ children }) {
  return <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{children}</p>
}

function BannerBody({ children }) {
  return <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>{children}</p>
}

function BannerButton({ children, onClick, disabled, primary, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: primary ? GREEN : 'none',
        color: primary ? '#fff' : GREEN_DARK,
        border: primary ? 'none' : `1.5px solid ${GREEN}`,
        borderRadius: 10, padding: '9px 18px',
        fontSize: 13, fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function AlertBox({ type, children }) {
  const isError = type === 'error'
  return (
    <div style={{
      marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13,
      background: isError ? '#FCEBEB' : '#EAF8F3',
      color: isError ? '#A32D2D' : GREEN_DARK,
      border: `1px solid ${isError ? '#F7C1C1' : '#BEE9DA'}`,
    }}>
      {children}
    </div>
  )
}
