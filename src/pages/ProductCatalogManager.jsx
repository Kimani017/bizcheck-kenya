import React, { useState, useEffect, useCallback } from "react";
import QRCode from "qrcode";
import imageCompression from "browser-image-compression";
import { bmvbhash } from "blockhash-core";
import { supabase } from "../supabase"; // confirmed path from your existing code

const STORE_BASE_URL = "https://www.bizcheckkenya.com/store";
const HASH_BITS = 16; // 256-bit hash -> 64 hex chars
const DUPLICATE_THRESHOLD = 10; // out of 256 bits differing; lower = stricter match

// ---------------------------------------------------------------------------
// Helpers: compression, perceptual hashing, duplicate distance
// ---------------------------------------------------------------------------

async function compressImage(file) {
  return imageCompression(file, {
    maxSizeMB: 1,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function computePhash(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return bmvbhash(imageData, HASH_BITS);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB || hashA.length !== hashB.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < hashA.length; i++) {
    let xor = parseInt(hashA[i], 16) ^ parseInt(hashB[i], 16);
    while (xor) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

// ---------------------------------------------------------------------------

export default function ProductCatalogManager({ businessId }) {
  const [products, setProducts] = useState([]);
  const [photosByProduct, setPhotosByProduct] = useState({});
  const [marketPosts, setMarketPosts] = useState([]);
  const [stats, setStats] = useState({ products: 0, marketPosts: 0, scans: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [uploadingFor, setUploadingFor] = useState(null);
  const [sendingFor, setSendingFor] = useState(null);
  const [captionDrafts, setCaptionDrafts] = useState({});

  const emptyForm = {
    id: null,
    name: "",
    description: "",
    price: "",
    quantity: "",
    sizes: "",
    colors: "",
    is_active: true,
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (businessId) {
      loadEverything();
      generateQr();
    }
  }, [businessId]);

  async function loadEverything() {
    setLoading(true);
    setError("");
    await Promise.all([fetchProducts(), fetchMarketPosts(), fetchStats()]);
    setLoading(false);
  }

  async function generateQr() {
    try {
      const url = `${STORE_BASE_URL}/${businessId}`;
      setQrDataUrl(await QRCode.toDataURL(url, { width: 400, margin: 2 }));
    } catch (err) {
      console.error("QR generation failed:", err);
    }
  }

  function downloadQr() {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `bizcheck-storefront-qr-${businessId}.png`;
    link.click();
  }

  async function fetchProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (error) {
      setError("Could not load products: " + error.message);
      return;
    }
    setProducts(data || []);
    (data || []).forEach((p) => fetchPhotosFor(p.id));
  }

  async function fetchPhotosFor(productId) {
    const { data, error } = await supabase
      .from("product_photos")
      .select("*")
      .eq("product_id", productId)
      .order("created_at", { ascending: false });

    if (error) return;

    // product-photos bucket is private, so build a short-lived signed URL per photo
    const withUrls = await Promise.all(
      (data || []).map(async (photo) => {
        const { data: signed } = await supabase.storage
          .from("product-photos")
          .createSignedUrl(photo.photo_url, 3600);
        return { ...photo, signedUrl: signed?.signedUrl || null };
      })
    );

    setPhotosByProduct((prev) => ({ ...prev, [productId]: withUrls }));
  }

  async function fetchMarketPosts() {
    const { data, error } = await supabase
      .from("market_posts")
      .select("*, products(name)")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (!error) {
      setMarketPosts(data || []);
      const drafts = {};
      (data || []).forEach((post) => { drafts[post.id] = post.caption || ""; });
      setCaptionDrafts(drafts);
    }
  }

  async function fetchStats() {
    const [{ count: productCount }, { count: postCount }, { count: scanCount }] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("market_posts").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "approved"),
      supabase.from("qr_scans").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    ]);
    setStats({ products: productCount || 0, marketPosts: postCount || 0, scans: scanCount || 0 });
  }

  // --- Product form -----------------------------------------------------

  function resetForm() { setForm(emptyForm); }

  function handleEdit(product) {
    setForm({
      id: product.id,
      name: product.name || "",
      description: product.description || "",
      price: product.price ?? "",
      quantity: product.quantity ?? "",
      sizes: (product.sizes || []).join(", "),
      colors: (product.colors || []).join(", "),
      is_active: product.is_active,
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      business_id: businessId,
      name: form.name.trim(),
      description: form.description.trim(),
      price: form.price === "" ? null : Number(form.price),
      quantity: form.quantity === "" ? 0 : Number(form.quantity),
      sizes: form.sizes ? form.sizes.split(",").map((s) => s.trim()).filter(Boolean) : [],
      colors: form.colors ? form.colors.split(",").map((c) => c.trim()).filter(Boolean) : [],
      is_active: form.is_active,
    };

    const { error } = form.id
      ? await supabase.from("products").update(payload).eq("id", form.id)
      : await supabase.from("products").insert(payload);

    setSaving(false);
    if (error) { setError("Save failed: " + error.message); return; }
    resetForm();
    fetchProducts();
    fetchStats();
  }

  async function handleDeleteProduct(id) {
    if (!window.confirm("Delete this product and all its photos? This cannot be undone.")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) { setError("Delete failed: " + error.message); return; }
    fetchProducts();
    fetchStats();
  }

  // --- Photo upload with compression + duplicate check -------------------

  async function handlePhotoSelect(productId, fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setUploadingFor(productId);
    setError("");

    try {
      const existing = photosByProduct[productId] || [];
      let knownHashes = existing.map((p) => p.phash).filter(Boolean);

      for (const rawFile of files) {
        const compressed = await compressImage(rawFile);
        const phash = await computePhash(compressed);

        const closest = knownHashes.reduce(
          (min, h) => Math.min(min, hammingDistance(phash, h)),
          Infinity
        );
        const isDuplicate = closest <= DUPLICATE_THRESHOLD;

        if (isDuplicate) {
          const proceed = window.confirm(
            "This looks very similar to a photo you already have for this product. Upload it anyway?"
          );
          if (!proceed) continue;
        }

        const path = `${businessId}/${productId}/${Date.now()}-${rawFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("product-photos")
          .upload(path, compressed, { upsert: true });

        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase.from("product_photos").insert({
          product_id: productId,
          business_id: businessId,
          photo_url: path, // storage path — bucket is private, signed URL generated on read
          phash,
          is_duplicate: isDuplicate,
        });

        if (insertError) throw insertError;
        knownHashes = [...knownHashes, phash];
      }

      fetchPhotosFor(productId);
    } catch (err) {
      setError("Photo upload failed: " + err.message);
    } finally {
      setUploadingFor(null);
    }
  }

  async function handleDeletePhoto(photoId, productId, storagePath) {
    if (!window.confirm("Delete this photo?")) return;
    await supabase.storage.from("product-photos").remove([storagePath]);
    await supabase.from("product_photos").delete().eq("id", photoId);
    fetchPhotosFor(productId);
  }

  // --- Send to Market (triggers the Edge Function) ------------------------

  async function handleSendToMarket(productId) {
    setSendingFor(productId);
    setError("");
    try {
      const { data, error } = await supabase.functions.invoke("generate-market-post", {
        body: { product_id: productId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      fetchMarketPosts();
      fetchStats();
    } catch (err) {
      setError("Send to Market failed: " + err.message);
    } finally {
      setSendingFor(null);
    }
  }

  // --- Market post review (edit caption, approve, reject) ----------------

  async function saveCaption(postId) {
    const { error } = await supabase
      .from("market_posts")
      .update({ caption: captionDrafts[postId] })
      .eq("id", postId);
    if (!error) fetchMarketPosts();
  }

  async function setPostStatus(postId, status) {
    const payload = { status };
    if (status === "approved") payload.approved_at = new Date().toISOString();
    const { error } = await supabase.from("market_posts").update(payload).eq("id", postId);
    if (!error) { fetchMarketPosts(); fetchStats(); }
  }

  const latestPostForProduct = useCallback(
    (productId) => marketPosts.find((p) => p.product_id === productId),
    [marketPosts]
  );

  // -------------------------------------------------------------------------

  if (loading) return <div className="p-6 text-gray-500">Loading your catalog...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">Product Catalog & Market</h1>
      <p className="text-gray-600 mb-6">Manage stock, upload photos, and post to the BizCheck Market.</p>

      {/* Performance flow */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Products" value={stats.products} />
        <StatCard label="Live on Market" value={stats.marketPosts} />
        <StatCard label="QR Scans" value={stats.scans} />
      </div>

      {/* QR code */}
      <div className="bg-white border rounded-xl p-5 mb-8 flex flex-col sm:flex-row items-center gap-5">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="Storefront QR code" className="w-32 h-32" />
        ) : (
          <div className="w-32 h-32 flex items-center justify-center bg-gray-100 rounded text-xs text-gray-400">Generating...</div>
        )}
        <div>
          <p className="font-semibold">Your storefront QR code</p>
          <p className="text-sm text-gray-500 mb-3">Print this and display it in your shop.</p>
          <button onClick={downloadQr} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
            Download QR Code
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {/* Add/Edit product form */}
      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-5 mb-8 space-y-4">
        <h2 className="font-semibold text-lg">{form.id ? "Edit Product" : "Add Product"}</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <input type="text" placeholder="Product name" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} required
            className="border rounded-lg px-3 py-2" />
          <input type="number" step="0.01" placeholder="Price (Ksh)" value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className="border rounded-lg px-3 py-2" />
          <input type="number" placeholder="Quantity in stock" value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            className="border rounded-lg px-3 py-2" />
          <input type="text" placeholder="Sizes (comma-separated)" value={form.sizes}
            onChange={(e) => setForm({ ...form, sizes: e.target.value })}
            className="border rounded-lg px-3 py-2" />
          <input type="text" placeholder="Colors (comma-separated)" value={form.colors}
            onChange={(e) => setForm({ ...form, colors: e.target.value })}
            className="border rounded-lg px-3 py-2 sm:col-span-2" />
        </div>
        <textarea placeholder="Description" value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="border rounded-lg px-3 py-2 w-full" rows={3} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          Visible in your inventory
        </label>
        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving..." : form.id ? "Update Product" : "Add Product"}
          </button>
          {form.id && (
            <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200">
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Product list with photo galleries */}
      <h2 className="font-semibold text-lg mb-3">Your Products</h2>
      {products.length === 0 ? (
        <p className="text-gray-500 mb-8">No products yet. Add your first one above.</p>
      ) : (
        <div className="space-y-4 mb-10">
          {products.map((p) => {
            const photos = photosByProduct[p.id] || [];
            const usablePhotoCount = photos.filter((ph) => !ph.is_duplicate).length;
            const latestPost = latestPostForProduct(p.id);

            return (
              <div key={p.id} className="border rounded-xl p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-sm text-gray-500">Ksh {p.price ?? "—"} · Qty {p.quantity}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(p)} className="text-xs text-blue-600 font-medium hover:underline">Edit</button>
                    <button onClick={() => handleDeleteProduct(p.id)} className="text-xs text-red-600 font-medium hover:underline">Delete</button>
                  </div>
                </div>

                {/* Photo gallery */}
                <div className="flex gap-2 flex-wrap mb-3">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative w-16 h-16">
                      {photo.signedUrl && (
                        <img src={photo.signedUrl} alt="" className={`w-16 h-16 object-cover rounded-lg ${photo.is_duplicate ? "opacity-40" : ""}`} />
                      )}
                      {photo.is_duplicate && (
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white bg-black/40 rounded-lg">DUPLICATE</span>
                      )}
                      <button onClick={() => handleDeletePhoto(photo.id, p.id, photo.photo_url)}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white rounded-full text-[10px] leading-4">×</button>
                    </div>
                  ))}
                  <label className="w-16 h-16 border-2 border-dashed rounded-lg flex items-center justify-center text-xs text-gray-400 cursor-pointer hover:bg-gray-50">
                    {uploadingFor === p.id ? "..." : "+ Photo"}
                    <input type="file" accept="image/*" multiple hidden
                      onChange={(e) => handlePhotoSelect(p.id, e.target.files)} />
                  </label>
                </div>

                {/* Send to Market */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSendToMarket(p.id)}
                    disabled={usablePhotoCount === 0 || sendingFor === p.id}
                    className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-40"
                  >
                    {sendingFor === p.id ? "Sending..." : "Send to Market"}
                  </button>
                  {latestPost && <StatusBadge status={latestPost.status} />}
                  {usablePhotoCount === 0 && <span className="text-xs text-gray-400">Add a photo first</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Market post review */}
      <h2 className="font-semibold text-lg mb-3">Market Post Review</h2>
      {marketPosts.length === 0 ? (
        <p className="text-gray-500">Nothing sent to Market yet.</p>
      ) : (
        <div className="space-y-4">
          {marketPosts.map((post) => (
            <div key={post.id} className="border rounded-xl p-4 flex gap-4">
              {post.market_photo_url ? (
                <img src={post.market_photo_url} alt="" className="w-24 h-24 object-cover rounded-lg" />
              ) : (
                <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-400">Processing...</div>
              )}
              <div className="flex-1">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-sm font-medium text-gray-700">{post.products?.name}</p>
                  <StatusBadge status={post.status} />
                </div>
                <textarea
                  value={captionDrafts[post.id] ?? ""}
                  onChange={(e) => setCaptionDrafts((d) => ({ ...d, [post.id]: e.target.value }))}
                  onBlur={() => saveCaption(post.id)}
                  rows={2}
                  className="w-full border rounded-lg px-2 py-1 text-sm mb-2"
                />
                {post.status === "pending_review" && (
                  <div className="flex gap-2">
                    <button onClick={() => setPostStatus(post.id, "approved")}
                      className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                      Approve & Post
                    </button>
                    <button onClick={() => setPostStatus(post.id, "rejected")}
                      className="px-3 py-1 bg-gray-100 rounded-lg text-xs font-medium hover:bg-gray-200">
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white border rounded-xl p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    pending_review: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };
  const labels = { pending_review: "Pending review", approved: "Live on Market", rejected: "Rejected" };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${styles[status]}`}>{labels[status]}</span>;
}
