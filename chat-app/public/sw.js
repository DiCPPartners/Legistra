/**
 * Service Worker per Legistra PWA
 */

const CACHE_NAME = 'legistra-cache-v1'
const STATIC_CACHE = 'legistra-static-v1'
const DYNAMIC_CACHE = 'legistra-dynamic-v1'

// Risorse da cachare subito
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
]

// Pattern URL da NON cachare (API, auth, etc.)
const NO_CACHE_PATTERNS = [
  /\/api\//,
  /supabase\.co/,
  /openai\.com/,
  /stripe\.com/,
  /\.hot-update\./
]

// Installazione: cacha risorse statiche
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...')
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets')
        return cache.addAll(STATIC_ASSETS).catch((err) => {
          console.warn('[SW] Some assets failed to cache:', err)
        })
      })
      .then(() => self.skipWaiting())
  )
})

// Attivazione: pulisci vecchie cache
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...')
  
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map((key) => {
              console.log('[SW] Deleting old cache:', key)
              return caches.delete(key)
            })
        )
      })
      .then(() => self.clients.claim())
  )
})

// Fetch: strategia network-first con fallback a cache
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  
  // Non cachare certi pattern
  if (NO_CACHE_PATTERNS.some((pattern) => pattern.test(request.url))) {
    return
  }
  
  // Solo GET requests
  if (request.method !== 'GET') {
    return
  }
  
  // Strategia per navigazione (HTML)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cacha la risposta
          const responseClone = response.clone()
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone)
          })
          return response
        })
        .catch(() => {
          // Fallback a cache o pagina offline
          return caches.match(request)
            .then((cached) => cached || caches.match('/'))
        })
    )
    return
  }
  
  // Strategia per assets statici: cache-first
  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          if (cached) {
            // Aggiorna in background
            fetch(request).then((response) => {
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(request, response)
              })
            }).catch(() => {})
            
            return cached
          }
          
          return fetch(request).then((response) => {
            const responseClone = response.clone()
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
            return response
          })
        })
    )
    return
  }
  
  // Default: network-first
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Non cachare risposte non-OK
        if (!response || response.status !== 200) {
          return response
        }
        
        const responseClone = response.clone()
        caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(request, responseClone)
        })
        
        return response
      })
      .catch(() => caches.match(request))
  )
})

// Gestione messaggi dal main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((keys) => {
      keys.forEach((key) => caches.delete(key))
    })
  }
})

// Background sync (per operazioni offline)
self.addEventListener('sync', (event) => {
  console.log('[SW] Sync event:', event.tag)
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages())
  }
})

async function syncMessages() {
  // Implementa logica di sync quando torna online
  console.log('[SW] Syncing messages...')
}

// Push notifications (placeholder)
self.addEventListener('push', (event) => {
  if (!event.data) return
  
  const data = event.data.json()
  
  const options = {
    body: data.body || 'Hai una nuova notifica',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    },
    actions: [
      { action: 'open', title: 'Apri' },
      { action: 'close', title: 'Chiudi' }
    ]
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Legistra', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  
  if (event.action === 'open' || !event.action) {
    const url = event.notification.data?.url || '/'
    event.waitUntil(
      clients.openWindow(url)
    )
  }
})
