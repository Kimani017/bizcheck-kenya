import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { formatChecks, formatKsh, checksToKsh, kshToChecks } from './checksUtils'

const GREEN = '#1D9E75'
const GREEN_DARK = '#0F6E56'

// Buy flow for a single product. Shows the price in Checks, warns if the
// buyer doesn't have enough, and places an escrow order via place_order.
export default function BuyProductModal({ product, currentUser, onClose, onOrdered, onOpenWallet }) {
  const [quantity, setQuantity] = useState(1)
  const [size, setSize] = useState('')
  const [color, setColor] = useState('')
  const [note, setNote] = useState('')
  const [wallet, setWallet] = useState(null)
  const [loading, setLoading] = useState(true)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadWallet() }, [currentUser?.id])

  async function loadWallet() {
    if (!currentUser?.id) { setLoading(false); return }
    const { data } = await supabase.from('wallets').select('*').eq('user_id', currentUser.id).maybeSingle()
    setWallet(data || { balance: 0, held: 0 })
    setLoading(false)
  }

  const unitChecks = kshToChecks(product?.price || 0)
  const baseTotal = unitChecks * quantity
  const buyerFee = Math.round(baseTotal * 0.03 * 100) / 100
  const totalChecks = Math.round((baseTotal + buyerFee) * 100) / 100
  const balance = Number(wallet?.balance || 0)
  const shortfall = Math.max(0, totalChecks - balance)
  const canAfford = shortfall <= 0

  async function placeOrder() {
    if (!currentUser) { setError('Please log in to place an order.'); return }
    setPlacing(true)
    setError('')

    const { data, error: rpcError } = await supabase.rpc('place_order', {
      p_product_id: product.id,
      p_quantity: quantity,
      p_size: size || null,
      p_color: color || null,
      p_delivery_note: note || null,
    })

    setPlacing(false)

    if (rpcError) { setError(rpcError.message); return }
    onOrdered?.(data)
  }

  if (!product) return null

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 60 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: 22, maxWidth: 480, width: '100%', maxHeight: '88vh', overflowY: 'auto', textAlign: 'left' }}
      >
        <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 999, margin: '0 auto 16px' }} />

        <h3 style={{ marginBottom: 4 }}>{product.name}</h3>
        <p style={{ fontSize: 20, fontWeight: 800, color: GREEN_DARK, marginBottom: 2 }}>
          {formatChecks(unitChecks)}
        </p>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
          {formatKsh(product.price)} each · {product.quantity} in stock
        </p>

        {/* Quantity */}
        <label style={labelStyle}>Quantity</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} style={stepBtn}>−</button>
          <span style={{ fontSize: 16, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{quantity}</span>
          <button
            onClick={() => setQuantity((q) => Math.min(product.quantity || 1, q + 1))}
            style={stepBtn}
          >+</button>
        </div>

        {product.sizes?.length > 0 && (
          <>
            <label style={labelStyle}>Size</label>
            <select value={size} onChange={(e) => setSize(e.target.value)} style={inputStyle}>
              <option value="">Select a size</option>
              {product.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </>
        )}

        {product.colors?.length > 0 && (
          <>
            <label style={labelStyle}>Colour</label>
            <select value={color} onChange={(e) => setColor(e.target.value)} style={inputStyle}>
              <option value="">Select a colour</option>
              {product.colors.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </>
        )}

        <label style={labelStyle}>Delivery note (optional)</label>
        <textarea
          rows={2}
          placeholder="Where should it be delivered?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' }}
        />

        {/* Total + balance */}
        <div style={{ background: 'var(--hover-bg)', borderRadius: 12, padding: 14, margin: '14px 0' }}>
          <Row label="Subtotal" value={formatChecks(baseTotal)} muted />
          <Row label="Platform fee (3%)" value={formatChecks(buyerFee)} muted />
          <Row label="Total" value={formatChecks(totalChecks)} bold />
          <Row label="In real money" value={formatKsh(checksToKsh(totalChecks))} muted />
          <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
          <Row label="Your balance" value={loading ? '…' : formatChecks(balance)} muted />
        </div>

        {!canAfford && !loading && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
            You need {formatChecks(shortfall)} more ({formatKsh(checksToKsh(shortfall))}).{' '}
            <button
              onClick={onOpenWallet}
              style={{ background: 'none', border: 'none', padding: 0, color: GREEN_DARK, fontWeight: 700, cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
            >
              Deposit now
            </button>
          </div>
        )}

        {error && (
          <div style={{ background: '#FCEBEB', border: '1px solid #F7C1C1', color: '#A32D2D', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Your Checks are held by BizCheck, not sent to the seller. They're released only after you,
          the seller and a BizCheck admin all confirm — or returned to you if something goes wrong.
        </p>

        <button
          onClick={placeOrder}
          disabled={!canAfford || placing || loading}
          style={{
            width: '100%', border: 'none', borderRadius: 12, padding: '13px',
            fontSize: 14.5, fontWeight: 700,
            background: canAfford ? GREEN : 'var(--hover-bg)',
            color: canAfford ? '#fff' : 'var(--text-muted)',
            cursor: canAfford && !placing ? 'pointer' : 'not-allowed',
          }}
        >
          {placing ? 'Placing order…' : `Place order · ${formatChecks(totalChecks)}`}
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

function Row({ label, value, bold, muted }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: bold ? 15 : 13, marginBottom: 4 }}>
      <span className={muted ? 'muted' : undefined}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600 }} className={muted ? 'muted' : undefined}>{value}</span>
    </div>
  )
}

const labelStyle = { fontSize: 12.5, color: 'var(--text-muted)', display: 'block', marginBottom: 5, fontWeight: 600 }
const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10, marginBottom: 12,
  border: '1px solid var(--border)', fontSize: 14,
  background: 'var(--surface)', color: 'var(--text)',
}
const stepBtn = {
  width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', fontSize: 18, cursor: 'pointer',
}
