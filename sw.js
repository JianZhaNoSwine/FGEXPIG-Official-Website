/* 运行时资源缓存（两套方案，由「设置 → 显示 → 缓存加速」切换）：
   - 关闭（默认，旧方案）：只缓存壁纸 / logo / 当前选中活动的资源，其余一律联网读取；
   - 开启（新方案）：壁纸 / logo / 其余静态资源都可读缓存，首页 3 个页面的内容数据始终联网，
     非选中活动的资源在离开 10 秒后释放。 */
const CACHE_NAME = 'fgexpig-assets-v71';
const ACTIVITY_RELEASE_DELAY = 10000;

let activeActivity = '';
let boostEnabled = false;
let releaseTimer = 0;
const releaseDeadlines = {};

function isWallpaper(path) {
  return /^\/wallpaper\/[1-5]\//.test(path);
}

function isLogo(path) {
  return path.startsWith('/logo/');
}

function isResourcePath(path) {
  return path.startsWith('/resources/');
}

function activityIdOf(path) {
  const match = /^\/resources\/([^/]+)\//.exec(path);
  return match ? match[1] : '';
}

// 首页 3 个页面（商店 / 资源 / 热点）的内容数据：只联网获取，不进入缓存。
function isActivityContent(path) {
  return isResourcePath(path) && /\.js$/i.test(path);
}

// 页面本体（HTML 文档）始终联网，避免缓存住旧页面。
function isDocumentRequest(path) {
  return path === '/' || path.endsWith('/') || /\.html?$/i.test(path);
}

function cacheKind(path) {
  if (isWallpaper(path) || isLogo(path)) return 'static';
  if (isDocumentRequest(path)) return '';
  if (isResourcePath(path)) {
    if (!activeActivity) return '';
    if (boostEnabled) {
      if (isActivityContent(path)) return '';
      return activityIdOf(path) === activeActivity ? 'activity' : '';
    }
    return path.startsWith('/resources/' + activeActivity + '/') ? 'activity' : '';
  }
  return boostEnabled ? 'extra' : '';
}

function keepable(path) {
  if (isWallpaper(path) || isLogo(path)) return true;
  if (isDocumentRequest(path)) return false;
  if (isResourcePath(path)) {
    const id = activityIdOf(path);
    if (!id) return false;
    if (boostEnabled && isActivityContent(path)) return false;
    if (id === activeActivity) return true;
    if (boostEnabled && releaseDeadlines[id]) return true;
    return false;
  }
  return boostEnabled;
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
  if (data.type !== 'fgexpig-cache-activity') return;
  const previousActivity = activeActivity;
  activeActivity = String(data.activity || '');
  boostEnabled = !!data.boost;
  event.waitUntil((async () => {
    if (boostEnabled) {
      // 非选中活动的资源延迟 10 秒释放：期间切回来可以直接读缓存。
      if (previousActivity && previousActivity !== activeActivity) {
        releaseDeadlines[previousActivity] = Date.now() + ACTIVITY_RELEASE_DELAY;
      }
      armReleaseTimer();
    } else {
      Object.keys(releaseDeadlines).forEach(id => { delete releaseDeadlines[id]; });
      if (releaseTimer) {
        clearTimeout(releaseTimer);
        releaseTimer = 0;
      }
    }
    await pruneCache();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  const kind = cacheKind(url.pathname);
  if (!kind) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  event.respondWith(kind === 'static' ? cacheFirst(request, kind) : staleWhileRevalidate(request));
});
