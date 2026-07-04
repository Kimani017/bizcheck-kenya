// BizCheck Kenya — sends the secret admin activation code by email via Resend
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://bizcheck-kenya.vercel.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // Handle the browser's CORS preflight request
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
        <h2 style="color: #085041;">Welcome to the BizCheck Kenya admin team!</h2>
        <p>Hi ${name || ''},</p>
        <p>Your admin application has been approved. To activate your admin access, log in to BizCheck Kenya and enter this secret code:</p>
        <div style="background: #E1F5EE; border: 1px solid #9FE1CB; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 22px; font-weight: 700; letter-spacing: 2px; color: #085041; font-family: monospace;">${code}</span>
        </div>
        <p><a href="${SITE_URL}/#enterAdminCode" style="background: #1D9E75; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">Activate my admin access →</a></p>
        <p style="color: #888; font-size: 13px;">Keep this code private. If you did not apply for admin access, please ignore this email.</p>
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
        subject: 'Your BizCheck Kenya admin activation code',
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