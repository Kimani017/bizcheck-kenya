import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import RubiksLoader from './RubiksLoader'
import Icon from './Icon'
import { AuthorRow } from './Avatar'
import { cache, keys, tags, TTL } from '../cache'
import { rpc, tryQuery } from '../supabaseHelpers'
import { handleError } from '../errors'

const PAGE_SIZE = 8

export default function FeedTab({ onSelectBusiness, currentUser }) {
  const [posts, setPosts] = useState([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [likeState, setLikeState] = useState({})
  const [saveState, setSaveState] = useState({})
  const [commentState, setCommentState] = useState({})
  const [scanning, setScanning] = useState(false)
  const [scanNote, setScanNote] = useState(null)
  const [query, setQuery] = useState('')
  const [loadError, setLoadError] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => { loadPage(0) }, [currentUser?.id])

  async function loadPage(pageIndex, force = false) {
    setLoading(true)
    setLoadError(null)
    try {

    // Cached per user + page. A 2-minute TTL also gives the feed STABILITY:
    // get_ranked_feed draws a fresh Thompson sample every call, so without a
    // cache a user who backgrounds the app and returns gets a completely
    // reshuffled feed and loses their place.
    const rows = await cache.get(
      keys.feed(currentUser?.id, pageIndex),
      // rpc() THROWS on error. Critical: if this returned [] on failure,
      // cache.get would store the empty array for the full TTL and the feed
      // would stay empty even after the database was fixed.
      () => rpc('get_ranked_feed', {
        p_user_id: currentUser?.id ?? null,
        p_limit:   PAGE_SIZE,
        p_offset:  pageIndex * PAGE_SIZE,
      }),
      { ttl: TTL.FEED, tags: [tags.FEED], force }
    )

    const newPosts = rows.map((row) => ({
      id:               row.post_id,
      business_id:      row.business_id,
      product_id:       row.product_id,
      caption:          row.caption,
      market_photo_url: row.market_photo_url,
      created_at:       row.created_at,
      is_exploration:   row.is_exploration,
      businesses: {
        id:                row.business_id,
        name:              row.business_name,
        business_username: row.business_username,
        logo_url:          row.business_logo_url,
      },
      _like_count:    row.like_count,
      _comment_count: row.comment_count,
      _save_count:    row.save_count,
      _view_count:    row.view_count,
    }))

    setPosts((prev) => (pageIndex === 0 ? newPosts : [...prev, ...newPosts]))
    setHasMore(newPosts.length === PAGE_SIZE)
    setPage(pageIndex)
    await loadEngagementFor(newPosts)

    if (newPosts.length > 0 && currentUser?.id) {
      const ids = newPosts.map((p) => p.id)

      // Views — the unique index drops same-day repeats server-side.
      tryQuery(
        supabase.from('post_views').insert(
          newPosts.map((p) => ({
            post_id:     p.id,
            business_id: p.business_id,
            viewer_id:   currentUser.id,
            view_day:    new Date().toISOString().slice(0, 10),
          }))
        ),
        'feed:logViews'
      )

      // Impressions — feeds the fatigue logic in the ranking algorithm.
      tryQuery(supabase.rpc('record_impressions', { p_post_ids: ids }), 'feed:impressions')
    }
    } catch (err) {
      // Show the user something honest instead of a false "No posts yet".
      setLoadError(handleError(err, 'feed:loadPage'))
    } finally {
      setLoading(false)
    }
  }

  async function loadEngagementFor(newPosts) {
    if (newPosts.length === 0 || !currentUser) {
      // Logged out: counts come from the RPC, nothing is "mine".
      seedCountsOnly(newPosts)
      return
    }
    const ids = newPosts.map((p) => p.id)

    // Only "did I personally do this" — counts already came from post_metrics
    // via the RPC, so we never fetch whole like/comment tables again.
    const [likes, saves] = await cache.get(
      keys.postEngagement(currentUser.id, ids),
      async () => {
        const [l, sv] = await Promise.all([
          query(supabase.from('post_likes').select('post_id').in('post_id', ids).eq('user_id', currentUser.id), 'feed:myLikes'),
          query(supabase.from('post_saves').select('post_id').in('post_id', ids).eq('user_id', currentUser.id), 'feed:mySaves'),
        ])
        return [l, sv]
      },
      { ttl: TTL.REALTIME, tags: [tags.ENGAGEMENT] }
    )

    const likedIds = new Set(likes.map((l) => l.post_id))
    const savedIds = new Set(saves.map((s) => s.post_id))

    setLikeState((prev) => {
      const next = { ...prev }
      newPosts.forEach((p) => { next[p.id] = { liked: likedIds.has(p.id), count: p._like_count ?? 0 } })
      return next
    })
    setSaveState((prev) => {
      const next = { ...prev }
      newPosts.forEach((p) => { next[p.id] = savedIds.has(p.id) })
      return next
    })
    setCommentState((prev) => {
      const next = { ...prev }
      newPosts.forEach((p) => {
        next[p.id] = { open: false, list: [], draft: '', count: p._comment_count ?? 0, ...(prev[p.id] || {}) }
      })
      return next
    })
  }

  function seedCountsOnly(newPosts) {
    setLikeState((prev) => {
      const next = { ...prev }
      newPosts.forEach((p) => { next[p.id] = { liked: false, count: p._like_count ?? 0 } })
      return next
    })
    setCommentState((prev) => {
      const next = { ...prev }
      newPosts.forEach((p) => {
        next[p.id] = { open: false, list: [], draft: '', count: p._comment_count ?? 0, ...(prev[p.id] || {}) }
      })
      return next
    })
  }

  async function toggleLike(postId) {
    if (!currentUser) { alert('Please log in to like posts.'); return }
    const current = likeState[postId] || { liked: false, count: 0 }

    // Optimistic — the button responds instantly, before the round trip.
    setLikeState((prev) => ({
      ...prev,
      [postId]: { liked: !current.liked, count: Math.max(0, current.count + (current.liked ? -1 : 1)) },
    }))

    const { data: nowLiked, error } = await supabase.rpc('toggle_post_like', { p_post_id: postId })

    if (error) {
      setLikeState((prev) => ({ ...prev, [postId]: current }))   // roll back
      alert('Could not update like: ' + error.message)
      return
    }

    setLikeState((prev) => ({
      ...prev,
      [postId]: { liked: nowLiked, count: Math.max(0, current.count + (nowLiked ? 1 : -1)) },
    }))

    // Clear only the engagement cache. Deliberately NOT the feed — invalidating
    // it would refetch and reshuffle mid-scroll and the user would lose their
    // place. The 2-minute TTL picks up the change soon enough.
    cache.invalidateTag(tags.ENGAGEMENT)
  }

  async function toggleSave(postId) {
    if (!currentUser) { alert('Please log in to save posts.'); return }
    const wasSaved = !!saveState[postId]
    setSaveState((prev) => ({ ...prev, [postId]: !wasSaved }))

    const { data: nowSaved, error } = await supabase.rpc('toggle_post_save', { p_post_id: postId })
    if (error) {
      setSaveState((prev) => ({ ...prev, [postId]: wasSaved }))
      alert('Could not update save: ' + error.message)
      return
    }
    setSaveState((prev) => ({ ...prev, [postId]: nowSaved }))
    cache.invalidateTag(tags.ENGAGEMENT)
  }

  async function toggleComments(postId) {
    const entry = commentState[postId] || { open: false, list: [], draft: '', count: 0 }
    if (entry.open) {
      setCommentState((prev) => ({ ...prev, [postId]: { ...entry, open: false } }))
      return
    }

    const list = await cache.get(
      `postComments:${postId}`,
      () => query(
        supabase.from('post_comments')
          .select('*, profiles(username, avatar_url)')
          .eq('post_id', postId)
          .order('created_at', { ascending: true }),
        'feed:comments'
      ),
      { ttl: TTL.REALTIME }
    )

    setCommentState((prev) => ({ ...prev, [postId]: { ...entry, open: true, list } }))
  }

  function updateDraft(postId, text) {
    setCommentState((prev) => ({
      ...prev,
      [postId]: { ...(prev[postId] || { open: true, list: [], count: 0 }), draft: text },
    }))
  }

  async function postComment(postId) {
    const entry = commentState[postId]
    if (!currentUser) { alert('Please log in to comment.'); return }
    if (!entry?.draft?.trim()) return

    const { data, error } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, user_id: currentUser.id, comment_text: entry.draft.trim() })
      .select('*, profiles(username, avatar_url)')
      .single()

    if (error) { alert('Could not post comment: ' + error.message); return }

    setCommentState((prev) => ({
      ...prev,
      [postId]: {
        ...prev[postId],
        list:  [...(prev[postId]?.list || []), data],
        draft: '',
        count: (prev[postId]?.count || 0) + 1,
      },
    }))

    cache.invalidate(`postComments:${postId}`)
    cache.invalidateTag(tags.ENGAGEMENT)
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleCameraCapture(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setScanning(true)
    setScanNote(null)
    try {
      const base64 = await fileToBase64(file)
      const { data, error } = await supabase.functions.invoke('identify-product-global', {
        body: { image_base64: base64, media_type: file.type || 'image/jpeg' },
      })
      if (error) {
        let detail = error.message
        try { const body = await error.context.json(); if (body?.error) detail = body.error } catch {}
        throw new Error(detail)
      }
      if (data?.match) {
        const biz = await cache.get(
          keys.business(data.match.business_id),
          () => supabase.from('businesses').select('*').eq('id', data.match.business_id).single().then(r => r.data),
          { ttl: TTL.BUSINESSES, tags: [tags.BUSINESSES] }
        )
        if (biz) { onSelectBusiness(biz); return }
      }
      setScanNote({ text: "Couldn't confidently match that photo to any product on BizCheck.", isMiss: true })
    } catch (err) {
      setScanNote({ text: 'Scan failed: ' + (err?.message || 'Unknown error'), isError: true })
    } finally {
      setScanning(false)
    }
  }

  const visiblePosts = query.trim()
    ? posts.filter((p) => {
        const q = query.toLowerCase()
        return p.caption?.toLowerCase().includes(q) || p.businesses?.name?.toLowerCase().includes(q)
      })
    : posts

  return (
    <div className="section" style={{ maxWidth: 520 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Feed</h2>
        <button
          onClick={() => loadPage(0, true)}
          style={{ background: 'none', border: 'none', fontSize: 12, color: '#1D9E75', cursor: 'pointer', fontWeight: 600 }}
        >
          Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search the feed…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={scanning}
          title="Scan a product with your camera"
          style={{ width: 42, height: 42, borderRadius: 10, border: 'none', flexShrink: 0, background: scanning ? 'var(--hover-bg)' : '#1D9E75', color: '#fff', fontSize: 18, cursor: scanning ? 'default' : 'pointer' }}
        >
          {scanning ? '…' : <Icon.Camera size={19} />}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleCameraCapture} />
      </div>

      {scanning && <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Searching BizCheck for a match…</p>}
      {scanNote && (
        <div style={{ marginBottom: 14, fontSize: 13, padding: '10px 14px', borderRadius: 10, background: scanNote.isError ? '#FCEBEB' : '#FEF3C7', color: scanNote.isError ? '#A32D2D' : '#92400E' }}>
          {scanNote.text}
        </div>
      )}

      {loadError && (
        <div style={{ marginBottom: 14, fontSize: 13, padding: '12px 14px', borderRadius: 10, background: '#FCEBEB', color: '#A32D2D' }}>
          {loadError}{' '}
          <button
            onClick={() => loadPage(0, true)}
            style={{ background: 'none', border: 'none', padding: 0, color: '#A32D2D', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}
          >
            Try again
          </button>
        </div>
      )}

      {loading && posts.length === 0 ? (
        <RubiksLoader label="Loading the feed…" />
      ) : visiblePosts.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>
          {loadError ? 'Could not load the feed.' : query ? 'Nothing matches that search.' : 'No posts yet.'}
        </p>
      ) : (
        <>
          {visiblePosts.map((post) => (
            <FeedPost
              key={post.id}
              post={post}
              like={likeState[post.id]       || { liked: false, count: 0 }}
              saved={!!saveState[post.id]}
              comment={commentState[post.id] || { open: false, list: [], draft: '', count: 0 }}
              currentUser={currentUser}
              onToggleLike={()     => toggleLike(post.id)}
              onToggleSave={()     => toggleSave(post.id)}
              onToggleComments={() => toggleComments(post.id)}
              onDraftChange={(t)   => updateDraft(post.id, t)}
              onPostComment={()    => postComment(post.id)}
              onOpenBusiness={()   => onSelectBusiness(post.businesses)}
            />
          ))}

          {hasMore && !query && (
            <div style={{ textAlign: 'left', marginTop: 10, marginBottom: 20 }}>
              <button className="btn-small" onClick={() => loadPage(page + 1)} disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FeedPost({ post, like, saved, comment, currentUser, onToggleLike, onToggleSave, onToggleComments, onDraftChange, onPostComment, onOpenBusiness }) {
  const [expanded, setExpanded] = useState(false)
  const caption      = post.caption || ''
  const isLong       = caption.length > 90
  const shownCaption = expanded || !isLong ? caption : caption.slice(0, 90) + '…'

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 16, marginBottom: 18, overflow: 'hidden', background: 'var(--surface)' }}>
      <div style={{
        background: 'linear-gradient(150deg, #F2FAF7 0%, #E3F3EC 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        aspectRatio: '1 / 1', padding: 18,
      }}>
        {post.market_photo_url && (
          <img src={post.market_photo_url} alt="" loading="lazy" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '10px 14px 4px' }}>
        <button onClick={onToggleLike} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', gap: 5, color: like.liked ? '#1D9E75' : 'var(--text)', padding: 0 }}>
          <Icon.Like size={19} /> <span style={{ fontSize: 13 }}>{like.count}</span>
        </button>
        <button onClick={onToggleComments} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', gap: 5, padding: 0 }}>
          <Icon.Comment size={19} /> <span style={{ fontSize: 13 }}>{comment.count}</span>
        </button>
        <button onClick={onToggleSave} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, marginLeft: 'auto', color: saved ? '#1D9E75' : 'var(--text)', padding: 0 }}>
          <Icon.Save size={19} />
        </button>
      </div>

      <div style={{ padding: '4px 14px 14px', textAlign: 'left' }}>
        <button onClick={onOpenBusiness} style={{ background: 'none', border: 'none', padding: 0, fontWeight: 700, fontSize: 14, cursor: 'pointer', color: 'var(--text-strong)', textAlign: 'left' }}>
          {post.businesses?.business_username || post.businesses?.name}
        </button>

        {post.is_exploration && (
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            new seller
          </span>
        )}

        {shownCaption && (
          <p style={{ fontSize: 13.5, marginTop: 2, textAlign: 'left' }}>
            {shownCaption}
            {isLong && (
              <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', padding: 0, marginLeft: 4, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
                {expanded ? 'less' : 'more'}
              </button>
            )}
          </p>
        )}

        {comment.open && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            {comment.list.length === 0 && <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>No comments yet.</p>}
            {comment.list.map((c) => (
              <div key={c.id} style={{ marginBottom: 12, textAlign: 'left' }}>
                <AuthorRow username={c.profiles?.username} photoUrl={c.profiles?.avatar_url} timestamp={c.created_at} size={28} />
                <p style={{ fontSize: 13, paddingLeft: 37 }}>{c.comment_text}</p>
              </div>
            ))}
            {currentUser ? (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input
                  type="text"
                  placeholder="Add a comment…"
                  value={comment.draft || ''}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onPostComment()}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}
                />
                <button className="btn-small" onClick={onPostComment}>Post</button>
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 12 }}>Log in to comment.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
