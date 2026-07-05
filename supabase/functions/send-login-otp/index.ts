// BizCheck Kenya — sends the admin login one-time code via Resend
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, name, code } = await req.json()

    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'Missing email or code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #085041;">BizCheck Kenya — Login verification</h2>
        <p>Hi ${name || ''},</p>
        <p>Someone is trying to log in to an admin account. If this is you, use the code below to continue:</p>
        <div style="background: #E1F5EE; border: 1px solid #9FE1CB; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 28px; font-weight: 700; letter-spacing: 4px; color: #085041; font-family: monospace;">${code}</span>
        </div>
        <p style="color: #888; font-size: 13px;">This code expires in 10 minutes. If you did not attempt to log in, please secure your account immediately.</p>
      </div>
    `

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'BizCheck Kenya <noreply@contact.bizcheckkenya.com>',
        to: [email],
        subject: 'Your BizCheck Kenya login code',
        html,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to send email', detail: result }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})