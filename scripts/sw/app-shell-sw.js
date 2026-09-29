// Vfitfunlife app-shell service worker (plan D3: offline app shell).
//
// TEMPLATE: scripts/generate-sw.mjs copies this file to out/sw.js after `next build`,
// replacing __SW_VERSION__ and the __PRECACHE_MANIFEST__ list with the build's HTML routes
// and the /_next/static assets they reference. Do not put it in public/.
//
// Registered by src/lib/sw/appShell.ts with scope '/' (web only: never on Capacitor native,
// never in dev). It is a separate registration from the FCM worker
// (public/firebase-messaging-sw.js, scope /firebase-cloud-messaging-push-scope) and has no
// push/notification handlers, so the two never compete.
//
// Strategies
//   navigations (HTML)          network-first (timeout) → cached route → /offline.html
//   RSC payloads (*.txt)        network-first → cache (same versioned cache as the HTML)
//   /_next/static, icons, …     cache-first (content-hashed or immutable)
//   everything else             not intercepted — in particular every cross-origin request
//                               (Firestore, Functions, Google APIs, Stripe, gstatic) and
//                               Firebase Hosting's reserved /__/ URLs (auth handler).

const SW_VERSION = '__SW_VERSION__';
const PRECACHE_URLS = /*__PRECACHE_MANIFEST__*/ [];

const SHELL_CACHE_PREFIX = 'vfit-shell-';
const SHELL_CACHE = SHELL_CACHE_PREFIX + SW_VERSION;
const RUNTIME_CACHE = 'vfit-runtime';
const RUNTIME_MAX_ENTRIES = 250;
const OFFLINE_URL = '/offline.html';
const REQUIRED_URLS = ['/', OFFLINE_URL];
const NAVIGATION_TIMEOUT_MS = 5000;

const STATIC_PREFIXES = ['/_next/static/', '/icons/', '/landing/'];
const STATIC_FILES = ['/favicon.ico', '/icon.svg'];
const BYPASS_PREFIXES = ['/__/'];
const BYPASS_FILES = ['/sw.js', '/firebase-messaging-sw.js'];

/**
 * How a request is handled: 'navigate' | 'rsc' | 'static' | 'shell' | null (not intercepted).
 * Pure, so it can be unit-tested (scripts/sw/app-shell-sw.test.mjs).
 */
function routeFor(method, url, mode, origin) {
  if (method !== 'GET') return null;
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return null;
  }
  if (u.origin !== origin) return null;
  const p = u.pathname;
  if (BYPASS_FILES.indexOf(p) !== -1) return null;
  for (const prefix of BYPASS_PREFIXES) if (p.indexOf(prefix) === 0) return null;
  if (mode === 'navigate') return 'navigate';
  for (const prefix of STATIC_PREFIXES) if (p.indexOf(prefix) === 0) return 'static';
  if (STATIC_FILES.indexOf(p) !== -1) return 'static';
  if (/\.txt$/.test(p)) return 'rsc';
  if (PRECACHE_URLS.indexOf(p) !== -1) return 'shell';
  return null;
}

/**
 * Cache key for an HTML route: the path only (query strings carry Firestore ids —
 * /bookings/detail/?id=… — and must all resolve to the one exported page), with the
 * trailing slash of next.config's `trailingSlash: true`.
 */
function pageKey(url) {
  const u = new URL(url);
  let p = u.pathname;
  if (p.slice(-11) === '/index.html') p = p.slice(0, -10);
  else if (!/\/$/.test(p) && !/\.[a-z0-9]+$/i.test(p)) p += '/';
  return u.origin + p;
}

function isCacheable(response) {
  return !!response && response.status === 200 && response.type === 'basic';
}

async function precache() {
  const cache = await caches.open(SHELL_CACHE);
  const results = await Promise.allSettled(
    PRECACHE_URLS.map(async (path) => {
      // Content-hashed build assets may come from the HTTP cache (the page just loaded
      // them); everything else must bypass it so the shell matches this build.
      const hashed = path.indexOf('/_next/static/') === 0;
      const response = await fetch(
        new Request(path, { cache: hashed ? 'default' : 'reload', credentials: 'same-origin' })
      );
      if (!isCacheable(response)) throw new Error(path + ' → ' + response.status);
      await cache.put(path, response);
    })
  );
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? PRECACHE_URLS[i] : null))
    .filter(Boolean);
  if (failed.length) console.warn('[sw] precache misses:', failed);
  // Without these the worker cannot do its job: fail the install, the browser retries later.
  for (const url of REQUIRED_URLS) {
    if (PRECACHE_URLS.indexOf(url) !== -1 && failed.indexOf(url) !== -1) {
      throw new Error('[sw] required precache entry failed: ' + url);
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.indexOf(SHELL_CACHE_PREFIX) === 0 && key !== SHELL_CACHE)
          .map((key) => caches.delete(key))
      );
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (e) {
          /* not supported */
        }
      }
      await self.clients.claim();
    })()
  );
});

function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

async function handleNavigate(event) {
  const cache = await caches.open(SHELL_CACHE);
  const key = pageKey(event.request.url);
  const network = (async () => {
    const preload = await event.preloadResponse;
    const response = preload || (await fetch(event.request));
    if (isCacheable(response) && !response.redirected) {
      cache.put(key, response.clone()).catch(() => {});
    }
    return response;
  })();
  network.catch(() => {});

  const cached = await cache.match(key);
  // With a cached copy, don't leave the user staring at a slow network forever.
  const first = await Promise.race([network.catch(() => null), cached ? timeout(NAVIGATION_TIMEOUT_MS) : new Promise(() => {})]);
  if (first) return first;
  if (cached) return cached;
  return (await cache.match(OFFLINE_URL)) || Response.error();
}

async function handleRsc(request) {
  const cache = await caches.open(SHELL_CACHE);
  const u = new URL(request.url);
  const key = u.origin + u.pathname; // drop ?_rsc=… cache-busters
  try {
    const response = await fetch(request);
    if (isCacheable(response)) cache.put(key, response.clone()).catch(() => {});
    return response;
  } catch (err) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw err;
  }
}

async function trimRuntimeCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - RUNTIME_MAX_ENTRIES;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}

async function handleStatic(request) {
  // Any cache: a page still running the previous build may ask for its own chunks.
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheable(response)) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache
      .put(request, response.clone())
      .then(() => trimRuntimeCache(cache))
      .catch(() => {});
  }
  return response;
}

async function handleShell(request) {
  try {
    return await fetch(request);
  } catch (err) {
    const cached = await caches.match(new URL(request.url).pathname, { cacheName: SHELL_CACHE });
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.headers.has('range')) return;
  const route = routeFor(request.method, request.url, request.mode, self.location.origin);
  if (route === 'navigate') event.respondWith(handleNavigate(event));
  else if (route === 'rsc') event.respondWith(handleRsc(request));
  else if (route === 'static') event.respondWith(handleStatic(request));
  else if (route === 'shell') event.respondWith(handleShell(request));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'vfit:sw-version' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: SW_VERSION, precached: PRECACHE_URLS.length });
  }
});
