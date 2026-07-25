import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

// PublicStorePage — the page a customer lands on after scanning a business's
// QR code. Rendered directly (no react-router): whatever boots the app should
// check window.location.pathname for "/store/<businessId>" and pass that id
// in as a prop here, bypassing the normal login/nav app shell entirely.
export default function PublicStorePage({ businessId }) {
  const [business, setBusiness] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState(null)

  useEffect(() => {
    if (businessId) { loadStore(); logScan() }
  }, [businessId])

  async function loadStore() {
    setLoading(true)

    const { data: biz } = await supabase
      .from('businesses')
      .select('id, name, logo_url, trust_score, status, ban_reason, banned_at, phone, mpesa_till')
      .eq('id', businessId)
      .single()

    setBusiness(biz || null)

    // Product info comes from the products table; photos come from approved
    // market posts (the AI-cleaned, business-approved images) — raw uploads
    // in product-photos stay private on purpose.
    const [{ data: prods }, { data: posts }] = await Promise.all([
      supabase.from('products').select('*').eq('business_id', businessId).eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('market_posts').select('product_id, market_photo_url').eq('business_id', businessId).eq('status', 'approved'),
    ])

    const photoByProduct = {}
    ;(posts || []).forEach((post) => { photoByProduct[post.product_id] = post.market_photo_url })

    setProducts((prods || []).map((p) => ({ ...p, display_photo: photoByProduct[p.id] || null })))
    setLoading(false)
  }

  async function logScan() {
    await supabase.from('qr_scans').insert({ business_id: businessId })
  }

  if (loading) {
    return <div style={{ padding: 20 }} className="muted">Loading store...</div>
  }

  if (!business) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <h2>Store Not Found</h2>
        <p className="muted">This QR code does not match any business on BizCheck Kenya.</p>
      </div>
    )
  }

  if (business.status === 'banned') {
    return (
      <div style={{ padding: '36px 20px', textAlign: 'center' }}>
        <div style={{ background: '#FCEBEB', border: '1.5px solid #F7C1C1', borderRadius: 16, padding: '30px 24px', maxWidth: 480, margin: '0 auto' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🚫</div>
          <h2 style={{ color: '#A32D2D', marginBottom: 8 }}>This business has been banned</h2>
          <p style={{ color: '#7a2020', fontSize: 14 }}>{business.ban_reason || 'Violation of BizCheck community guidelines.'}</p>
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>We recommend you do not proceed with any purchase from this seller.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 20, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        {business.logo_url && (
          <img src={business.logo_url} alt={business.name} style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover', marginBottom: 10 }} />
        )}
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>{business.name}</h1>
        <p className="muted">Trust score: {business.trust_score ?? 'Not yet rated'}%</p>
      </div>

      {products.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center' }}>This business hasn't added any products yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
          {products.map((product) => (
            <div
              key={product.id}
              onClick={() => setSelectedProduct(product)}
              style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, cursor: 'pointer', background: 'var(--surface)' }}
            >
              {product.display_photo ? (
                <img src={product.display_photo} alt={product.name} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
              ) : (
                <div style={{ width: '100%', aspectRatio: '1 / 1', background: 'var(--hover-bg)', borderRadius: 8, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>No photo</div>
              )}
              <p style={{ fontWeight: 600, fontSize: 14 }}>{product.name}</p>
              <p className="muted" style={{ fontSize: 13 }}>Ksh {product.price ?? '—'}</p>
            </div>
          ))}
        </div>
      )}

      {selectedProduct && (
        <div
          onClick={() => setSelectedProduct(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, maxWidth: 400, width: '100%' }}>
            {selectedProduct.display_photo && (
              <img src={selectedProduct.display_photo} alt={selectedProduct.name} style={{ width: '100%', borderRadius: 10, marginBottom: 12 }} />
            )}
            <h3 style={{ marginBottom: 6 }}>{selectedProduct.name}</h3>
            {selectedProduct.description && <p className="muted" style={{ marginBottom: 10 }}>{selectedProduct.description}</p>}
            <p style={{ marginBottom: 4 }}><strong>Price:</strong> Ksh {selectedProduct.price ?? '—'}</p>
            <p style={{ marginBottom: 4 }}><strong>Stock:</strong> {selectedProduct.quantity} available</p>
            {selectedProduct.sizes?.length > 0 && <p style={{ marginBottom: 4 }}><strong>Sizes:</strong> {selectedProduct.sizes.join(', ')}</p>}
            {selectedProduct.colors?.length > 0 && <p style={{ marginBottom: 4 }}><strong>Colors:</strong> {selectedProduct.colors.join(', ')}</p>}
            <button className="btn-small" style={{ marginTop: 12 }} onClick={() => setSelectedProduct(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
