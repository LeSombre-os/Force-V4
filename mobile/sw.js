const CACHE_NAME = 'force-v4-v2'
const ASSETS = [
  '.',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/data.js',
  'js/export.js',
  'js/log.js',
  'js/app.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png'
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS)
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (!response || !response.ok) return response
        return caches.open(CACHE_NAME).then(cache => {
          try {
            if (event.request.url.startsWith(self.location.origin)) {
              cache.put(event.request, response.clone())
            }
          } catch {}
          return response
        })
      }).catch(() => cached)
    })
  )
})
