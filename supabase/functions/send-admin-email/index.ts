// supabase/functions/send-admin-email/index.ts
// Sends transactional or broadcast emails via Resend.
// Supports PDF attachments from local upload or Supabase Storage.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_URL = 'https://api.resend.com/emails'
const BATCH_SIZE = 50
const BATCH_DELAY = 500

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return json({ error: 'Admin access required' }, 403)
    }

    // ── 2. Parse body ────────────────────────────────────────────────────────
    // Body can contain:
    //   attachments: [{ filename, content (base64), storagePath }]
    //   storagePath  → file is fetched from Supabase Storage
    //   content      → file was uploaded directly (base64 string)
    const body = await req.json()
    const { mode, subject, bodyHtml, attachments = [] } = body

    if (!mode || !subject?.trim() || !bodyHtml?.trim()) {
      return json({ error: 'mode, subject, and bodyHtml are required' }, 400)
    }

    // ── 3. Resolve attachments ───────────────────────────────────────────────
    const resolvedAttachments: { filename: string; content: string }[] = []

    for (const att of attachments) {
      if (att.storagePath) {
        // Fetch from Supabase Storage
        const { data, error } = await supabase.storage
          .from(att.bucket || 'business-documents')
          .download(att.storagePath)

        if (error || !data) {
          console.error('Storage fetch error:', error)
          continue
        }

        const arrayBuffer = await data.arrayBuffer()
        const uint8 = new Uint8Array(arrayBuffer)
        // Safe base64 for large files in Deno — btoa(String.fromCharCode(...))
        // crashes on large buffers due to call stack limits. Use chunk-based approach.
        let binary = ''
        const chunkSize = 8192
        for (let i = 0; i < uint8.length; i += chunkSize) {
          binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize))
        }
        const base64 = btoa(binary)
        resolvedAttachments.push({ filename: att.filename, content: base64 })
      } else if (att.content) {
        // Already base64 from direct upload — pass through as-is
        resolvedAttachments.push({ filename: att.filename, content: att.content })
      }
    }

    const fromAddress = Deno.env.get('ADMIN_FROM_EMAIL') ?? 'BizCheck Kenya <noreply@support.bizcheckkenya.com>'
    const resendKey = Deno.env.get('RESEND_API_KEY')!

    // ── 4. Individual send ───────────────────────────────────────────────────
    if (mode === 'individual') {
      const { recipientEmail } = body
      if (!recipientEmail?.trim()) return json({ error: 'recipientEmail is required' }, 400)

      const result = await sendEmail(resendKey, {
        from: fromAddress,
        to: [recipientEmail.trim()],
        subject,
        html: wrapHtml(bodyHtml, subject),
        attachments: resolvedAttachments,
      })

      if (!result.ok) return json({ error: result.error }, 502)
      return json({ sentTo: recipientEmail.trim() }, 200)
    }

    // ── 5. Broadcast send ────────────────────────────────────────────────────
    if (mode === 'broadcast') {
      const { target } = body

      const emails = new Set<string>()

      if (target === 'users' || target === 'both') {
        const { data: users } = await supabase
          .from('profiles')
          .select('email')
          .not('email', 'is', null)
        users?.forEach((u: any) => { if (u.email) emails.add(u.email) })
      }

      if (target === 'businesses' || target === 'both') {
        const { data: bizOwners } = await supabase
          .from('businesses')
          .select('owner_email, owner_id')
          .eq('status', 'verified')
          .not('owner_id', 'is', null)

        const ownerIds = (bizOwners || [])
          .filter((b: any) => !b.owner_email)
          .map((b: any) => b.owner_id)

        if (ownerIds.length > 0) {
          const { data: ownerProfiles } = await supabase
            .from('profiles')
            .select('id, email')
            .in('id', ownerIds)

          const profileMap: Record<string, string> = {}
          ownerProfiles?.forEach((p: any) => { if (p.email) profileMap[p.id] = p.email })
          bizOwners?.forEach((b: any) => {
            const email = b.owner_email || profileMap[b.owner_id]
            if (email) emails.add(email)
          })
        } else {
          bizOwners?.forEach((b: any) => { if (b.owner_email) emails.add(b.owner_email) })
        }
      }

      const allEmails = Array.from(emails)
      const totalRecipients = allEmails.length

      if (totalRecipients === 0) {
        return json({ sent: 0, totalRecipients: 0, message: 'No recipients found.' }, 200)
      }

      let sent = 0
      for (let i = 0; i < allEmails.length; i += BATCH_SIZE) {
        const batch = allEmails.slice(i, i + BATCH_SIZE)
        await Promise.allSettled(
          batch.map((email) =>
            sendEmail(resendKey, {
              from: fromAddress,
              to: [email],
              subject,
              html: wrapHtml(bodyHtml, subject),
              attachments: resolvedAttachments,
            })
          )
        ).then((results) => {
          sent += results.filter((r) => r.status === 'fulfilled' && (r.value as any).ok).length
        })

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
  attachments?: { filename: string; content: string }[]
  reply_to?: string
}) {
  try {
    const body: Record<string, unknown> = {
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      reply_to: payload.reply_to ?? Deno.env.get('ADMIN_REPLY_TO') ?? payload.from,
    }

    if (payload.attachments && payload.attachments.length > 0) {
      body.attachments = payload.attachments.map((a) => {
        const ext = a.filename.split('.').pop()?.toLowerCase() || ''
        const contentTypeMap: Record<string, string> = {
          pdf: 'application/pdf',
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }
        return {
          filename: a.filename,
          content: a.content, // base64 string
          content_type: contentTypeMap[ext] || 'application/octet-stream',
        }
      })
    }

    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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