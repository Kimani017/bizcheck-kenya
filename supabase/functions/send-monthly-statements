// supabase/functions/send-monthly-statements/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Admin clicks one button; every user with wallet activity that month gets a
// receipt by email. Reuses the Resend setup from send-admin-email.
//
// Two behaviours worth knowing about:
//
//   * DRY RUN by default. The first call reports how many people WOULD be
//     emailed. Sending needs confirm:true. Broadcasting a wrong month to
//     every user is not undoable.
//
//   * Idempotent per user per month. The send is recorded BEFORE the email
//     goes out, so a retry after a timeout resumes rather than double-sending.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_URL  = 'https://api.resend.com/emails'
const BATCH_SIZE  = 25
const BATCH_PAUSE = 1000

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const asUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await asUser.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: profile } = await admin
      .from('profiles').select('role').eq('id', user.id).single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return json({ error: 'Admin access required' }, 403)
    }

    const body = await req.json()
    const { year, month, confirm = false } = body

    if (!year || !month || month < 1 || month > 12) {
      return json({ error: 'Valid year and month (1-12) are required' }, 400)
    }

    // Refuse future or in-progress months — a statement for a month that has
    // not finished is wrong by definition.
    const now = new Date()
    const requested = new Date(year, month - 1, 1)
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    if (requested >= thisMonth) {
      return json({ error: 'That month has not finished yet. Statements can only be sent for completed months.' }, 400)
    }

    const { data: recipients, error: recError } = await admin
      .rpc('get_statement_recipients', { p_year: year, p_month: month })

    if (recError) return json({ error: 'Could not build recipient list: ' + recError.message }, 500)
    if (!recipients?.length) return json({ recipients: 0, message: 'No wallet activity that month.' }, 200)

    const { data: alreadySent } = await admin
      .from('statement_sends')
      .select('user_id')
      .eq('year', year).eq('month', month).eq('status', 'sent')

    const sentIds = new Set((alreadySent || []).map((r: any) => r.user_id))
    const pending = recipients.filter((r: any) => !sentIds.has(r.user_id))

    // ── Dry run ────────────────────────────────────────────────────────────
    if (!confirm) {
      return json({
        dryRun: true,
        totalWithActivity: recipients.length,
        alreadySent: sentIds.size,
        wouldSend: pending.length,
        message: `${pending.length} statement(s) ready to send for ${monthName(month)} ${year}. Call again with confirm:true to send.`,
      }, 200)
    }

    // ── Send ───────────────────────────────────────────────────────────────
    const resendKey   = Deno.env.get('RESEND_API_KEY')!
    const fromAddress = Deno.env.get('ADMIN_FROM_EMAIL')
      ?? 'BizCheck Kenya <noreply@support.bizcheckkenya.com>'

    let sent = 0
    let failed = 0

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE)

      await Promise.allSettled(batch.map(async (r: any) => {
        // Mark BEFORE sending. If the function times out mid-batch, the retry
        // skips anyone already marked rather than emailing them twice.
        await admin.from('statement_sends').upsert({
          user_id: r.user_id, year, month, status: 'sending',
          triggered_by: user.id, updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,year,month' })

        const { data: stmt, error: stmtError } = await admin
          .rpc('get_monthly_statement', { p_user_id: r.user_id, p_year: year, p_month: month })

        if (stmtError || !stmt) {
          failed++
          await admin.from('statement_sends').upsert({
            user_id: r.user_id, year, month, status: 'failed',
            error: stmtError?.message ?? 'No statement data',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,year,month' })
          return
        }

        const result = await sendEmail(resendKey, {
          from: fromAddress,
          to: [r.email],
          subject: `Your BizCheck statement — ${monthName(month)} ${year}`,
          html: statementHtml(stmt, r.name),
        })

        await admin.from('statement_sends').upsert({
          user_id: r.user_id, year, month,
          status: result.ok ? 'sent' : 'failed',
          error: result.ok ? null : String(result.error).slice(0, 500),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,year,month' })

        if (result.ok) sent++
        else failed++
      }))

      if (i + BATCH_SIZE < pending.length) {
        await new Promise((r) => setTimeout(r, BATCH_PAUSE))
      }
    }

    return json({
      sent, failed, total: pending.length,
      message: `Sent ${sent} of ${pending.length} statements.`,
    }, 200)

  } catch (err) {
    console.error('send-monthly-statements error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sendEmail(apiKey: string, payload: Record<string, unknown>) {
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        reply_to: Deno.env.get('ADMIN_REPLY_TO') ?? 'support@bizcheckkenya.com',
      }),
    })
    if (!res.ok) return { ok: false, error: await res.text() }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

function monthName(m: number) {
  return ['January','February','March','April','May','June','July',
          'August','September','October','November','December'][m - 1] ?? String(m)
}

const KSH_PER_CHECK = 20   // keep in step with checksUtils.js

function checks(n: number) {
  return `${Number(n ?? 0).toFixed(2)} Checks`
}
function ksh(n: number) {
  return `KSh ${(Number(n ?? 0) * KSH_PER_CHECK).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`
}

const KIND_LABELS: Record<string, string> = {
  deposit:              'Deposit',
  order_hold:           'Held for order',
  order_release:        'Payment received',
  order_refund:         'Refund',
  withdrawal_request:   'Withdrawal',
  withdrawal_failed:    'Withdrawal returned',
  admin_adjustment:     'Adjustment by admin',
  credit_purchase:      'Credit purchase',
  subscription_payment: 'Subscription',
  commission:           'Commission',
}

function esc(s: unknown) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function statementHtml(stmt: any, name?: string) {
  const rows = (stmt.transactions || []).map((t: any) => {
    const positive = Number(t.amount) > 0
    const date = new Date(t.created_at).toLocaleDateString('en-KE',
      { day: 'numeric', month: 'short' })
    return `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;font-size:13px;color:#666;">${date}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;font-size:13px;">
          ${esc(KIND_LABELS[t.kind] || t.kind)}
          ${t.note ? `<br><span style="color:#999;font-size:11px;">${esc(t.note)}</span>` : ''}
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-weight:600;color:${positive ? '#0F6E56' : '#A32D2D'};">
          ${positive ? '+' : ''}${checks(t.amount)}
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;color:#999;">
          ${checks(t.balance_after)}
        </td>
      </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">

    <div style="background:#1D9E75;padding:24px 32px;">
      <div style="color:#fff;font-size:20px;font-weight:700;">BizCheck Kenya</div>
      <div style="color:rgba(255,255,255,0.9);font-size:14px;margin-top:4px;">
        Statement — ${esc(stmt.month_label)}
      </div>
    </div>

    <div style="padding:28px 32px;color:#18181b;">
      <p style="font-size:15px;margin:0 0 20px;">Hi ${esc(name || 'there')},</p>
      <p style="font-size:14px;line-height:1.6;color:#52525b;margin:0 0 24px;">
        Here is a summary of your BizCheck wallet activity for ${esc(stmt.month_label)}.
        This is a record for your files — no action is needed.
      </p>

      <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;margin-bottom:24px;">
        <tr>
          <td style="padding:14px 16px;font-size:13px;color:#71717a;">Opening balance</td>
          <td style="padding:14px 16px;font-size:14px;text-align:right;font-weight:600;">${checks(stmt.opening_balance)}</td>
        </tr>
        <tr>
          <td style="padding:14px 16px;font-size:13px;color:#71717a;border-top:1px solid #eee;">Money in</td>
          <td style="padding:14px 16px;font-size:14px;text-align:right;font-weight:600;color:#0F6E56;border-top:1px solid #eee;">+${checks(stmt.total_in)}</td>
        </tr>
        <tr>
          <td style="padding:14px 16px;font-size:13px;color:#71717a;border-top:1px solid #eee;">Money out</td>
          <td style="padding:14px 16px;font-size:14px;text-align:right;font-weight:600;color:#A32D2D;border-top:1px solid #eee;">&minus;${checks(stmt.total_out)}</td>
        </tr>
        <tr>
          <td style="padding:14px 16px;font-size:14px;font-weight:700;border-top:2px solid #1D9E75;">Closing balance</td>
          <td style="padding:14px 16px;font-size:16px;text-align:right;font-weight:800;color:#0F6E56;border-top:2px solid #1D9E75;">
            ${checks(stmt.closing_balance)}<br>
            <span style="font-size:12px;font-weight:400;color:#71717a;">${ksh(stmt.closing_balance)}</span>
          </td>
        </tr>
      </table>

      <h3 style="font-size:15px;margin:0 0 12px;">Transactions (${esc(stmt.transaction_count)})</h3>
      ${rows ? `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;">Date</th>
            <th style="padding:8px;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;">Description</th>
            <th style="padding:8px;text-align:right;font-size:11px;color:#71717a;text-transform:uppercase;">Amount</th>
            <th style="padding:8px;text-align:right;font-size:11px;color:#71717a;text-transform:uppercase;">Balance</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>` : '<p style="color:#71717a;font-size:13px;">No transactions this month.</p>'}

      <p style="font-size:12px;color:#71717a;margin-top:24px;line-height:1.6;">
        1 Check = KSh ${KSH_PER_CHECK}. Checks held against an open order are released
        once you, the seller, and a BizCheck admin all confirm delivery.
      </p>
    </div>

    <div style="padding:20px 32px;background:#f4f4f5;font-size:12px;color:#71717a;text-align:center;">
      Questions? Reply to this email or write to support@bizcheckkenya.com<br>
      &copy; ${new Date().getFullYear()} BizCheck Kenya &middot; bizcheckkenya.com
    </div>
  </div>
</body></html>`
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}