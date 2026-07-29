import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

const GREEN = '#1D9E75'
const GREEN_DARK = '#0F6E56'

export default function PublicStorePage({ businessId }) {
  const [business, setBusiness] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null) // { product, confidence, note } | { noMatch: true }
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (businessId) { loadStore(); logScan() }
  }, [businessId])

  async function loadStore() {
    setLoading(true)

    const { data: biz } = await supabase
      .from('businesses')
      .select('id, name, logo_url, trust_score, status, ban_reason, banned_at, category, location')
      .eq('id', businessId)
      .single()

    setBusiness(biz || null)

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

  async function handleCameraCapture(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow selecting the same file again later
    if (!file) return

    setScanning(true)
    setScanResult(null)
    try {
      const base64 = await fileToBase64(file)
      const { data, error } = await supabase.functions.invoke('identify-product', {
        body: { business_id: businessId, image_base64: base64, media_type: file.type || 'image/jpeg' },
      })
      if (error) throw error
      if (data?.match) {
        const matched = products.find((p) => p.id === data.match.product_id)
        setScanResult({ product: matched, note: data.match.note })
        if (matched) setSelectedProduct(matched)
      } else {
        setScanResult({ noMatch: true })
      }
    } catch (err) {
      console.error('Visual search failed:', err)
      setScanResult({ error: true })
    } finally {
      setScanning(false)
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const filteredProducts = products.filter((p) => {
    if (!searchText.trim()) return true
    const q = searchText.toLowerCase()
    return p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
  })

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }} className="muted">Loading store...</div>
  }

  if (!business) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
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
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #F7F6F2)' }}>
      {/* STORE HEADER */}
      <div style={{ background: 'linear-gradient(135deg, #0F6E56, #1D9E75)', padding: '32px 20px 46px', color: '#fff', textAlign: 'center' }}>
        {business.logo_url ? (
          <img src={business.logo_url} alt={business.name} style={{ width: 72, height: 72, borderRadius: 18, objectFit: 'cover', marginBottom: 12, border: '3px solid rgba(255,255,255,0.5)' }} />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: 18, background: 'rgba(255,255,255,0.15)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🏢</div>
        )}
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>{business.name}</h1>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
          {business.category && (
            <span style={{ background: 'rgba(255,255,255,0.18)', padding: '4px 12px', borderRadius: 999 }}>{business.category}</span>
          )}
          <span style={{ background: 'rgba(255,255,255,0.18)', padding: '4px 12px', borderRadius: 999 }}>⭐ Trust {business.trust_score ?? '—'}%</span>
          {business.location && <span style={{ background: 'rgba(255,255,255,0.18)', padding: '4px 12px', borderRadius: 999 }}>📍 {business.location}</span>}
        </div>
      </div>

      {/* SEARCH BAR — floats over the header/content boundary */}
      <div style={{ maxWidth: 640, margin: '-22px auto 0', padding: '0 20px' }}>
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', padding: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="text"
            placeholder="Search this store's products..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', padding: '10px 12px', fontSize: 14, background: 'transparent' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning}
            title="Scan a product with your camera"
            style={{
              width: 42, height: 42, borderRadius: 10, border: 'none', flexShrink: 0,
              background: scanning ? 'var(--hover-bg, #eee)' : GREEN, color: '#fff', fontSize: 18,
              cursor: scanning ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {scanning ? '…' : '📷'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleCameraCapture} />
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 20px 40px' }}>
        {/* VISUAL SEARCH RESULT BANNER */}
        {scanning && (
          <div style={{ background: '#fff', border: `1px solid ${GREEN}`, borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13.5, color: GREEN_DARK, textAlign: 'center' }}>
            🔍 Looking through this store's catalog for a match...
          </div>
        )}
        {scanResult?.product && (
          <div style={{ background: '#EAF8F3', border: '1px solid #BEE9DA', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13.5 }}>
            <strong style={{ color: GREEN_DARK }}>Found it:</strong> {scanResult.product.name}
            {scanResult.note && <span className="muted"> — {scanResult.note}</span>}
          </div>
        )}
        {scanResult?.noMatch && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13.5, color: '#92400E' }}>
            Couldn't confidently match that photo to anything in this store's catalog — try browsing below instead.
          </div>
        )}
        {scanResult?.error && (
          <div style={{ background: '#FCEBEB', border: '1px solid #F7C1C1', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13.5, color: '#A32D2D' }}>
            Something went wrong scanning that photo — please try again.
          </div>
        )}

        {/* PRODUCT GRID */}
        {filteredProducts.length === 0 ? (
          <p className="muted" style={{ textAlign: 'center', marginTop: 30 }}>
            {searchText ? 'No products match your search.' : "This business hasn't added any products yet."}
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                style={{
                  background: '#fff', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
                  border: '1px solid var(--border, #E5E3DC)', transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.08)' }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
              >
                {product.display_photo ? (
                  <img src={product.display_photo} alt={product.name} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', aspectRatio: '1 / 1', background: 'var(--hover-bg, #F1EFE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🖼️</div>
                )}
                <div style={{ padding: '10px 12px' }}>
                  <p style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>{product.name}</p>
                  <p style={{ color: GREEN_DARK, fontWeight: 700, fontSize: 13 }}>Ksh {product.price ?? '—'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PRODUCT DETAIL MODAL */}
      {selectedProduct && (
        <div
          onClick={() => { setSelectedProduct(null); setScanResult(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: 22, maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div style={{ width: 40, height: 4, background: 'var(--border, #E5E3DC)', borderRadius: 999, margin: '0 auto 16px' }} />
            {selectedProduct.display_photo && (
              <img src={selectedProduct.display_photo} alt={selectedProduct.name} style={{ width: '100%', borderRadius: 14, marginBottom: 14 }} />
            )}
            <h2 style={{ marginBottom: 6 }}>{selectedProduct.name}</h2>
            <p style={{ color: GREEN_DARK, fontWeight: 800, fontSize: 20, marginBottom: 10 }}>Ksh {selectedProduct.price ?? '—'}</p>
            {selectedProduct.description && <p className="muted" style={{ marginBottom: 14, fontSize: 14 }}>{selectedProduct.description}</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              <DetailRow label="In stock" value={`${selectedProduct.quantity} available`} />
              {selectedProduct.sizes?.length > 0 && <DetailRow label="Sizes" value={selectedProduct.sizes.join(', ')} />}
              {selectedProduct.colors?.length > 0 && <DetailRow label="Colors" value={selectedProduct.colors.join(', ')} />}
            </div>

            <button
              onClick={() => { setSelectedProduct(null); setScanResult(null) }}
              style={{ width: '100%', background: 'var(--hover-bg, #F1EFE8)', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, color: 'var(--text, #333)', cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, borderBottom: '1px solid var(--border, #F0EEE8)', paddingBottom: 8 }}>
      <span className="muted">{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  )
}
