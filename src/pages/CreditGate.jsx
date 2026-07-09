import { supabase } from '../supabase'

// Call this before any credit-gated USER action (personal account).
// Returns { ok: true } on success, or { ok: false, insufficientCredits: true }
// if they need to buy more / subscribe.
export async function chargeUserCredits(action, cost) {
  const { error } = await supabase.rpc('charge_user_credits', { p_action: action, p_cost: cost })
  if (error) {
    if (error.message.includes('insufficient_credits')) return { ok: false, insufficientCredits: true }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

// Same, but for a BUSINESS account (Bizyangu) action.
export async function chargeBusinessCredits(businessId, action, cost) {
  const { error } = await supabase.rpc('charge_business_credits', { p_business_id: businessId, p_action: action, p_cost: cost })
  if (error) {
    if (error.message.includes('insufficient_credits')) return { ok: false, insufficientCredits: true }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

// Shared "you're out of credits" popup — every page uses this same one.
export function InsufficientCreditsModal({ onClose, onGoToPricing, isBusiness }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, maxWidth: 380, width: '100%', border: '1px solid var(--border)', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>💳</div>
        <h3 style={{ marginBottom: 8, color: 'var(--text-strong)' }}>Out of credits</h3>
        <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
          {isBusiness
            ? "Your business doesn't have enough credits for this action. Buy more, or upgrade to Full Control for unlimited access."
            : "You don't have enough credits for this action. Buy more, or subscribe for unlimited access."}
        </p>
        <button className="btn-primary" style={{ marginBottom: 10 }} onClick={onGoToPricing}>Buy credits / Subscribe →</button>
        <button className="link-btn" onClick={onClose}>Maybe later</button>
      </div>
    </div>
  )
}
