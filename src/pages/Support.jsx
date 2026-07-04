import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

// Simple FAQ knowledge base — bot matches keywords and replies instantly.
// No AI API needed, so it's free and always available, even when admin is offline.
const FAQ_RESPONSES = [
  // ── Getting started ──
  {
    keywords: ['how does this work', 'how does bizcheck work', 'what is bizcheck', 'what does this app do', 'what is this app', 'what is this site'],
    answer: "BizCheck Kenya helps you verify sellers before you buy — search any business by name, phone number, or M-Pesa till to see its trust score, community votes, and reviews before you send money. You can also report scammers to protect other Kenyans. 🇰🇪",
  },
  {
    keywords: ['is this free', 'do i pay', 'cost', 'pricing', 'subscription', 'how much'],
    answer: "BizCheck Kenya is 100% free to use — no subscriptions, no hidden fees, ever. 🆓",
  },
  {
    keywords: ['who runs this', 'who owns bizcheck', 'who created', 'who made this', 'about bizcheck'],
    answer: "BizCheck Kenya is a community-driven platform built to fight online fraud in Kenya. Real Kenyans vote, review, and report — our small team reviews everything to keep it accurate.",
  },

  // ── Searching / checking sellers ──
  {
    keywords: ['how do i search', 'how to search', 'check a seller', 'check a business', 'is this seller legit', 'verify a seller', 'is this business real'],
    answer: "Just type the business name, phone number, M-Pesa till, or social media handle into the search bar on the Home page. We'll show you their trust score, reviews, and any scam reports. 🔍",
  },
  {
    keywords: ['trust score', 'how is trust score calculated', 'what is trust score', 'what does trust score mean'],
    answer: "A business's trust score is based on community votes (👍 legit / 👎 scam) — scam votes count more heavily to stay cautious. Above 70% is generally trustworthy, below 40% means exercise real caution.",
  },
  {
    keywords: ['how does voting work', 'legit vote', 'scam vote', 'why cant i vote'],
    answer: "On any business profile, click 👍 Legit or 👎 Scam to cast your vote — you need to be logged in, and each user can only vote once per business (though you can change your vote later).",
  },

  // ── Reporting scammers ──
  {
    keywords: ['report a scam', 'report scammer', 'how to report', 'i got scammed', 'i was scammed', 'report a seller', 'report this business'],
    answer: "So sorry to hear that. Go to 'Report a Scammer' in the menu, search the seller's name first — if they're already listed you can report directly from their profile, otherwise fill in the details yourself. Our team reviews every report. 🚩",
  },
  {
    keywords: ['what happens after i report', 'report status', 'is my report anonymous', 'will they know i reported'],
    answer: "Your report goes straight to our admin team for review — the business is never told who reported them. If enough people report the same business, it gets flagged or marked as a scam.",
  },
  {
    keywords: ['how many reports', 'when does a business get flagged', 'when is a business a scam', 'flagged threshold', 'scam threshold'],
    answer: "Our admin team reviews businesses once they receive multiple reports from different users — this helps make sure no one gets falsely accused by a single angry customer.",
  },

  // ── Listing / owning a business ──
  {
    keywords: ['list my business', 'register my business', 'add my business', 'submit business', 'list a business', 'how to list'],
    answer: "To list your business, go to My Profile → My Business tab → click '+ List a business'. Fill in the form and our admin team will verify it within 24hrs. 🏢",
  },
  {
    keywords: ['how long does verification take', 'when will my business be verified', 'verification time', 'still pending', 'pending review'],
    answer: "Verification usually takes up to 24 hours. If it's been longer, reply here with your business name and we'll check on it for you.",
  },
  {
    keywords: ['claim my business', 'claim business', 'this is my business', 'how to claim'],
    answer: "If you see your business listed but it's not linked to your account yet, visit its profile page and click '🏢 Is this your business? Claim it', then fill in your ID number. Our admin team verifies every claim.",
  },
  {
    keywords: ['change my business name', 'edit business name', 'update business name', 'change name', 'change category', 'change location', 'wrong location', 'wrong category', 'update my business', 'edit my business'],
    answer: "Business name, category, and location can't be edited directly for security reasons — this prevents scammers from renaming a flagged business to escape detection. Just tell me what you'd like changed and a team member will update it for you shortly! ✏️",
  },
  {
    keywords: ['edit description', 'change phone number', 'update contact', 'change mpesa till', 'update social media'],
    answer: "You can update your description, phone, M-Pesa till, and social handles yourself — go to My Profile → My Business → click on your verified business → Edit profile.",
  },
  {
    keywords: ['how many views', 'who viewed my business', 'business dashboard', 'business stats', 'business analytics'],
    answer: "Click on your own verified business under My Profile → My Business to see your private dashboard — it shows total views, ratings, and every review you've received.",
  },
  {
    keywords: ['reply to a review', 'respond to review', 'answer a review'],
    answer: "You can reply to any review on your business — go to your business dashboard, find the review, and click 'Reply to this review'. Your reply is visible publicly.",
  },

  // ── Account help ──
  {
    keywords: ['forgot password', 'reset password', 'change password', 'change my password', 'new password', "can't log in", 'cannot log in', 'login issue', 'trouble logging in'],
    answer: "On the login page, click 'Forgot your password?' and we'll send a reset link to your email. If you still have trouble, share your registered email here and we'll help.",
  },
  {
    keywords: ['change my username', 'edit username', 'update username'],
    answer: "Go to My Profile → Personal Info tab → click '✏️ Change username' — you can pick any new username as long as it's available.",
  },
  {
    keywords: ['change my email', 'update my email', 'change my phone number', 'update phone number'],
    answer: "Reply here with your current registered email/phone and what you'd like it changed to — our team will verify and update it for you.",
  },
  {
    keywords: ['delete my account', 'close my account', 'remove my account', 'deactivate account'],
    answer: "We're sorry to see you go! Please share your registered email or phone number and our team will process your account deletion request.",
  },
  {
    keywords: ['sign up with google', 'google login', 'continue with google'],
    answer: "Yes! On the login or signup page, click 'Continue with Google' to sign in instantly with your Google account — no password needed.",
  },

  // ── Safety & trust ──
  {
    keywords: ['is my data safe', 'privacy', 'data protection', 'is bizcheck safe'],
    answer: "We take privacy seriously — your personal details are never shown publicly, only your chosen username. Reports are reviewed by admins and never shared with the business you reported.",
  },
  {
    keywords: ['mpesa safety', 'mpesa tips', 'safe payment', 'how to pay safely'],
    answer: "Before sending M-Pesa, always check the seller's trust score here first, confirm the till/paybill name matches the business, and avoid sending money for goods you haven't seen or agreed on clearly.",
  },
  {
    keywords: ['signs of a scam', 'how to spot a scammer', 'red flags'],
    answer: "Common red flags: prices far below market rate, pressure to pay immediately, refusal to meet or video call, no reviews or a very low trust score, and requests to pay via unusual methods.",
  },

  // ── Contact / human help ──
  {
    keywords: ['talk to a human', 'real person', 'speak to someone', 'human agent', 'contact support', 'email support'],
    answer: "Of course — I've noted your message and a real team member will follow up here within 24hrs. You can also email us directly at support@bizcheckkenya.com.",
  },
  {
    keywords: ['thank you', 'thanks', 'thank you so much', 'appreciate it'],
    answer: "You're very welcome! 😊 Let me know if there's anything else I can help with.",
  },
]

// Normalize text so matching ignores case, punctuation, and extra spaces
// e.g. "How can I change my PASSWORD?!" -> "how can i change my password"
function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function findBotReply(message) {
  const cleaned = normalize(message)
  for (const faq of FAQ_RESPONSES) {
    if (faq.keywords.some((kw) => cleaned.includes(normalize(kw)))) {
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

    // The bot always tries to reply — either with a matched FAQ answer,
    // or a friendly fallback letting the user know a human will follow up.
    const botAnswer = findBotReply(messageText)

    setBotTyping(true)
    setTimeout(async () => {
      await supabase.from('support_messages').insert({
        sender_id: null,
        thread_user_id: currentUser.id,
        message: botAnswer || FALLBACK_REPLY,
        is_bot: true,
      })
      setBotTyping(false)
      loadMessages()
    }, 900)
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
                    color: isMe ? '#fff' : isBot ? '#0D3C46' : 'var(--text)',
                    fontSize: 14, lineHeight: 1.5,
                    border: isBot ? '1px solid #80DEEA' : 'none',
                  }}>
                    {!isMe && (
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2, color: isBot ? '#17A2B8' : 'var(--text-muted)' }}>
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
              <div style={{ padding: '10px 14px', borderRadius: 14, background: 'var(--hover-bg)', border: '1.5px solid #17A2B8', fontSize: 13, color: 'var(--text)' }}>
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
