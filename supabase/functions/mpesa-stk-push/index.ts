// BizCheck Kenya — initiates an M-Pesa STK Push via Safaricom's
// Daraja API. Sends a payment prompt directly to the customer's phone.
const CONSUMER_KEY = Deno.env.get('MPESA_CONSUMER_KEY') ?? ''
const CONSUMER_SECRET = Deno.env.get('MPESA_CONSUMER_SECRET') ?? ''
const SHORTCODE = Deno.env.get('MPESA_SHORTCODE') ?? ''
const PASSKEY = Deno.env.get('MPESA_PASSKEY') ?? ''
// Sandbox by default — switch to https://api.safaricom.co.ke for production
const MPESA_BASE_URL = Deno.env.get('MPESA_BASE_URL') ?? 'https://sandbox.safaricom.co.ke'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function formatTimestamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

// Daraja requires the phone number in 254XXXXXXXXX format
function normalizePhone(phone: string) {
  let p = phone.trim().replace(/\s+/g, '')
  if (p.startsWith('0')) p = '254' + p.slice(1)
  if (p.startsWith('+')) p = p.slice(1)
  return p
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { payment_id, amount, phone_number, account_reference, description } = await req.json()

    if (!payment_id || !amount || !phone_number) {
      return new Response(JSON.stringify({ error: 'Missing payment_id, amount, or phone_number' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Get an OAuth access token
    const authString = btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`)
    const tokenRes = await fetch(`${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { 'Authorization': `Basic ${authString}` },
    })
    const tokenData = await tokenRes.json()

    if (!tokenRes.ok || !tokenData.access_token) {
      return new Response(JSON.stringify({ error: 'Failed to get M-Pesa access token', detail: tokenData }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Build the STK Push request
    const timestamp = formatTimestamp()
    const password = btoa(`${SHORTCODE}${PASSKEY}${timestamp}`)
    const phone = normalizePhone(phone_number)

    const stkRes = await fetch(`${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerBuyGoodsOnline',
        Amount: Math.round(amount),
        PartyA: phone,
        PartyB: SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: 'https://ubjndgyukfhngytfabnw.supabase.co/functions/v1/mpesa-callback',
        AccountReference: account_reference || 'BizCheck',
        TransactionDesc: description || 'BizCheck Kenya payment',
      }),
    })

    const stkData = await stkRes.json()

    if (!stkRes.ok || !stkData.CheckoutRequestID) {
      return new Response(JSON.stringify({ error: 'STK push failed', detail: stkData }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      success: true,
      checkout_request_id: stkData.CheckoutRequestID,
      merchant_request_id: stkData.MerchantRequestID,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error', detail: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})