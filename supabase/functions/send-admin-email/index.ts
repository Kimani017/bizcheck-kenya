// supabase/functions/send-admin-email/index.ts
// Sends transactional or broadcast emails via Resend.
// Only callable by users with role 'admin' or 'superadmin'.
//
// Prerequisites (Supabase secrets):
//   RESEND_API_KEY   – your Resend API key (re_xxxxxxxxxxxx)
//   ADMIN_FROM_EMAIL – e.g. "BizCheck Kenya <noreply@mail.bizcheckkenya.com>"
//                      Must be a domain you've verified in Resend.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_URL = 'https://api.resend.com/emails'
const BATCH_SIZE = 50   // Resend batch limit per request
const BATCH_DELAY = 500 // ms between batches to stay within rate limits

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    // Use service role to bypass RLS so we can read profiles.role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify the caller's JWT to get their user_id
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return json({ error: 'Admin access required' }, 403)
    }

    // ── 2. Parse body ────────────────────────────────────────────────────────
    const body = await req.json()
    const { mode, subject, bodyHtml } = body

    if (!mode || !subject?.trim() || !bodyHtml?.trim()) {
      return json({ error: 'mode, subject, and bodyHtml are required' }, 400)
    }

    const fromAddress = Deno.env.get('ADMIN_FROM_EMAIL') ?? 'BizCheck Kenya <noreply@mail.bizcheckkenya.com>'
    const resendKey = Deno.env.get('RESEND_API_KEY')!

    // ── 3. Individual send ───────────────────────────────────────────────────
    if (mode === 'individual') {
      const { recipientEmail } = body
      if (!recipientEmail?.trim()) return json({ error: 'recipientEmail is required for individual mode' }, 400)

      const result = await sendEmail(resendKey, {
        from: fromAddress,
        to: [recipientEmail.trim()],
        subject,
        html: wrapHtml(bodyHtml, subject),
      })

      if (!result.ok) return json({ error: result.error }, 502)
      return json({ sentTo: recipientEmail.trim() }, 200)
    }

    // ── 4. Broadcast send ────────────────────────────────────────────────────
    if (mode === 'broadcast') {
      const { target } = body // 'users' | 'businesses' | 'both'

      const emails = new Set<string>()

      if (target === 'users' || target === 'both') {
        const { data: users } = await supabase
          .from('profiles')
          .select('email')
          .not('email', 'is', null)
        users?.forEach((u) => { if (u.email) emails.add(u.email) })
      }

      if (target === 'businesses' || target === 'both') {
        // Use owner_email from businesses; fall back to owner's profile email
        const { data: bizOwners } = await supabase
          .from('businesses')
          .select('owner_email, owner_id')
          .eq('status', 'verified')
          .not('owner_id', 'is', null)

        const ownerIds = (bizOwners || [])
          .filter(b => !b.owner_email)
          .map(b => b.owner_id)

        if (ownerIds.length > 0) {
          const { data: ownerProfiles } = await supabase
            .from('profiles')
            .select('id, email')
            .in('id', ownerIds)

          const profileMap: Record<string, string> = {}
          ownerProfiles?.forEach((p) => { if (p.email) profileMap[p.id] = p.email })

          bizOwners?.forEach((b) => {
            const email = b.owner_email || profileMap[b.owner_id]
            if (email) emails.add(email)
          })
        } else {
          bizOwners?.forEach((b) => { if (b.owner_email) emails.add(b.owner_email) })
        }
      }

      const allEmails = Array.from(emails)
      const totalRecipients = allEmails.length

      if (totalRecipients === 0) {
        return json({ sent: 0, totalRecipients: 0, message: 'No recipients found.' }, 200)
      }

      // Send in batches
      let sent = 0
      for (let i = 0; i < allEmails.length; i += BATCH_SIZE) {
        const batch = allEmails.slice(i, i + BATCH_SIZE)

        // Resend recommends individual sends for transactional mail to avoid
        // unsubscribes affecting others. For small batches we send individually.
        await Promise.allSettled(
          batch.map((email) =>
            sendEmail(resendKey, {
              from: fromAddress,
              to: [email],
              subject,
              html: wrapHtml(bodyHtml, subject),
            })
          )
        ).then((results) => {
          sent += results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
        })

        // Pause between batches
        if (i + BATCH_SIZE < allEmails.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY))
        }
      }

      return json({ sent, totalRecipients }, 200)
    }

    return json({ error: `Unknown mode: ${mode}` }, 400)

  } catch (err) {
    console.error('send-admin-email error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sendEmail(apiKey: string, payload: {
  from: string
  to: string[]
  subject: string
  html: string
  reply_to?: string
}) {
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...payload,
        // Add a reply-to so users can reply to a monitored inbox
        reply_to: payload.reply_to ?? Deno.env.get('ADMIN_REPLY_TO') ?? payload.from,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      return { ok: false, error: err }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

function wrapHtml(content: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escHtml(title)}</title>
  <style>
    body{margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
    .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7}
    .header{background:#1D9E75;padding:24px 32px}
    .header img{height:36px}
    .header-title{color:#fff;font-size:22px;font-weight:700;margin:0;margin-top:8px}
    .body{padding:32px;color:#18181b;font-size:15px;line-height:1.7}
    .footer{padding:20px 32px;background:#f4f4f5;font-size:12px;color:#71717a;text-align:center}
    a{color:#1D9E75}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="header-title">BizCheck Kenya</div>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      © ${new Date().getFullYear()} BizCheck Kenya · <a href="https://www.bizcheckkenya.com">bizcheckkenya.com</a><br/>
      You received this email because you have an account on BizCheck Kenya.
    </div>
  </div>
</body>
</html>`
}

function escHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}