import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

export default function Support({ onBack, currentUser }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef(null)

  useEffect(() => {
    loadMessages()

    // Live updates — new messages appear instantly without refresh
    const channel = supabase
      .channel(`support-${currentUser.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'support_messages',
        filter: `thread_user_id=eq.${currentUser.id}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages() {
    setLoading(true)
    const { data } = await supabase
      .from('support_messages')
      .select('*')
      .eq('thread_user_id', currentUser.id)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    setLoading(false)
  }

  async function sendMessage() {
    if (!text.trim()) return
    setSending(true)
    const { error } = await supabase.from('support_messages').insert({
      sender_id: currentUser.id,
      thread_user_id: currentUser.id,
      message: text.trim(),
    })
    setSending(false)
    if (error) { alert('Error sending message: ' + error.message); return }
    setText('')
    loadMessages()
  }

  return (
    <div className="section" style={{ maxWidth: 640 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>
      <h2 style={{ marginBottom: 6 }}>Support</h2>
      <p className="muted" style={{ marginBottom: 20 }}>Chat with our team live — great for requesting changes to your business listing, like your name, category, or location.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--hover-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>✉️</div>
          <div style={{ fontSize: 13 }}><strong style={{ color: 'var(--text-strong)' }}>support@bizcheckkenya.com</strong></div>
        </div>
      </div>

      {/* LIVE CHAT */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 460 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          💬 Live chat with BizCheck team
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1D9E75' }}></span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <p className="muted" style={{ textAlign: 'center' }}>Loading conversation…</p>
          ) : messages.length === 0 ? (
            <p className="muted" style={{ textAlign: 'center', marginTop: 40 }}>No messages yet. Say hello or ask us anything — we usually reply within 24hrs.</p>
          ) : (
            messages.map((m) => {
              const isMe = m.sender_id === currentUser.id
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '75%', padding: '10px 14px', borderRadius: 14,
                    background: isMe ? '#1D9E75' : 'var(--hover-bg)',
                    color: isMe ? '#fff' : 'var(--text)',
                    fontSize: 14, lineHeight: 1.5,
                  }}>
                    {!isMe && <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2, opacity: 0.7 }}>BizCheck Support</div>}
                    {m.message}
                    <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>
                      {new Date(m.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type your message…"
            style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }}
          />
          <button
            onClick={sendMessage}
            disabled={sending || !text.trim()}
            style={{ padding: '10px 20px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
