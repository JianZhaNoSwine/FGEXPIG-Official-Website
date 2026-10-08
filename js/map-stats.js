/* FGEXPIG 地图数据统计（游玩数 / 点赞数 / 点踩数）
 *
 * 数据源：第三方社区站 FallGuysDB 的公开接口
 *   https://api2.fallguysdb.info/api/creative/{分享码}.json
 * 只取 3 个字段：
 *   level.play_count         -> 游玩数
 *   snapshot.stats.likes     -> 点赞数
 *   snapshot.stats.dislikes  -> 点踩数
 * 其余字段一律不用。
 *
 * 分享码来自 resources/shop.js 每个活动的 codes；
 * 一个活动的卡片显示的是它所有地图的累加值。
 *
 * 抓取策略：
 *   - 一轮会一直请求，直到队列清空（每天每个码最多成功刷新 1 次）
 *   - 队列顺序：先「完全没有数据的码」，再「已有上次数据的码」；
 *     每一档内部都是活动时间从最新到最旧
 *   - 某个请求失败 = 开始被风控：失败的码放回队尾，整个队列暂停 15 分钟再继续；
 *     恢复时间写入 localStorage，期间关掉网页 / exe 也不影响
 *   - 中途请求成功过一次的码，当天不再请求（第二天自动重新刷新一轮）
 *   - 404 视为「这个地图暂时没有数据」，当天不再重试，避免无意义地反复请求
 *
 * 上次数据永久保留：只有请求成功才会覆盖，失败时原样显示旧数据。
 */
(function (global) {
  'use strict';

  var API = 'https://api2.fallguysdb.info/api/creative/';
  var STORAGE_KEY = 'fgexpig.mapstats.v1';
  var CODE_RE = /^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/i;
  var REQUEST_GAP_MS = 8000;               // 请求间隔基数（突发请求会被整段封禁，必须放慢）
  var REQUEST_JITTER_MS = 4000;            // 间隔随机抖动
  var RATE_LIMIT_PAUSE_MS = 15 * 60 * 1000; // 没拿到 Retry-After 时的兜底暂停
  var TRANSPORT_RETRY_MS = 60 * 1000;      // 纯网络错误：短退避重试，不算风控
  var REQUEST_TIMEOUT_MS = 15000;

  // { codes: {码: {plays,likes,dislikes,at}}, days: {码: 'YYYY-M-D'}, resumeAt }
  var store = readStore();
  var activities = {};                     // id -> { codes: [...], order: number }
  var queueNew = [];                       // 优先：完全没有数据的码
  var queueStale = [];                     // 其次：已有上次数据、今天还没刷新的码
  var listeners = [];
  var running = false;
  var pumpTimer = 0;

  // 地图数据卡片由 exe（桌面端）独占：网页版连一次请求都不发
  function desktopOnly() {
    return !!(global.FGEXPIG_DESKTOP && global.FGEXPIG_DESKTOP.isDesktop);
  }

  function dayKey(timestamp) {
    var date = timestamp ? new Date(timestamp) : new Date();
    if (isNaN(date.getTime())) date = new Date();
    return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
  }

  function readStore() {
    var empty = { codes: {}, days: {}, resumeAt: 0 };
    var parsed = null;
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (err) {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object') return empty;
    var next = {
      codes: parsed.codes && typeof parsed.codes === 'object' ? parsed.codes : {},
      days: parsed.days && typeof parsed.days === 'object' ? parsed.days : {},
      resumeAt: Number(parsed.resumeAt) || 0
    };
    // 兼容旧数据：用已有的成功时间补出「哪一天刷新过」
    Object.keys(next.codes).forEach(function (code) {
      var rec = next.codes[code];
      if (rec && rec.at && !next.days[code]) next.days[code] = dayKey(Number(rec.at));
    });
    return next;
  }

  function writeStore() {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (err) {}
  }

  function normalizeCode(value) {
    var text = String(value == null ? '' : value).trim();
    return CODE_RE.test(text) ? text.toUpperCase() : '';
  }

  function toCount(value) {
    var num = Number(value);
    if (!isFinite(num) || num < 0) return 0;
    return Math.round(num);
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (err) {}
    }
  }

  /* ---------- 对外：注册活动 ---------- */
  function register(list) {
    if (!desktopOnly()) return;
    if (!list || !list.length) return;
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row || !row.id) continue;
      var codes = [];
      var source = row.codes || [];
      for (var j = 0; j < source.length; j++) {
        var code = normalizeCode(source[j]);
        if (code && codes.indexOf(code) < 0) codes.push(code);
      }
      if (!codes.length) continue;
      var order = Number(row.order);
      activities[row.id] = { codes: codes, order: isFinite(order) ? order : 0 };
      changed = true;
    }
    if (!changed) return;
    buildQueue();
    // 必须通知一次：队列可能为空（今天已经全部刷新过），
    // 若不通知，订阅方（首页地图卡片、暂停菜单顶部统计）会一直停在 N/A。
    notify();
    if (!queueNew.length && !queueStale.length) return;
    var wait = Number(store.resumeAt || 0) - Date.now();
    schedulePump(wait > 0 ? wait : 0);
  }

  function buildQueue() {
    var ids = Object.keys(activities).sort(function (a, b) {
      return activities[b].order - activities[a].order;   // 活动时间：最新 → 最旧
    });
    var today = dayKey();
    var empty = [];
    var stale = [];
    var seen = {};
    for (var i = 0; i < ids.length; i++) {
      var codes = activities[ids[i]].codes;
      for (var j = 0; j < codes.length; j++) {
        var code = codes[j];
        if (seen[code]) continue;
        seen[code] = true;
        // 今天已经成功刷新过 → 当轮不再请求
        if (store.days[code] === today) continue;
        if (store.codes[code]) stale.push(code);
        else empty.push(code);
      }
    }
    queueNew = empty;
    queueStale = stale;
  }

  function requeue(code) {
    // 失败的码放回队尾：没有数据的仍然优先于有历史数据的
    if (store.codes[code]) queueStale.push(code);
    else queueNew.push(code);
  }

  /* ---------- 抓取：一直请求到队列清空 ---------- */
  function nextGap() {
    return REQUEST_GAP_MS + Math.floor(Math.random() * REQUEST_JITTER_MS);
  }

  function schedulePump(delay) {
    if (pumpTimer) return;
    pumpTimer = global.setTimeout(function () {
      pumpTimer = 0;
      pump();
    }, Math.max(0, Number(delay) || 0));
  }

  function takeNextCode() {
    if (queueNew.length) return queueNew.shift();
    if (queueStale.length) return queueStale.shift();
    return '';
  }

  function pump() {
    if (!desktopOnly()) return;
    if (running) return;
    // 处于风控暂停期：等到恢复时间再继续（恢复时间已持久化，关掉页面也有效）
    var wait = Number(store.resumeAt || 0) - Date.now();
    if (wait > 0) {
      schedulePump(wait);
      return;
    }
    var code = takeNextCode();
    if (!code) return;                     // 队列清空，本轮结束
    running = true;
    fetchCode(code).then(function () {
      running = false;
      store.days[code] = dayKey();         // 今天成功刷新过，当轮不再请求
      store.resumeAt = 0;
      writeStore();
      notify();
      schedulePump(nextGap());
    }, function (err) {
      running = false;
      var status = Number(err && err.status) || 0;
      if (status === 404) {
        // 这个地图暂时没有数据：当天不再重试，明天再试
        store.days[code] = dayKey();
        writeStore();
        schedulePump(nextGap());
        return;
      }
      requeue(code);
      var retryAfterMs = Number(err && err.retryAfterMs) || 0;
      if (retryAfterMs > 0) {
        // 服务端明确给了 Retry-After（实测风控会要求等近 1 小时）：
        // 严格按它等，避免在封禁期内重试把封禁续上，导致永远刷不到数据。
        store.resumeAt = Date.now() + retryAfterMs;
        writeStore();
        notify();
        schedulePump(retryAfterMs);
        return;
      }
      if (err && err.transport) {
        // 纯网络错误（断网 / 超时）：不是风控，不写 resumeAt，短退避后继续
        schedulePump(TRANSPORT_RETRY_MS);
        return;
      }
      // 其余失败按风控处理：整队暂停 15 分钟后继续
      store.resumeAt = Date.now() + RATE_LIMIT_PAUSE_MS;
      writeStore();
      notify();
      schedulePump(RATE_LIMIT_PAUSE_MS);
    });
  }

  function consumePayload(code, json) {
    if (!json || json.ok !== true || !json.data) {
      var error = new Error('bad payload');
      error.status = 0;
      throw error;
    }
    var level = json.data.level || {};
    var stats = (json.data.snapshot && json.data.snapshot.stats) || {};
    store.codes[code] = {
      plays: toCount(level.play_count),
      likes: toCount(stats.likes),
      dislikes: toCount(stats.dislikes),
      at: Date.now()
    };
    writeStore();
  }

  function mapStatsBridge() {
    var bridge = global.FGEXPIG_DESKTOP && global.FGEXPIG_DESKTOP.fetchMapStats;
    return typeof bridge === 'function' ? bridge : null;
  }

  // exe：交给 Electron 主进程代取，绕开 CORS，并能读到真实状态码与 Retry-After
  function fetchCodeViaBridge(bridge, code) {
    return Promise.resolve(bridge(code)).then(function (result) {
      var status = Number(result && result.status) || 0;
      if (status < 200 || status >= 300) {
        var error = new Error('HTTP ' + status);
        error.status = status;
        error.retryAfterMs = Number(result && result.retryAfterMs) || 0;
        // 主进程没有 CORS，状态 0 就是真的网络/连接失败，不是风控
        error.transport = status === 0;
        throw error;
      }
      var json = null;
      try {
        json = JSON.parse(result.body);
      } catch (err) {
        var parseError = new Error('bad json');
        parseError.status = 0;
        throw parseError;
      }
      consumePayload(code, json);
    });
  }

  // 网页 / 旧版 exe：渲染进程直连（风控响应没有 CORS 头，这里只能看到网络错误）
  function fetchCodeViaBrowser(code) {
    var controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
    var timer = 0;
    var options = { cache: 'no-store', credentials: 'omit', mode: 'cors' };
    if (controller) {
      options.signal = controller.signal;
      timer = global.setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    }
    return global.fetch(API + encodeURIComponent(code) + '.json', options)
      .then(function (response) {
        if (!response || !response.ok) {
          var error = new Error('HTTP ' + (response ? response.status : 0));
          error.status = response ? Number(response.status) || 0 : 0;
          var retryAfter = response && response.headers ? Number(response.headers.get('retry-after')) : 0;
          if (isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = Math.min(retryAfter, 21600) * 1000;
          throw error;
        }
        return response.json();
      })
      .then(function (json) {
        consumePayload(code, json);
      })
      .then(function (value) {
        if (timer) global.clearTimeout(timer);
        return value;
      }, function (err) {
        if (timer) global.clearTimeout(timer);
        throw err;
      });
  }

  function fetchCode(code) {
    var bridge = mapStatsBridge();
    if (bridge) return fetchCodeViaBridge(bridge, code);
    return fetchCodeViaBrowser(code);
  }

  /* ---------- 对外：读取汇总 ---------- */
  function get(id) {
    var activity = activities[id];
    if (!activity) return null;
    var plays = 0;
    var likes = 0;
    var dislikes = 0;
    var covered = 0;
    var today = dayKey();
    var refreshed = 0;
    for (var i = 0; i < activity.codes.length; i++) {
      var code = activity.codes[i];
      if (store.days[code] === today) refreshed++;
      var rec = store.codes[code];
      if (!rec) continue;
      plays += toCount(rec.plays);
      likes += toCount(rec.likes);
      dislikes += toCount(rec.dislikes);
      covered++;
    }
    if (!covered) return null;
    return {
      plays: plays,
      likes: likes,
      dislikes: dislikes,
      covered: covered,
      codeCount: activity.codes.length,
      // 这个活动的全部地图都拿到过数据，才计算并展示点赞率 / 赞踩比
      complete: covered === activity.codes.length,
      refreshed: refreshed,
      // 今天是否已经把该活动的全部地图刷新过一遍
      fresh: refreshed === activity.codes.length
    };
  }

  // 全站合计（暂停菜单顶部统计用）：所有已注册活动下的所有地图
  function all() {
    var plays = 0;
    var likes = 0;
    var dislikes = 0;
    var covered = 0;
    var total = 0;
    var refreshed = 0;
    var today = dayKey();
    Object.keys(activities).forEach(function (id) {
      var activity = activities[id];
      if (!activity || !activity.codes) return;
      activity.codes.forEach(function (code) {
        total += 1;
        if (store.days[code] === today) refreshed += 1;
        var rec = store.codes[code];
        if (!rec) return;
        plays += toCount(rec.plays);
        likes += toCount(rec.likes);
        dislikes += toCount(rec.dislikes);
        covered += 1;
      });
    });
    return {
      plays: plays,
      likes: likes,
      dislikes: dislikes,
      covered: covered,
      total: total,
      refreshed: refreshed,
      complete: total > 0 && covered === total,
      fresh: total > 0 && refreshed === total
    };
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      var index = listeners.indexOf(fn);
      if (index >= 0) listeners.splice(index, 1);
    };
  }

  // 是否处于风控暂停中（暂停时间已持久化，关掉页面也有效）
  function isPaused() {
    return Number(store.resumeAt || 0) > Date.now();
  }

  function state() {
    var today = dayKey();
    var freshToday = 0;
    Object.keys(activities).forEach(function (id) {
      activities[id].codes.forEach(function (code) {
        if (store.days[code] === today) freshToday++;
      });
    });
    return {
      queuedNoData: queueNew.length,
      queuedStale: queueStale.length,
      running: running,
      activities: Object.keys(activities).length,
      cached: Object.keys(store.codes).length,
      freshToday: freshToday,
      day: today,
      resumeInMs: Math.max(0, Number(store.resumeAt || 0) - Date.now())
    };
  }

  global.FgexpigMapStats = {
    register: register,
    get: get,
    all: all,
    subscribe: subscribe,
    isPaused: isPaused,
    state: state,
    api: API
  };
})(window);