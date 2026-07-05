// BizCheck Kenya — notifies a business owner their business is verified,
// with their permanent business login code (bizcode)
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email, name, businessName, bizcode } = await req.json()

    if (!email || !bizcode) {
      return new Response(JSON.stringify({ error: 'Missing email or bizcode' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #085041;">🎉 ${businessName} is now verified!</h2>
        <p>Hi ${name || ''},</p>
        <p>Congratulations — your business has passed BizCheck Kenya's review and is now live for customers to see.</p>
        <p>To manage your business, log in to BizCheck and choose "Business account" when prompted, then enter this code:</p>
        <div style="background: #E1F5EE; border: 1px solid #9FE1CB; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 22px; font-weight: 700; letter-spacing: 2px; color: #085041; font-family: monospace;">${bizcode}</span>
        </div>
        <p style="color: #888; font-size: 13px;">Keep this code private — it's your permanent key to managing your business on BizCheck Kenya.</p>
      </div>
    `

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'BizCheck Kenya <noreply@contact.bizcheckkenya.com>',
        to: [email],
        subject: `${businessName} is verified! Here's your business code`,
        html,
      }),
    })

    const result = await response.json()
    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to send email', detail: result }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})