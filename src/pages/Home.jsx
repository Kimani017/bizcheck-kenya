import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { SkeletonCard } from './Skeleton'
import RubiksLoader from './RubiksLoader'

const PAGE_SIZE = 8

export default function Home({ onSelectBusiness, goToReport, currentUser, onInsufficientCredits }) {
  const [query, setQuery] = useState('')
  const [businessResults, setBusinessResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [searchTimeout, setSearchTimeout] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [scanNote, setScanNote] = useState(null)
  const fileInputRef = useRef(null)

  const [posts, setPosts] = useState([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingFeed, setLoadingFeed] = useState(true)
  const [likeState, setLikeState] = useState({})
  const [saveState, setSaveState] = useState({})
  const [commentState, setCommentState] = useState({})

  useEffect(() => { loadFeedPage(0) }, [])

  async function loadFeedPage(pageIndex) {
    setLoadingFeed(true)
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
    }
    setLoadingFeed(false)
  }

  async function loadEngagementFor(newPosts) {
    if (newPosts.length === 0) return
    const ids = newPosts.map((p) => p.id)

    const [{ data: likes }, { data: saves }, { data: commentCounts }] = await Promise.all([
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
        const count = (commentCounts || []).filter((c) => c.post_id === id).length
        next[id] = prev[id] || { open: false, list: [], draft: '', count }
        next[id].count = count
      })
      return next
    })
  }

  async function toggleLike(postId) {
    if (!currentUser) return
    const current = likeState[postId] || { liked: false, count: 0 }
    if (current.liked) {
      await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', currentUser.id)
      setLikeState((prev) => ({ ...prev, [postId]: { liked: false, count: Math.max(0, current.count - 1) } }))
    } else {
      await supabase.from('post_likes').insert({ post_id: postId, user_id: currentUser.id })
      setLikeState((prev) => ({ ...prev, [postId]: { liked: true, count: current.count + 1 } }))
    }
  }

  async function toggleSave(postId) {
    if (!currentUser) return
    const isSaved = saveState[postId]
    if (isSaved) {
      await supabase.from('post_saves').delete().eq('post_id', postId).eq('user_id', currentUser.id)
    } else {
      await supabase.from('post_saves').insert({ post_id: postId, user_id: currentUser.id })
    }
    setSaveState((prev) => ({ ...prev, [postId]: !isSaved }))
  }

  async function toggleComments(postId) {
    const entry = commentState[postId] || { open: false, list: [], draft: '', count: 0 }
    if (!entry.open) {
      const { data } = await supabase
        .from('post_comments')
        .select('*, profiles(username)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
      setCommentState((prev) => ({ ...prev, [postId]: { ...entry, open: true, list: data || [] } }))
    } else {
      setCommentState((prev) => ({ ...prev, [postId]: { ...entry, open: false } }))
    }
  }

  function updateDraft(postId, text) {
    setCommentState((prev) => ({ ...prev, [postId]: { ...(prev[postId] || { open: true, list: [], count: 0 }), draft: text } }))
  }

  async function postComment(postId) {
    const entry = commentState[postId]
    if (!currentUser || !entry?.draft?.trim()) return
    const { data, error } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, user_id: currentUser.id, comment_text: entry.draft.trim() })
      .select('*, profiles(username)')
      .single()
    if (!error && data) {
      setCommentState((prev) => ({
        ...prev,
        [postId]: { ...prev[postId], list: [...prev[postId].list, data], draft: '', count: prev[postId].count + 1 },
      }))
    }
  }

  async function handleSearch(overrideQuery) {
    const q = (overrideQuery ?? query).trim()
    if (!q) { setBusinessResults(null); return }
    setSearching(true)

    const { data: rpcData, error: rpcError } = await supabase.rpc('search_businesses', { query: q })

    if (!rpcError && rpcData && rpcData.length > 0) {
      const { data: bannedData } = await supabase.from('businesses').select('*').eq('status', 'banned').ilike('name', `%${q}%`)
      const seen = new Set(rpcData.map((b) => b.id))
      setBusinessResults([...rpcData, ...(bannedData || []).filter((b) => !seen.has(b.id))])
      setSearching(false)
      return
    }

    const { data: fallbackData } = await supabase
      .from('businesses')
      .select('*')
      .in('status', ['verified', 'flagged', 'scam', 'banned'])
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%,mpesa_till.ilike.%${q}%,fb_handle.ilike.%${q}%,tiktok_handle.ilike.%${q}%`)
      .order('trust_score', { ascending: false })

    setSearching(false)
    setBusinessResults(fallbackData || [])
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
        setScanNote({ text: data.match.note })
      } else {
        setScanNote({ text: "Couldn't confidently match that photo to any product on BizCheck.", isMiss: true })
      }
    } catch (err) {
      setScanNote({ text: 'Something went wrong scanning that photo: ' + (err?.message || 'Unknown error'), isError: true })
    } finally {
      setScanning(false)
    }
  }

  return (
    <div>
      <div className="section" style={{ paddingBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search a business, or a product..."
            value={query}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14 }}
            onChange={(e) => {
              setQuery(e.target.value)
              if (searchTimeout) clearTimeout(searchTimeout)
              if (!e.target.value.trim()) { setBusinessResults(null); return }
              setSearchTimeout(setTimeout(() => handleSearch(e.target.value), 300))
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning}
            title="Scan a product with your camera"
            style={{ width: 42, height: 42, borderRadius: 10, border: 'none', flexShrink: 0, background: scanning ? 'var(--hover-bg)' : '#1D9E75', color: '#fff', fontSize: 18, cursor: scanning ? 'default' : 'pointer' }}
          >
            {scanning ? '…' : '📷'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleCameraCapture} />
        </div>

        {scanning && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Searching BizCheck for a match…</p>}
        {scanNote && (
          <div style={{ marginTop: 8, fontSize: 13, padding: '8px 12px', borderRadius: 10, background: scanNote.isError ? '#FCEBEB' : scanNote.isMiss ? '#FEF3C7' : '#EAF8F3', color: scanNote.isError ? '#A32D2D' : scanNote.isMiss ? '#92400E' : '#0F6E56' }}>
            {scanNote.text}
          </div>
        )}
      </div>

      {businessResults !== null && (
        <div className="section">
          <h2>Search results ({businessResults.length})</h2>
          {searching ? (
            <div className="biz-grid">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          ) : businessResults.length === 0 ? (
            <div className="empty-state">
              <p>No results for "{query}".</p>
              <button className="link-btn" onClick={goToReport}>Was this a scammer? Report it here →</button>
            </div>
          ) : (
            <div className="biz-grid">
              {businessResults.map((b) => <BusinessCard key={b.id} business={b} onClick={() => onSelectBusiness(b)} />)}
            </div>
          )}
        </div>
      )}

      {businessResults === null && (
        <div className="section" style={{ maxWidth: 480, margin: '0 auto' }}>
          {loadingFeed && posts.length === 0 ? (
            <RubiksLoader label="Loading the feed…" />
          ) : posts.length === 0 ? (
            <p className="muted" style={{ textAlign: 'center', marginTop: 30 }}>No posts yet.</p>
          ) : (
            <>
              {posts.map((post) => (
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

              {hasMore && (
                <div style={{ textAlign: 'center', marginTop: 10, marginBottom: 20 }}>
                  <button className="btn-small" onClick={() => loadFeedPage(page + 1)} disabled={loadingFeed}>
                    {loadingFeed ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
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
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, marginBottom: 18, overflow: 'hidden', background: 'var(--surface)' }}>
      {post.market_photo_url && (
        <img src={post.market_photo_url} alt="" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '10px 14px 4px' }}>
        <button onClick={onToggleLike} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', gap: 5, color: like.liked ? '#1D9E75' : 'var(--text)' }}>
          👍 <span style={{ fontSize: 13 }}>{like.count}</span>
        </button>
        <button onClick={onToggleComments} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', gap: 5 }}>
          💬 <span style={{ fontSize: 13 }}>{comment.count}</span>
        </button>
        <button onClick={onToggleSave} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, marginLeft: 'auto', color: saved ? '#1D9E75' : 'var(--text)' }}>
          🔖
        </button>
      </div>

      <div style={{ padding: '4px 14px 14px' }}>
        <button onClick={onOpenBusiness} style={{ background: 'none', border: 'none', padding: 0, fontWeight: 700, fontSize: 14, cursor: 'pointer', color: 'var(--text-strong)' }}>
          {post.businesses?.business_username || post.businesses?.name}
        </button>
        {shownCaption && (
          <p style={{ fontSize: 13.5, marginTop: 2 }}>
            {shownCaption}
            {isLong && (
              <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', padding: 0, marginLeft: 4, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
                {expanded ? 'less' : 'more'}
              </button>
            )}
          </p>
        )}

        {comment.open && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            {comment.list.map((c) => (
              <p key={c.id} style={{ fontSize: 13, marginBottom: 6 }}>
                <strong>@{c.profiles?.username || 'user'}</strong> {c.comment_text}
              </p>
            ))}
            {currentUser && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input
                  type="text"
                  placeholder="Add a comment…"
                  value={comment.draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onPostComment()}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                />
                <button className="btn-small" onClick={onPostComment}>Post</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function BusinessCard({ business, onClick }) {
  const trustColor = business.trust_score > 70 ? '#1D9E75' : business.trust_score > 40 ? '#EF9F27' : '#E24B4A'
  const initial = (business.name || 'B')[0].toUpperCase()
  return (
    <div className="biz-card" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="biz-card-top">
        {business.photo_url ? (
          <img src={business.photo_url} alt={business.name} className="biz-avatar" />
        ) : (
          <div className="biz-avatar-fallback">{initial}</div>
        )}
        <div>
          <p className="biz-card-name">{business.name}</p>
          <span className={`badge ${business.status === 'verified' ? 'badge-verified' : business.status === 'banned' ? 'badge-danger' : 'badge-pending'}`}>
            {business.status}
          </span>
        </div>
      </div>
      <div className="trust-bar"><div className="trust-fill" style={{ width: `${business.trust_score || 0}%`, background: trustColor }} /></div>
      <p className="muted" style={{ fontSize: 12 }}>Trust {business.trust_score || 0}%</p>
    </div>
  )
}
