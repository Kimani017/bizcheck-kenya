import { useState, useEffect } from 'react'
import { getMyUsage } from './access'

const GREEN = '#1D9E75'
const GREEN_DARK = '#0F6E56'

// Shown when a metered allowance is used up or a plan feature is touched.
// Replaces InsufficientCreditsModal.
//
// The old modal said "Out of credits" and pointed at a shop. This one tells
// the user exactly what they used, when it resets, and — for metered actions —
// why the thing is not free. A user who understands the limit is far less
// annoyed by it than one who just hit a wall.
export function AccessGate({ access, onClose, onGoToPricing }) {
  if (!access || access.allowed) return null

  const isLogin    = access.reason === 'login_required'
  const isAllowance = access.reason === 'allowance_used'
  const isBusiness = access.reason === 'business_plan_required'

  const title = isLogin      ? 'Log in to continue'
              : isAllowance  ? "That's your free allowance for this month"
              : isBusiness   ? 'Part of the Business plan'
              :                'Part of the Plus plan'

  const icon  = isLogin ? '👋' : isAllowance ? '📅' : '✨'

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, maxWidth: 400, width: '100%', border: '1px solid var(--border)' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>{icon}</div>
          <h3 style={{ marginBottom: 8, color: 'var(--text-strong)' }}>{title}</h3>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
            {access.message || 'This needs a plan.'}
          </p>
        </div>

        {/* Exact numbers, not a vague "you're out". */}
        {isAllowance && access.allowance != null && (
          <div style={{ background: 'var(--hover-bg)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="muted">{access.label}</span>
              <span style={{ fontWeight: 700 }}>{access.used} of {access.allowance} used</span>
            </div>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: '#EF9F27' }} />
            </div>
          </div>
        )}

        {/* Say plainly why it is not free. */}
        {access.cost_note && (
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 16, fontStyle: 'italic' }}>
            {access.cost_note}
          </p>
        )}

        <div style={{ background: '#EAF8F3', border: '1px solid #BEE9DA', borderRadius: 10, padding: '12px 14px', marginBottom: 18, fontSize: 12.5, color: GREEN_DARK, lineHeight: 1.6 }}>
          <strong>Always free on BizCheck:</strong> searching businesses, viewing
          profiles and trust scores, reading reviews, and reporting scammers.
          Checking a seller never costs anything.
        </div>

        {!isLogin && (
          <button
            onClick={onGoToPricing}
            style={{ width: '100%', background: GREEN, color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}
          >
            See plans
          </button>
        )}
        <button
          onClick={onClose}
          style={{ width: '100%', background: 'none', border: 'none', padding: '10px', fontSize: 13.5, color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          {isAllowance ? 'Wait until next month' : 'Not now'}
        </button>
      </div>
    </div>
  )
}

// Drop into Settings so a user can always answer "what have I used?"
// without contacting support. Transparency is being able to check, not
// being told once at signup.
export function UsagePanel() {
  const [usage, setUsage] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMyUsage().then((u) => { setUsage(u); setLoading(false) })
  }, [])

  if (loading) return <p className="muted" style={{ fontSize: 13 }}>Loading your usage…</p>
  if (!usage?.logged_in) return null

  const resets = new Date(usage.period_end).toLocaleDateString('en-KE', { day: 'numeric', month: 'long' })

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h4 style={{ margin: 0 }}>This month</h4>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          background: usage.plan === 'active' ? '#EAF8F3' : 'var(--hover-bg)',
          color: usage.plan === 'active' ? GREEN_DARK : 'var(--text-muted)',
        }}>
          {usage.plan === 'active' ? 'Plus' : 'Free'}
        </span>
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>Resets on {resets}</p>

      {(usage.items || []).map((item) => (
        <div key={item.action} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
            <span>{item.label}</span>
            <span style={{ fontWeight: 600 }}>
              {item.unlimited ? 'Unlimited' : `${item.used} / ${item.allowance}`}
            </span>
          </div>
          {!item.unlimited && (
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(100, (item.used / Math.max(item.allowance, 1)) * 100)}%`,
                height: '100%',
                background: item.remaining === 0 ? '#E24B4A' : item.remaining <= 2 ? '#EF9F27' : GREEN,
                transition: 'width .3s',
              }} />
            </div>
          )}
        </div>
      ))}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
        <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: GREEN_DARK }}>Always free</p>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
          {(usage.always_free || []).join(' · ')}
        </p>
      </div>
    </div>
  )
}

// Back-compat shim so existing imports keep working during the switchover.
// Delete once nothing imports InsufficientCreditsModal.
export function InsufficientCreditsModal({ onClose, onGoToPricing, isBusiness }) {
  return (
    <AccessGate
      access={{
        allowed: false,
        reason: isBusiness ? 'business_plan_required' : 'plan_required',
        message: isBusiness
          ? 'This feature is part of the Business plan.'
          : 'This feature is part of the Plus plan.',
      }}
      onClose={onClose}
      onGoToPricing={onGoToPricing}
    />
  )
}
