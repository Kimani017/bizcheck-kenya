import { useState } from 'react'
import { supabase } from '../supabase'

export default function Pricing({ currentUser, businessMode, onBack }) {
  const [loadingPlan, setLoadingPlan] = useState(null)
  const [phone, setPhone] = useState('')
  const [promptSentFor, setPromptSentFor] = useState(null)
  const [bizCreditQty, setBizCreditQty] = useState(10)

  async function startCheckout({ paymentType, amount, billingCycle = null, businessId = null, label }) {
    if (!phone.trim()) { alert('Please enter your M-Pesa phone number first (e.g. 0712345678).'); return }
    setLoadingPlan(paymentType + (billingCycle || ''))
    setPromptSentFor(null)

    // 1. Create the pending payment record ourselves (allowed under RLS)
    const { data: payment, error: insertError } = await supabase.from('payments').insert({
      user_id: currentUser.id,
      business_id: businessId,
      payment_type: paymentType,
      billing_cycle: billingCycle,
      amount_kes: amount,
    }).select().single()

    if (insertError) { setLoadingPlan(null); alert('Error: ' + insertError.message); return }

    // 2. Ask the edge function to send the M-Pesa STK Push prompt
    const { data: sessionData } = await supabase.auth.getSession()
    try {
      const res = await fetch('${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mpesa-stk-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionData.session.access_token}` },
        body: JSON.stringify({
          payment_id: payment.id,
          amount,
          phone_number: phone.trim(),
          account_reference: 'BizCheck',
          description: label || 'BizCheck Kenya payment',
        }),
      })
      const result = await res.json()
      setLoadingPlan(null)

      if (!res.ok || !result.checkout_request_id) {
        alert('Could not send M-Pesa prompt: ' + (result.error || 'unknown error'))
        return
      }

      // Store the CheckoutRequestID so the callback can find this payment later
      await supabase.from('payments').update({ mpesa_checkout_request_id: result.checkout_request_id }).eq('id', payment.id)
      setPromptSentFor(paymentType + (billingCycle || ''))
    } catch (e) {
      setLoadingPlan(null)
      alert('Error starting checkout. Please try again.')
    }
  }

  const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, flex: 1, minWidth: 260 }
  const btnStyle = (disabled) => ({ width: '100%', padding: '11px', background: disabled ? 'var(--hover-bg)' : '#1D9E75', color: disabled ? 'var(--text-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', marginTop: 12 })

  return (
    <div className="section" style={{ maxWidth: 900 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>
      <h2 style={{ marginBottom: 6 }}>Pricing</h2>
      <p className="muted" style={{ marginBottom: 20 }}>Choose the plan that fits you. Payments are processed securely via M-Pesa.</p>

      <div className="form-group" style={{ maxWidth: 320, marginBottom: 24 }}>
        <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>M-Pesa phone number</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0712345678"
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
        />
      </div>

      {promptSentFor && (
        <div className="vote-msg" style={{ marginBottom: 20 }}>
          📲 Check your phone — enter your M-Pesa PIN to approve the payment. Your plan activates automatically once confirmed.
        </div>
      )}

      {!businessMode ? (
        <>
          <h3 style={{ marginBottom: 14 }}>For Users</h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
            <div style={cardStyle}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Search Credits</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1D9E75' }}>Ksh 27</div>
              <p className="muted" style={{ fontSize: 13 }}>5 credits to use across BizCheck. No subscription needed.</p>
              <button style={btnStyle(loadingPlan)} disabled={!!loadingPlan} onClick={() => startCheckout({ paymentType: 'search_credits', amount: 27 })}>
                {loadingPlan === 'search_credits' ? 'Starting…' : 'Buy credits'}
              </button>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Subscriber — Monthly</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1D9E75' }}>Ksh 67 <span style={{ fontSize: 13, fontWeight: 400 }}>first month</span></div>
              <p className="muted" style={{ fontSize: 13 }}>Then Ksh 167/month. Unlimited search, full features.</p>
              <button style={btnStyle(loadingPlan)} disabled={!!loadingPlan} onClick={() => startCheckout({ paymentType: 'user_subscription', amount: 67, billingCycle: 'monthly' })}>
                {loadingPlan === 'user_subscriptionmonthly' ? 'Starting…' : 'Subscribe monthly'}
              </button>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Subscriber — Annual</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1D9E75' }}>Ksh 1,764<span style={{ fontSize: 13, fontWeight: 400 }}>/year</span></div>
              <p className="muted" style={{ fontSize: 13 }}>12% off the monthly rate. Billed once a year.</p>
              <button style={btnStyle(loadingPlan)} disabled={!!loadingPlan} onClick={() => startCheckout({ paymentType: 'user_subscription', amount: 1764, billingCycle: 'annual' })}>
                {loadingPlan === 'user_subscriptionannual' ? 'Starting…' : 'Subscribe annually'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <h3 style={{ marginBottom: 14 }}>For Your Business — {businessMode.name}</h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
            <div style={cardStyle}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🟣 Full Control</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1D9E75' }}>Ksh 127 <span style={{ fontSize: 13, fontWeight: 400 }}>first month</span></div>
              <p className="muted" style={{ fontSize: 13 }}>Then Ksh 337/month. Dashboard, review replies, B2B, Report a User, purple badge.</p>
              <button style={btnStyle(loadingPlan)} disabled={!!loadingPlan} onClick={() => startCheckout({ paymentType: 'business_full_control', amount: 127, billingCycle: 'monthly', businessId: businessMode.id })}>
                {loadingPlan === 'business_full_controlmonthly' ? 'Starting…' : 'Get Full Control'}
              </button>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🟣 Full Control — Annual</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1D9E75' }}>Ksh 3,559<span style={{ fontSize: 13, fontWeight: 400 }}>/year</span></div>
              <p className="muted" style={{ fontSize: 13 }}>12% off the monthly rate. Same full experience, billed once a year.</p>
              <button style={btnStyle(loadingPlan)} disabled={!!loadingPlan} onClick={() => startCheckout({ paymentType: 'business_full_control', amount: 3559, billingCycle: 'annual', businessId: businessMode.id })}>
                {loadingPlan === 'business_full_controlannual' ? 'Starting…' : 'Get Full Control annually'}
              </button>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>⚡ Business Credits</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1D9E75' }}>
                Ksh {Math.round(Math.max(10, bizCreditQty) * 3.7)}
              </div>
              <p className="muted" style={{ fontSize: 13 }}>From Ksh 37 for 10 credits. Choose how many you want (minimum 10).</p>
              <input
                type="number"
                min={10}
                value={bizCreditQty}
                onChange={(e) => setBizCreditQty(parseInt(e.target.value) || 10)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface-2)', color: 'var(--text)', boxSizing: 'border-box', marginTop: 8 }}
              />
              <button
                style={btnStyle(loadingPlan)}
                disabled={!!loadingPlan || bizCreditQty < 10}
                onClick={() => startCheckout({ paymentType: 'business_credits', amount: Math.round(Math.max(10, bizCreditQty) * 3.7), businessId: businessMode.id, label: `${bizCreditQty} business credits` })}
              >
                {loadingPlan === 'business_credits' ? 'Starting…' : `Buy ${Math.max(10, bizCreditQty)} credits`}
              </button>
              {bizCreditQty < 10 && <p style={{ color: '#A32D2D', fontSize: 12, marginTop: 6 }}>Minimum purchase is 10 credits (Ksh 37).</p>}
            </div>
          </div>
        </>
      )}

      <p className="muted" style={{ fontSize: 12 }}>
        You'll get an M-Pesa prompt on your phone to approve the payment. Your plan activates automatically once payment is confirmed.
      </p>
    </div>
  )
}
