// BizCheck Kenya — service worker
// Caches static app shell so the app opens instantly and offers
// basic offline resilience. Does NOT cache API/data calls —
// those always go live to Supabase for fresh, accurate data.

const CACHE_NAME = 'bizcheck-v2' // bump this any time you meaningfully change this file
const APP_SHELL = ['/manifest.json'] // NOTE: '/' and '/index.html' deliberately NOT pre-cached — see fetch handler below

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Never cache Supabase API calls — always fetch live data
  if (url.hostname.includes('supabase.co')) return

  // Only handle GET requests for our own static assets
  if (event.request.method !== 'GET') return

  // NAVIGATION requests (the HTML page itself) — always go to the network
  // first. This is the actual fix: index.html references your hashed JS/CSS
  // filenames, so if the HTML itself is stale, users get stuck on old code
  // forever no matter how many times you redeploy. Falling back to cache
  // only kicks in if they're genuinely offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    )
    return
  }

  // Everything else (hashed JS/CSS/images) — safe to serve cache-first,
  // since each build gives these files a unique filename. There's no
  // "stale file at the same URL" risk for these like there is for HTML.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html')
        }
      })
    })
  )
})