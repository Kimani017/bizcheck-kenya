// supabase/functions/send-to-market/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Sends a product to the BizCheck Market.
//
// Runs with the SERVICE ROLE key, so it bypasses storage + table RLS entirely —
// this is why it succeeds where the direct client upload was getting a 403.
//
// It still enforces security itself: it reads the CALLER's identity from their
// auth token and confirms they own the business before doing anything.
//
// No paid third-party APIs. Just: verify owner → copy photo → insert post.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { product_id } = await req.json()
    if (!product_id) return json({ error: 'product_id is required' }, 400)

    // Service-role client — bypasses RLS. Only ever runs here, server-side.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Identify the caller from their auth token ────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return json({ error: 'Not authenticated.' }, 401)

    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData?.user) return json({ error: 'Not authenticated.' }, 401)
    const callerId = userData.user.id

    // ── Load product + its business ──────────────────────────────────────────
    const { data: product, error: productErr } = await admin
      .from('products')
      .select('id, name, description, business_id, businesses(category, owner_id)')
      .eq('id', product_id)
      .single()

    if (productErr || !product) return json({ error: 'Product not found.' }, 404)

    // ── Security: the caller MUST own this business ──────────────────────────
    const ownerId = (product as any).businesses?.owner_id
    if (ownerId !== callerId) {
      return json({ error: 'You do not own this business.' }, 403)
    }

    // ── Pick the most recent non-duplicate photo ─────────────────────────────
    const { data: photos, error: photosErr } = await admin
      .from('product_photos')
      .select('photo_url')
      .eq('product_id', product_id)
      .eq('is_duplicate', false)
      .order('created_at', { ascending: false })
      .limit(1)

    if (photosErr || !photos || photos.length === 0) {
      return json({ error: 'Add a photo to this product first.' }, 400)
    }
    const sourcePath = photos[0].photo_url

    // ── Download the raw photo from the private product-photos bucket ────────
    const { data: fileBlob, error: dlErr } = await admin.storage
      .from('product-photos')
      .download(sourcePath)

    if (dlErr || !fileBlob) {
      return json({ error: 'Could not read the product photo.' }, 500)
    }

    // ── Upload it as-is to the public market-photos bucket ───────────────────
    const ext = (sourcePath.split('.').pop() || 'jpg').toLowerCase()
    const contentType =
      ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const marketPath = `${product.business_id}/${product_id}-${Date.now()}.${ext}`

    const arrayBuf = await fileBlob.arrayBuffer()
    const { error: upErr } = await admin.storage
      .from('market-photos')
      .upload(marketPath, arrayBuf, { contentType, upsert: true })

    if (upErr) return json({ error: 'Could not upload to market: ' + upErr.message }, 500)

    const { data: pub } = admin.storage.from('market-photos').getPublicUrl(marketPath)

    // ── Caption: product name (+ description), no AI ─────────────────────────
    const caption = product.description
      ? `${product.name} — ${product.description}`.slice(0, 140)
      : product.name

    // ── Create the market post (pending admin review) ────────────────────────
    const { data: post, error: insErr } = await admin
      .from('market_posts')
      .insert({
        product_id,
        business_id: product.business_id,
        market_photo_url: pub.publicUrl,
        caption,
        category: (product as any).businesses?.category ?? null,
        status: 'pending_review',
      })
      .select()
      .single()

    if (insErr) return json({ error: 'Could not create market post: ' + insErr.message }, 500)

    return json({ success: true, market_post: post }, 200)
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Unexpected error' }, 500)
  }
})