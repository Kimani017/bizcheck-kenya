// src/pages/access.js
// ─────────────────────────────────────────────────────────────────────────────
// Replaces CreditGate.jsx.
//
// What changed and why:
//
//   * No credits. Nothing to run out of mid-task, no second currency to learn.
//   * Checking a business is FREE — searching, viewing profiles, trust scores,
//     reviews, reporting scams. Charging for the safety action was working
//     against the reason the app exists.
//   * Metered actions have a visible monthly allowance the user can check at
//     any time, not an opaque balance.
//   * Structured results instead of string-matching error messages. The old
//     code did error.message.includes('insufficient_credits'), which breaks
//     silently the first time that wording changes.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../supabase'
import { handleError } from '../errors'

/**
 * Can the current user do this?
 *
 *   const access = await canDo('visual_scan')
 *   if (!access.allowed) { setGate(access); return }
 *
 * Returns:
 *   { allowed, tier, reason?, message?, used?, allowance?, remaining?, unlimited? }
 *
 * Fails OPEN. If the check itself errors, the user is allowed through — a
 * monitoring blip must never lock people out of a product they paid for.
 */
export async function canDo(action, businessId = null) {
  try {
    const { data, error } = await supabase.rpc('check_access', {
      p_action: action,
      p_business_id: businessId,
    })
    if (error) {
      handleError(error, 'canDo:' + action)
      return { allowed: true, tier: 'free', degraded: true }
    }
    return data
  } catch (err) {
    handleError(err, 'canDo:' + action)
    return { allowed: true, tier: 'free', degraded: true }
  }
}

/**
 * Record one use of a metered action. Call AFTER it succeeds — a failed scan
 * must not consume someone's allowance.
 */
export async function recordUse(action) {
  try {
    const { data, error } = await supabase.rpc('record_usage', { p_action: action })
    if (error) { handleError(error, 'recordUse:' + action); return null }
    return data
  } catch (err) {
    handleError(err, 'recordUse:' + action)
    return null
  }
}

/**
 * Check, run, then record — the common case in one call.
 *
 *   const result = await withAccess('visual_scan', async () => scanProduct(file))
 *   if (!result.ok) { setGate(result.access); return }
 *   use(result.value)
 *
 * The action only counts against the allowance if `fn` resolves without
 * throwing, so network failures and provider errors are free.
 */
export async function withAccess(action, fn, businessId = null) {
  const access = await canDo(action, businessId)
  if (!access.allowed) return { ok: false, access }

  try {
    const value = await fn()
    if (access.tier === 'metered' && !access.unlimited) {
      recordUse(action)          // fire and forget; never blocks the user
    }
    return { ok: true, value, access }
  } catch (err) {
    return { ok: false, error: handleError(err, 'withAccess:' + action), access }
  }
}

/** Everything the user has used this month, and what is always free. */
export async function getMyUsage() {
  try {
    const { data, error } = await supabase.rpc('get_my_usage')
    if (error) { handleError(error, 'getMyUsage'); return null }
    return data
  } catch (err) {
    handleError(err, 'getMyUsage')
    return null
  }
}

/** Pricing data straight from action_policy, so the page cannot drift. */
export async function getPricingInfo() {
  try {
    const { data, error } = await supabase.rpc('get_pricing_info')
    if (error) { handleError(error, 'getPricingInfo'); return null }
    return data
  } catch (err) {
    handleError(err, 'getPricingInfo')
    return null
  }
}