/* Bounded runtime cache: wallpaper + logo + resources of the active activity only. */
const CACHE_NAME = 'fgexpig-assets-v3';
let activeActivity = '';

function isWallpaper(path) {
  return /^\/wallpaper\/[1-5]\//.test(path);
}

function isLogo(path) {
  return path.startsWith('/logo/');
}

function isActiveActivityAsset(path) {
  return !!activeActivity && path.startsWith('/resources/' + activeActivity + '/');
}

function cacheKind(path) {
  if (isWallpaper(path) || isLogo(path)) return 'static';
  if (isActiveActivityAsset(path)) return 'activity';
  return '';
}

async function pruneCache() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  await Promise.all(requests.map(async request => {
    const path = new URL(request.url).pathname;
    if (!cacheKind(path)) await cache.delete(request);
  }));
}

async function putIfUsable(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function cacheFirst(request, kind) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (kind === 'static') await putIfUsable(request, response);
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request).then(async response => {
    await putIfUsable(request, response);
    return response;
  });
  return cached || network;
}

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)));
    await pruneCache();
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'fgexpig-cache-activity') return;
  activeActivity = String(data.activity || '');
  event.waitUntil(pruneCache());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const kind = cacheKind(url.pathname);
  if (!kind) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  event.respondWith(kind === 'static' ? cacheFirst(request, kind) : staleWhileRevalidate(request));
});
