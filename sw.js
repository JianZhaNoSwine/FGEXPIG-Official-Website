/* 运行时资源缓存（两套方案，由「设置 → 显示 → 缓存加速」切换）：
   - 关闭（默认，旧方案）：只缓存壁纸 / logo / 当前选中活动的资源，其余一律联网读取；
   - 开启（加速方案）：图片 + 所有音乐 + 当前选中字体的文件，先读缓存再联网校验，
     过时了就替换并写入新缓存；文字类（HTML / CSS / JS / 数据）只联网读取，不进入缓存；
     非选中活动的图片在离开 10 秒后释放。 */
const CACHE_NAME = 'fgexpig-assets-v73';
const ACTIVITY_RELEASE_DELAY = 10000;
/* 加速方案缓存这些内容 */
const IMAGE_PATH_RE = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;

let activeActivity = '';
let boostEnabled = false;
let selectedFontPaths = [];
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

function isImagePath(path) {
  return IMAGE_PATH_RE.test(path);
}

function isMusicPath(path) {
  return path.startsWith('/music/');
}

function isSelectedFontPath(path) {
  return selectedFontPaths.indexOf(path) >= 0;
}

function activityIdOf(path) {
  const match = /^\/resources\/([^/]+)\//.exec(path);
  return match ? match[1] : '';
}

// 首页 3 个页面的内容数据（resources/**.js 等文字类）：只联网获取，不进入缓存。
function isActivityContent(path) {
  return isResourcePath(path) && /\.js$/i.test(path);
}

function cacheKind(path) {
  if (boostEnabled) {
    // 加速方案：图片 / 全部音乐 / 当前选中字体；其它（文字类等）联网
    const cacheable = isImagePath(path) || isMusicPath(path) || isSelectedFontPath(path);
    if (!cacheable) return '';
    if (isResourcePath(path)) {
      const id = activityIdOf(path);
      if (!id) return '';
      if (id === activeActivity) return 'activity';
      if (releaseDeadlines[id]) return 'activity'; // 宽限期内仍可读缓存
      return '';
    }
    return 'asset';
  }
  // 旧方案
  if (isWallpaper(path) || isLogo(path)) return 'static';
  if (!isResourcePath(path) || !activeActivity) return '';
  return path.startsWith('/resources/' + activeActivity + '/') ? 'activity' : '';
}

function keepable(path) {
  if (boostEnabled) {
    const cacheable = isImagePath(path) || isMusicPath(path) || isSelectedFontPath(path);
    if (!cacheable) return false;
    if (!isResourcePath(path)) return true;
    const id = activityIdOf(path);
    if (!id) return false;
    if (id === activeActivity) return true;
    return !!releaseDeadlines[id];
  }
  if (isWallpaper(path) || isLogo(path)) return true;
  if (!isResourcePath(path) || !activeActivity) return false;
  return path.startsWith('/resources/' + activeActivity + '/');
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
  if (data.type !== 'fgexpig-cache-activity') return;
  const previousActivity = activeActivity;
  activeActivity = String(data.activity || '');
  boostEnabled = !!data.boost;
  selectedFontPaths = Array.isArray(data.font) ? data.font.map(String) : [];
  event.waitUntil((async () => {
    if (boostEnabled) {
      // 非选中活动的图片延迟 10 秒释放：期间切回来可以直接读缓存。
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
  if (request.mode === 'navigate' || isActivityContent(url.pathname)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  const kind = cacheKind(url.pathname);
  if (!kind) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  // 加速方案：图片 / 音乐 / 选中字体都「先缓存后校验」；旧方案：壁纸/logo 缓存优先，活动资源先缓存后校验
  if (!boostEnabled && kind === 'static') event.respondWith(cacheFirst(request, kind));
  else event.respondWith(staleWhileRevalidate(request));
});
