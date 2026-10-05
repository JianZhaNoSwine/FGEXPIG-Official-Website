/* 统一缓存机制：
   - 文本（HTML / CSS / JS / JSON / TXT 等）只联网读取，不进入缓存；
   - 图片 / 音乐 / 字体 / 视频等二进制资源先读缓存，再联网校验更新；
   - 只保留当前筛选活动、当前画质级别的资源，其余不进入缓存。 */
const CACHE_NAME = 'fgexpig-assets-v75';
const ACTIVITY_RELEASE_DELAY = 10000;
/* 文本类：不缓存 */
const TEXT_PATH_RE = /\.(?:html?|css|js|json|txt|xml|csv|md)$/i;

let activeActivity = '';
let allowedActivities = [];
let qualityConfig = {
  wallpaper: 1,
  profileMusic: 1,
  achievements: 1,
  badges: 1,
  resources: 1,
  emoji: 1
};
let releaseTimer = 0;
const releaseDeadlines = {};

function isTextPath(path) {
  return TEXT_PATH_RE.test(path);
}

function isResourcePath(path) {
  return path.startsWith('/resources/');
}

function activityIdOf(path) {
  const match = /^\/resources\/([^/]+)\//.exec(path);
  return match ? match[1] : '';
}

function activityAllowed(id) {
  if (!id) return false;
  if (!allowedActivities.length) return id === activeActivity;
  return allowedActivities.indexOf(id) >= 0;
}

function qualityCategoryOf(path) {
  if (/^\/wallpaper\//.test(path)) return 'wallpaper';
  if (/^\/(?:profile|music)\//.test(path)) return 'profileMusic';
  if (/^\/logo\//.test(path)) return 'badges';
  if (/^\/emoji\//.test(path)) return 'emoji';
  if (/^\/resources\//.test(path)) {
    if (/\/icons\//.test(path)) return 'achievements';
    if (/\/pictures\//.test(path)) return 'resources';
  }
  return '';
}

function qualityLevelOf(path) {
  const match = /\/([1-5])\/[^/]+$/.exec(path);
  return match ? Number(match[1]) : 0;
}

function qualityAllowed(path) {
  const category = qualityCategoryOf(path);
  if (!category) return true;
  const level = qualityLevelOf(path);
  if (!level) return true;
  return level === Number(qualityConfig[category] || 1);
}

function cacheKind(path) {
  if (isTextPath(path)) return '';
  if (isResourcePath(path)) {
    const id = activityIdOf(path);
    return activityAllowed(id) && qualityAllowed(path) ? 'activity' : '';
  }
  return qualityAllowed(path) ? 'asset' : '';
}

function keepable(path) {
  if (isTextPath(path)) return false;
  if (isResourcePath(path)) return activityAllowed(activityIdOf(path)) && qualityAllowed(path);
  return qualityAllowed(path);
}

async function pruneCache() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  await Promise.all(requests.map(async request => {
    const path = new URL(request.url).pathname;
    if (!keepable(path)) await cache.delete(request);
  }));
}

async function putIfUsable(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

// 先返回缓存；后台再联网校验：带上 ETag / Last-Modified，304 说明没过时，
// 200 则写入新缓存（过时的资源被替换）。
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = (async () => {
    try {
      const headers = new Headers();
      const etag = cached && cached.headers.get('ETag');
      const lastModified = cached && cached.headers.get('Last-Modified');
      if (etag) headers.set('If-None-Match', etag);
      if (lastModified) headers.set('If-Modified-Since', lastModified);
      const response = await fetch(new Request(request.url, {
        method: 'GET',
        headers: headers,
        credentials: 'same-origin',
        cache: 'no-store'
      }));
      if (response.status === 304) return cached || response;
      await putIfUsable(request, response);
      return response;
    } catch (err) {
      return cached || Response.error();
    }
  })();
  return cached || network;
}

function armReleaseTimer() {
  Object.keys(releaseDeadlines).forEach(id => {
    if (id === activeActivity) delete releaseDeadlines[id];
  });
  const ids = Object.keys(releaseDeadlines);
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = 0;
  }
  if (!ids.length) return;
  const next = Math.min.apply(null, ids.map(id => releaseDeadlines[id]));
  releaseTimer = setTimeout(async () => {
    releaseTimer = 0;
    await releaseExpiredActivities();
    armReleaseTimer();
  }, Math.max(0, next - Date.now()));
}

async function releaseExpiredActivities() {
  const now = Date.now();
  const expired = Object.keys(releaseDeadlines).filter(id => releaseDeadlines[id] <= now);
  if (!expired.length) return;
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  await Promise.all(requests.map(async request => {
    const id = activityIdOf(new URL(request.url).pathname);
    if (id && expired.indexOf(id) >= 0) await cache.delete(request);
  }));
  expired.forEach(id => { delete releaseDeadlines[id]; });
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
  if (data.type === 'fgexpig-cache-config') {
    activeActivity = String(data.activity || '');
    allowedActivities = Array.isArray(data.activities)
      ? data.activities.map(id => String(id || '')).filter(Boolean).filter((id, index, list) => list.indexOf(id) === index)
      : [];
    if (data.quality && typeof data.quality === 'object') {
      Object.keys(qualityConfig).forEach(key => {
        const level = Math.round(Number(data.quality[key]));
        if (isFinite(level)) qualityConfig[key] = Math.max(1, Math.min(5, level));
      });
    }
    event.waitUntil(pruneCache());
    return;
  }
  if (data.type !== 'fgexpig-cache-activity') return;
  const previousActivity = activeActivity;
  activeActivity = String(data.activity || '');
  event.waitUntil((async () => {
    // 兼容旧消息：只更新当前活动，不扩大缓存范围。
    if (previousActivity && previousActivity !== activeActivity) {
      releaseDeadlines[previousActivity] = Date.now() + ACTIVITY_RELEASE_DELAY;
    }
    armReleaseTimer();
    await pruneCache();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' || !cacheKind(url.pathname)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
