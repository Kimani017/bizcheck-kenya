// BizCheck Kenya — receives Safaricom's payment result callback
// after an STK Push completes (success or failure). Uses the
// SERVICE ROLE key since this runs with no logged-in user context.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const payload = await req.json()
    const callback = payload?.Body?.stkCallback

    if (!callback || !callback.CheckoutRequestID) {
      return new Response(JSON.stringify({ error: 'Malformed callback payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const checkoutRequestId = callback.CheckoutRequestID
    const resultCode = callback.ResultCode // 0 = success, anything else = failed/cancelled

    // Find the payment row we tagged with this CheckoutRequestID when we
    // initiated the STK push
    const { data: paymentRow } = await supabase
      .from('payments')
      .select('id')
      .eq('mpesa_checkout_request_id', checkoutRequestId)
      .single()

    if (!paymentRow) {
      // Nothing to update — acknowledge anyway so Safaricom doesn't retry forever
      return new Response(JSON.stringify({ success: true, note: 'No matching payment found' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (resultCode === 0) {
      const { error } = await supabase.rpc('activate_payment', { p_payment_id: paymentRow.id })
      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to activate payment', detail: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      await supabase.from('payments').update({ status: 'failed' }).eq('id', paymentRow.id)
    }

    // Safaricom expects this exact acknowledgement shape
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error', detail: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})