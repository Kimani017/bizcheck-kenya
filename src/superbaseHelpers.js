// src/supabaseHelpers.js
// ─────────────────────────────────────────────────────────────────────────────
// THE SILENT FAILURE THIS FIXES
//
// The pattern used all over the app:
//
//     supabase.rpc('get_ranked_feed', {...}).then(r => r.data || [])
//
// If the RPC errors, `r.data` is null, so this returns []. The caller cannot
// tell "there are genuinely no posts" from "the query exploded". The Feed
// showed "No posts yet" for a Postgres 42702 error and nothing was logged.
//
// Worse, when wrapped in cache.get(), that empty array gets CACHED — so the
// feed stays empty for the full TTL even after the database is fixed.
//
// These helpers THROW on error instead. cache.get() does not store a rejected
// promise, and the error reaches reportError() where you can actually see it.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'
import { reportError } from './errors'

/**
 * Call an RPC. Throws on error rather than returning an empty array.
 *
 *   const rows = await rpc('get_ranked_feed', { p_user_id: id })
 */
export async function rpc(fn, params = {}) {
  const { data, error } = await supabase.rpc(fn, params)
  if (error) {
    reportError(error, `rpc:${fn}`, { params: safeParams(params) })
    throw error
  }
  return data ?? []
}

/**
 * Run a PostgREST query builder. Throws on error.
 *
 *   const rows = await query(
 *     supabase.from('businesses').select('*').eq('status', 'verified'),
 *     'load-businesses'
 *   )
 */
export async function query(builder, context = 'query') {
  const { data, error } = await builder
  if (error) {
    reportError(error, context)
    throw error
  }
  return data ?? []
}

/**
 * Same as query() but for .single() / .maybeSingle(), where an empty result
 * is legitimate. Returns null when nothing is found; still throws on real
 * errors so they are never mistaken for "not found".
 */
export async function queryOne(builder, context = 'queryOne') {
  const { data, error } = await builder
  if (error) {
    // PGRST116 is "no rows returned" from .single() — not an error condition.
    if (error.code === 'PGRST116') return null
    reportError(error, context)
    throw error
  }
  return data ?? null
}

/**
 * For calls where failure genuinely is not worth interrupting the user —
 * logging a view, recording an impression. Reports the error, returns the
 * fallback, never throws.
 *
 * Use this ONLY for fire-and-forget writes, never for reads that populate UI.
 */
export async function tryQuery(builder, context, fallback = null) {
  try {
    const { data, error } = await builder
    if (error) { reportError(error, context); return fallback }
    return data ?? fallback
  } catch (err) {
    reportError(err, context)
    return fallback
  }
}

// Strip anything that should not end up in an error log.
function safeParams(params) {
  const out = {}
  for (const [k, v] of Object.entries(params || {})) {
    if (/password|token|secret|key|pin/i.test(k)) continue
    if (typeof v === 'string' && v.length > 200) { out[k] = v.slice(0, 200) + '…'; continue }
    out[k] = v
  }
  return out
}