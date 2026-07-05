import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { SkeletonList } from './Skeleton'

export default function B2BOversight({ onBack }) {
  const [threads, setThreads] = useState([])
  const [activeThread, setActiveThread] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadThreads() }, [])

  async function loadThreads() {
    setLoading(true)
    const { data } = await supabase
      .from('b2b_messages')
      .select('*, sender:businesses!b2b_messages_sender_business_id_fkey(id, name), recipient:businesses!b2b_messages_recipient_business_id_fkey(id, name)')
      .order('created_at', { ascending: false })

    // Group into unique business-pair conversations
    const grouped = {}
    for (const m of data || []) {
      const key = [m.sender_business_id, m.recipient_business_id].sort().join('-')
      if (!grouped[key]) {
        grouped[key] = { key, businessA: m.sender, businessB: m.recipient, lastMessage: m, count: 0 }
      }
      grouped[key].count++
    }
    setThreads(Object.values(grouped).sort((a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at)))
    setLoading(false)
  }

  async function openThread(t) {
    setActiveThread(t)
    const { data } = await supabase
      .from('b2b_messages')
      .select('*')
      .or(`and(sender_business_id.eq.${t.businessA.id},recipient_business_id.eq.${t.businessB.id}),and(sender_business_id.eq.${t.businessB.id},recipient_business_id.eq.${t.businessA.id})`)
      .order('created_at', { ascending: true })
    setMessages(data || [])
  }

  if (loading) return <div className="section" style={{ maxWidth: 820 }}><h2 style={{ marginBottom: 20 }}>B2B Oversight</h2><SkeletonList count={5} /></div>

  return (
    <div className="section" style={{ maxWidth: 820 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>
      <h2 style={{ marginBottom: 6 }}>B2B — Business to Business Chats</h2>
      <p className="muted" style={{ marginBottom: 20 }}>Read-only oversight of every conversation between businesses. You cannot reply here.</p>

      <div style={{ display: 'flex', gap: 16, height: 500, flexWrap: 'wrap' }}>
        <div style={{ width: 280, flexShrink: 0, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
            All conversations ({threads.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {threads.length === 0 ? (
              <p className="muted" style={{ padding: 14, fontSize: 13 }}>No B2B conversations yet.</p>
            ) : threads.map((t) => (
              <button
                key={t.key}
                onClick={() => openThread(t)}
                style={{ width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: activeThread?.key === t.key ? 'var(--hover-bg)' : 'transparent', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 700, fontSize: 13 }}>🏢 {t.businessA?.name} ↔ {t.businessB?.name}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{t.count} message{t.count !== 1 ? 's' : ''}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 240, border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!activeThread ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p className="muted">Select a conversation to view (read-only).</p></div>
          ) : (
            <>
              <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
                🏢 {activeThread.businessA?.name} ↔ {activeThread.businessB?.name}
                <span className="badge badge-pending" style={{ marginLeft: 8, fontSize: 11 }}>👁 Oversight only</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map((m) => {
                  const isA = m.sender_business_id === activeThread.businessA.id
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: isA ? 'flex-start' : 'flex-end' }}>
                      <div style={{ maxWidth: '70%', padding: '10px 14px', borderRadius: 14, background: isA ? 'var(--hover-bg)' : '#E1F5EE', color: 'var(--text)', fontSize: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 2, opacity: 0.7 }}>{isA ? activeThread.businessA?.name : activeThread.businessB?.name}</div>
                        {m.message}
                        <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>{new Date(m.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ padding: 12, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                <span className="muted" style={{ fontSize: 12 }}>🔒 Superadmin oversight — replying is disabled</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
