// supabase/functions/send-business-live-email/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Processes the pending_emails queue and sends via Resend.
// Called by cron every 5 minutes, or immediately after a business goes live.
// Idempotent — marks emails as sent before sending to avoid duplicates.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const resendKey   = Deno.env.get('RESEND_API_KEY')!
    const fromAddress = Deno.env.get('ADMIN_FROM_EMAIL')
      ?? 'BizCheck Kenya <noreply@support.bizcheckkenya.com>'

    // Get unsent emails
    const { data: emails, error } = await admin
      .from('pending_emails')
      .select('*')
      .eq('sent', false)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) return json({ error: error.message }, 500)
    if (!emails?.length) return json({ sent: 0, message: 'No pending emails' }, 200)

    let sent = 0
    let failed = 0

    for (const email of emails) {
      // Mark as sent BEFORE sending to prevent duplicates on retry
      await admin.from('pending_emails')
        .update({ sent: true })
        .eq('id', email.id)

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from:     fromAddress,
            to:       [email.to_email],
            subject:  email.subject,
            html:     email.html,
            reply_to: Deno.env.get('ADMIN_REPLY_TO') ?? 'support@bizcheckkenya.com',
          }),
        })

        if (res.ok) {
          sent++
        } else {
          // Unmark so it can be retried
          await admin.from('pending_emails')
            .update({ sent: false })
            .eq('id', email.id)
          failed++
        }
      } catch {
        await admin.from('pending_emails')
          .update({ sent: false })
          .eq('id', email.id)
        failed++
      }
    }

    return json({ sent, failed, total: emails.length }, 200)

  } catch (err) {
    console.error('send-business-live-email error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}