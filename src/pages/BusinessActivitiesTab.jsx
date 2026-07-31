import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import RubiksLoader from './RubiksLoader'
import { AuthorRow } from './Avatar'

const GREEN = '#1D9E75'

function StarDisplay({ rating, size = 13 }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} style={{ color: s <= rating ? '#F5A623' : 'var(--border)', fontSize: size }}>★</span>
      ))}
    </span>
  )
}

export default function BusinessActivitiesTab({ business, currentUser }) {
  const [openCard, setOpenCard] = useState(null) // 'reviews' | 'activity' | 'history'
  const [loading, setLoading] = useState(true)
  const [reviews, setReviews] = useState([])
  const [activityLog, setActivityLog] = useState([])
  const [counts, setCounts] = useState({ posts: 0, visited: 0, edits: 0, reportedBiz: 0, reportedUsers: 0, likedPosts: 0 })
  const [history, setHistory] = useState({ reportedBusinesses: [], reportedUsers: [], likedPosts: [] })

  useEffect(() => { load() }, [business?.id])

  async function load() {
    if (!business?.id) return
    setLoading(true)

    const [
      { data: reviewData },
      { data: logData },
      { count: postCount },
      { data: visitedData },
      { data: reportedBizData },
      { data: reportedUserData },
      { data: likedData },
    ] = await Promise.all([
      supabase.from('reviews').select('*, profiles(username, avatar_url)').eq('business_id', business.id).order('created_at', { ascending: false }),
      supabase.from('business_activity_log').select('*').eq('business_id', business.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('market_posts').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
      // Businesses this business's owner has viewed
      currentUser
        ? supabase.from('profile_views').select('business_id').eq('viewer_id', currentUser.id)
        : Promise.resolve({ data: [] }),
      currentUser
        ? supabase.from('reports').select('id, business_id, created_at, businesses(name)').eq('reporter_id', currentUser.id).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      currentUser
        ? supabase.from('user_reports').select('id, created_at').eq('reporter_id', currentUser.id).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      currentUser
        ? supabase.from('post_likes').select('post_id, created_at, market_posts(caption, businesses(name))').eq('user_id', currentUser.id).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])

    setReviews(reviewData || [])
    setActivityLog(logData || [])

    const uniqueVisited = new Set((visitedData || []).map((v) => v.business_id).filter((id) => id !== business.id))

    setCounts({
      posts: postCount || 0,
      visited: uniqueVisited.size,
      edits: (logData || []).length,
      reportedBiz: (reportedBizData || []).length,
      reportedUsers: (reportedUserData || []).length,
      likedPosts: (likedData || []).length,
    })

    setHistory({
      reportedBusinesses: reportedBizData || [],
      reportedUsers: reportedUserData || [],
      likedPosts: likedData || [],
    })

    setLoading(false)
  }

  function toggle(card) {
    setOpenCard((prev) => (prev === card ? null : card))
  }

  if (loading) return <RubiksLoader label="Loading your activity…" />

  const positiveReviews = reviews.filter((r) => r.rating >= 4).length
  const negativeReviews = reviews.filter((r) => r.rating <= 2).length

  return (
    <div style={{ textAlign: 'left' }}>
      <h3 style={{ marginBottom: 2 }}>Activities</h3>
      <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>Tap a card to see the detail.</p>

      <RollCard
        icon="⭐"
        title="Reviews"
        summary={`${reviews.length} total · ${positiveReviews} positive · ${negativeReviews} negative`}
        open={openCard === 'reviews'}
        onToggle={() => toggle('reviews')}
      >
        {reviews.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No reviews yet.</p>
        ) : (
          reviews.map((r) => (
            <div key={r.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 12 }}>
              <AuthorRow
                username={r.profiles?.username}
                photoUrl={r.profiles?.avatar_url}
                timestamp={r.created_at}
                size={30}
                trailing={<StarDisplay rating={r.rating} />}
              />
              {r.review_text && <p style={{ fontSize: 13, paddingLeft: 39 }}>{r.review_text}</p>}
            </div>
          ))
        )}
      </RollCard>

      <RollCard
        icon="📊"
        title="Activity"
        summary={`${counts.posts} posts · ${counts.visited} businesses visited · ${counts.edits} profile changes`}
        open={openCard === 'activity'}
        onToggle={() => toggle('activity')}
      >
        <MiniRow label="Posts published to the market" value={counts.posts} />
        <MiniRow label="Other businesses you've visited" value={counts.visited} />
        <MiniRow label="Changes made to your profile" value={counts.edits} />

        {activityLog.length > 0 && (
          <>
            <p style={{ fontSize: 12.5, fontWeight: 700, margin: '14px 0 8px' }}>Recent profile changes</p>
            {activityLog.slice(0, 15).map((log) => (
              <p key={log.id} style={{ fontSize: 12.5, marginBottom: 6 }} className="muted">
                <strong style={{ color: 'var(--text)' }}>{log.field_changed}</strong>
                {log.old_value ? ` changed from "${log.old_value}" to "${log.new_value}"` : ` set to "${log.new_value}"`}
                {' · '}
                {new Date(log.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
              </p>
            ))}
          </>
        )}
      </RollCard>

      <RollCard
        icon="🕘"
        title="History"
        summary={`${counts.reportedBiz} businesses reported · ${counts.reportedUsers} users reported · ${counts.likedPosts} posts liked`}
        open={openCard === 'history'}
        onToggle={() => toggle('history')}
      >
        <p style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Businesses you've reported</p>
        {history.reportedBusinesses.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>None yet.</p>
        ) : (
          history.reportedBusinesses.map((r) => (
            <p key={r.id} style={{ fontSize: 13, marginBottom: 5 }}>
              {r.businesses?.name || 'Business'}
              <span className="muted"> · {new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </p>
          ))
        )}

        <p style={{ fontSize: 12.5, fontWeight: 700, margin: '14px 0 8px' }}>Users you've reported</p>
        {history.reportedUsers.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>None yet.</p>
        ) : (
          history.reportedUsers.map((r) => (
            <p key={r.id} className="muted" style={{ fontSize: 13, marginBottom: 5 }}>
              Report filed {new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          ))
        )}

        <p style={{ fontSize: 12.5, fontWeight: 700, margin: '14px 0 8px' }}>Posts you've liked</p>
        {history.likedPosts.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>None yet.</p>
        ) : (
          history.likedPosts.map((l) => (
            <p key={l.post_id} style={{ fontSize: 13, marginBottom: 5 }}>
              {l.market_posts?.businesses?.name || 'A business'}
              <span className="muted"> — {l.market_posts?.caption?.slice(0, 50) || 'post'}</span>
            </p>
          ))
        )}
      </RollCard>
    </div>
  )
}

function RollCard({ icon, title, summary, open, onToggle, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 12, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-strong)' }}>{title}</p>
          <p className="muted" style={{ fontSize: 12 }}>{summary}</p>
        </div>
        <span style={{ fontSize: 12, color: GREEN, transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          {children}
        </div>
      )}
    </div>
  )
}

function MiniRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
      <span className="muted">{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  )
}
