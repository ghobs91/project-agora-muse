const CACHE_NAME = 'agora-muse-v1';
const STATIC_CACHE = 'agora-muse-static-v1';
const DYNAMIC_CACHE = 'agora-muse-dynamic-v1';

const PRECACHE_URLS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/favicon-32x32.png',
];

// Cache strategies
const CACHE_FIRST = [/\.(js|css|woff2?|png|svg|ico|webp|avif)$/, /\/_next\/static\//];
const NETWORK_FIRST = [/^https?:\/\/(public\.api|bsky\.social|api\.bsky)\//];

// Install: precache essential files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('Precache failed for some URLs:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: respond with appropriate strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and browser extensions
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') return;

  // Network-first for API calls
  if (NETWORK_FIRST.some((pattern) => pattern.test(url.href))) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for static assets
  if (CACHE_FIRST.some((pattern) => pattern.test(url.pathname)) ||
      (url.origin === self.location.origin && url.pathname.startsWith('/_next/'))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation requests: network-first with offline fallback
  if (request.mode === 'navigate') {
    // OAuth callbacks must bypass the service worker. iOS PWAs in standalone
    // mode can enter a redirect loop or serve a stale cached response when the
    // service worker intercepts the identity provider's redirect back to the
    // app. Let the browser load the callback page directly so the OAuth params
    // are consumed exactly once.
    if (url.pathname === '/oauth/callback' || url.pathname === '/oauth/callback/') {
      return;
    }

    event.respondWith(navigationFallback(request));
    return;
  }

  // Default: network-first for HTML, stale-while-revalidate for rest
  if (request.destination === 'document' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match('/offline');
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // For navigation, return offline page
    if (request.mode === 'navigate') {
      return caches.match('/offline');
    }
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      caches.open(DYNAMIC_CACHE).then((cache) => {
        cache.put(request, response.clone());
      });
    }
    return response;
  }).catch(() => {});

  return cached || fetchPromise;
}

async function navigationFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match('/offline');
  }
}

// Push notification handler (placeholder for future)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || '',
    icon: '/icon-192x192.png',
    badge: '/favicon-32x32.png',
    tag: data.tag || 'agora-muse',
    data: data.url || '/',
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Agora Muse', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === event.notification.data && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data || '/');
      }
    })
  );
});
