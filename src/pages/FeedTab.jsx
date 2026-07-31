import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import RubiksLoader from './RubiksLoader'
import Icon from './Icon'

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
  const fileInputRef = useRef(null)

  useEffect(() => { loadPage(0) }, [])

  async function loadPage(pageIndex) {
    setLoading(true)
    const from = pageIndex * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('market_posts')
      .select('*, businesses(id, name, business_username, logo_url, description)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .range(from, to)

    if (!error) {
      const newPosts = data || []
      setPosts((prev) => (pageIndex === 0 ? newPosts : [...prev, ...newPosts]))
      setHasMore(newPosts.length === PAGE_SIZE)
      setPage(pageIndex)
      await loadEngagementFor(newPosts)

      // Log a view for each post shown, so businesses see real numbers
      if (newPosts.length > 0) {
        supabase.from('post_views').insert(
          newPosts.map((p) => ({ post_id: p.id, business_id: p.business_id, viewer_id: currentUser?.id || null }))
        ).then(() => {})
      }
    }
    setLoading(false)
  }

  async function loadEngagementFor(newPosts) {
    if (newPosts.length === 0) return
    const ids = newPosts.map((p) => p.id)

    const [{ data: likes }, { data: saves }, { data: comments }] = await Promise.all([
      supabase.from('post_likes').select('post_id, user_id').in('post_id', ids),
      currentUser
        ? supabase.from('post_saves').select('post_id').in('post_id', ids).eq('user_id', currentUser.id)
        : Promise.resolve({ data: [] }),
      supabase.from('post_comments').select('post_id').in('post_id', ids),
    ])

    setLikeState((prev) => {
      const next = { ...prev }
      ids.forEach((id) => {
        const forPost = (likes || []).filter((l) => l.post_id === id)
        next[id] = { liked: currentUser ? forPost.some((l) => l.user_id === currentUser.id) : false, count: forPost.length }
      })
      return next
    })

    setSaveState((prev) => {
      const next = { ...prev }
      const savedIds = new Set((saves || []).map((s) => s.post_id))
      ids.forEach((id) => { next[id] = savedIds.has(id) })
      return next
    })

    setCommentState((prev) => {
      const next = { ...prev }
      ids.forEach((id) => {
        const count = (comments || []).filter((c) => c.post_id === id).length
        next[id] = { open: false, list: [], draft: '', ...(prev[id] || {}), count }
      })
      return next
    })
  }

  async function toggleLike(postId) {
    if (!currentUser) { alert('Please log in to like posts.'); return }
    const current = likeState[postId] || { liked: false, count: 0 }
    if (current.liked) {
      const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', currentUser.id)
      if (error) { alert('Could not unlike: ' + error.message); return }
      setLikeState((prev) => ({ ...prev, [postId]: { liked: false, count: Math.max(0, current.count - 1) } }))
    } else {
      const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: currentUser.id })
      if (error) { alert('Could not like: ' + error.message); return }
      setLikeState((prev) => ({ ...prev, [postId]: { liked: true, count: current.count + 1 } }))
    }
  }

  async function toggleSave(postId) {
    if (!currentUser) { alert('Please log in to save posts.'); return }
    const isSaved = saveState[postId]
    const { error } = isSaved
      ? await supabase.from('post_saves').delete().eq('post_id', postId).eq('user_id', currentUser.id)
      : await supabase.from('post_saves').insert({ post_id: postId, user_id: currentUser.id })
    if (error) { alert('Could not update save: ' + error.message); return }
    setSaveState((prev) => ({ ...prev, [postId]: !isSaved }))
  }

  async function toggleComments(postId) {
    const entry = commentState[postId] || { open: false, list: [], draft: '', count: 0 }
    if (entry.open) {
      setCommentState((prev) => ({ ...prev, [postId]: { ...entry, open: false } }))
      return
    }
    const { data, error } = await supabase
      .from('post_comments')
      .select('*, profiles(username)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
    if (error) { alert('Could not load comments: ' + error.message); return }
    setCommentState((prev) => ({ ...prev, [postId]: { ...entry, open: true, list: data || [] } }))
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
      .select('*, profiles(username)')
      .single()

    if (error) { alert('Could not post comment: ' + error.message); return }

    setCommentState((prev) => ({
      ...prev,
      [postId]: { ...prev[postId], list: [...(prev[postId]?.list || []), data], draft: '', count: (prev[postId]?.count || 0) + 1 },
    }))
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
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
        const { data: biz } = await supabase.from('businesses').select('*').eq('id', data.match.business_id).single()
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
      <h2 style={{ marginBottom: 12 }}>Feed</h2>

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

      {loading && posts.length === 0 ? (
        <RubiksLoader label="Loading the feed…" />
      ) : visiblePosts.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>{query ? 'Nothing matches that search.' : 'No posts yet.'}</p>
      ) : (
        <>
          {visiblePosts.map((post) => (
            <FeedPost
              key={post.id}
              post={post}
              like={likeState[post.id] || { liked: false, count: 0 }}
              saved={!!saveState[post.id]}
              comment={commentState[post.id] || { open: false, list: [], draft: '', count: 0 }}
              currentUser={currentUser}
              onToggleLike={() => toggleLike(post.id)}
              onToggleSave={() => toggleSave(post.id)}
              onToggleComments={() => toggleComments(post.id)}
              onDraftChange={(text) => updateDraft(post.id, text)}
              onPostComment={() => postComment(post.id)}
              onOpenBusiness={() => onSelectBusiness(post.businesses)}
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
  const caption = post.caption || ''
  const isLong = caption.length > 90
  const shownCaption = expanded || !isLong ? caption : caption.slice(0, 90) + '…'

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 16, marginBottom: 18, overflow: 'hidden', background: 'var(--surface)' }}>
      {/* Photos are background-removed PNGs, so they need a backdrop —
          without one they read as "raw" floating cutouts. */}
      <div style={{
        background: 'linear-gradient(150deg, #F2FAF7 0%, #E3F3EC 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        aspectRatio: '1 / 1', padding: 18,
      }}>
        {post.market_photo_url && (
          <img src={post.market_photo_url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
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
              <p key={c.id} style={{ fontSize: 13, marginBottom: 6, textAlign: 'left' }}>
                <strong>@{c.profiles?.username || 'user'}</strong> {c.comment_text}
              </p>
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
