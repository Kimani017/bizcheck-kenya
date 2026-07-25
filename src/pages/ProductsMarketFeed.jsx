import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

const PAGE_SIZE = 12

// Drop-in subtab for Directory.jsx. onSelectBusiness should be the SAME
// callback Directory already receives from App.jsx (the one that opens the
// real BusinessPublicProfile) — this component only calls it when the
// customer actually chooses to view the profile, not on first tap.
export default function ProductsMarketFeed({ onSelectBusiness }) {
  const [posts, setPosts] = useState([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [galleryBusinessId, setGalleryBusinessId] = useState(null)

  useEffect(() => { loadPage(0) }, [])

  async function loadPage(pageIndex) {
    setLoading(true)
    const from = pageIndex * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('market_posts')
      .select('*, businesses(id, name, business_username, logo_url)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .range(from, to)

    if (!error) {
      setPosts((prev) => (pageIndex === 0 ? data : [...prev, ...data]))
      setHasMore((data || []).length === PAGE_SIZE)
      setPage(pageIndex)
    }
    setLoading(false)
  }

  if (galleryBusinessId) {
    return (
      <BusinessGallery
        businessId={galleryBusinessId}
        onExit={() => setGalleryBusinessId(null)}
        onOpenProfile={onSelectBusiness}
      />
    )
  }

  if (loading && posts.length === 0) {
    return <p className="muted" style={{ textAlign: 'center', marginTop: 40 }}>Loading the market…</p>
  }
  if (posts.length === 0) {
    return <p className="muted" style={{ textAlign: 'center', marginTop: 40 }}>No products in the market yet.</p>
  }

  return (
    <div>
      <div className="biz-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {posts.map((post) => (
          <div key={post.id} className="market-post-tile" onClick={() => setGalleryBusinessId(post.business_id)}>
            {post.market_photo_url && <img src={post.market_photo_url} alt="" />}
            <div className="market-post-badge">
              {post.businesses?.business_username || post.businesses?.name}
            </div>
            {post.caption && <div className="market-post-caption">{post.caption}</div>}
          </div>
        ))}
      </div>

      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button className="btn-small" onClick={() => loadPage(page + 1)} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

// Shown after tapping a product — that business's market photos, with
// swipe-right (or the text link, for desktop/no-touch) handing off to the
// real profile navigation via onOpenProfile.
function BusinessGallery({ businessId, onExit, onOpenProfile }) {
  const [business, setBusiness] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const touchStartX = useRef(null)

  useEffect(() => { load() }, [businessId])

  async function load() {
    setLoading(true)
    const [{ data: biz }, { data: marketPosts }] = await Promise.all([
      supabase.from('businesses').select('*').eq('id', businessId).single(),
      supabase.from('market_posts').select('*').eq('business_id', businessId).eq('status', 'approved').order('created_at', { ascending: false }),
    ])
    setBusiness(biz || null)
    setPosts(marketPosts || [])
    setLoading(false)
  }

  function handleTouchStart(e) { touchStartX.current = e.touches[0].clientX }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return
    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    if (deltaX > 60 && business) onOpenProfile(business)
    touchStartX.current = null
  }

  if (loading) return <p className="muted" style={{ textAlign: 'center', marginTop: 40 }}>Loading store…</p>
  if (!business) return <p className="muted" style={{ textAlign: 'center', marginTop: 40 }}>Business not found.</p>

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button className="link-btn" style={{ margin: 0 }} onClick={onExit}>← Back to Products</button>
        <button className="link-btn" style={{ margin: 0, color: '#1D9E75' }} onClick={() => onOpenProfile(business)}>
          View business profile →
        </button>
      </div>

      <h3 style={{ marginBottom: 2 }}>{business.name}</h3>
      <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>Swipe right, or tap "View business profile," for reviews &amp; ratings</p>

      {posts.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center', marginTop: 30 }}>No products posted to the market yet.</p>
      ) : (
        <div className="biz-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {posts.map((post) => (
            <div key={post.id} className="market-post-tile">
              {post.market_photo_url && <img src={post.market_photo_url} alt="" />}
              {post.caption && <div className="market-post-caption">{post.caption}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
