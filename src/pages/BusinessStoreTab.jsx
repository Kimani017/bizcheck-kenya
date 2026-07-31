import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import RubiksLoader from './RubiksLoader'

// Business-side view of their own store posts: same cards customers see,
// plus view/like counts, delete, and replying to comments.
export default function BusinessStoreTab({ business, currentUser, onOpenCatalog }) {
  const [posts, setPosts] = useState([])
  const [stats, setStats] = useState({}) // { post_id: { views, likes, comments } }
  const [comments, setComments] = useState({}) // { post_id: [rows] }
  const [openComments, setOpenComments] = useState({})
  const [replyDrafts, setReplyDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [business?.id])

  async function load() {
    if (!business?.id) return
    setLoading(true)
    setError('')

    const { data: postData, error: postError } = await supabase
      .from('market_posts')
      .select('*, products(name, price, quantity)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })

    if (postError) { setError('Could not load your store: ' + postError.message); setLoading(false); return }

    const list = postData || []
    setPosts(list)

    if (list.length > 0) {
      const ids = list.map((p) => p.id)
      const [{ data: views }, { data: likes }, { data: commentRows }] = await Promise.all([
        supabase.from('post_views').select('post_id').in('post_id', ids),
        supabase.from('post_likes').select('post_id').in('post_id', ids),
        supabase.from('post_comments').select('post_id').in('post_id', ids),
      ])

      const next = {}
      ids.forEach((id) => {
        next[id] = {
          views: (views || []).filter((v) => v.post_id === id).length,
          likes: (likes || []).filter((l) => l.post_id === id).length,
          comments: (commentRows || []).filter((c) => c.post_id === id).length,
        }
      })
      setStats(next)
    }

    setLoading(false)
  }

  async function toggleComments(postId) {
    if (openComments[postId]) {
      setOpenComments((prev) => ({ ...prev, [postId]: false }))
      return
    }
    const { data, error } = await supabase
      .from('post_comments')
      .select('*, profiles(username)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })

    if (error) { setError('Could not load comments: ' + error.message); return }
    setComments((prev) => ({ ...prev, [postId]: data || [] }))
    setOpenComments((prev) => ({ ...prev, [postId]: true }))
  }

  async function postReply(postId) {
    const draft = replyDrafts[postId]
    if (!draft?.trim() || !currentUser) return

    const { data, error } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, user_id: currentUser.id, comment_text: draft.trim() })
      .select('*, profiles(username)')
      .single()

    if (error) { setError('Could not post reply: ' + error.message); return }

    setComments((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), data] }))
    setReplyDrafts((prev) => ({ ...prev, [postId]: '' }))
    setStats((prev) => ({ ...prev, [postId]: { ...prev[postId], comments: (prev[postId]?.comments || 0) + 1 } }))
  }

  async function deleteComment(commentId, postId) {
    if (!window.confirm('Delete this comment?')) return
    const { error } = await supabase.from('post_comments').delete().eq('id', commentId)
    if (error) { setError('Could not delete comment: ' + error.message); return }
    setComments((prev) => ({ ...prev, [postId]: (prev[postId] || []).filter((c) => c.id !== commentId) }))
    setStats((prev) => ({ ...prev, [postId]: { ...prev[postId], comments: Math.max(0, (prev[postId]?.comments || 1) - 1) } }))
  }

  async function deletePost(postId) {
    if (!window.confirm('Remove this post from the market? Your product stays in your catalog.')) return
    const { error } = await supabase.from('market_posts').delete().eq('id', postId)
    if (error) { setError('Could not delete post: ' + error.message); return }
    setPosts((prev) => prev.filter((p) => p.id !== postId))
  }

  if (loading) return <RubiksLoader label="Loading your store…" />

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ marginBottom: 2 }}>Your Store</h3>
          <p className="muted" style={{ fontSize: 13 }}>How customers see your products, with your own numbers on each.</p>
        </div>
        <button className="btn-small" style={{ background: '#1D9E75', color: '#fff' }} onClick={onOpenCatalog}>
          + Add a post
        </button>
      </div>

      {error && (
        <div style={{ background: '#FCEBEB', border: '1px solid #F7C1C1', color: '#A32D2D', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      {posts.length === 0 ? (
        <p className="muted">No posts yet. Use "+ Add a post" to send a product to the market.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {posts.map((post) => {
            const s = stats[post.id] || { views: 0, likes: 0, comments: 0 }
            const isPending = post.status === 'pending_review'

            return (
              <div key={post.id} style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface)' }}>
                <div style={{ background: 'linear-gradient(150deg, #F2FAF7 0%, #E3F3EC 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '16 / 10', padding: 16 }}>
                  {post.market_photo_url ? (
                    <img src={post.market_photo_url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span className="muted" style={{ fontSize: 13 }}>Processing…</span>
                  )}
                </div>

                <div style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 14 }}>{post.products?.name}</p>
                      <p className="muted" style={{ fontSize: 13 }}>Ksh {post.products?.price ?? '—'} · Qty {post.products?.quantity ?? 0}</p>
                    </div>
                    {isPending && (
                      <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                        Pending review
                      </span>
                    )}
                  </div>

                  {post.caption && <p style={{ fontSize: 13.5, marginBottom: 10 }}>{post.caption}</p>}

                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 13, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <span>👁 {s.views} views</span>
                    <span>👍 {s.likes} likes</span>
                    <button
                      onClick={() => toggleComments(post.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1D9E75', fontSize: 13, fontWeight: 600, padding: 0 }}
                    >
                      💬 {s.comments} comments
                    </button>
                    <button
                      onClick={() => deletePost(post.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0392B', fontSize: 12.5, fontWeight: 600, marginLeft: 'auto', padding: 0 }}
                    >
                      Delete
                    </button>
                  </div>

                  {openComments[post.id] && (
                    <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                      {(comments[post.id] || []).length === 0 && (
                        <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>No comments yet.</p>
                      )}
                      {(comments[post.id] || []).map((c) => (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                          <p style={{ fontSize: 13 }}>
                            <strong>@{c.profiles?.username || 'user'}</strong> {c.comment_text}
                          </p>
                          <button
                            onClick={() => deleteComment(c.id, post.id)}
                            title="Delete this comment"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, flexShrink: 0, padding: 0 }}
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <input
                          type="text"
                          placeholder="Reply as your business…"
                          value={replyDrafts[post.id] || ''}
                          onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && postReply(post.id)}
                          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}
                        />
                        <button className="btn-small" onClick={() => postReply(post.id)}>Reply</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
