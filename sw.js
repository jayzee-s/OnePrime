// OnePrime Service Worker
// Cache-first strategy for static assets (CSS, JS, fonts).
// Cache entries expire after 2 days (172800 seconds); stale entries are
// evicted on the next fetch, which then re-caches the fresh response.
// HTML pages use network-first so navigation always reflects the latest
// content even while assets are served from cache.

const CACHE_NAME = 'oneprime-v202507100930';
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000; // 2 days in milliseconds

// Assets to pre-cache on install (shell resources needed to load any page)
const PRECACHE_URLS = [
  '/css/style.css',
  '/js/script.js',
  '/js/admin.js',
  '/js/membership.js',
];

// ===== INSTALL =====
// Pre-fetch and store shell assets so they're available immediately on
// first load. skipWaiting() activates this worker without waiting for
// existing tabs to close — safe here because our cache strategy always
// falls back to the network rather than serving permanently stale data.
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ===== ACTIVATE =====
// Delete any old cache versions (different CACHE_NAME) left over from
// previous deploys, so stale assets from old builds don't linger.
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ===== FETCH =====
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Only handle same-origin GET requests — let POST/external requests
  // (Google Fonts, Anthropic API, etc.) pass through untouched.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  var pathname = url.pathname;

  // HTML pages: network-first so navigation always shows the latest markup.
  // Falls back to cache only when offline.
  if (pathname.endsWith('.html') || pathname === '/' || pathname === '') {
    event.respondWith(networkFirstThenCache(event.request));
    return;
  }

  // CSS / JS / images / fonts: cache-first with 2-day expiry.
  // A cache hit is served immediately; if the cached copy is older than
  // 2 days it is treated as a miss (fetched fresh from network) and the
  // cache entry is replaced with the new response.
  if (isStaticAsset(pathname)) {
    event.respondWith(cacheFirstWithExpiry(event.request));
    return;
  }
});

// ===== HELPERS =====

function isStaticAsset(pathname) {
  return /\.(css|js|woff2?|ttf|otf|eot|png|jpe?g|webp|gif|svg|ico)$/i.test(pathname);
}

// Cache-first: return cached response if fresh (< 2 days old).
// If stale or missing, fetch from network, cache the new response, and
// return it. On network failure, return the stale cached copy if any.
function cacheFirstWithExpiry(request) {
  return caches.open(CACHE_NAME).then(function(cache) {
    return cache.match(request).then(function(cachedResponse) {
      if (cachedResponse) {
        var cachedAt = cachedResponse.headers.get('sw-cached-at');
        var age = cachedAt ? (Date.now() - parseInt(cachedAt, 10)) : Infinity;
        if (age < MAX_AGE_MS) {
          // Fresh enough — serve from cache.
          return cachedResponse;
        }
        // Stale — fall through to network fetch below.
      }
      return fetchAndCache(request, cache).catch(function() {
        // Network failed — serve stale cache as last resort.
        return cachedResponse || Response.error();
      });
    });
  });
}

// Network-first: try network, cache the response, and return it.
// If the network fails, try the cache.
function networkFirstThenCache(request) {
  return caches.open(CACHE_NAME).then(function(cache) {
    return fetchAndCache(request, cache).catch(function() {
      return cache.match(request);
    });
  });
}

// Fetch from network, stamp the response with the current time in a
// custom header (sw-cached-at) so cache-first logic can check its age,
// store it, and return it.
function fetchAndCache(request, cache) {
  return fetch(request).then(function(networkResponse) {
    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
      return networkResponse;
    }
    // Clone before consuming (a Response body can only be read once).
    var responseToCache = networkResponse.clone();
    // Inject the cached-at timestamp into a modified response so we can
    // check freshness later without touching the original headers.
    var headers = new Headers(responseToCache.headers);
    headers.set('sw-cached-at', String(Date.now()));
    return responseToCache.blob().then(function(body) {
      var stamped = new Response(body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers,
      });
      cache.put(request, stamped);
      return networkResponse;
    });
  });
}
