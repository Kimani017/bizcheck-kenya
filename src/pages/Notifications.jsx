import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { SkeletonList } from './Skeleton'

export default function Notifications({ currentUser, businessMode, onBack, onOpenMessages, onOpenB2B }) {
  const [unreadDMs, setUnreadDMs] = useState(0)
  const [unreadB2B, setUnreadB2B] = useState(0)
  const [violations, setViolations] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)

    const promises = [
      supabase.from('direct_messages').select('id', { count: 'exact', head: true }).eq('recipient_id', currentUser.id).eq('is_read', false),
      supabase.from('user_enforcement_actions').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20),
    ]

    if (businessMode) {
      promises.push(
        supabase.from('b2b_messages').select('id', { count: 'exact', head: true }).eq('recipient_business_id', businessMode.id).eq('is_read', false)
      )
    }

    const results = await Promise.all(promises)
    setUnreadDMs(results[0].count || 0)
    setViolations(results[1].data || [])
    setAnnouncements(results[2].data || [])
    if (businessMode) setUnreadB2B(results[3].count || 0)

    setLoading(false)
  }

  function actionLabel(action) {
    if (action === 'warn') return '⚠ Warning issued'
    if (action === 'restrict') return '🚫 Review restriction (45 days)'
    if (action === 'ban') return '⛔ Account banned'
    return action
  }

  if (loading) return <div className="section" style={{ maxWidth: 640 }}><h2 style={{ marginBottom: 20 }}>Notifications</h2><SkeletonList count={4} /></div>

  return (
    <div className="section" style={{ maxWidth: 640 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>
      <h2 style={{ marginBottom: 6 }}>Notifications</h2>
      <p className="muted" style={{ marginBottom: 20 }}>Stay on top of messages, violations, and app updates.</p>

      {/* UNREAD MESSAGES */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        <button
          onClick={onOpenMessages}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', cursor: 'pointer', textAlign: 'left' }}
        >
          <span style={{ fontWeight: 600 }}>💬 Direct Messages</span>
          {unreadDMs > 0 ? (
            <span style={{ background: '#E24B4A', color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 12, padding: '2px 10px' }}>{unreadDMs} unread</span>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>All caught up</span>
          )}
        </button>

        {businessMode && (
          <button
            onClick={onOpenB2B}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ fontWeight: 600 }}>🏢 B2B Messages</span>
            {unreadB2B > 0 ? (
              <span style={{ background: '#E24B4A', color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 12, padding: '2px 10px' }}>{unreadB2B} unread</span>
            ) : (
              <span className="muted" style={{ fontSize: 13 }}>All caught up</span>
            )}
          </button>
        )}
      </div>

      {/* VIOLATIONS */}
      {!businessMode && (
        <>
          <h3 style={{ marginBottom: 12 }}>Your account activity</h3>
          {violations.length === 0 ? (
            <p className="muted" style={{ marginBottom: 24 }}>No violations on your account.</p>
          ) : (
            <div className="detail-rows" style={{ marginBottom: 24 }}>
              {violations.map((v) => (
                <div className="detail-row" key={v.id}>
                  <span>{actionLabel(v.action)}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {new Date(v.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ANNOUNCEMENTS */}
      <h3 style={{ marginBottom: 12 }}>App updates</h3>
      {announcements.length === 0 ? (
        <p className="muted">No announcements yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {announcements.map((a) => (
            <div key={a.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{a.title}</div>
              <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>{a.body}</p>
              <div className="muted" style={{ fontSize: 12 }}>
                {new Date(a.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
