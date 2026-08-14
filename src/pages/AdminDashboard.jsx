import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { SkeletonList } from './Skeleton'
import UserActivity from './UserActivity'
import { formatChecks, formatKsh, checksToKsh } from './checksUtils'

const FLAG_THRESHOLD = 6
const SCAM_THRESHOLD = 10

const TXN_KIND_LABELS = {
  deposit: 'Deposit',
  order_hold: 'Held for order',
  order_release: 'Released to seller',
  order_refund: 'Refund',
  withdrawal_request: 'Withdrawal',
  withdrawal_failed: 'Withdrawal returned',
  admin_adjustment: 'Admin adjustment',
  credit_purchase: 'Credit purchase',
  subscription_payment: 'Subscription',
  platform_revenue: 'Platform revenue',
  commission: 'Commission',
}

// ─── Inline Email Composer ────────────────────────────────────────────────────
// Kept inline so AdminDashboard stays a single file.
// Calls the send-admin-email Edge Function which verifies admin role
// before sending anything via Resend.
function AdminEmailComposer() {
  const [mode, setMode] = useState('individual')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [target, setTarget] = useState('users')
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [confirmBroadcast, setConfirmBroadcast] = useState(false)
  const [attachments, setAttachments] = useState([]) // [{ filename, content (base64) }]
  const fileInputRef = useRef(null)

  function handleFileChange(e) {
    e.preventDefault()
    e.stopPropagation()
    const files = Array.from(e.target.files || [])
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

    files.forEach((file) => {
      if (!allowed.includes(file.type)) {
        alert(`${file.name} is not a supported file type. Use PDF, image, or Word doc.`)
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        alert(`${file.name} is too large. Max size is 5MB per file.`)
        return
      }
      const reader = new FileReader()
      reader.onload = (ev) => {
        const base64 = ev.target.result.split(',')[1]
        setAttachments((prev) => [...prev, { filename: file.name, content: base64 }])
      }
      reader.readAsDataURL(file)
    })
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAttachment(index) {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  function openFilePicker(e) {
    e.preventDefault()
    e.stopPropagation()
    if (fileInputRef.current) fileInputRef.current.click()
  }

  async function handleSend() {
    if (!subject.trim() || !bodyHtml.trim()) {
      alert('Please fill in both subject and message.')
      return
    }
    if (mode === 'individual' && !recipientEmail.trim()) {
      alert('Please enter a recipient email.')
      return
    }
    if (mode === 'broadcast' && !confirmBroadcast) {
      alert('Please check the confirmation box before broadcasting.')
      return
    }

    setSending(true)
    setResult(null)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token

      const payload = mode === 'individual'
        ? { mode, recipientEmail, subject, bodyHtml, attachments }
        : { mode, target, subject, bodyHtml, attachments }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-admin-email`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(payload),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        setResult({ success: false, message: data.error || 'Failed to send' })
      } else if (mode === 'individual') {
        setResult({ success: true, message: `Sent to ${data.sentTo}` })
        setRecipientEmail('')
      } else {
        setResult({ success: true, message: `Sent to ${data.sent} of ${data.totalRecipients} recipients.` })
        setConfirmBroadcast(false)
      }

      setSubject('')
      setBodyHtml('')
      setAttachments([])
    } catch (err) {
      setResult({ success: false, message: 'Network error: ' + err.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
          <input type="radio" checked={mode === 'individual'} onChange={() => setMode('individual')} />
          Send to one person
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
          <input type="radio" checked={mode === 'broadcast'} onChange={() => setMode('broadcast')} />
          Broadcast to many
        </label>
      </div>

      {mode === 'individual' && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Recipient email</label>
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="user@example.com"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface-2)', color: 'var(--text)', boxSizing: 'border-box' }}
          />
        </div>
      )}

      {mode === 'broadcast' && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Send to</label>
          <select value={target} onChange={(e) => setTarget(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface-2)', color: 'var(--text)' }}>
            <option value="users">All individual users</option>
            <option value="businesses">All businesses</option>
            <option value="both">Everyone (users + businesses)</option>
          </select>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Subject</label>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface-2)', color: 'var(--text)', boxSizing: 'border-box' }} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          Message <span className="muted" style={{ fontWeight: 400 }}>(HTML allowed — &lt;p&gt;, &lt;b&gt;, &lt;a href=""&gt;)</span>
        </label>
        <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={10}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'monospace', background: 'var(--surface-2)', color: 'var(--text)', boxSizing: 'border-box', resize: 'vertical' }} />
      </div>

      {/* ── Attachments ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Attachments</div>
        {/* Hidden real input — triggered via ref, never via label */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={openFilePicker}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}
        >
          📎 Attach file
        </button>
        <span className="muted" style={{ fontSize: 12, marginLeft: 10 }}>PDF, image, Word — max 5MB each</span>

        {attachments.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {attachments.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
                <span>📄 {a.filename}</span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeAttachment(i) }}
                  style={{ background: 'none', border: 'none', color: '#A32D2D', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {mode === 'broadcast' && (
        <div style={{ marginBottom: 16, background: '#FFF3CD', padding: 14, borderRadius: 10, border: '1px solid #F59E0B' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={confirmBroadcast} onChange={(e) => setConfirmBroadcast(e.target.checked)} style={{ marginTop: 2 }} />
            I understand this will email <strong style={{ margin: '0 4px' }}>every {target === 'both' ? 'user and business' : target}</strong> on BizCheck Kenya and cannot be undone.
          </label>
        </div>
      )}

      <button onClick={handleSend} disabled={sending}
        style={{ padding: '11px 24px', background: sending ? 'var(--border)' : '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer' }}>
        {sending ? 'Sending…' : mode === 'individual' ? 'Send Email' : 'Broadcast Email'}
      </button>

      {result && (
        <p style={{ marginTop: 14, fontSize: 14, color: result.success ? '#0D6E82' : '#A32D2D', fontWeight: 600 }}>
          {result.success ? '✓ ' : '✗ '}{result.message}
        </p>
      )}
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminDashboard({ onSelectBusiness, onSelectUser }) {
  const [mainTab, setMainTab] = useState('businesses')
  const [chatThreads, setChatThreads] = useState([])
  const [activeThreadUserId, setActiveThreadUserId] = useState(null)
  const [threadMessages, setThreadMessages] = useState([])
  const [chatText, setChatText] = useState('')
  const [userReports, setUserReports] = useState([])
  const [bizSubTab, setBizSubTab] = useState('verified')
  const [reportSubTab, setReportSubTab] = useState('pending')
  const [processingSubmission, setProcessingSubmission] = useState(null)
  const [claims, setClaims] = useState([])
  const [claimNamesById, setClaimNamesById] = useState({})

  const [businesses, setBusinesses] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(null)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [banCodeModal, setBanCodeModal] = useState(null)
  const [banCodeInput, setBanCodeInput] = useState('')
  const [banReason, setBanReason] = useState('')
  const [currentAdminId, setCurrentAdminId] = useState(null)

  // Money tabs
  const [txnEntries, setTxnEntries] = useState([])
  const [txnFilter, setTxnFilter] = useState('all')
  const [txnSearch, setTxnSearch] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [revenueTotal, setRevenueTotal] = useState(0)
  const [withdrawals, setWithdrawals] = useState([])
  const [withdrawalFilter, setWithdrawalFilter] = useState('pending')
  const [escrowOrders, setEscrowOrders] = useState([])
  const [moneyLoaded, setMoneyLoaded] = useState(false)

  useEffect(() => { checkAdmin() }, [])

  useEffect(() => {
    if ((mainTab === 'transactions' || mainTab === 'withdrawals' || mainTab === 'escrow') && !moneyLoaded) {
      loadMoneyData()
    }
  }, [mainTab])

  useEffect(() => {
    if (!currentAdminId) return
    const channel = supabase
      .channel('admin-support-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload) => {
        loadChatThreads()
        if (payload.new.thread_user_id === activeThreadUserId) {
          setThreadMessages((prev) => [...prev, payload.new])
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentAdminId, activeThreadUserId])

  async function loadMoneyData() {
    const [{ data: entries }, { data: revenue }, { data: wds }, { data: escrowOrders }] = await Promise.all([
      supabase
        .from('wallet_entries')
        .select('*, wallets(owner_type, user_id, business_id, businesses(name)), profiles(username)')
        .order('created_at', { ascending: false })
        .limit(300),
      supabase.from('platform_revenue').select('checks_amount'),
      supabase.from('withdrawals').select('*, profiles(username, phone)').order('created_at', { ascending: true }),
      supabase.from('orders').select('*, businesses(name)').in('status', ['held', 'shipped', 'admin_review']).order('created_at', { ascending: true }),
    ])
    setTxnEntries(entries || [])
    setRevenueTotal((revenue || []).reduce((s, r) => s + Number(r.checks_amount), 0))
    setWithdrawals(wds || [])
    setEscrowOrders(escrowOrders || [])
    setMoneyLoaded(true)
  }

  function copyTxnId(id) {
    navigator.clipboard?.writeText(id)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  async function markWithdrawalPaid(w) {
    const netAmount = w.net_amount_ksh ?? w.amount_ksh
    const reference = window.prompt(
      `Send KSh ${netAmount} (net, after 2% fee) to ${w.phone}.\n\nM-Pesa confirmation code:`
    )
    if (!reference || !reference.trim()) return

    const { error: updateErr } = await supabase
      .from('withdrawals')
      .update({ status: 'paid', provider_reference: reference.trim(), processed_at: new Date().toISOString() })
      .eq('id', w.id)
    if (updateErr) { alert('Error: ' + updateErr.message); return }

    const { error: feeErr } = await supabase.rpc('credit_withdrawal_fee', { p_withdrawal_id: w.id })
    if (feeErr) { alert('Paid, but could not record the fee: ' + feeErr.message) }
    loadMoneyData()
  }

  async function markWithdrawalFailed(w) {
    const reason = window.prompt('Why did this payout fail? (Full amount will be returned to the user)')
    if (reason === null) return
    const { error } = await supabase.rpc('fail_withdrawal', { p_withdrawal_id: w.id, p_reason: reason || 'Payout failed' })
    if (error) { alert('Error: ' + error.message); return }
    loadMoneyData()
  }

  async function approveEscrowRelease(order) {
    const missing = []
    if (!order.buyer_confirmed_at) missing.push('buyer')
    if (!order.seller_confirmed_at) missing.push('seller')
    const warning = missing.length
      ? `\n\nNote: ${missing.join(' and ')} have not confirmed yet. Your approval will be recorded, but the money only moves once everyone has confirmed.`
      : '\n\nBuyer and seller have both confirmed. Approving now will release the payment.'
    if (!confirm(`Approve release of ${formatChecks(order.total_checks)} for "${order.product_name}"?${warning}`)) return
    const { error } = await supabase.rpc('admin_confirm_release', { p_order_id: order.id })
    if (error) { alert('Error: ' + error.message); return }
    loadMoneyData()
  }

  async function adminRefundOrder(order) {
    const reason = window.prompt(`Refund ${formatChecks(order.total_checks)} to the buyer. Reason:`)
    if (!reason || reason.trim().length < 3) { if (reason !== null) alert('Please give a reason for the refund.'); return }
    const { error } = await supabase.rpc('admin_refund_order', { p_order_id: order.id, p_reason: reason.trim() })
    if (error) { alert('Error: ' + error.message); return }
    loadMoneyData()
  }

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setIsAdmin(false); return }
    setCurrentAdminId(user.id)
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const admin = profile && ['admin', 'superadmin'].includes(profile.role)
    setIsAdmin(admin)
    setIsSuperadmin(profile?.role === 'superadmin')
    if (admin) loadAll()
  }

  async function sendBizcode(business) {
    if (!business.owner_id) { alert('This business has no owner linked yet.'); return }
    if (processingSubmission === business.id) return
    setProcessingSubmission(business.id)

    const { data: owner } = await supabase.from('profiles').select('email, name').eq('id', business.owner_id).single()
    const email = business.owner_email || owner?.email
    if (!email) { alert('No email found for this business owner.'); return }

    const { data: bizcode, error: codeError } = await supabase.rpc('finalize_business_verification', { p_business_id: business.id })
    if (codeError) { alert('Error generating bizcode: ' + codeError.message); return }

    const { data: sessionData } = await supabase.auth.getSession()
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-business-verified`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session.access_token}` },
        body: JSON.stringify({ email, name: business.owner_name || owner?.name, businessName: business.name, bizcode }),
      })
      if (!res.ok) throw new Error('Email failed')
      alert(`✓ Bizcode generated and emailed to ${email}.`)
    } catch (e) {
      alert(`Bizcode generated, but the email failed to send. Share this code with the owner manually:\n\n${bizcode}`)
    }
    setProcessingSubmission(null)
    loadAll()
  }

  async function banBusiness(businessId) {
    if (!isSuperadmin) {
      setBanCodeInput('')
      setBanCodeModal(businessId)
      return
    }
    const reason = prompt('Reason for banning this business (required — shown on the public banned page):')
    if (!reason || reason.trim().length < 5) { alert('A clear reason is required.'); return }
    setBanReason(reason.trim())
    await submitBanWithReason(businessId, null, reason.trim())
  }

  async function submitBanWithReason(businessId, code, reason) {
    const { error } = await supabase.rpc('ban_business_with_code', { p_business_id: businessId, p_code: code, p_reason: reason })
    if (error) {
      alert(error.message.includes('Too many') ? '⏱ ' + error.message : 'Error: ' + error.message)
      return
    }
    setBanCodeModal(null)
    setBanReason('')
    loadAll()
  }

  async function submitBan(businessId, code) {
    if (!banReason.trim() || banReason.trim().length < 5) {
      alert('Please give a clear reason for banning this business — the superadmin and the public banned page will see it.')
      return
    }
    const { error } = await supabase.rpc('ban_business_with_code', { p_business_id: businessId, p_code: code, p_reason: banReason.trim() })
    if (error) {
      alert(error.message.includes('Too many') ? '⏱ ' + error.message : 'Error: ' + error.message)
      return
    }
    setBanCodeModal(null)
    setBanReason('')
    loadAll()
  }

  async function loadAll() {
    setLoading(true)
    const [bizRes, subRes, repRes] = await Promise.all([
      supabase.from('businesses').select('*').order('unique_reporter_count', { ascending: false }),
      supabase.from('submissions').select('*, profiles!submissions_submitter_id_fkey(name, email, username)').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('reports').select('*, businesses(name, status, unique_reporter_count)').order('created_at', { ascending: false }),
    ])
    setBusinesses(bizRes.data || [])
    setSubmissions(subRes.data || [])
    setReports(repRes.data || [])

    const { data: claimData } = await supabase
      .from('claim_requests')
      .select('*')
      .order('created_at', { ascending: false })
    setClaims(claimData || [])

    if (claimData && claimData.length > 0) {
      const userIds = Array.from(new Set(claimData.map((c) => c.claimant_id)))
      const bizIds = Array.from(new Set(claimData.map((c) => c.business_id)))
      const [{ data: claimUsers }, { data: claimBizs }] = await Promise.all([
        supabase.from('profiles').select('id, username, name').in('id', userIds),
        supabase.from('businesses').select('id, name').in('id', bizIds),
      ])
      const names = {}
      claimUsers?.forEach((u) => { names[u.id] = `@${u.username || 'user'}` })
      claimBizs?.forEach((b) => { names[b.id] = b.name })
      setClaimNamesById(names)
    }

    const { data: userRepData } = await supabase
      .from('user_reports')
      .select('*, reporter:profiles!user_reports_reporter_id_fkey(username, name), reported:profiles!user_reports_reported_user_id_fkey(username, name)')
      .order('created_at', { ascending: false })
    setUserReports(userRepData || [])

    await loadChatThreads()
    setLoading(false)
  }

  async function decideClaim(claim, approve) {
    const rpc = approve ? 'approve_claim' : 'reject_claim'
    if (!confirm(approve ? `Approve this claim? ${claimNamesById[claim.claimant_id] || 'This user'} becomes the owner of ${claimNamesById[claim.business_id] || 'the business'}.` : 'Reject this claim?')) return
    const { error } = await supabase.rpc(rpc, { p_claim_id: claim.id })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }

  async function banReportedUser(report) {
    const note = prompt('Note for banning this user (internal record):') || ''
    const { error } = await supabase.rpc('ban_user_from_report', { p_report_id: report.id, p_note: note })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }

  async function dismissUserReport(report) {
    const note = prompt('Reason for dismissing (internal record):') || ''
    const { error } = await supabase.rpc('dismiss_user_report', { p_report_id: report.id, p_note: note })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }

  async function loadChatThreads() {
    const { data } = await supabase
      .from('support_messages')
      .select('*, profiles!support_messages_thread_user_id_fkey(name, username, email)')
      .order('created_at', { ascending: false })

    const grouped = {}
    ;(data || []).forEach((m) => {
      if (!grouped[m.thread_user_id]) {
        grouped[m.thread_user_id] = {
          userId: m.thread_user_id,
          profile: m.profiles,
          lastMessage: m,
          unreadCount: 0,
        }
      }
      if (!m.is_read && m.sender_id === m.thread_user_id) {
        grouped[m.thread_user_id].unreadCount++
      }
    })
    setChatThreads(Object.values(grouped).sort((a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at)))
  }

  async function openThread(userId) {
    setActiveThreadUserId(userId)
    const { data } = await supabase
      .from('support_messages')
      .select('*')
      .eq('thread_user_id', userId)
      .order('created_at', { ascending: true })
    setThreadMessages(data || [])

    await supabase.from('support_messages')
      .update({ is_read: true })
      .eq('thread_user_id', userId)
      .eq('sender_id', userId)
      .eq('is_read', false)
    loadChatThreads()
  }

  async function sendChatReply() {
    if (!chatText.trim() || !activeThreadUserId) return
    const { error } = await supabase.from('support_messages').insert({
      sender_id: currentAdminId,
      thread_user_id: activeThreadUserId,
      message: chatText.trim(),
      is_read: true,
    })
    if (error) { alert('Error: ' + error.message); return }
    setChatText('')
    openThread(activeThreadUserId)
  }

  async function setBusinessStatus(businessId, status) {
    const { error } = await supabase.rpc('admin_set_business_status', {
      p_business_id: businessId, p_status: status, p_admin_id: currentAdminId,
    })
    if (error) { alert('Error: ' + error.message); return }
    loadAll()
  }

  async function approveSubmission(sub) {
    if (processingSubmission) return
    setProcessingSubmission(sub.id)
    try {
      await doApproveSubmission(sub)
    } finally {
      setProcessingSubmission(null)
    }
  }

  async function doApproveSubmission(sub) {
    const { data: existing } = await supabase.from('businesses').select('id').ilike('name', sub.name).maybeSingle()

    const commonFields = {
      category: sub.category, description: sub.description, phone: sub.phone,
      mpesa_till: sub.mpesa_till, fb_handle: sub.fb_handle, tiktok_handle: sub.tiktok_handle,
      instagram_handle: sub.instagram_handle, owner_id: sub.submitter_id, status: 'verified',
      business_username: sub.business_username, location_type: sub.location_type,
      opening_time: sub.opening_time, closing_time: sub.closing_time, other_branches: sub.other_branches,
      owner_name: sub.owner_name, owner_id_number: sub.owner_id_number, owner_age: sub.owner_age,
      owner_email: sub.owner_email, owner_phone: sub.owner_phone,
    }

    let businessId
    if (existing) {
      const { error } = await supabase.from('businesses').update(commonFields).eq('id', existing.id)
      if (error) { alert('Error: ' + error.message); return }
      businessId = existing.id
    } else {
      const { data: created, error } = await supabase.from('businesses').insert({
        name: sub.name, location: sub.location, ...commonFields,
      }).select().single()
      if (error) { alert('Error: ' + error.message); return }
      businessId = created.id
    }

    const { data: bizcode, error: codeError } = await supabase.rpc('finalize_business_verification', { p_business_id: businessId })

    await supabase.rpc('link_listing_payment', { p_submitter_id: sub.submitter_id, p_business_id: businessId })
    if (codeError) { alert('Verified, but could not generate bizcode: ' + codeError.message) }

    await supabase.from('submissions').update({
      status: 'approved', reviewed_by: currentAdminId, reviewed_at: new Date().toISOString(),
    }).eq('id', sub.id)

    await supabase.from('audit_log').insert({
      admin_id: currentAdminId, action_type: 'approve_submission', target_table: 'submissions', target_id: sub.id,
    })

    if (bizcode) {
      const { data: sessionData } = await supabase.auth.getSession()
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-business-verified`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session.access_token}` },
          body: JSON.stringify({ email: sub.owner_email || sub.email, name: sub.owner_name, businessName: sub.name, bizcode }),
        })
      } catch (e) { /* email failure shouldn't block approval */ }
    }

    loadAll()
  }

  async function viewDoc(path) {
    const { data, error } = await supabase.storage.from('business-documents').createSignedUrl(path, 300)
    if (error) { alert('Error loading document: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  async function rejectSubmission(sub) {
    await supabase.from('submissions').update({
      status: 'rejected', reviewed_by: currentAdminId, reviewed_at: new Date().toISOString(),
    }).eq('id', sub.id)
    await supabase.from('audit_log').insert({
      admin_id: currentAdminId, action_type: 'reject_submission', target_table: 'submissions', target_id: sub.id,
    })
    loadAll()
  }

  async function dismissReport(report) {
    await supabase.from('reports').update({
      status: 'dismissed', reviewed_by: currentAdminId, reviewed_at: new Date().toISOString(),
    }).eq('id', report.id)
    await supabase.from('audit_log').insert({
      admin_id: currentAdminId, action_type: 'dismiss_report', target_table: 'reports', target_id: report.id,
    })
    loadAll()
  }

  async function acknowledgeReport(report) {
    let businessId = report.business_id

    if (!businessId) {
      const { data: newBiz, error } = await supabase.from('businesses').insert({
        name: report.business_name, category: 'Other', status: 'pending',
        description: `Stored from scam report: ${report.description || report.scam_type}`,
      }).select().single()
      if (error) { alert('Error: ' + error.message); return }
      businessId = newBiz.id
      await supabase.from('reports').update({ business_id: businessId }).eq('id', report.id)
    }

    await supabase.from('reports').update({
      status: 'verified', reviewed_by: currentAdminId, reviewed_at: new Date().toISOString(),
    }).eq('id', report.id)

    await supabase.from('audit_log').insert({
      admin_id: currentAdminId, action_type: 'verify_report', target_table: 'reports', target_id: report.id,
    })
    loadAll()
  }

  function getFullBusiness(businessId) {
    return businesses.find(b => b.id === businessId) || null
  }

  if (isAdmin === null) return <div className="section"><p className="muted">Checking access…</p></div>
  if (isAdmin === false) return <div className="section"><p className="muted">You don't have admin access.</p></div>
  if (loading) return <div className="section" style={{ maxWidth: 920 }}><h2 style={{ marginBottom: 20 }}>Admin Dashboard</h2><SkeletonList count={6} /></div>

  const verifiedBiz = businesses.filter(b => b.status === 'verified')
  const flaggedBiz = businesses.filter(b => b.status === 'flagged')
  const scamBiz = businesses.filter(b => b.status === 'scam')
  const pendingReports = reports.filter(r => r.status === 'pending')

  const reportedBusinessMap = {}
  reports.forEach(r => {
    if (!r.business_id) return
    if (!reportedBusinessMap[r.business_id]) {
      reportedBusinessMap[r.business_id] = { business: r.businesses, businessId: r.business_id, reportCount: 0, reports: [] }
    }
    reportedBusinessMap[r.business_id].reportCount++
    reportedBusinessMap[r.business_id].reports.push(r)
  })
  const reportedBusinesses = Object.values(reportedBusinessMap).sort(
    (a, b) => (b.business?.unique_reporter_count || 0) - (a.business?.unique_reporter_count || 0)
  )

  const needsReviewCount = businesses.filter(b =>
    (b.unique_reporter_count >= FLAG_THRESHOLD && b.status === 'verified') ||
    (b.unique_reporter_count >= SCAM_THRESHOLD && b.status !== 'scam')
  ).length

  const tabs = [
    ['businesses', 'All Businesses'],
    ['reports', 'Reports'],
    ['verification', `Business Verification${submissions.length ? ` (${submissions.length})` : ''}`],
    ['userReports', `User Reports${userReports.filter(r => r.status === 'pending').length ? ` (${userReports.filter(r => r.status === 'pending').length})` : ''}`],
    ['claims', `Claims${claims.filter(c => c.status === 'pending').length ? ` (${claims.filter(c => c.status === 'pending').length})` : ''}`],
    ['transactions', 'Transactions'],
    ['escrow', `Escrow${escrowOrders.filter(o => o.status === 'admin_review' || (o.buyer_confirmed_at && o.seller_confirmed_at && !o.admin_confirmed_at)).length ? ` (${escrowOrders.filter(o => o.status === 'admin_review' || (o.buyer_confirmed_at && o.seller_confirmed_at && !o.admin_confirmed_at)).length})` : ''}`],
    ['withdrawals', `Withdrawals${withdrawals.filter(w => w.status === 'pending').length ? ` (${withdrawals.filter(w => w.status === 'pending').length})` : ''}`],
    ['chat', `Support Chat${chatThreads.reduce((s, t) => s + t.unreadCount, 0) ? ` (${chatThreads.reduce((s, t) => s + t.unreadCount, 0)})` : ''}`],
    ['email', 'Send Email'],  // ← new tab
  ]

  return (
    <div className="section" style={{ maxWidth: 920 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Admin Dashboard</h2>
        {needsReviewCount > 0 && (
          <span style={{ background: '#FCEBEB', color: '#A32D2D', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
            🔔 {needsReviewCount} business{needsReviewCount !== 1 ? 'es' : ''} need review
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0, flexWrap: 'wrap' }}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setMainTab(id)}
            style={{
              padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 700,
              color: mainTab === id ? '#1D9E75' : 'var(--text-muted)',
              borderBottom: mainTab === id ? '3px solid #1D9E75' : '3px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Email tab ──────────────────────────────────────────────────────── */}
      {mainTab === 'email' && <AdminEmailComposer />}

      {/* ── All Businesses ─────────────────────────────────────────────────── */}
      {mainTab === 'businesses' && (
        <div>
          <div className="filter-row" style={{ marginBottom: 18 }}>
            {[
              ['verified', `Verified (${verifiedBiz.length})`],
              ['flagged', `Flagged (${flaggedBiz.length})`],
              ['scam', `Scammers (${scamBiz.length})`],
            ].map(([id, label]) => (
              <button key={id} className={`filter-btn ${bizSubTab === id ? 'on' : ''}`} onClick={() => setBizSubTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(bizSubTab === 'verified' ? verifiedBiz : bizSubTab === 'flagged' ? flaggedBiz : scamBiz).map((b) => (
              <BusinessAdminRow key={b.id} business={b} onSetStatus={setBusinessStatus} onBan={banBusiness} onSendBizcode={sendBizcode} thresholds={{ FLAG_THRESHOLD, SCAM_THRESHOLD }} onSelectBusiness={onSelectBusiness} onSelectUser={onSelectUser} />
            ))}
            {(bizSubTab === 'verified' ? verifiedBiz : bizSubTab === 'flagged' ? flaggedBiz : scamBiz).length === 0 && (
              <p className="muted">No businesses in this category.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Reports ────────────────────────────────────────────────────────── */}
      {mainTab === 'reports' && (
        <div>
          <div className="filter-row" style={{ marginBottom: 18 }}>
            {[
              ['pending', `Pending Reports (${pendingReports.length})`],
              ['reported', `Businesses Reported (${reportedBusinesses.length})`],
              ['log', `Report Log (${reports.length})`],
              ...(isSuperadmin ? [['made', 'Reports made']] : []),
            ].map(([id, label]) => (
              <button key={id} className={`filter-btn ${reportSubTab === id ? 'on' : ''}`} onClick={() => setReportSubTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {reportSubTab === 'made' && isSuperadmin && <UserActivity onBack={null} />}

          {reportSubTab === 'pending' && (
            pendingReports.length === 0 ? <p className="muted">No pending reports.</p> :
            <div className="admin-list">
              {pendingReports.map((r) => (
                <div className="admin-row" key={r.id}>
                  <div>
                    <strong>{r.business_name}</strong> <span className="muted">— {r.scam_type.replace('_', ' ')}</span>
                    {r.businesses && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                        ({r.businesses.unique_reporter_count} unique reporter{r.businesses.unique_reporter_count !== 1 ? 's' : ''} so far)
                      </span>
                    )}
                    {r.amount_lost && <div className="muted" style={{ fontSize: 13 }}>Lost: Ksh {r.amount_lost}</div>}
                    {r.description && <div style={{ fontSize: 13, marginTop: 4 }}>{r.description}</div>}
                  </div>
                  <div className="admin-actions">
                    <button className="btn-small" onClick={() => acknowledgeReport(r)}>Acknowledge & store</button>
                    <button className="btn-ghost-small" onClick={() => dismissReport(r)}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {reportSubTab === 'reported' && (
            reportedBusinesses.length === 0 ? <p className="muted">No businesses have been reported yet.</p> :
            <div className="admin-list">
              {reportedBusinesses.map((rb) => {
                const biz = rb.business
                const count = biz?.unique_reporter_count || rb.reportCount
                const needsFlagReview = count >= FLAG_THRESHOLD && biz?.status === 'verified'
                const needsScamReview = count >= SCAM_THRESHOLD && biz?.status !== 'scam'
                return (
                  <div className="admin-row" key={rb.businessId} style={{ flexWrap: 'wrap' }}>
                    <div>
                      <button onClick={() => { const full = getFullBusiness(rb.businessId); if (full) onSelectBusiness?.(full) }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                        <strong style={{ color: '#1D9E75', textDecoration: 'underline' }}>{biz?.name || 'Unknown business'}</strong>
                      </button>
                      <span className={`badge ${biz?.status === 'verified' ? 'badge-verified' : biz?.status === 'scam' ? 'badge-danger' : 'badge-pending'}`} style={{ marginLeft: 8 }}>{biz?.status}</span>
                      {getFullBusiness(rb.businessId)?.owner_id && (
                        <button onClick={() => onSelectUser?.(getFullBusiness(rb.businessId).owner_id)} className="link-btn" style={{ display: 'inline', margin: 0, marginLeft: 8, fontSize: 12 }}>👤 View owner profile</button>
                      )}
                      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                        {count} unique reporter{count !== 1 ? 's' : ''} · {rb.reportCount} total report{rb.reportCount !== 1 ? 's' : ''}
                      </div>
                      {needsScamReview && <div style={{ color: '#A32D2D', fontSize: 12, fontWeight: 700, marginTop: 4 }}>🚨 {SCAM_THRESHOLD}+ reporters reached — consider marking as scam</div>}
                      {!needsScamReview && needsFlagReview && <div style={{ color: '#854D0E', fontSize: 12, fontWeight: 700, marginTop: 4 }}>⚠ {FLAG_THRESHOLD}+ reporters reached — consider flagging</div>}
                    </div>
                    <div className="admin-actions">
                      {biz?.status !== 'flagged' && <button className="btn-ghost-small" onClick={() => setBusinessStatus(rb.businessId, 'flagged')}>Mark flagged</button>}
                      {biz?.status !== 'scam' && <button className="btn-small" style={{ background: '#A32D2D' }} onClick={() => setBusinessStatus(rb.businessId, 'scam')}>Mark scam</button>}
                      {biz?.status !== 'verified' && <button className="btn-ghost-small" onClick={() => setBusinessStatus(rb.businessId, 'verified')}>Restore verified</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {reportSubTab === 'log' && (
            reports.length === 0 ? <p className="muted">No reports have been filed yet.</p> :
            <div className="admin-list">
              {reports.map((r) => (
                <div className="admin-row" key={r.id}>
                  <div>
                    <strong>{r.business_name}</strong>
                    <span className={`badge ${r.status === 'verified' ? 'badge-danger' : r.status === 'dismissed' ? 'badge-verified' : 'badge-pending'}`} style={{ marginLeft: 8 }}>{r.status}</span>
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Reason: {r.scam_type.replace('_', ' ')} {r.amount_lost && `· Lost Ksh ${r.amount_lost}`}</div>
                    {r.description && <div style={{ fontSize: 13, marginTop: 4 }}>{r.description}</div>}
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Business Verification ───────────────────────────────────────────── */}
      {mainTab === 'verification' && (
        submissions.length === 0 ? <p className="muted">No pending business verifications.</p> :
        <div className="admin-list">
          {submissions.map((s) => (
            <div className="admin-row" key={s.id}>
              <div>
                <strong>{s.name}</strong> <span className="muted">— {s.category}</span>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {s.location && `📍 ${s.location} · `}{s.phone} {s.mpesa_till && `· ${s.mpesa_till}`} {s.fb_handle && `· ${s.fb_handle}`}
                </div>
                {s.description && <div style={{ fontSize: 13, marginTop: 4 }}>{s.description}</div>}
                {s.business_username && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Business username: @{s.business_username}</div>}
                {(s.opening_time || s.closing_time) && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Hours: {s.opening_time || '—'} - {s.closing_time || '—'}</div>}
                {s.other_branches && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Other branches: {s.other_branches}</div>}
                {s.owner_name && (
                  <div style={{ marginTop: 10, background: 'var(--surface-2)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Applicant details</div>
                    <div><strong>Name:</strong> {s.owner_name}</div>
                    <div><strong>ID number:</strong> {s.owner_id_number}</div>
                    <div><strong>Age:</strong> {s.owner_age}</div>
                    <div><strong>Email:</strong> {s.owner_email}</div>
                    <div><strong>Phone:</strong> {s.owner_phone}</div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 12 }}>
                      {s.id_photo_url && <button className="link-btn" style={{ margin: 0, fontSize: 12 }} onClick={() => viewDoc(s.id_photo_url)}>🪪 View ID photo</button>}
                      {s.permit_photo_url && <button className="link-btn" style={{ margin: 0, fontSize: 12 }} onClick={() => viewDoc(s.permit_photo_url)}>📄 View permit</button>}
                      {s.registration_photo_url && <button className="link-btn" style={{ margin: 0, fontSize: 12 }} onClick={() => viewDoc(s.registration_photo_url)}>📄 View registration</button>}
                    </div>
                  </div>
                )}
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Submitted by:{' '}
                  {s.submitter_id ? (
                    <button onClick={() => onSelectUser?.(s.submitter_id)} className="link-btn" style={{ display: 'inline', margin: 0, fontSize: 12 }}>{s.profiles?.name || s.profiles?.username || 'Unknown'} →</button>
                  ) : (s.profiles?.name || s.profiles?.username || 'Unknown')}
                  {' · '}{new Date(s.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <div className="admin-actions">
                <button className="btn-small" onClick={() => approveSubmission(s)} disabled={processingSubmission === s.id}>{processingSubmission === s.id ? 'Approving…' : 'Approve'}</button>
                <button className="btn-ghost-small" onClick={() => rejectSubmission(s)}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Claims ─────────────────────────────────────────────────────────── */}
      {mainTab === 'claims' && (
        claims.length === 0 ? <p className="muted">No business claims yet.</p> :
        <div className="admin-list">
          {claims.map((c) => (
            <div className="admin-row" key={c.id} style={{ flexWrap: 'wrap' }}>
              <div>
                <strong>{claimNamesById[c.business_id] || 'Business'}</strong>
                <span className={`badge ${c.status === 'pending' ? 'badge-pending' : c.status === 'approved' ? 'badge-verified' : 'badge-danger'}`} style={{ marginLeft: 8 }}>{c.status}</span>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Claimed by {claimNamesById[c.claimant_id] || 'user'} · ID number: {c.id_number}</div>
                {c.reason && <div style={{ fontSize: 13, marginTop: 4 }}>{c.reason}</div>}
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{new Date(c.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>
              {c.status === 'pending' && (
                <div className="admin-actions">
                  <button className="btn-small" onClick={() => decideClaim(c, true)}>Approve claim</button>
                  <button className="btn-ghost-small" onClick={() => decideClaim(c, false)}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── User Reports ───────────────────────────────────────────────────── */}
      {mainTab === 'userReports' && (
        userReports.length === 0 ? <p className="muted">No user reports yet.</p> :
        <div className="admin-list">
          {userReports.map((r) => (
            <div className="admin-row" key={r.id} style={{ flexWrap: 'wrap' }}>
              <div>
                <strong>@{r.reported?.username || 'user'}</strong>
                <span className={`badge ${r.status === 'pending' ? 'badge-pending' : r.status === 'banned' ? 'badge-danger' : 'badge-verified'}`} style={{ marginLeft: 8 }}>{r.status}</span>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Reported by @{r.reporter?.username || 'user'} · {r.reason}</div>
                {r.details && <div style={{ fontSize: 13, marginTop: 4 }}>{r.details}</div>}
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>
              {r.status === 'pending' && (
                <div className="admin-actions">
                  <button className="btn-small" style={{ background: '#A32D2D' }} onClick={() => banReportedUser(r)}>Ban user</button>
                  <button className="btn-ghost-small" onClick={() => dismissUserReport(r)}>Dismiss</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Transactions ───────────────────────────────────────────────────── */}
      {mainTab === 'transactions' && (
        !moneyLoaded ? <SkeletonList count={6} /> :
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{txnEntries.length}</div>
              <div className="muted" style={{ fontSize: 11 }}>Entries shown</div>
            </div>
            <div style={{ background: '#E0F7EF', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0D6E82' }}>{formatChecks(revenueTotal)}</div>
              <div className="muted" style={{ fontSize: 11 }}>Platform revenue</div>
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{formatKsh(checksToKsh(revenueTotal))}</div>
              <div className="muted" style={{ fontSize: 11 }}>In real money</div>
            </div>
          </div>
          <input type="text" placeholder="Search by transaction ID, order ID, username, business, M-Pesa ref…" value={txnSearch} onChange={(e) => setTxnSearch(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13.5, background: 'var(--surface)', color: 'var(--text)', marginBottom: 12, boxSizing: 'border-box' }} />
          <div className="filter-row" style={{ marginBottom: 18, flexWrap: 'wrap' }}>
            <button className={`filter-btn ${txnFilter === 'all' ? 'on' : ''}`} onClick={() => setTxnFilter('all')}>All</button>
            {Array.from(new Set(txnEntries.map((e) => e.kind))).map((k) => (
              <button key={k} className={`filter-btn ${txnFilter === k ? 'on' : ''}`} onClick={() => setTxnFilter(k)}>{TXN_KIND_LABELS[k] || k}</button>
            ))}
          </div>
          <div className="admin-list">
            {txnEntries
              .filter((e) => txnFilter === 'all' || e.kind === txnFilter)
              .filter((e) => {
                if (!txnSearch.trim()) return true
                const q = txnSearch.toLowerCase()
                return e.id?.toLowerCase().includes(q) || e.order_id?.toLowerCase().includes(q) || e.reference?.toLowerCase().includes(q) || e.profiles?.username?.toLowerCase().includes(q) || e.wallets?.businesses?.name?.toLowerCase().includes(q) || e.note?.toLowerCase().includes(q)
              })
              .map((e) => {
                const positive = Number(e.amount) > 0
                const owner = e.wallets?.owner_type === 'business' ? `🏢 ${e.wallets?.businesses?.name || 'business'}` : e.wallets?.owner_type === 'platform' ? '⬛ BizCheck' : `@${e.profiles?.username || 'user'}`
                return (
                  <div className="admin-row" key={e.id}>
                    <div>
                      <strong>{TXN_KIND_LABELS[e.kind] || e.kind}</strong> <span className="muted">— {owner}</span>
                      {e.note && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{e.note}</div>}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                        <button onClick={() => copyTxnId(e.id)} className="link-btn" style={{ display: 'inline', margin: 0, fontSize: 11, fontFamily: 'monospace' }}>{copiedId === e.id ? '✓ copied' : `txn ${e.id.slice(0, 8)}`}</button>
                        {e.order_id && <button onClick={() => copyTxnId(e.order_id)} className="link-btn" style={{ display: 'inline', margin: 0, fontSize: 11, fontFamily: 'monospace' }}>{copiedId === e.order_id ? '✓ copied' : `order ${e.order_id.slice(0, 8)}`}</button>}
                        <span className="muted" style={{ fontSize: 11 }}>{new Date(e.created_at).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: positive ? '#0D6E82' : '#A32D2D' }}>{positive ? '+' : ''}{formatChecks(e.amount)}</div>
                      <div className="muted" style={{ fontSize: 11 }}>bal {formatChecks(e.balance_after)}</div>
                    </div>
                  </div>
                )
              })}
            {txnEntries.length === 0 && <p className="muted">No transactions yet.</p>}
          </div>
        </div>
      )}

      {/* ── Escrow ─────────────────────────────────────────────────────────── */}
      {mainTab === 'escrow' && (
        !moneyLoaded ? <SkeletonList count={4} /> :
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{escrowOrders.length}</div>
              <div className="muted" style={{ fontSize: 11 }}>Open orders</div>
            </div>
            <div style={{ background: '#FFF3E0', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#7C2D12' }}>{escrowOrders.filter(o => o.status === 'admin_review' || (o.buyer_confirmed_at && o.seller_confirmed_at && !o.admin_confirmed_at)).length}</div>
              <div className="muted" style={{ fontSize: 11 }}>Need your approval</div>
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{formatChecks(escrowOrders.reduce((s, o) => s + Number(o.total_checks), 0))}</div>
              <div className="muted" style={{ fontSize: 11 }}>Value held</div>
            </div>
          </div>
          <div className="admin-list">
            {escrowOrders.length === 0 ? <p className="muted">No open escrow orders.</p> : escrowOrders.map((o) => {
              const flagged = o.status === 'admin_review'
              const needsAdmin = flagged || (o.buyer_confirmed_at && o.seller_confirmed_at && !o.admin_confirmed_at)
              return (
                <div className="admin-row" key={o.id} style={{ flexWrap: 'wrap', borderLeft: `4px solid ${flagged ? '#EA580C' : needsAdmin ? '#1D9E75' : 'var(--border)'}` }}>
                  <div>
                    <strong>{o.product_name}</strong><span className="muted"> — {o.businesses?.name}</span>
                    <span className={`badge ${o.status === 'admin_review' ? 'badge-danger' : o.status === 'shipped' ? 'badge-pending' : 'badge-verified'}`} style={{ marginLeft: 8 }}>{o.status === 'admin_review' ? 'Needs review' : o.status}</span>
                    <div style={{ fontWeight: 700, marginTop: 4 }}>{formatChecks(o.total_checks)} <span className="muted" style={{ fontWeight: 400 }}>({formatKsh(checksToKsh(o.total_checks))})</span></div>
                    {o.commission_checks > 0 && <div className="muted" style={{ fontSize: 12 }}>Seller payout: {formatChecks(o.seller_payout_checks)} · Commission: {formatChecks(o.commission_checks)}</div>}
                    {o.review_reason && <div style={{ fontSize: 12.5, background: '#FFEDD5', color: '#7C2D12', borderRadius: 8, padding: '6px 10px', marginTop: 6 }}><strong>Flagged:</strong> {o.review_reason}</div>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <span className={`badge ${o.buyer_confirmed_at ? 'badge-verified' : 'badge-pending'}`}>{o.buyer_confirmed_at ? '✓ Buyer' : '○ Buyer'}</span>
                      <span className={`badge ${o.seller_confirmed_at ? 'badge-verified' : 'badge-pending'}`}>{o.seller_confirmed_at ? '✓ Seller' : '○ Seller'}</span>
                      <span className={`badge ${o.admin_confirmed_at ? 'badge-verified' : 'badge-pending'}`}>{o.admin_confirmed_at ? '✓ Admin' : '○ Admin'}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Ordered {new Date(o.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}{o.shipped_at && ` · shipped ${new Date(o.shipped_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}`}</div>
                  </div>
                  <div className="admin-actions">
                    {!o.admin_confirmed_at && <button className="btn-small" onClick={() => approveEscrowRelease(o)}>Approve release</button>}
                    <button className="btn-ghost-small" style={{ color: '#A32D2D' }} onClick={() => adminRefundOrder(o)}>Refund buyer</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Withdrawals ────────────────────────────────────────────────────── */}
      {mainTab === 'withdrawals' && (
        !moneyLoaded ? <SkeletonList count={4} /> :
        <div>
          <div className="filter-row" style={{ marginBottom: 18 }}>
            {[['pending', `Pending (${withdrawals.filter(w => w.status === 'pending').length})`], ['all', `All (${withdrawals.length})`]].map(([id, label]) => (
              <button key={id} className={`filter-btn ${withdrawalFilter === id ? 'on' : ''}`} onClick={() => setWithdrawalFilter(id)}>{label}</button>
            ))}
          </div>
          <div className="admin-list">
            {(withdrawalFilter === 'pending' ? withdrawals.filter(w => w.status === 'pending') : withdrawals).map((w) => (
              <div className="admin-row" key={w.id} style={{ flexWrap: 'wrap' }}>
                <div>
                  <strong>@{w.profiles?.username || 'user'}</strong>
                  <span className={`badge ${w.status === 'paid' ? 'badge-verified' : w.status === 'failed' ? 'badge-danger' : 'badge-pending'}`} style={{ marginLeft: 8 }}>{w.status}</span>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Pay to: {w.phone} · {w.destination_type}</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{formatKsh(w.net_amount_ksh ?? w.amount_ksh)} <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>net to send</span></div>
                  <div className="muted" style={{ fontSize: 12 }}>Requested {formatKsh(w.amount_ksh)} ({formatChecks(w.checks_amount)}) — 2% fee: {formatChecks(w.fee_checks || 0)}</div>
                  {w.provider_reference && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Ref: {w.provider_reference}</div>}
                  {w.failure_reason && <div style={{ fontSize: 11, marginTop: 4, color: '#A32D2D' }}>Failed: {w.failure_reason}</div>}
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{new Date(w.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                </div>
                {w.status === 'pending' && (
                  <div className="admin-actions">
                    <button className="btn-small" onClick={() => markWithdrawalPaid(w)}>Mark as paid</button>
                    <button className="btn-ghost-small" onClick={() => markWithdrawalFailed(w)}>Mark failed</button>
                  </div>
                )}
              </div>
            ))}
            {(withdrawalFilter === 'pending' ? withdrawals.filter(w => w.status === 'pending') : withdrawals).length === 0 && <p className="muted">Nothing here.</p>}
          </div>
        </div>
      )}

      {/* ── Support Chat ───────────────────────────────────────────────────── */}
      {mainTab === 'chat' && (
        <div style={{ display: 'flex', gap: 16, height: 520 }}>
          <div style={{ width: 260, flexShrink: 0, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Conversations ({chatThreads.length})</div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {chatThreads.length === 0 ? <p className="muted" style={{ padding: 14, fontSize: 13 }}>No support messages yet.</p> :
                chatThreads.map((t) => (
                  <button key={t.userId} onClick={() => openThread(t.userId)} style={{ width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: activeThreadUserId === t.userId ? 'var(--hover-bg)' : 'transparent', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 13 }}>{t.profile?.name || t.profile?.username || 'User'}</strong>
                      {t.unreadCount > 0 && <span style={{ background: '#E24B4A', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 6px' }}>{t.unreadCount}</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.lastMessage.message}</div>
                  </button>
                ))}
            </div>
          </div>
          <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!activeThreadUserId ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p className="muted">Select a conversation to view messages.</p></div>
            ) : (
              <>
                <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
                  {chatThreads.find(t => t.userId === activeThreadUserId)?.profile?.name || 'User'}
                  <button className="link-btn" style={{ display: 'inline', margin: 0, marginLeft: 10, fontSize: 12 }} onClick={() => onSelectUser?.(activeThreadUserId)}>View profile →</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {threadMessages.map((m) => {
                    const isMeAdmin = !m.is_bot && m.sender_id !== m.thread_user_id
                    return (
                      <div key={m.id} style={{ display: 'flex', justifyContent: isMeAdmin ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth: '70%', padding: '10px 14px', borderRadius: 14, background: isMeAdmin ? '#1D9E75' : 'var(--hover-bg)', color: isMeAdmin ? '#fff' : 'var(--text)', fontSize: 14, border: m.is_bot ? '1.5px solid #17A2B8' : 'none' }}>
                          {m.is_bot && <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 2, color: '#17A2B8' }}>🤖 Bot auto-reply</div>}
                          {m.message}
                          <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>{new Date(m.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                  <input value={chatText} onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChatReply()} placeholder="Reply…" style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }} />
                  <button onClick={sendChatReply} style={{ padding: '10px 20px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Send</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Ban code modal ─────────────────────────────────────────────────── */}
      {banCodeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, maxWidth: 380, width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔐</div>
              <h3 style={{ marginBottom: 6, color: 'var(--text-strong)' }}>Ban authorization required</h3>
              <p className="muted" style={{ fontSize: 13 }}>Enter the ban code from the superadmin to proceed.</p>
            </div>
            <textarea value={banReason} onChange={(e) => setBanReason(e.target.value)} rows={3} placeholder="Reason for the ban (required — shown to the superadmin and on the public banned page)" autoFocus
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', marginBottom: 10, boxSizing: 'border-box', resize: 'vertical' }} />
            <input type="password" value={banCodeInput} onChange={(e) => setBanCodeInput(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && submitBan(banCodeModal, banCodeInput.trim())} placeholder="BAN-XXXXXXXX"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 15, textAlign: 'center', letterSpacing: 2, fontFamily: 'monospace', background: 'var(--surface-2)', color: 'var(--text)', marginBottom: 14, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => submitBan(banCodeModal, banCodeInput.trim())}>Ban business</button>
              <button className="btn-ghost-small" onClick={() => setBanCodeModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BusinessAdminRow({ business: b, onSetStatus, onBan, onSendBizcode, thresholds, onSelectBusiness, onSelectUser }) {
  const needsFlagReview = b.unique_reporter_count >= thresholds.FLAG_THRESHOLD && b.status === 'verified'
  const needsScamReview = b.unique_reporter_count >= thresholds.SCAM_THRESHOLD && b.status !== 'scam'
  return (
    <div className="admin-row" style={{ flexWrap: 'wrap' }}>
      <div>
        <button onClick={() => onSelectBusiness?.(b)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
          <strong style={{ color: '#1D9E75', textDecoration: 'underline' }}>{b.name}</strong>
        </button>
        {b.admin_reviewed && (
          <span title="Reviewed and verified by BizCheck admin" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: '#1877F2', marginLeft: 6, verticalAlign: 'middle' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
        )}
        <span className="muted"> — {b.category}</span>
        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>👁 {b.view_count || 0} view{b.view_count === 1 ? '' : 's'}</span>
        {b.owner_id && <button onClick={() => onSelectUser?.(b.owner_id)} className="link-btn" style={{ display: 'inline', margin: 0, marginLeft: 8, fontSize: 12 }}>👤 View owner profile</button>}
        <div className="muted" style={{ fontSize: 13 }}>Trust: {b.trust_score}% · {b.legit_votes} legit / {b.scam_votes} scam votes · {b.unique_reporter_count} unique reporters</div>
        {needsScamReview && <div style={{ color: '#A32D2D', fontSize: 12, fontWeight: 700, marginTop: 4 }}>🚨 Reached scam threshold ({thresholds.SCAM_THRESHOLD}+ reporters)</div>}
        {!needsScamReview && needsFlagReview && <div style={{ color: '#854D0E', fontSize: 12, fontWeight: 700, marginTop: 4 }}>⚠ Reached flag threshold ({thresholds.FLAG_THRESHOLD}+ reporters)</div>}
      </div>
      <div className="admin-actions">
        {b.status === 'verified' && !b.bizcode && <button className="btn-small" style={{ background: '#0D6E82' }} onClick={() => onSendBizcode(b)}>🔑 Send bizcode</button>}
        {b.status !== 'verified' && <button className="btn-ghost-small" onClick={() => onSetStatus(b.id, 'verified')}>Verify</button>}
        {b.status !== 'flagged' && <button className="btn-ghost-small" onClick={() => onSetStatus(b.id, 'flagged')}>Flag</button>}
        {b.status !== 'scam' && <button className="btn-small" style={{ background: '#A32D2D' }} onClick={() => onSetStatus(b.id, 'scam')}>Mark scam</button>}
        {b.status !== 'banned' && <button className="btn-ghost-small" onClick={() => onBan(b.id)}>Ban</button>}
      </div>
    </div>
  )
}
