import { useState, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'
import imageCompression from 'browser-image-compression'
import { bmvbhash } from 'blockhash-core'
import { supabase } from '../supabase'
import RubiksLoader from './RubiksLoader'

const STORE_BASE_URL = 'https://www.bizcheckkenya.com/store'
const HASH_BITS = 16
const DUPLICATE_THRESHOLD = 10
const GREEN = '#1D9E75'
const GREEN_DARK = '#0F6E56'

async function compressImage(file) {
  try {
    return await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1200, useWebWorker: true })
  } catch (err) {
    // Some Android browsers fail silently/oddly when compression runs in a
    // background Web Worker — retry once on the main thread instead.
    console.warn('Compression via Web Worker failed, retrying without it:', err)
    return await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1200, useWebWorker: false })
  }
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read this image — it may be an unsupported format like HEIC. Try a JPEG or PNG.'))
    img.src = src
  })
}

async function computePhash(file) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImageElement(objectUrl)
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return bmvbhash(imageData, HASH_BITS)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB || hashA.length !== hashB.length) return Infinity
  let dist = 0
  for (let i = 0; i < hashA.length; i++) {
    let xor = parseInt(hashA[i], 16) ^ parseInt(hashB[i], 16)
    while (xor) { dist += xor & 1; xor >>= 1 }
  }
  return dist
}

const inp = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }

export default function ProductCatalogManager({ businessId }) {
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'products' | 'market'
  const [products, setProducts] = useState([])
  const [photosByProduct, setPhotosByProduct] = useState({})
  const [marketPosts, setMarketPosts] = useState([])
  const [stats, setStats] = useState({ products: 0, marketPosts: 0, scans: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [uploadingFor, setUploadingFor] = useState(null)
  const [sendingFor, setSendingFor] = useState(null)
  const [captionDrafts, setCaptionDrafts] = useState({})
  const [showForm, setShowForm] = useState(false)

  const emptyForm = { id: null, name: '', description: '', price: '', quantity: '', sizes: '', colors: '', is_active: true }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    if (businessId) { loadEverything(); generateQr() }
  }, [businessId])

  async function loadEverything() {
    setLoading(true)
    setError('')
    await Promise.all([fetchProducts(), fetchMarketPosts(), fetchStats()])
    setLoading(false)
  }

  async function generateQr() {
    try {
      const url = `${STORE_BASE_URL}/${businessId}`
      setQrDataUrl(await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#0B1F1A', light: '#FFFFFF' } }))
    } catch (err) {
      console.error('QR generation failed:', err)
    }
  }

  function downloadQr() {
    if (!qrDataUrl) return
    const link = document.createElement('a')
    link.href = qrDataUrl
    link.download = `bizcheck-storefront-qr-${businessId}.png`
    link.click()
  }

  async function fetchProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (error) { setError('Could not load products: ' + error.message); return }
    setProducts(data || [])
    ;(data || []).forEach((p) => fetchPhotosFor(p.id))
  }

  async function fetchPhotosFor(productId) {
    const { data, error } = await supabase
      .from('product_photos')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })

    if (error) return

    const withUrls = await Promise.all(
      (data || []).map(async (photo) => {
        const { data: signed } = await supabase.storage.from('product-photos').createSignedUrl(photo.photo_url, 3600)
        return { ...photo, signedUrl: signed?.signedUrl || null }
      })
    )
    setPhotosByProduct((prev) => ({ ...prev, [productId]: withUrls }))
  }

  async function fetchMarketPosts() {
    const { data, error } = await supabase
      .from('market_posts')
      .select('*, products(name)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (!error) {
      setMarketPosts(data || [])
      const drafts = {}
      ;(data || []).forEach((post) => { drafts[post.id] = post.caption || '' })
      setCaptionDrafts(drafts)
    }
  }

  async function fetchStats() {
    const [{ count: productCount }, { count: postCount }, { count: scanCount }] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('market_posts').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'approved'),
      supabase.from('qr_scans').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    ])
    setStats({ products: productCount || 0, marketPosts: postCount || 0, scans: scanCount || 0 })
  }

  function resetForm() { setForm(emptyForm); setShowForm(false) }

  function handleEdit(product) {
    setForm({
      id: product.id,
      name: product.name || '',
      description: product.description || '',
      price: product.price ?? '',
      quantity: product.quantity ?? '',
      sizes: (product.sizes || []).join(', '),
      colors: (product.colors || []).join(', '),
      is_active: product.is_active,
    })
    setShowForm(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      business_id: businessId,
      name: form.name.trim(),
      description: form.description.trim(),
      price: form.price === '' ? null : Number(form.price),
      quantity: form.quantity === '' ? 0 : Number(form.quantity),
      sizes: form.sizes ? form.sizes.split(',').map((s) => s.trim()).filter(Boolean) : [],
      colors: form.colors ? form.colors.split(',').map((c) => c.trim()).filter(Boolean) : [],
      is_active: form.is_active,
    }

    const { error } = form.id
      ? await supabase.from('products').update(payload).eq('id', form.id)
      : await supabase.from('products').insert(payload)

    setSaving(false)
    if (error) { setError('Save failed: ' + error.message); return }
    resetForm()
    fetchProducts()
    fetchStats()
  }

  async function handleDeleteProduct(id) {
    if (!window.confirm('Delete this product and all its photos? This cannot be undone.')) return
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) { setError('Delete failed: ' + error.message); return }
    fetchProducts()
    fetchStats()
  }

  async function handlePhotoSelect(productId, fileList) {
    const files = Array.from(fileList || [])
    if (files.length === 0) return

    setUploadingFor(productId)
    setError('')

    try {
      const existing = photosByProduct[productId] || []
      let knownHashes = existing.map((p) => p.phash).filter(Boolean)

      for (const rawFile of files) {
        let compressed
        try {
          compressed = await compressImage(rawFile)
        } catch (err) {
          throw new Error('Could not compress this photo: ' + (err?.message || 'unknown compression error'))
        }

        let phash
        try {
          phash = await computePhash(compressed)
        } catch (err) {
          throw new Error('Could not process this photo: ' + (err?.message || 'unknown error while checking for duplicates'))
        }

        const closest = knownHashes.reduce((min, h) => Math.min(min, hammingDistance(phash, h)), Infinity)
        const isDuplicate = closest <= DUPLICATE_THRESHOLD

        if (isDuplicate) {
          const proceed = window.confirm('This looks very similar to a photo you already have for this product. Upload it anyway?')
          if (!proceed) continue
        }

        const path = `${businessId}/${productId}/${Date.now()}-${rawFile.name}`
        const { error: uploadError } = await supabase.storage.from('product-photos').upload(path, compressed, { upsert: true })
        if (uploadError) throw uploadError

        const { error: insertError } = await supabase.from('product_photos').insert({
          product_id: productId, business_id: businessId, photo_url: path, phash, is_duplicate: isDuplicate,
        })
        if (insertError) throw insertError
        knownHashes = [...knownHashes, phash]
      }

      fetchPhotosFor(productId)
    } catch (err) {
      console.error('Photo upload error:', err)
      setError('Photo upload failed: ' + (err?.message || 'An unknown error occurred. Please try a different photo, or a different browser/app.'))
    } finally {
      setUploadingFor(null)
    }
  }

  async function handleDeletePhoto(photoId, productId, storagePath) {
    if (!window.confirm('Delete this photo?')) return
    await supabase.storage.from('product-photos').remove([storagePath])
    await supabase.from('product_photos').delete().eq('id', photoId)
    fetchPhotosFor(productId)
  }

  async function handleSendToMarket(productId) {
    setSendingFor(productId)
    setError('')
    try {
      const { data, error } = await supabase.functions.invoke('generate-market-post', { body: { product_id: productId } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      fetchMarketPosts()
      fetchStats()
    } catch (err) {
      setError('Send to Market failed: ' + err.message)
    } finally {
      setSendingFor(null)
    }
  }

  async function saveCaption(postId) {
    const { error } = await supabase.from('market_posts').update({ caption: captionDrafts[postId] }).eq('id', postId)
    if (!error) fetchMarketPosts()
  }

  async function setPostStatus(postId, status) {
    const payload = { status }
    if (status === 'approved') payload.approved_at = new Date().toISOString()
    const { error } = await supabase.from('market_posts').update(payload).eq('id', postId)
    if (!error) { fetchMarketPosts(); fetchStats() }
  }

  const latestPostForProduct = useCallback(
    (productId) => marketPosts.find((p) => p.product_id === productId),
    [marketPosts]
  )

  const pendingCount = marketPosts.filter((p) => p.status === 'pending_review').length

  if (loading) {
    return <RubiksLoader label="Loading your catalog…" />
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN }} />
        <h3 style={{ margin: 0 }}>Product Catalog &amp; Market</h3>
      </div>
      <p className="muted" style={{ marginBottom: 20, fontSize: 13 }}>Manage stock, upload photos, and post to the BizCheck Market.</p>

      {/* TAB SWITCHER */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 22, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
        <TabButton label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
        <TabButton label="Products" count={products.length} active={activeTab === 'products'} onClick={() => setActiveTab('products')} />
        <TabButton label="Market Review" count={pendingCount || null} active={activeTab === 'market'} onClick={() => setActiveTab('market')} />
      </div>

      {error && (
        <div style={{ background: '#FCEBEB', border: '1px solid #F7C1C1', color: '#A32D2D', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13.5 }}>
          {error}
        </div>
      )}

      {/* ===== OVERVIEW TAB ===== */}
      {activeTab === 'overview' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <StatCard icon="📦" label="Products" value={stats.products} />
            <StatCard icon="🛍️" label="Live on Market" value={stats.marketPosts} accent />
            <StatCard icon="📱" label="QR Scans" value={stats.scans} />
          </div>

          <div style={{ ...card, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Storefront QR code" style={{ width: 110, height: 110, borderRadius: 12, border: '1px solid var(--border)' }} />
            ) : (
              <div style={{ width: 110, height: 110, background: 'var(--hover-bg)', borderRadius: 12 }} />
            )}
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-strong)' }}>Your storefront QR code</p>
              <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Print this and display it in your shop — customers scan it to browse your live stock, no app download needed.</p>
              <button
                onClick={downloadQr}
                style={{ background: GREEN, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.background = GREEN_DARK}
                onMouseLeave={(e) => e.currentTarget.style.background = GREEN}
              >
                ⬇ Download QR Code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PRODUCTS TAB ===== */}
      {activeTab === 'products' && (
        <div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              style={{ width: '100%', background: 'var(--hover-bg)', border: `1.5px dashed var(--border)`, borderRadius: 14, padding: '16px', color: GREEN_DARK, fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 20 }}
            >
              + Add a new product
            </button>
          )}

          {showForm && (
            <form onSubmit={handleSubmit} style={{ ...card, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h4 style={{ margin: 0 }}>{form.id ? 'Edit Product' : 'Add Product'}</h4>
                <button type="button" onClick={resetForm} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>

              <div className="form-row" style={{ marginBottom: 12 }}>
                <input style={inp} type="text" placeholder="Product name" value={form.name} required
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input style={inp} type="number" step="0.01" placeholder="Price (Ksh)" value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <input style={inp} type="number" placeholder="Quantity in stock" value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                <input style={inp} type="text" placeholder="Sizes (e.g. S, M, L)" value={form.sizes}
                  onChange={(e) => setForm({ ...form, sizes: e.target.value })} />
              </div>
              <input style={{ ...inp, marginBottom: 12 }} type="text" placeholder="Colors (e.g. Red, Blue)" value={form.colors}
                onChange={(e) => setForm({ ...form, colors: e.target.value })} />
              <textarea style={{ ...inp, marginBottom: 12, resize: 'vertical' }} rows={3} placeholder="Description"
                value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginBottom: 18, color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                Visible in your inventory
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="submit" disabled={saving}
                  style={{ background: GREEN, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Saving…' : form.id ? 'Update Product' : 'Add Product'}
                </button>
                <button type="button" onClick={resetForm} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 22px', fontSize: 14, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {products.length === 0 ? (
            <EmptyState icon="🗂️" text="No products yet — add your first one above to get started." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {products.map((p) => {
                const photos = photosByProduct[p.id] || []
                const usablePhotoCount = photos.filter((ph) => !ph.is_duplicate).length
                const latestPost = latestPostForProduct(p.id)
                const coverPhoto = photos.find((ph) => !ph.is_duplicate && ph.signedUrl)

                return (
                  <div key={p.id} style={{ ...card, padding: 16, display: 'flex', gap: 16 }}>
                    <div style={{ width: 88, height: 88, borderRadius: 12, overflow: 'hidden', background: 'var(--hover-bg)', flexShrink: 0 }}>
                      {coverPhoto ? (
                        <img src={coverPhoto.signedUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🖼️</div>
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div>
                          <p style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{p.name}</p>
                          <p className="muted" style={{ fontSize: 13 }}>Ksh {p.price ?? '—'} · Qty {p.quantity}</p>
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                          <button onClick={() => handleEdit(p)} style={{ background: 'none', border: 'none', color: GREEN_DARK, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Edit</button>
                          <button onClick={() => handleDeleteProduct(p.id)} style={{ background: 'none', border: 'none', color: '#C0392B', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Delete</button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, marginBottom: 12 }}>
                        {photos.map((photo) => (
                          <div key={photo.id} style={{ position: 'relative', width: 44, height: 44 }}>
                            {photo.signedUrl && (
                              <img src={photo.signedUrl} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, opacity: photo.is_duplicate ? 0.35 : 1, border: '1px solid var(--border)' }} />
                            )}
                            {photo.is_duplicate && (
                              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#fff' }}>⧉</span>
                            )}
                            <button onClick={() => handleDeletePhoto(photo.id, p.id, photo.photo_url)}
                              style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: '#C0392B', color: '#fff', border: '1.5px solid var(--surface)', fontSize: 10, lineHeight: '15px', cursor: 'pointer', padding: 0 }}>×</button>
                          </div>
                        ))}
                        <label style={{ width: 44, height: 44, border: '1.5px dashed var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: GREEN, cursor: 'pointer' }}>
                          {uploadingFor === p.id ? '…' : '+'}
                          <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => handlePhotoSelect(p.id, e.target.files)} />
                        </label>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          disabled={usablePhotoCount === 0 || sendingFor === p.id}
                          onClick={() => handleSendToMarket(p.id)}
                          style={{
                            background: usablePhotoCount === 0 ? 'var(--hover-bg)' : GREEN,
                            color: usablePhotoCount === 0 ? 'var(--text-muted)' : '#fff',
                            border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12.5, fontWeight: 700,
                            cursor: usablePhotoCount === 0 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {sendingFor === p.id ? 'Sending…' : '🛍️ Send to Market'}
                        </button>
                        {latestPost && <StatusBadge status={latestPost.status} />}
                        {usablePhotoCount === 0 && <span className="muted" style={{ fontSize: 12 }}>Add a photo first</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== MARKET REVIEW TAB ===== */}
      {activeTab === 'market' && (
        marketPosts.length === 0 ? (
          <EmptyState icon="🛍️" text={'Nothing sent to Market yet — go to the Products tab and hit "Send to Market" on an item with a photo.'} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {marketPosts.map((post) => (
              <div key={post.id} style={{ ...card, padding: 16, display: 'flex', gap: 16, borderLeft: `4px solid ${post.status === 'approved' ? GREEN : post.status === 'rejected' ? '#C0392B' : '#E8A33D'}` }}>
                {post.market_photo_url ? (
                  <img src={post.market_photo_url} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10, flexShrink: 0, border: '1px solid var(--border)' }} />
                ) : (
                  <div style={{ width: 84, height: 84, background: 'var(--hover-bg)', borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Processing…</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>{post.products?.name}</p>
                    <StatusBadge status={post.status} />
                  </div>
                  <textarea
                    style={{ ...inp, marginBottom: 10, fontSize: 13 }}
                    rows={2}
                    value={captionDrafts[post.id] ?? ''}
                    onChange={(e) => setCaptionDrafts((d) => ({ ...d, [post.id]: e.target.value }))}
                    onBlur={() => saveCaption(post.id)}
                  />
                  {post.status === 'pending_review' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => setPostStatus(post.id, 'approved')}
                        style={{ background: GREEN, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                      >
                        ✓ Approve &amp; Post
                      </button>
                      <button
                        onClick={() => setPostStatus(post.id, 'rejected')}
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 16px', fontSize: 12.5, color: 'var(--text-muted)', cursor: 'pointer' }}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function TabButton({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#1D9E75' : 'transparent',
        color: active ? '#fff' : 'var(--text-muted)',
        border: 'none', borderRadius: 10, padding: '8px 16px',
        fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {label}
      {!!count && (
        <span style={{
          background: active ? 'rgba(255,255,255,0.25)' : 'var(--hover-bg)',
          color: active ? '#fff' : '#1D9E75',
          fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
        }}>
          {count}
        </span>
      )}
    </button>
  )
}

function StatCard({ icon, label, value, accent }) {
  return (
    <div style={{
      background: accent ? '#EAF8F3' : 'var(--surface)',
      border: `1px solid ${accent ? '#BEE9DA' : 'var(--border)'}`,
      borderRadius: 14, padding: '16px 14px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: accent ? '#0F6E56' : 'var(--text-strong)' }}>{value}</div>
      <div className="muted" style={{ fontSize: 11.5 }}>{label}</div>
    </div>
  )
}

function StatusBadge({ status }) {
  const styles = {
    pending_review: { background: '#FEF3C7', color: '#92400E' },
    approved: { background: '#D1FAE5', color: '#065F46' },
    rejected: { background: '#FEE2E2', color: '#991B1B' },
  }
  const labels = { pending_review: 'Pending review', approved: 'Live on Market', rejected: 'Rejected' }
  return <span style={{ ...styles[status], fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{labels[status]}</span>
}

function EmptyState({ icon, text }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>
      <p style={{ fontSize: 14, maxWidth: 320, margin: '0 auto' }}>{text}</p>
    </div>
  )
}
