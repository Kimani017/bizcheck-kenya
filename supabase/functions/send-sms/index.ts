// BizCheck Kenya — Africa's Talking SMS Hook for Supabase Auth
const AT_API_KEY = Deno.env.get('AT_API_KEY') ?? ''
const AT_USERNAME = Deno.env.get('AT_USERNAME') ?? ''
const HOOK_SECRET = Deno.env.get('SEND_SMS_HOOK_SECRET') ?? ''

Deno.serve(async (req) => {
  try {
    // Verify the request is from Supabase
    const authHeader = req.headers.get('authorization') ?? ''
    if (HOOK_SECRET && authHeader !== `Bearer ${HOOK_SECRET}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const payload = await req.json()

    // Supabase Auth Hook sends: { user: {...}, sms: { otp: '123456' } }
    const phone = payload?.user?.phone
    const otp = payload?.sms?.otp

    if (!phone || !otp) {
      return new Response(JSON.stringify({ error: 'Missing phone or otp' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const message = `Your BizCheck Kenya verification code is: ${otp}. Valid for 10 minutes. Do not share this with anyone.`

    const body = new URLSearchParams({
      username: AT_USERNAME,
      to: phone,
      message,
    })

    const response = await fetch(
      'https://api.africastalking.com/version1/messaging',
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'apiKey': AT_API_KEY,
        },
        body: body.toString(),
      }
    )

    const result = await response.json()
    console.log('AT response:', JSON.stringify(result))

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to send SMS', detail: result }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Hook error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})