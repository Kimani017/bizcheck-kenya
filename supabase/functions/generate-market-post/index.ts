// Supabase Edge Function: generate-market-post
// Deploy path in the Dashboard: Edge Functions -> New Function -> name it
// "generate-market-post" -> paste this file's contents -> Deploy.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { product_id } = await req.json();
    if (!product_id) {
      return new Response(JSON.stringify({ error: "product_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client — bypasses RLS, only ever runs server-side here.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Load product + its business (for category)
    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("*, businesses(category)")
      .eq("id", product_id)
      .single();

    if (productError || !product) {
      throw new Error("Product not found: " + productError?.message);
    }

    // 2. Pick the "best" photo. MVP: most recent non-duplicate upload.
    //    (Can be upgraded later to a real sharpness/lighting score.)
    const { data: photos, error: photosError } = await supabaseAdmin
      .from("product_photos")
      .select("*")
      .eq("product_id", product_id)
      .eq("is_duplicate", false)
      .order("created_at", { ascending: false })
      .limit(1);

    if (photosError || !photos || photos.length === 0) {
      throw new Error("No usable photo found for this product.");
    }
    const bestPhoto = photos[0];

    // 3. Download the raw photo from the private product-photos bucket
    const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
      .from("product-photos")
      .download(bestPhoto.photo_url);

    if (downloadError || !fileBlob) {
      throw new Error("Could not download photo: " + downloadError?.message);
    }

    // 4. Remove background via remove.bg
    const removeBgForm = new FormData();
    removeBgForm.append("image_file", fileBlob, "photo.jpg");
    removeBgForm.append("size", "auto");

    const removeBgResponse = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": Deno.env.get("REMOVE_BG_API_KEY")! },
      body: removeBgForm,
    });

    if (!removeBgResponse.ok) {
      throw new Error("remove.bg failed: " + (await removeBgResponse.text()));
    }
    const cleanedImageBuffer = await removeBgResponse.arrayBuffer();

    // 5. Upload the cleaned photo to the PUBLIC market-photos bucket
    const marketPhotoPath = `${product.business_id}/${product_id}-${Date.now()}.png`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("market-photos")
      .upload(marketPhotoPath, cleanedImageBuffer, { contentType: "image/png", upsert: true });

    if (uploadError) {
      throw new Error("Could not upload cleaned photo: " + uploadError.message);
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("market-photos")
      .getPublicUrl(marketPhotoPath);

    // 6. Generate a short caption with Claude (Haiku — cheap, fast, plenty for this)
    const captionPrompt = `Write a short, appealing product caption (max 20 words) for a marketplace listing.
Product name: ${product.name}
Description: ${product.description || "N/A"}
Price: Ksh ${product.price ?? "N/A"}
Respond with ONLY the caption text, no quotes, no preamble.`;

    let caption = product.name; // fallback if the Claude call fails
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        messages: [{ role: "user", content: captionPrompt }],
      }),
    });

    if (claudeResponse.ok) {
      const claudeData = await claudeResponse.json();
      const textBlock = claudeData.content?.find((c: any) => c.type === "text");
      if (textBlock?.text) caption = textBlock.text.trim();
    }

    // 7. Create the market post as pending review
    const { data: marketPost, error: insertError } = await supabaseAdmin
      .from("market_posts")
      .insert({
        product_id,
        business_id: product.business_id,
        market_photo_url: publicUrlData.publicUrl,
        caption,
        category: product.businesses?.category ?? null,
        status: "pending_review",
      })
      .select()
      .single();

    if (insertError) {
      throw new Error("Could not create market post: " + insertError.message);
    }

    // 8. Save a "visual fingerprint" (embedding) for this product, so future
    //    customer photo scans can match against it with a fast database
    //    lookup instead of an AI call every time.
    try {
      const voyageResponse = await fetch("https://api.voyageai.com/v1/multimodalembeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("VOYAGE_API_KEY")}`,
        },
        body: JSON.stringify({
          inputs: [
            {
              content: [
                { type: "text", text: `${product.name}. ${product.description || ""}` },
                { type: "image_url", image_url: publicUrlData.publicUrl },
              ],
            },
          ],
          model: "voyage-multimodal-3.5",
          input_type: "document",
        }),
      });

      if (voyageResponse.ok) {
        const voyageData = await voyageResponse.json();
        const embedding = voyageData.data?.[0]?.embedding;
        if (embedding) {
          await supabaseAdmin.from("product_embeddings").upsert({
            product_id,
            business_id: product.business_id,
            embedding,
            updated_at: new Date().toISOString(),
          });
        }
      } else {
        console.error("Voyage embedding failed:", await voyageResponse.text());
      }
    } catch (embedErr) {
      // Don't fail the whole market post if embedding generation has trouble —
      // the post itself still succeeded, this just means visual search won't
      // find this product until the next successful embed attempt.
      console.error("Embedding step failed:", embedErr);
    }

    return new Response(JSON.stringify({ success: true, market_post: marketPost }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});