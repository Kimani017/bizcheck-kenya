import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import BusinessPublicProfile from './BusinessPublicProfile'
import RubiksLoader from './RubiksLoader'

// The one destination for viewing any business, from anywhere in the app.
// Pass the same props you'd give BusinessPublicProfile directly — this
// wraps it (header hidden) as the "Info/Reviews" subtab, and adds a new
// "Display" subtab showing the business's posted product photos.
export default function BusinessStorePage({
  business, onBack, currentUser, isAdmin, businessMode,
  onReport, onMessageBusiness, onMessageUser, onInsufficientCredits,
}) {
  const [activeTab, setActiveTab] = useState('display') // 'display' | 'info'
  const [posts, setPosts] = useState([])
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [selectedPost, setSelectedPost] = useState(null)

  useEffect(() => { loadPosts() }, [business?.id])

  async function loadPosts() {
    if (!business?.id) return
    setLoadingPosts(true)
    const { data } = await supabase
      .from('market_posts')
      .select('*, products(name, description, price, quantity, sizes, colors)')
      .eq('business_id', business.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
    setPosts(data || [])
    setLoadingPosts(false)
  }

  if (!business) return null

  return (
    <div className="section" style={{ maxWidth: 680 }}>
      <button className="link-btn" onClick={onBack}>← Back</button>

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
          style={{ fontSize: 18, padding: '8px 20px' }}
        >
          📦
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={`subtab-btn ${activeTab === 'info' ? 'on' : ''}`}
          aria-label="Business info and reviews"
          style={{ fontSize: 18, padding: '8px 20px' }}
        >
          🧩
        </button>
      </div>

      {activeTab === 'display' ? (
        loadingPosts ? (
          <RubiksLoader label="Loading products…" />
        ) : posts.length === 0 ? (
          <p className="muted" style={{ textAlign: 'center', marginTop: 30 }}>No products posted yet.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => setSelectedPost(post)}
                style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--hover-bg)', cursor: 'pointer', overflow: 'hidden' }}
              >
                {post.market_photo_url && (
                  <img src={post.market_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>
            ))}
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
            <h3 style={{ marginBottom: 6 }}>{selectedPost.products?.name}</h3>
            {selectedPost.caption && <p className="muted" style={{ marginBottom: 10 }}>{selectedPost.caption}</p>}
            <p style={{ fontWeight: 700, marginBottom: 6 }}>Ksh {selectedPost.products?.price ?? '—'}</p>
            {selectedPost.products?.quantity != null && <p style={{ fontSize: 13, marginBottom: 4 }}>Stock: {selectedPost.products.quantity} available</p>}
            {selectedPost.products?.sizes?.length > 0 && <p style={{ fontSize: 13, marginBottom: 4 }}>Sizes: {selectedPost.products.sizes.join(', ')}</p>}
            {selectedPost.products?.colors?.length > 0 && <p style={{ fontSize: 13, marginBottom: 4 }}>Colors: {selectedPost.products.colors.join(', ')}</p>}
            <button className="btn-small" style={{ marginTop: 14 }} onClick={() => setSelectedPost(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
