import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { IdentityLine } from './Identity'
import { SkeletonList } from './Skeleton'
import ReportUserModal from './ReportUserModal'
import { chargeUserCredits, chargeBusinessCredits } from './CreditGate'

function linkify(text) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return parts.map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#FFE58A', textDecoration: 'underline', fontWeight: 700, wordBreak: 'break-all' }}>{part}</a>
      : part
  )
}

export default function Messages({ currentUser, initialTargetId, isAdmin, businessMode, onBack, onInsufficientCredits }) {
  const [threads, setThreads] = useState([])
  const [activeThread, setActiveThread] = useState(null) // { profile, otherUserId }
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const [otherBusinesses, setOtherBusinesses] = useState([])
  const [showReportModal, setShowReportModal] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    loadThreads().then(() => {
      if (initialTargetId) openThreadWith(initialTargetId)
    })

    const channel = supabase
      .channel(`dm-${currentUser.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'direct_messages',
        filter: `recipient_id=eq.${currentUser.id}`,
      }, (payload) => {
        loadThreads()
        if (activeThread && payload.new.sender_id === activeThread.otherUserId) {
          setMessages((prev) => [...prev, payload.new])
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadThreads() {
    setLoading(true)
    const { data } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`)
      .order('created_at', { ascending: false })

    const grouped = {}
    for (const m of data || []) {
      const otherId = m.sender_id === currentUser.id ? m.recipient_id : m.sender_id
      if (!grouped[otherId]) {
        grouped[otherId] = { otherUserId: otherId, lastMessage: m, unreadCount: 0 }
      }
      if (m.recipient_id === currentUser.id && !m.is_read) grouped[otherId].unreadCount++
    }

    // Fetch profile info for each thread partner
    const ids = Object.keys(grouped)
    if (ids.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, name, username, role').in('id', ids)
      profiles?.forEach((p) => { if (grouped[p.id]) grouped[p.id].profile = p })
    }

    setThreads(Object.values(grouped).sort((a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at)))
    setLoading(false)
  }

  async function openThreadWith(otherUserId) {
    const { data: profile } = await supabase.from('profiles').select('id, name, username, role').eq('id', otherUserId).single()
    setActiveThread({ profile, otherUserId })

    const { data } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`and(sender_id.eq.${currentUser.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${currentUser.id})`)
      .order('created_at', { ascending: true })
    setMessages(data || [])

    await supabase.from('direct_messages').update({ is_read: true }).eq('sender_id', otherUserId).eq('recipient_id', currentUser.id).eq('is_read', false)
    loadThreads()
  }

  async function send() {
    if (!text.trim() || !activeThread) return

    // Credit charge: business mode pays 0.25 to message a user; personal
    // users pay 1 to message admin, 0.5 to message a business owner,
    // 0.1 to message a regular user. Subscribers/Full Control skip inside.
    let charge
    if (businessMode) {
      charge = await chargeBusinessCredits(businessMode.id, 'message_user', 0.25)
    } else if (['admin', 'superadmin'].includes(activeThread.profile?.role)) {
      charge = await chargeUserCredits('message_admin', 1)
    } else {
      const { data: ownedBiz } = await supabase.from('businesses').select('id').eq('owner_id', activeThread.otherUserId).eq('status', 'verified').limit(1)
      charge = ownedBiz && ownedBiz.length > 0
        ? await chargeUserCredits('message_business', 0.5)
        : await chargeUserCredits('message_user', 0.1)
    }
    if (!charge.ok) {
      if (charge.insufficientCredits && onInsufficientCredits) { onInsufficientCredits(); return }
      if (charge.insufficientCredits) { alert('You are out of credits.'); return }
      alert('Error: ' + charge.error); return
    }

    setSending(true)
    const { error } = await supabase.from('direct_messages').insert({
      sender_id: currentUser.id,
      recipient_id: activeThread.otherUserId,
      message: text.trim(),
    })
    setSending(false)
    if (error) { alert('Error sending: ' + error.message); return }
    setText('')
    openThreadWith(activeThread.otherUserId)
  }

  async function openLinkPicker() {
    const { data } = await supabase.from('businesses').select('id, name').eq('owner_id', activeThread.otherUserId)
    setOtherBusinesses(data || [])
    setShowLinkPicker(true)
  }

  async function sendEditLink(targetType, businessId = null, businessName = null) {
    const { data: token, error } = await supabase.rpc('create_edit_link', {
      p_target_user_id: activeThread.otherUserId,
      p_target_type: targetType,
      p_target_business_id: businessId,
    })
    if (error) { alert('Error creating link: ' + error.message); return }

    const url = `${window.location.origin}/#editlink-${token}`
    const label = targetType === 'personal' ? 'your personal info' : `"${businessName}"`
    const linkMessage = `🔗 You can edit ${label} here: ${url}\n\nThis link expires 5 minutes after you open it, so please make your changes right away.`

    await supabase.from('direct_messages').insert({
      sender_id: currentUser.id,
      recipient_id: activeThread.otherUserId,
      message: linkMessage,
    })
    setShowLinkPicker(false)
    openThreadWith(activeThread.otherUserId)
  }

  if (loading) return <div className="section" style={{ maxWidth: 820 }}><h2 style={{ marginBottom: 20 }}>Messages</h2><SkeletonList count={5} /></div>

  return (
    <div className="section" style={{ maxWidth: 820 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>
      <h2 style={{ marginBottom: 20 }}>Messages</h2>

      <div style={{ display: 'flex', gap: 16, height: 520, flexWrap: 'wrap' }}>
        {/* THREAD LIST */}
        <div style={{ width: 260, flexShrink: 0, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
            Conversations ({threads.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {threads.length === 0 ? (
              <p className="muted" style={{ padding: 14, fontSize: 13 }}>No messages yet. Visit someone's profile and click "💬 Message" to start a conversation.</p>
            ) : threads.map((t) => (
              <button
                key={t.otherUserId}
                onClick={() => openThreadWith(t.otherUserId)}
                style={{
                  width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none',
                  borderBottom: '1px solid var(--border)',
                  background: activeThread?.otherUserId === t.otherUserId ? 'var(--hover-bg)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <IdentityLine profile={t.profile} fontWeight={700} color="var(--text)" />
                  {t.unreadCount > 0 && (
                    <span style={{ background: '#E24B4A', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 6px' }}>{t.unreadCount}</span>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.lastMessage.message}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ACTIVE THREAD */}
        <div style={{ flex: 1, minWidth: 240, border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!activeThread ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p className="muted">Select a conversation to view messages.</p>
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <IdentityLine profile={activeThread.profile} fontWeight={700} color="var(--text)" />
                <div style={{ display: 'flex', gap: 8 }}>
                  {isAdmin && (
                    <button className="btn-ghost-small" onClick={openLinkPicker} style={{ fontSize: 12 }}>🔗 Send edit link</button>
                  )}
                  <button className="btn-ghost-small" style={{ fontSize: 12, color: '#E24B4A' }} onClick={() => setShowReportModal(true)}>🚩 Report</button>
                </div>
              </div>

              {showLinkPicker && (
                <div style={{ padding: '12px 16px', background: '#E1F5EE', borderBottom: '1px solid #9FE1CB', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#085041', marginBottom: 2 }}>Choose what they can edit:</div>
                  <button className="btn-small" style={{ fontSize: 12 }} onClick={() => sendEditLink('personal')}>👤 Personal info</button>
                  {otherBusinesses.map((b) => (
                    <button key={b.id} className="btn-small" style={{ fontSize: 12 }} onClick={() => sendEditLink('business', b.id, b.name)}>🏢 {b.name}</button>
                  ))}
                  {otherBusinesses.length === 0 && <div className="muted" style={{ fontSize: 12 }}>This user has no businesses to edit.</div>}
                  <button className="btn-ghost-small" style={{ fontSize: 12, alignSelf: 'flex-start' }} onClick={() => setShowLinkPicker(false)}>Cancel</button>
                </div>
              )}
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map((m) => {
                  const isMe = m.sender_id === currentUser.id
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '70%', padding: '10px 14px', borderRadius: 14,
                        background: isMe ? '#1D9E75' : 'var(--hover-bg)',
                        color: isMe ? '#fff' : 'var(--text)', fontSize: 14,
                      }}>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{linkify(m.message)}</div>
                        <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>
                          {new Date(m.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
              <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                  placeholder="Type a message…"
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }}
                />
                <button onClick={send} disabled={sending || !text.trim()} style={{ padding: '10px 20px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {showReportModal && activeThread && (
        <ReportUserModal
          reportedUserId={activeThread.otherUserId}
          reportedUsername={activeThread.profile?.username || 'user'}
          currentUser={currentUser}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  )
}
