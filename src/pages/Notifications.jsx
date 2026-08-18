import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { SkeletonList } from './Skeleton'
import { cache, TTL } from '../cache'

const TYPE_ICONS = {
  business_approved: '✅',
  business_live:     '🚀',
  subscription:      '📅',
  order_update:      '📦',
  transfer:          '💸',
  general:           '🔔',
}

export default function Notifications({ currentUser, businessMode, onBack, onOpenMessages, onOpenB2B }) {
  const [unreadDMs, setUnreadDMs]         = useState(0)
  const [unreadB2B, setUnreadB2B]         = useState(0)
  const [violations, setViolations]       = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [bizNotifs, setBizNotifs]         = useState([])   // new: business notifications
  const [markingAll, setMarkingAll]       = useState(false)
  const [loading, setLoading]             = useState(true)

  useEffect(() => { loadAll() }, [currentUser?.id])

  async function loadAll() {
    setLoading(true)

    const promises = [
      supabase.from('direct_messages').select('id', { count: 'exact', head: true }).eq('recipient_id', currentUser.id).eq('is_read', false),
      supabase.from('user_enforcement_actions').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.rpc('get_my_notifications', { p_limit: 20, p_offset: 0 }),
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
    setBizNotifs(results[3].data || [])
    if (businessMode) setUnreadB2B(results[4]?.count || 0)

    setLoading(false)
  }

  async function markRead(id) {
    await supabase.rpc('mark_notifications_read', { p_notification_id: id })
    setBizNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
    cache.invalidate(`notifications:${currentUser?.id}`)
  }

  async function markAllRead() {
    setMarkingAll(true)
    await supabase.rpc('mark_notifications_read', { p_notification_id: null })
    setBizNotifs((prev) => prev.map((n) => ({ ...n, read: true })))
    cache.invalidate(`notifications:${currentUser?.id}`)
    setMarkingAll(false)
  }

  function actionLabel(action) {
    if (action === 'warn')     return '⚠ Warning issued'
    if (action === 'restrict') return '🚫 Review restriction (45 days)'
    if (action === 'ban')      return '⛔ Account banned'
    return action
  }

  const unreadBizNotifs = bizNotifs.filter((n) => !n.read).length

  if (loading) return (
    <div className="section" style={{ maxWidth: 640 }}>
      <h2 style={{ marginBottom: 20 }}>Notifications</h2>
      <SkeletonList count={4} />
    </div>
  )

  return (
    <div className="section" style={{ maxWidth: 640 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>
      <h2 style={{ marginBottom: 6 }}>Notifications</h2>
      <p className="muted" style={{ marginBottom: 20 }}>Stay on top of messages, violations, and app updates.</p>

      {/* ── BUSINESS NOTIFICATIONS (new) ──────────────────────────────────── */}
      {bizNotifs.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>
              Your alerts
              {unreadBizNotifs > 0 && (
                <span style={{ marginLeft: 8, fontSize: 12, background: '#1D9E75', color: '#fff', borderRadius: 20, padding: '2px 9px', fontWeight: 600 }}>
                  {unreadBizNotifs} new
                </span>
              )}
            </h3>
            {unreadBizNotifs > 0 && (
              <button
                onClick={markAllRead}
                disabled={markingAll}
                style={{ background: 'none', border: 'none', fontSize: 12, color: '#1D9E75', cursor: 'pointer', fontWeight: 600 }}
              >
                {markingAll ? 'Marking…' : 'Mark all read'}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bizNotifs.map((n) => (
              <div
                key={n.id}
                onClick={() => { if (!n.read) markRead(n.id) }}
                style={{
                  display: 'flex', gap: 12, padding: '14px 16px',
                  borderRadius: 12,
                  background: n.read ? 'var(--surface)' : 'var(--hover-bg)',
                  border: '1px solid ' + (n.read ? 'var(--border)' : '#1D9E7540'),
                  cursor: n.read ? 'default' : 'pointer',
                }}
              >
                <div style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>
                  {TYPE_ICONS[n.type] || '🔔'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <p style={{ fontWeight: n.read ? 500 : 700, fontSize: 14, margin: 0, lineHeight: 1.4 }}>
                      {n.title}
                    </p>
                    {!n.read && (
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1D9E75', flexShrink: 0, marginTop: 4 }} />
                    )}
                  </div>
                  <p className="muted" style={{ fontSize: 13, margin: '4px 0 4px', lineHeight: 1.5 }}>
                    {n.body}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                    {formatTimeAgo(n.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── UNREAD MESSAGES (existing) ────────────────────────────────────── */}
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

      {/* ── VIOLATIONS (existing) ─────────────────────────────────────────── */}
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

      {/* ── ANNOUNCEMENTS (existing) ──────────────────────────────────────── */}
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

function formatTimeAgo(timestamp) {
  const now  = new Date()
  const then = new Date(timestamp)
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60)    return 'Just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`
  return then.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
}
