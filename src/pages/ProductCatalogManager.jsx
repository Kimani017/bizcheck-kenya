import { useState, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'
import imageCompression from 'browser-image-compression'
import { bmvbhash } from 'blockhash-core'
import { supabase } from '../supabase'

const STORE_BASE_URL = 'https://www.bizcheckkenya.com/store'
const HASH_BITS = 16
const DUPLICATE_THRESHOLD = 10

async function compressImage(file) {
  return imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1200, useWebWorker: true })
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
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

const inp = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }

export default function ProductCatalogManager({ businessId }) {
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
      setQrDataUrl(await QRCode.toDataURL(url, { width: 400, margin: 2 }))
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

  function resetForm() { setForm(emptyForm) }

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
        const compressed = await compressImage(rawFile)
        const phash = await computePhash(compressed)
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
      setError('Photo upload failed: ' + err.message)
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

  if (loading) return <p className="muted">Loading your catalog...</p>

  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>Product Catalog &amp; Market</h3>
      <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>Manage stock, upload photos, and post to the BizCheck Market.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
        <StatCard label="Products" value={stats.products} />
        <StatCard label="Live on Market" value={stats.marketPosts} />
        <StatCard label="QR Scans" value={stats.scans} />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="Storefront QR code" style={{ width: 120, height: 120 }} />
        ) : (
          <div style={{ width: 120, height: 120, background: 'var(--hover-bg)', borderRadius: 8 }} />
        )}
        <div>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>Your storefront QR code</p>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Print this and display it in your shop.</p>
          <button className="btn-small" onClick={downloadQr}>Download QR Code</button>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

      <form onSubmit={handleSubmit} className="review-write-box" style={{ marginBottom: 20 }}>
        <h4 style={{ marginBottom: 12 }}>{form.id ? 'Edit Product' : 'Add Product'}</h4>
        <div className="form-row" style={{ marginBottom: 10 }}>
          <input style={inp} type="text" placeholder="Product name" value={form.name} required
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input style={inp} type="number" step="0.01" placeholder="Price (Ksh)" value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
        <div className="form-row" style={{ marginBottom: 10 }}>
          <input style={inp} type="number" placeholder="Quantity in stock" value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <input style={inp} type="text" placeholder="Sizes (comma-separated)" value={form.sizes}
            onChange={(e) => setForm({ ...form, sizes: e.target.value })} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <input style={inp} type="text" placeholder="Colors (comma-separated)" value={form.colors}
            onChange={(e) => setForm({ ...form, colors: e.target.value })} />
        </div>
        <textarea style={{ ...inp, marginBottom: 10, resize: 'vertical' }} rows={3} placeholder="Description"
          value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 14 }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          Visible in your inventory
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-primary" style={{ width: 'auto', padding: '9px 22px' }} type="submit" disabled={saving}>
            {saving ? 'Saving…' : form.id ? 'Update Product' : 'Add Product'}
          </button>
          {form.id && <button type="button" className="btn-ghost-small" onClick={resetForm}>Cancel</button>}
        </div>
      </form>

      <h4 style={{ marginBottom: 10 }}>Your Products</h4>
      {products.length === 0 ? (
        <p className="muted" style={{ marginBottom: 24 }}>No products yet. Add your first one above.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {products.map((p) => {
            const photos = photosByProduct[p.id] || []
            const usablePhotoCount = photos.filter((ph) => !ph.is_duplicate).length
            const latestPost = latestPostForProduct(p.id)

            return (
              <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{p.name}</p>
                    <p className="muted" style={{ fontSize: 13 }}>Ksh {p.price ?? '—'} · Qty {p.quantity}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="link-btn" style={{ margin: 0, fontSize: 12 }} onClick={() => handleEdit(p)}>Edit</button>
                    <button className="link-btn" style={{ margin: 0, fontSize: 12, color: '#E24B4A' }} onClick={() => handleDeleteProduct(p.id)}>Delete</button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {photos.map((photo) => (
                    <div key={photo.id} style={{ position: 'relative', width: 64, height: 64 }}>
                      {photo.signedUrl && (
                        <img src={photo.signedUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, opacity: photo.is_duplicate ? 0.4 : 1 }} />
                      )}
                      {photo.is_duplicate && (
                        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.4)', borderRadius: 8, textAlign: 'center' }}>DUPLICATE</span>
                      )}
                      <button onClick={() => handleDeletePhoto(photo.id, p.id, photo.photo_url)}
                        style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#E24B4A', color: '#fff', border: 'none', fontSize: 11, lineHeight: '18px', cursor: 'pointer' }}>×</button>
                    </div>
                  ))}
                  <label style={{ width: 64, height: 64, border: '2px dashed var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                    {uploadingFor === p.id ? '…' : '+ Photo'}
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => handlePhotoSelect(p.id, e.target.files)} />
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    className="btn-small"
                    style={{ background: '#9333EA', color: '#fff' }}
                    disabled={usablePhotoCount === 0 || sendingFor === p.id}
                    onClick={() => handleSendToMarket(p.id)}
                  >
                    {sendingFor === p.id ? 'Sending…' : 'Send to Market'}
                  </button>
                  {latestPost && <StatusBadge status={latestPost.status} />}
                  {usablePhotoCount === 0 && <span className="muted" style={{ fontSize: 12 }}>Add a photo first</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <h4 style={{ marginBottom: 10 }}>Market Post Review</h4>
      {marketPosts.length === 0 ? (
        <p className="muted">Nothing sent to Market yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {marketPosts.map((post) => (
            <div key={post.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', gap: 14 }}>
              {post.market_photo_url ? (
                <img src={post.market_photo_url} alt="" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 88, height: 88, background: 'var(--hover-bg)', borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)' }}>Processing…</div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <p className="muted" style={{ fontSize: 13, fontWeight: 500 }}>{post.products?.name}</p>
                  <StatusBadge status={post.status} />
                </div>
                <textarea
                  style={{ ...inp, marginBottom: 8, fontSize: 13 }}
                  rows={2}
                  value={captionDrafts[post.id] ?? ''}
                  onChange={(e) => setCaptionDrafts((d) => ({ ...d, [post.id]: e.target.value }))}
                  onBlur={() => saveCaption(post.id)}
                />
                {post.status === 'pending_review' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-small" style={{ background: '#1D9E75', color: '#fff' }} onClick={() => setPostStatus(post.id, 'approved')}>
                      Approve &amp; Post
                    </button>
                    <button className="btn-ghost-small" onClick={() => setPostStatus(post.id, 'rejected')}>Reject</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div className="muted" style={{ fontSize: 11 }}>{label}</div>
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
  return <span style={{ ...styles[status], fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999 }}>{labels[status]}</span>
}
