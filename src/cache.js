// src/cache.js
// ─────────────────────────────────────────────────────────────────────────────
// BizCheck multi-layer cache.
//
//   L1  in-memory Map        — instant reads, lost on refresh
//   L2  IndexedDB            — survives refresh, close, and offline
//   L3  Supabase             — source of truth
//
// Beyond simple key/value, this handles the four things that actually cause
// cache bugs in production:
//
//   1. REQUEST DEDUPLICATION. If Feed and Home both ask for the same key in
//      the same tick, one network call is made and both await the same promise.
//      Without this, mounting three components fires three identical queries.
//
//   2. TAG INVALIDATION. A like touches a post, its business, and the feed.
//      Tags let one write invalidate every affected key without the caller
//      needing to know which keys exist.
//
//   3. CROSS-TAB SYNC. Two tabs open, user deposits in one — the other must
//      not keep showing the old balance. BroadcastChannel handles this.
//
//   4. SUBSCRIPTIONS. Components re-render when their cached data changes,
//      including when a background revalidation lands.
//
// Deliberately NOT Redis: BizCheck is a static SPA talking straight to
// PostgREST. Redis would require routing reads through an Edge Function,
// adding cold-start latency to reads that are currently direct. Revisit if
// you ever put a Node server in front of the database.
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME       = 'bizcheck-cache'
const DB_VERSION    = 1
const STORE         = 'entries'
const MAX_ENTRIES   = 500              // LRU cap on L1
const DEFAULT_TTL   = 3 * 60 * 1000
const MAX_VALUE_KB  = 512              // don't persist anything huge to L2

export const TTL = {
  REALTIME:   30 * 1000,        // 30s  — live counts, open orders
  WALLET:     60 * 1000,        // 1m   — money, keep tight
  FEED:       2 * 60 * 1000,    // 2m
  BUSINESSES: 5 * 60 * 1000,    // 5m
  PROFILE:    10 * 60 * 1000,   // 10m
  STATIC:     30 * 60 * 1000,   // 30m  — categories, config
}

// ─── L1: in-memory ────────────────────────────────────────────────────────────
// value shape: { data, fetchedAt, lastAccess, tags, persist }
const mem = new Map()

// ─── In-flight request registry (deduplication) ──────────────────────────────
const inflight = new Map()   // key -> Promise

// ─── Subscribers ─────────────────────────────────────────────────────────────
const subscribers = new Map() // key -> Set<callback>

// ─── Cross-tab channel ───────────────────────────────────────────────────────
let channel = null
try {
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('bizcheck-cache')
    channel.onmessage = (ev) => {
      const { type, key, prefix, tag } = ev.data || {}
      // Apply the peer tab's invalidation locally WITHOUT rebroadcasting,
      // otherwise two tabs bounce messages back and forth forever.
      if (type === 'invalidate')        localInvalidate(key)
      else if (type === 'invalidatePrefix') localInvalidatePrefix(prefix)
      else if (type === 'invalidateTag')    localInvalidateTag(tag)
      else if (type === 'clear')            localClear()
    }
  }
} catch { channel = null }

function broadcast(msg) {
  try { channel?.postMessage(msg) } catch { /* channel closed */ }
}

// ─── L2: IndexedDB ───────────────────────────────────────────────────────────
// All L2 access goes through dbReady so nothing races the upgrade handler.
let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return }
    let req
    try { req = indexedDB.open(DB_NAME, DB_VERSION) } catch { resolve(null); return }

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    // Private browsing and some embedded webviews block IndexedDB entirely.
    // Resolving null means the cache degrades to L1 only — still correct.
    req.onerror   = () => resolve(null)
  })
  return dbPromise
}

async function idbGet(key) {
  const db = await openDB()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const rq = tx.objectStore(STORE).get(key)
      rq.onsuccess = () => resolve(rq.result || null)
      rq.onerror   = () => resolve(null)
    } catch { resolve(null) }
  })
}

async function idbSet(key, entry) {
  const db = await openDB()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ key, ...entry })
      tx.oncomplete = () => resolve()
      tx.onerror    = () => resolve()
      tx.onabort    = () => resolve()
    } catch { resolve() }
  })
}

async function idbDelete(key) {
  const db = await openDB()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror    = () => resolve()
    } catch { resolve() }
  })
}

async function idbClear() {
  const db = await openDB()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror    = () => resolve()
    } catch { resolve() }
  })
}

async function idbAllKeys() {
  const db = await openDB()
  if (!db) return []
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const rq = tx.objectStore(STORE).getAllKeys()
      rq.onsuccess = () => resolve(rq.result || [])
      rq.onerror   = () => resolve([])
    } catch { resolve([]) }
  })
}

// ─── LRU eviction on L1 ──────────────────────────────────────────────────────
function evictIfNeeded() {
  if (mem.size <= MAX_ENTRIES) return
  // Evict the least recently ACCESSED, not the oldest written. A key written
  // once at startup and read on every screen must not be evicted before a key
  // written recently and never read again.
  const sorted = [...mem.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess)
  const toRemove = mem.size - MAX_ENTRIES
  for (let i = 0; i < toRemove; i++) mem.delete(sorted[i][0])
}

// ─── Notify subscribers ──────────────────────────────────────────────────────
function notify(key, data) {
  const subs = subscribers.get(key)
  if (!subs) return
  for (const cb of subs) {
    try { cb(data) } catch { /* a broken subscriber must not break the cache */ }
  }
}

// ─── Local invalidation (does NOT broadcast — used by the channel handler) ───
function localInvalidate(key) {
  if (!key) return
  mem.delete(key)
  idbDelete(key)
  notify(key, undefined)
}

function localInvalidatePrefix(prefix) {
  if (!prefix) return
  for (const k of [...mem.keys()]) {
    if (k.startsWith(prefix)) { mem.delete(k); notify(k, undefined) }
  }
  idbAllKeys().then((keys) => {
    keys.filter((k) => k.startsWith(prefix)).forEach(idbDelete)
  })
}

function localInvalidateTag(tag) {
  if (!tag) return
  for (const [k, v] of [...mem.entries()]) {
    if (v.tags?.includes(tag)) { mem.delete(k); idbDelete(k); notify(k, undefined) }
  }
}

function localClear() {
  const keys = [...mem.keys()]
  mem.clear()
  idbClear()
  keys.forEach((k) => notify(k, undefined))
}

// ─── Size guard for L2 ───────────────────────────────────────────────────────
function tooBigToPersist(data) {
  try {
    return JSON.stringify(data).length > MAX_VALUE_KB * 1024
  } catch {
    return true   // circular or non-serialisable — never persist
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════════════════

export const cache = {
  /**
   * Read through the cache.
   *
   * @param key      stable string, e.g. `feed:${userId}:0`
   * @param fetcher  () => Promise<data>   called only on miss or revalidation
   * @param opts.ttl      ms before the entry is considered stale
   * @param opts.tags     string[] for group invalidation
   * @param opts.persist  false to keep out of IndexedDB (sensitive/large data)
   * @param opts.force    true to bypass cache and refetch
   */
  async get(key, fetcher, opts = {}) {
    const {
      ttl     = DEFAULT_TTL,
      tags    = [],
      persist = true,
      force   = false,
    } = opts

    const now = Date.now()

    if (force) {
      await this.invalidate(key)
    } else {
      // ── L1 hit ───────────────────────────────────────────────────────────
      const hit = mem.get(key)
      if (hit) {
        hit.lastAccess = now
        const fresh = (now - hit.fetchedAt) < ttl
        if (fresh) return hit.data

        // Stale: return immediately, revalidate behind the user's back.
        // Guarded by `inflight` so ten stale reads trigger one refetch.
        if (!inflight.has(key)) {
          const p = Promise.resolve()
            .then(fetcher)
            .then((data) => {
              writeEntry(key, data, tags, persist)
              notify(key, data)
              return data
            })
            .catch(() => hit.data)      // keep serving stale on failure
            .finally(() => inflight.delete(key))
          inflight.set(key, p)
        }
        return hit.data
      }

      // ── L2 hit (cold start / after refresh) ──────────────────────────────
      const stored = await idbGet(key)
      if (stored && (now - stored.fetchedAt) < ttl) {
        mem.set(key, {
          data: stored.data, fetchedAt: stored.fetchedAt,
          lastAccess: now, tags: stored.tags || [], persist,
        })
        evictIfNeeded()
        return stored.data
      }
    }

    // ── Miss: dedupe concurrent callers onto one promise ────────────────────
    if (inflight.has(key)) return inflight.get(key)

    const p = Promise.resolve()
      .then(fetcher)
      .then((data) => {
        writeEntry(key, data, tags, persist)
        notify(key, data)
        return data
      })
      .finally(() => inflight.delete(key))

    inflight.set(key, p)
    return p
  },

  /** Write a value directly. Use after a mutation to keep the cache warm. */
  set(key, data, opts = {}) {
    const { tags = [], persist = true } = opts
    writeEntry(key, data, tags, persist)
    notify(key, data)
  },

  /** Read without fetching. Returns null on miss. */
  peek(key) {
    const hit = mem.get(key)
    if (!hit) return null
    hit.lastAccess = Date.now()
    return hit.data
  },

  /** Drop one key. Prefix keys ending in ':' drop everything beneath them. */
  async invalidate(key) {
    if (!key) return
    if (key.endsWith(':')) {
      localInvalidatePrefix(key)
      broadcast({ type: 'invalidatePrefix', prefix: key })
    } else {
      localInvalidate(key)
      broadcast({ type: 'invalidate', key })
    }
  },

  /** Drop every key carrying this tag, across every tab. */
  async invalidateTag(tag) {
    localInvalidateTag(tag)
    broadcast({ type: 'invalidateTag', tag })
  },

  /** Drop everything. Call on sign-out. */
  async clear() {
    localClear()
    inflight.clear()
    broadcast({ type: 'clear' })
  },

  /**
   * Subscribe to a key. Fires whenever the value changes, including on
   * background revalidation. Returns an unsubscribe function — call it in
   * your effect cleanup or you will leak.
   */
  subscribe(key, callback) {
    if (!subscribers.has(key)) subscribers.set(key, new Set())
    subscribers.get(key).add(callback)
    return () => {
      const set = subscribers.get(key)
      if (!set) return
      set.delete(callback)
      if (set.size === 0) subscribers.delete(key)
    }
  },

  /** Diagnostics — useful in the console when something looks stale. */
  stats() {
    return {
      memEntries:   mem.size,
      inflight:     inflight.size,
      subscribers:  subscribers.size,
      crossTab:     !!channel,
      keys:         [...mem.keys()],
    }
  },
}

function writeEntry(key, data, tags, persist) {
  const now = Date.now()
  mem.set(key, { data, fetchedAt: now, lastAccess: now, tags, persist })
  evictIfNeeded()
  if (persist && !tooBigToPersist(data)) {
    idbSet(key, { data, fetchedAt: now, tags })
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// KEY BUILDERS — use these instead of hand-writing strings.
// A typo in a key is a silent cache miss that looks like a performance bug.
// ═════════════════════════════════════════════════════════════════════════════

export const keys = {
  feed:         (userId, page)      => `feed:${userId || 'anon'}:${page}`,
  businesses:   (userId, category)  => `businesses:${userId || 'anon'}:${category || 'All'}`,
  business:     (id)                => `business:${id}`,
  businessPosts:(id)                => `businessPosts:${id}`,
  products:     (businessId)        => `products:${businessId}`,
  wallet:       (userId)            => `wallet:${userId}`,
  walletEntries:(userId)            => `walletEntries:${userId}`,
  profile:      (userId)            => `profile:${userId}`,
  postEngagement:(userId, postIds)  => `engagement:${userId || 'anon'}:${postIds.join(',')}`,
  homeStats:    ()                  => `homeStats`,
  orders:       (userId)            => `orders:${userId}`,
  notifications:(userId)            => `notifications:${userId}`,
}

// Tags group related keys so one write can clear everything it touched.
export const tags = {
  FEED:       'feed',
  BUSINESSES: 'businesses',
  WALLET:     'wallet',
  PRODUCTS:   'products',
  ORDERS:     'orders',
  ENGAGEMENT: 'engagement',
  PROFILE:    'profile',
}

// ═════════════════════════════════════════════════════════════════════════════
// INVALIDATION HELPERS — call these after writes, not raw invalidate().
// Centralising the "what does this action touch" logic here is what stops
// stale-data bugs six months from now.
// ═════════════════════════════════════════════════════════════════════════════

export const invalidateOn = {
  like(userId)      { cache.invalidateTag(tags.ENGAGEMENT); cache.invalidate(`feed:${userId || 'anon'}:`) },
  save(userId)      { cache.invalidateTag(tags.ENGAGEMENT); cache.invalidate(`feed:${userId || 'anon'}:`) },
  comment(postId)   { cache.invalidateTag(tags.ENGAGEMENT); cache.invalidate(`postComments:${postId}`) },

  order(userId)     {
    cache.invalidate(keys.wallet(userId))
    cache.invalidate(keys.walletEntries(userId))
    cache.invalidate(keys.orders(userId))
    cache.invalidateTag(tags.PRODUCTS)
  },

  deposit(userId)   {
    cache.invalidate(keys.wallet(userId))
    cache.invalidate(keys.walletEntries(userId))
  },

  withdrawal(userId){
    cache.invalidate(keys.wallet(userId))
    cache.invalidate(keys.walletEntries(userId))
  },

  newPost(businessId) {
    cache.invalidateTag(tags.FEED)
    cache.invalidate(keys.businessPosts(businessId))
    cache.invalidate('businesses:')
  },

  businessUpdate(businessId) {
    cache.invalidate(keys.business(businessId))
    cache.invalidate('businesses:')
  },

  profileUpdate(userId) {
    cache.invalidate(keys.profile(userId))
  },

  signOut() { cache.clear() },
}