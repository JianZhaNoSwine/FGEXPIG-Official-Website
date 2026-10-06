/* 统一缓存机制：
   - 文本（HTML / CSS / JS / JSON / TXT 等）只联网读取，不进入缓存；
   - 图片 / 音乐 / 字体 / 视频等二进制资源先读缓存，再联网校验更新；
   - 固定缓存名：普通内容更新不清空旧缓存，只替换发生变化的资源；
   - 1/2/3 级缓存的范围由前端下载队列控制，Service Worker 不主动删除已下载的分级资源。 */
const CACHE_NAME = 'fgexpig-assets';
const LEGACY_CACHE_PREFIX = 'fgexpig-assets-';
const ACTIVITY_RELEASE_DELAY = 10000;
/* 文本类：不缓存 */
const TEXT_PATH_RE = /\.(?:html?|css|js|json|txt|xml|csv|md)$/i;

/* 媒体类：必须支持 Range，否则在线播放时回退/快进会从头开始 */
const MEDIA_PATH_RE = /\.(?:mp3|m4a|aac|wav|ogg|oga|opus|flac|mp4|m4v|webm|ogv|mov)$/i;
function isMediaPath(path) {
  return MEDIA_PATH_RE.test(path);
}

let activeActivity = '';
let allowedActivities = [];
let cacheConfigReady = false;
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
  return isTextPath(path) ? '' : 'asset';
}

function keepable(path) {
  return !isTextPath(path);
}

async function pruneCache() {
  if (!cacheConfigReady) return;
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
  const path = new URL(request.url).pathname;
  const stale = (await cache.keys()).filter(function (cachedRequest) {
    return cachedRequest.url !== request.url && new URL(cachedRequest.url).pathname === path;
  });
  await Promise.all(stale.map(function (cachedRequest) { return cache.delete(cachedRequest); }));
  await cache.put(new Request(request.url), response.clone());
}

// 先联网校验：带上 ETag / Last-Modified；304 直接保留旧缓存，
// 200 则只替换这一个发生变化的资源；网络失败才回退到缓存。
async function revalidateFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreVary: true });
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
  // 3 级缓存会保留所有活动资源，不再按活动切换时间主动删除。
  Object.keys(releaseDeadlines).forEach(id => { delete releaseDeadlines[id]; });
}

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

async function migrateLegacyCaches() {
  const names = await caches.keys();
  const legacyNames = names.filter(function (name) {
    return name !== CACHE_NAME && name.indexOf(LEGACY_CACHE_PREFIX) === 0;
  });
  if (!legacyNames.length) return;
  const target = await caches.open(CACHE_NAME);
  for (const name of legacyNames) {
    const source = await caches.open(name);
    const requests = await source.keys();
    for (const request of requests) {
      const existing = await target.match(request, { ignoreVary: true });
      if (existing) continue;
      const response = await source.match(request, { ignoreVary: true });
      if (response) await target.put(request, response.clone());
    }
    await caches.delete(name);
  }
}

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await migrateLegacyCaches();
    await pruneCache();
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'fgexpig-cache-config') {
    activeActivity = String(data.activity || '');
    cacheConfigReady = true;
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
  cacheConfigReady = true;
  event.waitUntil((async () => {
    // 兼容旧消息：只记录当前活动，不再删除其他活动缓存。
    if (previousActivity && previousActivity !== activeActivity) {
      releaseDeadlines[previousActivity] = Date.now() + ACTIVITY_RELEASE_DELAY;
    }
    armReleaseTimer();
    await pruneCache();
  })());
});

/* ---------- 媒体 Range 支持 ----------
   Cache Storage 返回的是完整 200 响应，直接回给带 Range 的媒体请求会让
   <audio>/<video> 重新从 0 开始加载（表现为回退/快进后从头播放）。
   这里按 Range 从完整缓存内容中切出 206，保证在线播放也能正常跳转。 */
const mediaPayloads = new Map();
const MEDIA_PAYLOAD_LIMIT = 2;

function rememberMediaPayload(key, payload) {
  if (mediaPayloads.has(key)) mediaPayloads.delete(key);
  mediaPayloads.set(key, payload);
  while (mediaPayloads.size > MEDIA_PAYLOAD_LIMIT) {
    mediaPayloads.delete(mediaPayloads.keys().next().value);
  }
}

function defaultMediaType(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'm4a' || ext === 'aac') return 'audio/mp4';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'flac') return 'audio/flac';
  if (ext === 'ogg' || ext === 'oga' || ext === 'opus') return 'audio/ogg';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'ogv') return 'video/ogg';
  if (ext === 'mov') return 'video/quicktime';
  return 'video/mp4';
}

async function getMediaPayload(url) {
  const key = url.href;
  const hit = mediaPayloads.get(key);
  if (hit) {
    mediaPayloads.delete(key);
    mediaPayloads.set(key, hit);
    return hit;
  }
  const response = await revalidateFirst(new Request(key));
  if (!response || !response.ok) throw new Error('media-unavailable');
  const type = response.headers.get('Content-Type') || defaultMediaType(url.pathname);
  const buffer = await response.arrayBuffer();
  const payload = { buffer: buffer, type: type };
  rememberMediaPayload(key, payload);
  return payload;
}

async function serveMediaFull(request, url) {
  const response = await revalidateFirst(new Request(url.href));
  if (!response || !response.ok) throw new Error('media-unavailable');
  const headers = new Headers(response.headers);
  headers.set('Accept-Ranges', 'bytes');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

function parseRangeHeader(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!match) return null;
  let start;
  let end;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (!isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (!isFinite(start) || !isFinite(end) || start < 0 || start > end || start >= size) return null;
  return { start: start, end: end };
}

async function serveMedia(request, url) {
  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) {
    try {
      return await serveMediaFull(request, url);
    } catch (err) {
      return fetch(request).catch(() => Response.error());
    }
  }
  let payload;
  try {
    payload = await getMediaPayload(url);
  } catch (err) {
    return fetch(request).catch(() => Response.error());
  }
  const size = payload.buffer.byteLength;
  const range = parseRangeHeader(rangeHeader, size);
  const headers = new Headers();
  headers.set('Content-Type', payload.type);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'no-store');
  if (!range) {
    headers.set('Content-Length', String(size));
    return new Response(payload.buffer, { status: 200, statusText: 'OK', headers: headers });
  }
  const body = payload.buffer.slice(range.start, range.end + 1);
  headers.set('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + size);
  headers.set('Content-Length', String(body.byteLength));
  return new Response(body, { status: 206, statusText: 'Partial Content', headers: headers });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' || !cacheKind(url.pathname)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  if (isMediaPath(url.pathname)) {
    event.respondWith(serveMedia(request, url));
    return;
  }
  event.respondWith(revalidateFirst(request));
});
