// Shared formatting + status helpers for the Checks wallet and escrow.
// 1 Check = 100 KSh.

export const KSH_PER_CHECK = 100

export function checksToKsh(checks) {
  return Number(checks || 0) * KSH_PER_CHECK
}

export function kshToChecks(ksh) {
  return Number(ksh || 0) / KSH_PER_CHECK
}

// "C 12.00" — always two decimals so amounts line up in lists
export function formatChecks(checks) {
  return `C ${Number(checks || 0).toFixed(2)}`
}

export function formatKsh(ksh) {
  return `KSh ${Number(ksh || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`
}

// Both, for places where showing the real-money equivalent avoids confusion
export function formatBoth(checks) {
  return `${formatChecks(checks)} · ${formatKsh(checksToKsh(checks))}`
}

export const ORDER_STATUS = {
  held: {
    label: 'Payment held',
    color: '#92400E',
    bg: '#FEF3C7',
    buyerHint: 'Your Checks are safely held. The seller has been notified.',
    sellerHint: 'Payment is held in escrow. Ship the item, then mark it as sent.',
  },
  shipped: {
    label: 'Shipped',
    color: '#1E40AF',
    bg: '#DBEAFE',
    buyerHint: 'On its way. Confirm once you have received it.',
    sellerHint: 'Waiting on the buyer to confirm they received it.',
  },
  completed: {
    label: 'Completed',
    color: '#065F46',
    bg: '#D1FAE5',
    buyerHint: 'Done. The seller has been paid.',
    sellerHint: 'Paid — the Checks are in your balance.',
  },
  cancelled: {
    label: 'Cancelled',
    color: '#6B7280',
    bg: '#F3F4F6',
    buyerHint: 'Cancelled before shipping. Your Checks were returned.',
    sellerHint: 'The buyer cancelled before you shipped.',
  },
  refunded: {
    label: 'Refunded',
    color: '#991B1B',
    bg: '#FEE2E2',
    buyerHint: 'An admin refunded this order. Your Checks were returned.',
    sellerHint: 'An admin refunded this order to the buyer.',
  },
  admin_review: {
    label: 'Under review',
    color: '#7C2D12',
    bg: '#FFEDD5',
    buyerHint: 'A BizCheck admin is reviewing this order. Your Checks stay held meanwhile.',
    sellerHint: 'A BizCheck admin is reviewing this order.',
  },
}

export function statusInfo(status) {
  return ORDER_STATUS[status] || { label: status, color: '#6B7280', bg: '#F3F4F6' }
}

// Which of the three release keys are still outstanding
export function pendingKeys(order) {
  const missing = []
  if (!order.buyer_confirmed_at) missing.push('buyer')
  if (!order.seller_confirmed_at) missing.push('seller')
  if (!order.admin_confirmed_at) missing.push('admin')
  return missing
}

// Deposit swap fee (shown as a separate line at checkout, doesn't reduce Checks received)
export const SWAP_FEE_PERCENT = 3.5
export function swapFeeKsh(amountKsh) {
  return Math.round(amountKsh * SWAP_FEE_PERCENT) / 100
}