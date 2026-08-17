// src/useCache.js
// ─────────────────────────────────────────────────────────────────────────────
// React bindings for the cache. Replaces the useState + useEffect + loading
// pattern repeated in every component.
//
// Before:
//   const [data, setData]       = useState([])
//   const [loading, setLoading] = useState(true)
//   useEffect(() => {
//     supabase.from('businesses').select('*').then(r => {
//       setData(r.data); setLoading(false)
//     })
//   }, [category])
//
// After:
//   const { data, loading, refresh } = useCache(
//     keys.businesses(user?.id, category),
//     () => supabase.from('businesses').select('*').then(r => r.data || []),
//     { ttl: TTL.BUSINESSES, deps: [category] }
//   )
//
// The hook subscribes to the key, so a background revalidation or an
// invalidation from ANOTHER TAB re-renders this component automatically.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react'
import { cache, TTL } from './cache'

export function useCache(key, fetcher, options = {}) {
  const {
    ttl      = TTL.BUSINESSES,
    tags     = [],
    persist  = true,
    deps     = [],
    enabled  = true,
    initialData = null,
  } = options

  // Seed from cache so a revisit paints instantly instead of flashing a spinner.
  const [data, setData]       = useState(() => (key ? cache.peek(key) : null) ?? initialData)
  const [loading, setLoading] = useState(() => (key ? cache.peek(key) === null : false))
  const [error, setError]     = useState(null)

  // Keep the latest fetcher without making it a dependency — otherwise an
  // inline arrow function would retrigger the effect on every render.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(async (force = false) => {
    if (!key || !enabled) { setLoading(false); return }

    const cached = cache.peek(key)
    if (cached === null) setLoading(true)   // only spin when we have nothing

    try {
      const result = await cache.get(key, () => fetcherRef.current(), { ttl, tags, persist, force })
      if (!mountedRef.current) return
      setData(result)
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [key, enabled, ttl, persist, JSON.stringify(tags)])

  // Fetch on mount and whenever key/deps change.
  useEffect(() => { load() }, [load, ...deps])

  // Re-render when the cached value changes from anywhere: background
  // revalidation, another component's write, or another browser tab.
  useEffect(() => {
    if (!key) return
    return cache.subscribe(key, (next) => {
      if (!mountedRef.current) return
      if (next === undefined) {
        load()          // invalidated elsewhere — refetch
      } else {
        setData(next)   // updated elsewhere — adopt it
      }
    })
  }, [key, load])

  const refresh = useCallback(() => load(true), [load])

  // Optimistic update: paint the new value now, roll back if the write fails.
  const mutate = useCallback((updater) => {
    if (!key) return
    const current = cache.peek(key)
    const next = typeof updater === 'function' ? updater(current) : updater
    cache.set(key, next, { tags, persist })
    setData(next)
    return () => {                    // rollback handle
      cache.set(key, current, { tags, persist })
      setData(current)
    }
  }, [key, persist, JSON.stringify(tags)])

  return { data, loading, error, refresh, mutate }
}

/**
 * Run several cached queries in parallel and wait for all of them.
 * Deduplication still applies per key, so overlapping queries across
 * components cost one request each, not one per caller.
 *
 *   const { data, loading } = useCacheMany([
 *     { key: keys.wallet(uid),        fetcher: fetchWallet,  ttl: TTL.WALLET },
 *     { key: keys.walletEntries(uid), fetcher: fetchEntries, ttl: TTL.WALLET },
 *   ], [uid])
 *   const [wallet, entries] = data ?? []
 */
export function useCacheMany(queries, deps = []) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const queriesRef = useRef(queries)
  queriesRef.current = queries

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(async (force = false) => {
    const qs = queriesRef.current
    if (!qs?.length) { setLoading(false); return }

    const allCached = qs.every(q => cache.peek(q.key) !== null)
    if (!allCached) setLoading(true)

    try {
      const results = await Promise.all(
        qs.map(q => cache.get(q.key, q.fetcher, {
          ttl: q.ttl ?? TTL.BUSINESSES,
          tags: q.tags ?? [],
          persist: q.persist ?? true,
          force,
        }))
      )
      if (!mountedRef.current) return
      setData(results)
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, ...deps])

  return { data, loading, error, refresh: () => load(true) }
}