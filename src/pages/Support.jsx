import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

// Simple FAQ knowledge base — bot matches keywords and replies instantly.
// No AI API needed, so it's free and always available, even when admin is offline.
const FAQ_RESPONSES = [
  {
    keywords: ['list my business', 'register my business', 'add my business', 'submit business', 'list a business'],
    answer: "To list your business, go to My Profile → My Business tab → click '+ List a business'. Fill in the form and our admin team will verify it within 24hrs. 🏢",
  },
  {
    keywords: ['change my business name', 'edit business name', 'update business name', 'change name', 'change category', 'change location', 'wrong location', 'wrong category'],
    answer: "Business name, category, and location can't be edited directly for security reasons. Just tell me what you'd like changed and a team member will update it for you shortly! ✏️",
  },
  {
    keywords: ['how does this work', 'how does bizcheck work', 'what is bizcheck', 'what does this app do'],
    answer: "BizCheck Kenya helps you verify sellers before you buy — search any business by name, phone, or M-Pesa till to see its trust score and reviews. You can also report scammers to protect other Kenyans. 🇰🇪",
  },
  {
    keywords: ['report a scam', 'report scammer', 'how to report', 'i got scammed', 'i was scammed'],
    answer: "So sorry to hear that. Go to 'Report a Scammer' in the menu, search the seller's name first, then fill in the report form. Our team reviews every report. 🚩",
  },
  {
    keywords: ['is this free', 'do i pay', 'cost', 'pricing', 'subscription'],
    answer: "BizCheck Kenya is 100% free to use — no subscriptions, no hidden fees. 🆓",
  },
  {
    keywords: ['trust score', 'how is trust score calculated', 'what is trust score'],
    answer: "A business's trust score is based on community votes (👍 legit / 👎 scam) and verified scam reports. Higher is better — above 70% is generally trustworthy.",
  },
  {
    keywords: ['delete my account', 'close my account', 'remove my account'],
    answer: "We're sorry to see you go! Please share your registered email or phone number and our team will process your account deletion request.",
  },
  {
    keywords: ['forgot password', 'reset password', "can't log in", 'cannot log in', 'login issue'],
    answer: "On the login page, click 'Forgot your password?' and we'll send a reset link to your email. If you still have trouble, let us know your registered email here.",
  },
  {
    keywords: ['claim my business', 'claim business', 'this is my business'],
    answer: "If you see your business listed but don't own it in our system yet, visit its profile page and click '🏢 Is this your business? Claim it', then fill in your ID number. Our admin team verifies every claim.",
  },
]

function findBotReply(message) {
  const lower = message.toLowerCase()
  for (const faq of FAQ_RESPONSES) {
    if (faq.keywords.some((kw) => lower.includes(kw))) {
      return faq.answer
    }
  }
  return null
}

const FALLBACK_REPLY = "Thanks for reaching out! I couldn't find an instant answer for that, but I've flagged your message for our team — we usually reply within 24hrs. In the meantime, you can ask me about: listing a business, reporting a scam, trust scores, or account help. 💬"

export default function Support({ onBack, currentUser }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [botTyping, setBotTyping] = useState(false)
  const sentFallbackRef = useRef(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    loadMessages()

    const channel = supabase
      .channel(`support-${currentUser.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'support_messages',
        filter: `thread_user_id=eq.${currentUser.id}`,
      }, (payload) => {
        setMessages((prev) => {
          if (prev.some(m => m.id === payload.new.id)) return prev
          return [...prev, payload.new]
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, botTyping])

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
    const messageText = text.trim()
    setSending(true)
    setText('')

    const { error } = await supabase.from('support_messages').insert({
      sender_id: currentUser.id,
      thread_user_id: currentUser.id,
      message: messageText,
    })
    setSending(false)
    if (error) { alert('Error sending message: ' + error.message); return }

    // Try to answer instantly with the bot before a human replies
    const botAnswer = findBotReply(messageText)
    const isQuestion = messageText.includes('?') || /^(how|what|why|when|where|can|is|do|does|will)\b/i.test(messageText)

    if (botAnswer || (isQuestion && !sentFallbackRef.current)) {
      setBotTyping(true)
      setTimeout(async () => {
        await supabase.from('support_messages').insert({
          sender_id: null,
          thread_user_id: currentUser.id,
          message: botAnswer || FALLBACK_REPLY,
          is_bot: true,
        })
        if (!botAnswer) sentFallbackRef.current = true
        setBotTyping(false)
        loadMessages()
      }, 900)
    }
  }

  return (
    <div className="section" style={{ maxWidth: 640 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>
      <h2 style={{ marginBottom: 6 }}>Support</h2>
      <p className="muted" style={{ marginBottom: 20 }}>Chat with our team — our assistant answers common questions instantly, and a real person follows up within 24hrs.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--hover-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>✉️</div>
          <div style={{ fontSize: 13 }}><strong style={{ color: 'var(--text-strong)' }}>support@bizcheckkenya.com</strong></div>
        </div>
      </div>

      {/* LIVE CHAT */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 480 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          💬 BizCheck Support
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1D9E75' }}></span>
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>Assistant online · Team replies within 24hrs</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <p className="muted" style={{ textAlign: 'center' }}>Loading conversation…</p>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 30 }}>
              <p className="muted" style={{ marginBottom: 10 }}>👋 Hi! Ask me anything — I can help instantly with common questions, or connect you to our team.</p>
              <p className="muted" style={{ fontSize: 12 }}>Try: "How do I list my business?" or "How do I report a scam?"</p>
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.sender_id === currentUser.id
              const isBot = m.is_bot
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '78%', padding: '10px 14px', borderRadius: 14,
                    background: isMe ? '#1D9E75' : isBot ? '#E0F7FA' : 'var(--hover-bg)',
                    color: isMe ? '#fff' : 'var(--text)',
                    fontSize: 14, lineHeight: 1.5,
                    border: isBot ? '1px solid #80DEEA' : 'none',
                  }}>
                    {!isMe && (
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2, opacity: 0.7 }}>
                        {isBot ? '🤖 BizCheck Assistant' : 'BizCheck Support'}
                      </div>
                    )}
                    {m.message}
                    <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>
                      {new Date(m.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          {botTyping && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ padding: '10px 14px', borderRadius: 14, background: '#E0F7FA', border: '1px solid #80DEEA', fontSize: 13, color: '#0D6E82' }}>
                🤖 typing…
              </div>
            </div>
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
