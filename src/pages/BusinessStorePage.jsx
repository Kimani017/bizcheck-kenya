import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import BusinessPublicProfile from './BusinessPublicProfile'
import RubiksLoader from './RubiksLoader'
import Icon from './Icon'
import BuyProductModal from './BuyProductModal'
import { chargeUserCredits } from './CreditGate'
import { AuthorRow } from './Avatar'

// The one destination for viewing any business, from anywhere in the app.
// Pass the same props you'd give BusinessPublicProfile directly — this
// wraps it (header hidden) as the "Info/Reviews" subtab, and adds a new
// "Display" subtab showing the business's posted product photos, with the
// same Like/Save/Comment engagement as the Feed.
export default function BusinessStorePage({
  business, onBack, currentUser, isAdmin, businessMode,
  onReport, onMessageBusiness, onMessageUser, onInsufficientCredits,
}) {
  const [activeTab, setActiveTab] = useState('display') // 'display' | 'info'
  const [posts, setPosts] = useState([])
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [selectedPost, setSelectedPost] = useState(null)
  const [buyProduct, setBuyProduct] = useState(null)
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [messaging, setMessaging] = useState(false)

  const [likeState, setLikeState] = useState({})
  const [saveState, setSaveState] = useState({})
  const [commentState, setCommentState] = useState({})

  useEffect(() => { loadPosts() }, [business?.id])

  async function loadPosts() {
    if (!business?.id) return
    setLoadingPosts(true)
    const { data } = await supabase
      .from('market_posts')
      .select('*, products(id, name, description, price, quantity, sizes, colors)')
      .eq('business_id', business.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })

    const list = data || []
    setPosts(list)
    await loadEngagementFor(list)
    setLoadingPosts(false)
  }

  async function loadEngagementFor(list) {
    if (list.length === 0) return
    const ids = list.map((p) => p.id)

    const [{ data: likes }, { data: saves }, { data: comments }] = await Promise.all([
      supabase.from('post_likes').select('post_id, user_id').in('post_id', ids),
      currentUser
        ? supabase.from('post_saves').select('post_id').in('post_id', ids).eq('user_id', currentUser.id)
        : Promise.resolve({ data: [] }),
      supabase.from('post_comments').select('post_id').in('post_id', ids),
    ])

    const nextLikes = {}
    const nextSaves = {}
    const nextComments = {}
    const savedIds = new Set((saves || []).map((s) => s.post_id))

    ids.forEach((id) => {
      const forPost = (likes || []).filter((l) => l.post_id === id)
      nextLikes[id] = { liked: currentUser ? forPost.some((l) => l.user_id === currentUser.id) : false, count: forPost.length }
      nextSaves[id] = savedIds.has(id)
      nextComments[id] = { open: false, list: [], draft: '', count: (comments || []).filter((c) => c.post_id === id).length }
    })

    setLikeState(nextLikes)
    setSaveState(nextSaves)
    setCommentState(nextComments)
  }

  async function toggleLike(postId) {
    if (!currentUser) { alert('Please log in to like posts.'); return }
    const current = likeState[postId] || { liked: false, count: 0 }
    if (current.liked) {
      const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', currentUser.id)
      if (error) return
      setLikeState((prev) => ({ ...prev, [postId]: { liked: false, count: Math.max(0, current.count - 1) } }))
    } else {
      const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: currentUser.id })
      if (error) return
      setLikeState((prev) => ({ ...prev, [postId]: { liked: true, count: current.count + 1 } }))
    }
  }

  async function toggleSave(postId) {
    if (!currentUser) { alert('Please log in to save posts.'); return }
    const isSaved = saveState[postId]
    const { error } = isSaved
      ? await supabase.from('post_saves').delete().eq('post_id', postId).eq('user_id', currentUser.id)
      : await supabase.from('post_saves').insert({ post_id: postId, user_id: currentUser.id })
    if (error) return
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
      .select('*, profiles(username, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
    if (error) return
    setCommentState((prev) => ({ ...prev, [postId]: { ...entry, open: true, list: data || [] } }))
  }

  function updateDraft(postId, text) {
    setCommentState((prev) => ({ ...prev, [postId]: { ...(prev[postId] || { open: true, list: [], count: 0 }), draft: text } }))
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
      [postId]: { ...prev[postId], list: [...prev[postId].list, data], draft: '', count: prev[postId].count + 1 },
    }))
  }

  async function messageBusiness() {
    if (!currentUser) { alert('Please log in to message this business.'); return }
    if (businessMode) { onMessageBusiness?.(business); return }

    setMessaging(true)
    const result = await chargeUserCredits('message_business', 0.5)
    setMessaging(false)

    if (!result.ok) {
      if (result.insufficientCredits) { onInsufficientCredits?.(); return }
      alert('Error: ' + result.error)
      return
    }
    onMessageUser?.(business.owner_id)
  }

  if (!business) return null

  const canMessage = business.owner_id && business.owner_id !== currentUser?.id && (onMessageBusiness || onMessageUser)

  return (
    <div className="section" style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="link-btn" onClick={onBack} style={{ margin: 0 }}>← Back</button>
        {canMessage && (
          <button
            onClick={messageBusiness}
            disabled={messaging}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 20, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: messaging ? 'default' : 'pointer' }}
          >
            <Icon.Messages size={15} /> {messaging ? '…' : businessMode ? 'B2B Message' : 'Message'}
          </button>
        )}
      </div>

      {/* Shared header — shown once, above both subtabs */}
      <div style={{ textAlign: 'center', marginBottom: 16, marginTop: 8 }}>
        {business.photo_url ? (
          <img src={business.photo_url} alt={business.name} style={{ width: 76, height: 76, borderRadius: '50%', objectFit: 'cover', marginBottom: 10, border: '2px solid var(--border)' }} />
        ) : (
          <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'var(--hover-bg)', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🏢</div>
        )}
        <h2 style={{ marginBottom: 4 }}>{business.name}</h2>
        {business.description && (
          <p className="muted" style={{ fontSize: 13, maxWidth: 420, margin: '0 auto' }}>{business.description}</p>
        )}
      </div>

      {/* Subtab toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        <button
          onClick={() => setActiveTab('display')}
          className={`subtab-btn ${activeTab === 'display' ? 'on' : ''}`}
          aria-label="Display"
          style={{ padding: '8px 22px', display: 'flex', alignItems: 'center' }}
        >
          <Icon.Grid size={18} />
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={`subtab-btn ${activeTab === 'info' ? 'on' : ''}`}
          aria-label="Business info and reviews"
          style={{ padding: '8px 22px', display: 'flex', alignItems: 'center' }}
        >
          <Icon.Info size={18} />
        </button>
      </div>

      {activeTab === 'display' ? (
        loadingPosts ? (
          <RubiksLoader label="Loading products…" />
        ) : posts.length === 0 ? (
          <p className="muted" style={{ textAlign: 'center', marginTop: 30 }}>No products posted yet.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {posts.map((post) => {
              const like = likeState[post.id] || { liked: false, count: 0 }
              const comment = commentState[post.id] || { count: 0 }
              const saved = !!saveState[post.id]
              return (
                <div key={post.id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' }}>
                  <div onClick={() => setSelectedPost(post)} style={{ aspectRatio: '1 / 1', background: 'var(--hover-bg)', cursor: 'pointer' }}>
                    {post.market_photo_url && (
                      <img src={post.market_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 10px' }}>
                    <button onClick={() => toggleLike(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, color: like.liked ? '#1D9E75' : 'var(--text)' }}>
                      <Icon.Like size={16} /> <span style={{ fontSize: 12 }}>{like.count}</span>
                    </button>
                    <button onClick={() => toggleComments(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
                      <Icon.Comment size={16} /> <span style={{ fontSize: 12 }}>{comment.count}</span>
                    </button>
                    <button onClick={() => toggleSave(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', padding: 0, color: saved ? '#1D9E75' : 'var(--text)' }}>
                      <Icon.Save size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        <BusinessPublicProfile
          business={business}
          hideHeader
          onBack={onBack}
          onReport={onReport}
          currentUser={currentUser}
          isAdmin={isAdmin}
          businessMode={businessMode}
          onMessageBusiness={onMessageBusiness}
          onMessageUser={onMessageUser}
          onInsufficientCredits={onInsufficientCredits}
        />
      )}

      {/* Product detail popup, opened from the Display grid */}
      {selectedPost && (
        <div
          onClick={() => setSelectedPost(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: 20, maxWidth: 420, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            {selectedPost.market_photo_url && (
              <img src={selectedPost.market_photo_url} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 12 }} />
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
              <button onClick={() => toggleLike(selectedPost.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, padding: 0, color: (likeState[selectedPost.id]?.liked) ? '#1D9E75' : 'var(--text)' }}>
                <Icon.Like size={18} /> <span style={{ fontSize: 13 }}>{likeState[selectedPost.id]?.count || 0}</span>
              </button>
              <button onClick={() => toggleComments(selectedPost.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, padding: 0 }}>
                <Icon.Comment size={18} /> <span style={{ fontSize: 13 }}>{commentState[selectedPost.id]?.count || 0}</span>
              </button>
              <button onClick={() => toggleSave(selectedPost.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', padding: 0, color: saveState[selectedPost.id] ? '#1D9E75' : 'var(--text)' }}>
                <Icon.Save size={18} />
              </button>
            </div>

            <h3 style={{ marginBottom: 6 }}>{selectedPost.products?.name}</h3>
            {selectedPost.caption && <p className="muted" style={{ marginBottom: 10 }}>{selectedPost.caption}</p>}
            <p style={{ fontWeight: 700, marginBottom: 6 }}>Ksh {selectedPost.products?.price ?? '—'}</p>
            {selectedPost.products?.quantity != null && <p style={{ fontSize: 13, marginBottom: 4 }}>Stock: {selectedPost.products.quantity} available</p>}
            {selectedPost.products?.sizes?.length > 0 && <p style={{ fontSize: 13, marginBottom: 4 }}>Sizes: {selectedPost.products.sizes.join(', ')}</p>}
            {selectedPost.products?.colors?.length > 0 && <p style={{ fontSize: 13, marginBottom: 4 }}>Colors: {selectedPost.products.colors.join(', ')}</p>}

            {selectedPost.products?.id && business?.owner_id !== currentUser?.id && (
              <button
                onClick={() => setBuyProduct(selectedPost.products)}
                disabled={!selectedPost.products.quantity}
                style={{ width: '100%', marginTop: 12, background: selectedPost.products.quantity ? '#1D9E75' : 'var(--hover-bg)', color: selectedPost.products.quantity ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, cursor: selectedPost.products.quantity ? 'pointer' : 'not-allowed' }}
              >
                {selectedPost.products.quantity ? 'Buy with Checks' : 'Out of stock'}
              </button>
            )}

            {commentState[selectedPost.id]?.open && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                {(commentState[selectedPost.id]?.list || []).length === 0 && (
                  <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>No comments yet.</p>
                )}
                {(commentState[selectedPost.id]?.list || []).map((c) => (
                  <div key={c.id} style={{ marginBottom: 12 }}>
                    <AuthorRow username={c.profiles?.username} photoUrl={c.profiles?.avatar_url} timestamp={c.created_at} size={26} />
                    <p style={{ fontSize: 13, paddingLeft: 35 }}>{c.comment_text}</p>
                  </div>
                ))}
                {currentUser ? (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input
                      type="text"
                      placeholder="Add a comment…"
                      value={commentState[selectedPost.id]?.draft || ''}
                      onChange={(e) => updateDraft(selectedPost.id, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && postComment(selectedPost.id)}
                      style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}
                    />
                    <button className="btn-small" onClick={() => postComment(selectedPost.id)}>Post</button>
                  </div>
                ) : (
                  <p className="muted" style={{ fontSize: 12 }}>Log in to comment.</p>
                )}
              </div>
            )}

            <button className="btn-small" style={{ marginTop: 12 }} onClick={() => setSelectedPost(null)}>Close</button>
          </div>
        </div>
      )}

      {buyProduct && (
        <BuyProductModal
          product={buyProduct}
          currentUser={currentUser}
          onClose={() => setBuyProduct(null)}
          onOpenWallet={() => window.location.hash = '#wallet'}
          onOrdered={() => {
            setBuyProduct(null)
            setSelectedPost(null)
            setOrderPlaced(true)
            setTimeout(() => setOrderPlaced(false), 6000)
          }}
        />
      )}

      {orderPlaced && (
        <div style={{ position: 'fixed', bottom: 90, left: 20, right: 20, background: '#1D9E75', color: '#fff', borderRadius: 12, padding: '14px 18px', textAlign: 'center', fontSize: 14, fontWeight: 600, zIndex: 70 }}>
          Order placed — your Checks are held safely. Track it under "My Orders."
        </div>
      )}
    </div>
  )
}
