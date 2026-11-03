const CACHE_NAME = 'slidestudio-v2.9';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-1024.png',
  '/sw.js',
  '/js/background-color.js',
  '/js/color-utils.js',
  '/js/designer.js',
  '/js/export.js',
  '/js/guidance.js',
  '/js/history.js',
  '/js/image-transform.js',
  '/js/keyboard.js',
  '/js/layers.js',
  '/js/main.js',
  '/js/pwa-install.js',
  '/js/sections.js',
  '/js/selection.js',
  '/js/selfcheck.js',
  '/js/slidestudio.js',
  '/js/state.js',
  '/js/text-editor2.js',
  '/js/text2-transform.js',
  '/js/ui-helpers.js',
  '/js/zoom.js'
];

// Install
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', event => {
  console.log('Service Worker activated!');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch
self.addEventListener('fetch', event => {
  // Skip non-GET requests and cross-origin requests
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Network-first: always try the latest files from the server, fall back to cache when offline
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Don't cache non-successful responses
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        // Cache successful responses for offline use
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      })
      .catch(error => {
        console.log('Fetch failed; returning cached fallback:', error);
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If it's a page request, return the cached homepage
          if (event.request.destination === 'document') {
            return caches.match('/');
          }
        });
      })
  );
});
