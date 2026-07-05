import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

export default function B2BChat({ myBusiness, initialTargetBusiness, onBack }) {
  const [threads, setThreads] = useState([])
  const [activeThread, setActiveThread] = useState(null) // { business, otherBusinessId }
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef(null)

  useEffect(() => {
    loadThreads().then(() => {
      if (initialTargetBusiness) openThreadWith(initialTargetBusiness)
    })

    const channel = supabase
      .channel(`b2b-${myBusiness.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'b2b_messages' }, (payload) => {
        if (payload.new.recipient_business_id === myBusiness.id || payload.new.sender_business_id === myBusiness.id) {
          loadThreads()
          if (activeThread && (payload.new.sender_business_id === activeThread.otherBusinessId || payload.new.recipient_business_id === activeThread.otherBusinessId)) {
            setMessages((prev) => [...prev, payload.new])
          }
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadThreads() {
    setLoading(true)
    const { data } = await supabase
      .from('b2b_messages')
      .select('*')
      .or(`sender_business_id.eq.${myBusiness.id},recipient_business_id.eq.${myBusiness.id}`)
      .order('created_at', { ascending: false })

    const grouped = {}
    for (const m of data || []) {
      const otherId = m.sender_business_id === myBusiness.id ? m.recipient_business_id : m.sender_business_id
      if (!grouped[otherId]) grouped[otherId] = { otherBusinessId: otherId, lastMessage: m, unreadCount: 0 }
      if (m.recipient_business_id === myBusiness.id && !m.is_read) grouped[otherId].unreadCount++
    }

    const ids = Object.keys(grouped)
    if (ids.length > 0) {
      const { data: businesses } = await supabase.from('businesses').select('id, name, category').in('id', ids)
      businesses?.forEach((b) => { if (grouped[b.id]) grouped[b.id].business = b })
    }

    setThreads(Object.values(grouped).sort((a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at)))
    setLoading(false)
  }

  async function openThreadWith(otherBusiness) {
    setActiveThread({ business: otherBusiness, otherBusinessId: otherBusiness.id })

    const { data } = await supabase
      .from('b2b_messages')
      .select('*')
      .or(`and(sender_business_id.eq.${myBusiness.id},recipient_business_id.eq.${otherBusiness.id}),and(sender_business_id.eq.${otherBusiness.id},recipient_business_id.eq.${myBusiness.id})`)
      .order('created_at', { ascending: true })
    setMessages(data || [])

    await supabase.from('b2b_messages').update({ is_read: true }).eq('sender_business_id', otherBusiness.id).eq('recipient_business_id', myBusiness.id).eq('is_read', false)
    loadThreads()
  }

  async function send() {
    if (!text.trim() || !activeThread) return
    setSending(true)
    const { error } = await supabase.from('b2b_messages').insert({
      sender_business_id: myBusiness.id,
      recipient_business_id: activeThread.otherBusinessId,
      sender_user_id: myBusiness.owner_id,
      message: text.trim(),
    })
    setSending(false)
    if (error) { alert('Error sending: ' + error.message); return }
    setText('')
    openThreadWith(activeThread.business)
  }

  if (loading) return <div className="section" style={{ maxWidth: 820 }}><p className="muted">Loading conversations…</p></div>

  return (
    <div className="section" style={{ maxWidth: 820 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>
      <h2 style={{ marginBottom: 6 }}>B2B Messages</h2>
      <p className="muted" style={{ marginBottom: 20 }}>Chat directly with other businesses on BizCheck Kenya.</p>

      <div style={{ display: 'flex', gap: 16, height: 500, flexWrap: 'wrap' }}>
        <div style={{ width: 260, flexShrink: 0, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
            Conversations ({threads.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {threads.length === 0 ? (
              <p className="muted" style={{ padding: 14, fontSize: 13 }}>No B2B conversations yet. Visit another business's profile and click "Message this business".</p>
            ) : threads.map((t) => (
              <button
                key={t.otherBusinessId}
                onClick={() => openThreadWith(t.business)}
                style={{ width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: activeThread?.otherBusinessId === t.otherBusinessId ? 'var(--hover-bg)' : 'transparent', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>🏢 {t.business?.name || 'Business'}</strong>
                  {t.unreadCount > 0 && <span style={{ background: '#E24B4A', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 6px' }}>{t.unreadCount}</span>}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.lastMessage.message}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 240, border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!activeThread ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p className="muted">Select a conversation.</p></div>
          ) : (
            <>
              <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>🏢 {activeThread.business.name}</div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map((m) => {
                  const isMe = m.sender_business_id === myBusiness.id
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: '70%', padding: '10px 14px', borderRadius: 14, background: isMe ? '#1D9E75' : 'var(--hover-bg)', color: isMe ? '#fff' : 'var(--text)', fontSize: 14 }}>
                        {m.message}
                        <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>{new Date(m.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
              <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Type a message…" style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }} />
                <button onClick={send} disabled={sending || !text.trim()} style={{ padding: '10px 20px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Send</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
