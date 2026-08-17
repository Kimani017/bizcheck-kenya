// src/pages/checksUtils.js
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the Checks ↔ KSh conversion rate.
//
// 1 Check = KSh 100
//
// ALL money display in the app must go through these helpers. Never write
// the rate as a raw number anywhere else — one constant here means one place
// to update if the rate ever changes again.
// ─────────────────────────────────────────────────────────────────────────────

export const KSH_PER_CHECK = 100   // 1 Check = KSh 100

export function checksToKsh(checks) {
  return Number(checks ?? 0) * KSH_PER_CHECK
}

export function kshToChecks(ksh) {
  return Number(ksh ?? 0) / KSH_PER_CHECK
}

export function formatChecks(checks) {
  const n = Number(checks ?? 0)
  // Show whole numbers cleanly, decimals only when needed
  return n % 1 === 0 ? `${n} Checks` : `${n.toFixed(2)} Checks`
}

export function formatKsh(ksh) {
  return `KSh ${Number(ksh ?? 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`
}

export function formatChecksAndKsh(checks) {
  return `${formatChecks(checks)} (${formatKsh(checksToKsh(checks))})`
}

// ── Fee calculators ───────────────────────────────────────────────────────────
// All fees in Checks, rounded to 2dp.

export const FEES = {
  BUYER_COMMISSION:     0.02,   // 2% added to buyer's checkout total
  SELLER_COMMISSION:    0.02,   // 2% deducted from seller's payout
  WITHDRAWAL:           0.02,   // 2% on withdrawal amount
  TRANSFER_USER_USER:   0.01,   // 1% on user→user check transfer
  TRANSFER_USER_BIZ:    0.02,   // 2% on user→business transfer (not a purchase)
}

export const SUBSCRIPTION = {
  USER_WEEKLY_CHECKS:     1,    // 1 Check/week
  BUSINESS_MONTHLY_CHECKS: 3,  // 3 Checks/month
  LISTING_FEE_CHECKS:    2.27, // one-time listing fee
  TRIAL_DAYS:             7,   // free trial for both users and businesses
}

export function buyerTotal(productPriceChecks) {
  const fee = Math.round(productPriceChecks * FEES.BUYER_COMMISSION * 100) / 100
  return { subtotal: productPriceChecks, fee, total: productPriceChecks + fee }
}

export function sellerPayout(productPriceChecks) {
  const commission = Math.round(productPriceChecks * FEES.SELLER_COMMISSION * 100) / 100
  return { gross: productPriceChecks, commission, net: productPriceChecks - commission }
}

export function withdrawalNet(checksRequested) {
  const fee = Math.round(checksRequested * FEES.WITHDRAWAL * 100) / 100
  return { requested: checksRequested, fee, net: checksRequested - fee }
}

export function transferFee(checks, type = 'user_user') {
  const rate = type === 'user_biz' ? FEES.TRANSFER_USER_BIZ : FEES.TRANSFER_USER_USER
  const fee = Math.round(checks * rate * 100) / 100
  return { amount: checks, fee, total: checks + fee }
}