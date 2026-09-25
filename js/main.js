/* ============================================================
 * 底栏 logo 刻度槽切换
 * - 滚轮切换 / 鼠标长按拖动 / 移动端拖动 / 点击两侧槽位
 * - 每个 logo 对应一个页面（页面唯一标识 = logo 名）
 * - 切换 logo 同步切换壁纸（按画质目录）与音乐
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- 数据：活动列表 ----------
     底栏槽位以「活动核心数据」为准；没有 logo 图的活动仍显示圆角矩形框（空框，无 logo）。
     LOGOS 为核心数据未加载前的兜底列表（内置文件）。 */
  var LOGOS = [
    'JFES110', 'JFES115', 'JFES120', 'JFES130',
    'JFES140', 'JFES150', 'JFES160', 'JFES170',
    'JFES175', 'JFES180', 'JFES190', 'JFES200', 'JZP1200'
  ];
  // 中心两侧各显示的槽位数
  var SIDE_SLOTS = 3;

  // 站点名：网页标题默认值，并作为各活动页标题的后缀（便于搜索引擎分别收录各活动）
  var SITE_NAME = '探索的猪仔官方网站';
  var SITE_DESCRIPTION = '探索的猪仔官方网站：收录 2026 糖豆人拜年纪、奥林PIG运动会、煎炸镇步行街等活动的预告、说明、成就、日程、测评与实绩资料。';

  var IMAGE_QUALITY_MIN = 1;
  var IMAGE_QUALITY_MAX = 5;
  var imageQualityLevel = 1;
  var IMAGE_QUALITY_CATEGORIES = [
    { id: 'wallpaper', label: '壁纸' },
    { id: 'profileMusic', label: '头像与音乐' },
    { id: 'achievements', label: '实绩' },
    { id: 'badges', label: '徽标' },
    { id: 'resources', label: '资源' },
    { id: 'emoji', label: '表情包' }
  ];
  var imageQualityCategories = {
    wallpaper: IMAGE_QUALITY_MIN,
    profileMusic: IMAGE_QUALITY_MIN,
    achievements: IMAGE_QUALITY_MIN,
    badges: IMAGE_QUALITY_MIN,
    resources: IMAGE_QUALITY_MIN,
    emoji: IMAGE_QUALITY_MIN
  };
  var appliedQualitySignature = null;
  var ASSET_REVISION = '20260925perf3';
  function normalizeImageQuality(value) {
    var level = Math.round(Number(value));
    if (!isFinite(level)) return IMAGE_QUALITY_MIN;
    return Math.max(IMAGE_QUALITY_MIN, Math.min(IMAGE_QUALITY_MAX, level));
  }
  function qualityCategoryForUrl(url, categoryOverride) {
    if (categoryOverride && imageQualityCategories[categoryOverride]) return categoryOverride;
    var raw = String(url || '').split(/[?#]/)[0].replace(/\\/g, '/');
    if (/^wallpaper\//i.test(raw)) return 'wallpaper';
    if (/^(profile|music)\//i.test(raw)) return 'profileMusic';
    if (/^logo\//i.test(raw)) return 'badges';
    if (/^emoji\//i.test(raw)) return 'emoji';
    if (/^resources\//i.test(raw)) {
      if (/\/icons\//i.test(raw)) return 'achievements';
      if (/\/pictures\//i.test(raw)) return 'resources';
    }
    return null;
  }
  function qualityLevelForUrl(url, categoryOverride) {
    var category = qualityCategoryForUrl(url, categoryOverride);
    return category && imageQualityCategories[category] ? imageQualityCategories[category] : imageQualityLevel;
  }
  // 图片统一按「原路径 / 分类画质等级 / 文件名.webp」解析。
  function qualityImageUrlAtLevel(url, categoryOverride, level) {
    var raw = String(url || '');
    if (!raw) return raw;
    var suffixIndex = raw.search(/[?#]/);
    var suffix = suffixIndex >= 0 ? raw.slice(suffixIndex) : '';
    var path = suffixIndex >= 0 ? raw.slice(0, suffixIndex) : raw;
    var parts = path.split('/');
    var file = parts.pop() || '';
    var dot = file.lastIndexOf('.');
    var base = dot > 0 ? file.slice(0, dot) : file;
    var qualityLevel = normalizeImageQuality(level);
    if (parts.length && /^[1-5]$/.test(parts[parts.length - 1])) {
      parts[parts.length - 1] = String(qualityLevel);
    } else {
      parts.push(String(qualityLevel));
    }
    parts.push(base + '.webp');
    var result = parts.join('/') + suffix;
    if (ASSET_REVISION) result += (suffix.indexOf('?') >= 0 ? '&' : '?') + 'imgv=' + encodeURIComponent(ASSET_REVISION);
    return result;
  }
  function qualityImageUrl(url, categoryOverride) {
    return qualityImageUrlAtLevel(url, categoryOverride, qualityLevelForUrl(url, categoryOverride));
  }
  function responsiveImageUrl(url, categoryOverride) {
    return qualityImageUrl(url, categoryOverride);
  }
  function bindResponsiveAsset(el, originalUrl, categoryOverride) {
    if (!el) return;
    el.dataset.assetOriginal = String(originalUrl || '');
    if (categoryOverride) el.dataset.assetQualityCategory = categoryOverride;
    else delete el.dataset.assetQualityCategory;
    var nextUrl = qualityImageUrl(originalUrl, categoryOverride);
    if (el.tagName === 'IMG') {
      if (!el.hasAttribute('loading')) el.loading = 'lazy';
      if (!el.hasAttribute('decoding')) el.decoding = 'async';
      el.src = nextUrl;
    } else {
      el.style.backgroundImage = 'url("' + nextUrl + '")';
    }
  }
  function refreshResponsiveAssets(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var assets = scope.querySelectorAll('[data-asset-original]');
    for (var i = 0; i < assets.length; i++) {
      var el = assets[i];
      var nextUrl = qualityImageUrl(el.dataset.assetOriginal, el.dataset.assetQualityCategory || null);
      if (!nextUrl) continue;
      if (el.tagName === 'IMG') el.src = nextUrl;
      else el.style.backgroundImage = 'url("' + nextUrl + '")';
    }
  }

  var runtimeCacheActivityId = '';
  var runtimeCacheWorkerReady = null;

  function postRuntimeCacheActivity(worker) {
    if (!worker) return;
    try {
      worker.postMessage({ type: 'fgexpig-cache-activity', activity: runtimeCacheActivityId });
    } catch (err) {}
  }

  function initRuntimeAssetCache() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    if (navigator.serviceWorker.controller) postRuntimeCacheActivity(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      postRuntimeCacheActivity(navigator.serviceWorker.controller);
    });
    runtimeCacheWorkerReady = navigator.serviceWorker.register('sw.js', { scope: './' })
      .then(function () { return navigator.serviceWorker.ready; })
      .then(function (registration) {
        postRuntimeCacheActivity(registration.active || registration.waiting || registration.installing);
        return registration;
      })
      .catch(function () {
        runtimeCacheWorkerReady = null;
        return null;
      });
  }

  function setRuntimeCacheActivity(id) {
    runtimeCacheActivityId = String(id || '');
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    postRuntimeCacheActivity(navigator.serviceWorker.controller);
    if (runtimeCacheWorkerReady) {
      runtimeCacheWorkerReady.then(function (registration) {
        if (registration) postRuntimeCacheActivity(registration.active || registration.waiting);
      });
    }
  }

  var logoUrl = function (n) { return responsiveImageUrl('logo/' + n + '.png'); };
  var musicUrl = function (n) { return 'music/' + n + '.mp3'; };
  var musicCoverUrl = function (n) { return responsiveImageUrl('music/' + n + '.jpg'); };
  var wallpaperUrl = function (n) { return responsiveImageUrl('wallpaper/' + n + '.png'); };

  /* ---------- DOM ---------- */
  var dock = document.getElementById('dock');
  var track = document.getElementById('dockTrack');
  var pagesWrap = document.getElementById('pages');
  var bgA = document.getElementById('bgA');
  var bgB = document.getElementById('bgB');
  var innerActivityButton = document.getElementById('innerActivityButton');
  var innerActivityButtonImg = document.getElementById('innerActivityButtonImg');
  var outerActivityButton = document.getElementById('outerActivityButton');
  var outerActivityButtonImg = document.getElementById('outerActivityButtonImg');
  var innerActivityPicker = document.getElementById('innerActivityPicker');
  var innerActivityTrack = document.getElementById('innerActivityTrack');

  /* ---------- 状态 ---------- */
  var state = {
    index: LOGOS.length - 1, // 当前选中下标
    offset: 0             // 拖拽中的 fractional 偏移（单位：槽）
  };
  var stagePage = null;
  var stagePageMode = false;
  var initialSelectionSettled = false;
  var slotSize = 80;
  var clickBlocked = false;

  /* ---------- 底栏槽位与页面（按活动列表构建，可随核心数据重建） ---------- */
  var items = [];
  var pages = [];
  var prePh = [];   // 开头前的占位空框（不可选中）
  var postPh = [];  // 结尾后的占位空框（不可选中）
  var logoUnavailable = {}; // logo URL -> 已知不存在
  var dockSig = '';   // 已构建底栏的活动列表签名，避免重复重建
  var EDGE_PAD = 3;   // 首尾各补的空框数量

  var imageExistsCache = {};
  var imageExistsPending = {};
  var activityReleaseVersions = {};
  function imgExists(url) {
    if (Object.prototype.hasOwnProperty.call(imageExistsCache, url)) {
      return Promise.resolve(imageExistsCache[url]);
    }
    if (imageExistsPending[url]) return imageExistsPending[url];
    var request = new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () {
        im.onload = null;
        im.onerror = null;
        resolve(true);
      };
      im.onerror = function () {
        im.onload = null;
        im.onerror = null;
        resolve(false);
      };
      im.src = url;
    });
    imageExistsPending[url] = request;
    request.then(function (ok) {
      imageExistsCache[url] = ok;
      if (imageExistsPending[url] === request) imageExistsPending[url] = null;
    });
    return request;
  }

  // 活动列表：核心数据已加载则只取「已举办」(held!==false) 的活动并保持 ID 顺序；
  // 没有任何已举办数据时回退到内置兜底列表
  function activityIds() {
    var core = (typeof dataStore !== 'undefined' && dataStore && dataStore.core) || [];
    var ids = core
      .filter(function (r) { return r.held !== false; })
      .map(function (r) { return r.id; })
      .filter(Boolean);
    return ids.length ? ids : LOGOS.slice();
  }

  function coreReleaseTimestamp(value) {
    var text = String(value || '').trim();
    var match = text.match(/(\d{4})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*日?/);
    if (!match) return -Infinity;
    var year = Number(match[1]);
    var month = Number(match[2]) - 1;
    var day = Number(match[3]);
    var timestamp = Date.UTC(year, month, day);
    var date = new Date(timestamp);
    if (!isFinite(timestamp) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
      return -Infinity;
    }
    return timestamp;
  }

  // 显示值为 11 时作为默认活动；有多个时取发行日期最新者，日期相同取核心数据中靠后的项。
  function defaultSelectedActivityId() {
    var core = (typeof dataStore !== 'undefined' && dataStore && dataStore.core) || [];
    var bestId = '';
    var bestTime = -Infinity;
    var bestIndex = -1;
    core.forEach(function (row, index) {
      if (!row || !row.id || row.held === false) return;
      var display = Number(row.display);
      var isDefault = display === 11 || row.defaultSelected === true;
      if (!isDefault) return;
      var time = coreReleaseTimestamp(row.releaseDate);
      if (time > bestTime || (time === bestTime && index > bestIndex)) {
        bestId = row.id;
        bestTime = time;
        bestIndex = index;
      }
    });
    return bestId;
  }

  function hashActivityId() {
    try {
      return decodeURIComponent((location.hash || '').replace(/^#/, ''));
    } catch (err) {
      return (location.hash || '').replace(/^#/, '');
    }
  }

  function initialActivityId() {
    var defaultId = defaultSelectedActivityId();
    if (defaultId && LOGOS.indexOf(defaultId) >= 0) return defaultId;
    var hashId = hashActivityId();
    return LOGOS.indexOf(hashId) >= 0 ? hashId : '';
  }

  function buildDockItem(name, i) {
    var el = document.createElement('div');
    el.className = 'dock-item is-empty';
    el.dataset.id = name;
    var resolvedLogoUrl = logoUrl(name);
    if (!logoUnavailable[resolvedLogoUrl]) {
      var img = document.createElement('img');
      img.alt = name;
      img.decoding = 'async';
      img.loading = 'lazy';
      img.draggable = false;
      img.style.opacity = '0';
      img.onload = function () {
        img.style.opacity = '';
        el.classList.remove('is-empty');
      };
      img.onerror = function () {
        logoUnavailable[img.getAttribute('src') || resolvedLogoUrl] = true;
        img.onload = null;
        img.onerror = null;
        img.remove();
        el.classList.add('is-empty');
      };
      el.appendChild(img);
      bindResponsiveAsset(img, 'logo/' + name + '.png');
    }
    el.addEventListener('click', function () {
      if (!clickBlocked) select(i);
    });
    track.appendChild(el);
    return el;
  }

  function buildPage(name) {
    var sec = document.createElement('section');
    sec.className = 'page';
    sec.dataset.page = name;
    pagesWrap.appendChild(sec);
    return sec;
  }

  // 首尾占位空框：只参与显示，不可点击、不可选中
  function makePlaceholder() {
    var el = document.createElement('div');
    el.className = 'dock-item is-empty is-placeholder';
    track.appendChild(el);
    return el;
  }

  // 按活动 ID 列表（重）建底栏槽位与页面
  function buildDock(ids) {
    LOGOS = ids.slice();
    track.innerHTML = '';
    items = [];
    pages = [];
    prePh = [];
    postPh = [];
    for (var p = 0; p < EDGE_PAD; p++) prePh.push(makePlaceholder());
    LOGOS.forEach(function (name, i) {
      items.push(buildDockItem(name, i));
    });
    for (var q = 0; q < EDGE_PAD; q++) postPh.push(makePlaceholder());

    stagePageMode = !shouldUseOuterScreenLayout();
    if (stagePageMode) {
      if (!stagePage || !stagePage.isConnected) {
        disposeSectionCardResources(pagesWrap);
        pagesWrap.innerHTML = '';
        stagePage = buildPage(LOGOS[0] || '');
      } else {
        stagePage.dataset.page = LOGOS[0] || '';
      }
      pages = LOGOS.map(function () { return stagePage; });
    }

    if (!stagePageMode) {
      disposeSectionCardResources(pagesWrap);
      pagesWrap.innerHTML = '';
      LOGOS.forEach(function (name) {
        pages.push(buildPage(name));
      });
    }

    dockSig = LOGOS.join('|');
    invalidateCursorTargetCache();
  }

  /* ---------- 内屏活动选择页 ---------- */
  var innerPickerItems = [];
  var innerPickerPosition = 0;
  var innerPickerDrag = null;
  var innerPickerSnapTimer = 0;
  var innerPickerAnimFrame = 0;
  var innerPickerMoving = false;
  var innerPickerIgnoreClickUntil = 0;

  function innerPickerStep() {
    var item = innerPickerItems[0];
    return (item ? item.offsetHeight : 58) + 18;
  }

  function clampInnerPickerPosition(value) {
    return Math.max(0, Math.min(innerPickerItems.length - 1, value));
  }

  function renderInnerActivityPicker() {
    if (!innerActivityTrack || !innerPickerItems.length) return;
    var step = innerPickerStep();
    innerPickerItems.forEach(function (item, index) {
      var distance = index - innerPickerPosition;
      var abs = Math.abs(distance);
      var scale = Math.max(1, 1.16 - Math.min(1, abs) * 0.16);
      var opacity = Math.max(0.12, 1 - abs * 0.24);
      item.style.transform = 'translate(-50%, -50%) translate3d(0,' + (distance * step).toFixed(2) + 'px,0) scale(' + scale.toFixed(3) + ')';
      item.style.opacity = opacity.toFixed(3);
      item.style.zIndex = String(100 - Math.round(abs * 10));
      item.classList.toggle('is-centered', !innerPickerMoving && abs < 0.16);
    });
  }

  function animateInnerPickerTo(target) {
    if (innerPickerAnimFrame) cancelAnimationFrame(innerPickerAnimFrame);
    innerPickerMoving = true;
    var start = innerPickerPosition;
    var end = clampInnerPickerPosition(target);
    var started = 0;
    function frame(now) {
      if (!started) started = now;
      var progress = Math.min(1, (now - started) / 220);
      var eased = 1 - Math.pow(1 - progress, 3);
      innerPickerPosition = start + (end - start) * eased;
      renderInnerActivityPicker();
      if (progress < 1) innerPickerAnimFrame = requestAnimationFrame(frame);
      else {
        innerPickerAnimFrame = 0;
        innerPickerMoving = false;
        renderInnerActivityPicker();
      }
    }
    innerPickerAnimFrame = requestAnimationFrame(frame);
  }

  function scheduleInnerPickerSnap() {
    if (innerPickerSnapTimer) clearTimeout(innerPickerSnapTimer);
    innerPickerSnapTimer = setTimeout(function () {
      innerPickerSnapTimer = 0;
      animateInnerPickerTo(Math.round(innerPickerPosition));
    }, 120);
  }

  function buildInnerActivityPicker() {
    if (!innerActivityTrack) return;
    var ids = activityIds().slice();
    innerActivityTrack.innerHTML = '';
    innerPickerItems = [];
    ids.forEach(function (id, index) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'inner-activity-picker-item';
      item.dataset.index = String(index);
      item.setAttribute('aria-label', activityTitle(id));
      var img = document.createElement('img');
      img.alt = activityTitle(id);
      img.draggable = false;
      item.appendChild(img);
      bindResponsiveAsset(img, 'logo/' + id + '.png');
      innerActivityTrack.appendChild(item);
      innerPickerItems.push(item);
    });
    innerPickerPosition = Math.max(0, Math.min(ids.length - 1, state.index));
    innerPickerMoving = false;
    requestAnimationFrame(renderInnerActivityPicker);
    renderInnerActivityPicker();
  }

  function cancelInnerPickerOpenAnimations() {
    innerPickerItems.forEach(function (item) {
      if (!item.getAnimations) return;
      item.getAnimations().forEach(function (animation) { animation.cancel(); });
    });
  }

  function animateInnerPickerOpen() {
    if (!innerPickerItems.length || !innerPickerItems[0].animate) return;
    cancelInnerPickerOpenAnimations();
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    innerPickerItems.forEach(function (item, index) {
      var distance = Math.abs(index - innerPickerPosition);
      var endTransform = item.style.transform;
      var endOpacity = item.style.opacity || '1';
      item.animate([
        { transform: 'translate(-50%, -50%) translate3d(0, 0, 0) scale(0.78)', opacity: 0 },
        { transform: endTransform, opacity: Number(endOpacity) }
      ], {
        duration: 360,
        delay: Math.min(220, distance * 32),
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'backwards'
      });
    });
  }

  function openInnerActivityPicker() {
    if (!innerActivityPicker) return;
    buildInnerActivityPicker();
    innerActivityPicker.classList.add('open');
    innerActivityPicker.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('inner-picker-open');
    requestAnimationFrame(function () {
      renderInnerActivityPicker();
      animateInnerPickerOpen();
    });
  }

  function closeInnerActivityPicker() {
    if (!innerActivityPicker) return;
    cancelInnerPickerOpenAnimations();
    innerActivityPicker.classList.remove('open');
    innerActivityPicker.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('inner-picker-open');
  }

  function syncInnerActivityButton(logo) {
    var id = logo || LOGOS[state.index];
    if (!id) return;
    var title = activityTitle(id);
    if (innerActivityButton && innerActivityButtonImg) {
      innerActivityButtonImg.alt = title;
      innerActivityButton.setAttribute('aria-label', '选择活动：' + title);
      bindResponsiveAsset(innerActivityButtonImg, 'logo/' + id + '.png');
    }
    if (outerActivityButton && outerActivityButtonImg) {
      outerActivityButtonImg.alt = title;
      outerActivityButton.setAttribute('aria-label', '选择活动：' + title);
      bindResponsiveAsset(outerActivityButtonImg, 'logo/' + id + '.png');
    }
  }

  function initInnerActivityPicker() {
    if (!innerActivityPicker || !innerActivityTrack) return;
    if (innerActivityButton && innerActivityButton.dataset.ready !== '1') {
      innerActivityButton.dataset.ready = '1';
      innerActivityButton.addEventListener('click', openInnerActivityPicker);
    }
    if (outerActivityButton && outerActivityButton.dataset.ready !== '1') {
      outerActivityButton.dataset.ready = '1';
      outerActivityButton.addEventListener('click', openInnerActivityPicker);
    }
    innerActivityPicker.addEventListener('click', function (e) {
      if (e.target === innerActivityPicker) closeInnerActivityPicker();
    });
    innerActivityTrack.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;
      cancelInnerPickerOpenAnimations();
      if (innerPickerAnimFrame) { cancelAnimationFrame(innerPickerAnimFrame); innerPickerAnimFrame = 0; }
      if (innerPickerSnapTimer) { clearTimeout(innerPickerSnapTimer); innerPickerSnapTimer = 0; }
      innerPickerIgnoreClickUntil = 0;
      innerPickerDrag = {
        startY: e.clientY,
        startPosition: innerPickerPosition,
        moved: false,
        pointerId: e.pointerId,
        step: Math.max(1, innerPickerStep())
      };
      innerPickerMoving = true;
      renderInnerActivityPicker();
      innerActivityTrack.classList.add('pressing');
      try { innerActivityTrack.setPointerCapture(e.pointerId); } catch (err) {}
    });
    innerActivityTrack.addEventListener('pointermove', function (e) {
      if (!innerPickerDrag) return;
      var dy = e.clientY - innerPickerDrag.startY;
      if (!innerPickerDrag.moved && Math.abs(dy) < 3) return;
      innerPickerDrag.moved = true;
      if (e.cancelable) e.preventDefault();
      var nextPosition = clampInnerPickerPosition(innerPickerDrag.startPosition - dy / innerPickerDrag.step);
      if (Math.abs(nextPosition - innerPickerPosition) < 0.001) return;
      innerPickerPosition = nextPosition;
      renderInnerActivityPicker();
    });
    function endPickerDrag() {
      if (!innerPickerDrag) return;
      var drag = innerPickerDrag;
      innerPickerDrag = null;
      try { innerActivityTrack.releasePointerCapture(drag.pointerId); } catch (err2) {}
      innerActivityTrack.classList.remove('pressing');
      var moved = drag.moved;
      if (moved) {
        innerPickerIgnoreClickUntil = performance.now() + 120;
        animateInnerPickerTo(Math.round(innerPickerPosition));
      } else {
        innerPickerMoving = false;
        renderInnerActivityPicker();
      }
    }
    innerActivityTrack.addEventListener('pointerup', endPickerDrag);
    innerActivityTrack.addEventListener('pointercancel', endPickerDrag);
    innerActivityTrack.addEventListener('lostpointercapture', endPickerDrag);
    innerActivityTrack.addEventListener('click', function (e) {
      var item = e.target.closest ? e.target.closest('.inner-activity-picker-item') : null;
      if (!item && e.clientX != null && e.clientY != null) {
        var hit = document.elementFromPoint(e.clientX, e.clientY);
        item = hit && hit.closest ? hit.closest('.inner-activity-picker-item') : null;
      }
      if (!item) return;
      if (performance.now() < innerPickerIgnoreClickUntil) { innerPickerIgnoreClickUntil = 0; return; }
      var index = Number(item.dataset.index);
      if (Math.abs(innerPickerPosition - index) > 0.05) {
        animateInnerPickerTo(index);
        return;
      }
      select(index);
      closeInnerActivityPicker();
    });
    innerActivityTrack.addEventListener('wheel', function (e) {
      if (!innerActivityPicker.classList.contains('open')) return;
      e.preventDefault();
      cancelInnerPickerOpenAnimations();
      innerPickerMoving = true;
      innerPickerPosition = clampInnerPickerPosition(innerPickerPosition + e.deltaY / innerPickerStep());
      renderInnerActivityPicker();
      scheduleInnerPickerSnap();
    }, { passive: false });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && innerActivityPicker.classList.contains('open')) {
        e.preventDefault();
        e.stopPropagation();
        closeInnerActivityPicker();
      }
    }, true);
    window.addEventListener('resize', renderInnerActivityPicker);
  }
  // 统一取槽位元素：j<0 为开头占位，j>=活动数 为结尾占位
  function slotElAt(j) {
    if (j < 0) return prePh[-1 - j];
    if (j >= items.length) return postPh[j - items.length];
    return items[j];
  }

  // 核心数据变化后同步底栏：列表不变则跳过；变化则重建并保持当前选中（找不到则落到最后一个）
  function syncDockWithData() {
    var ids = activityIds();
    var core = (typeof dataStore !== 'undefined' && dataStore && dataStore.core) || [];
    var defaultId = defaultSelectedActivityId();
    var idsChanged = ids.join('|') !== dockSig;
    var applyInitialDefault = !initialSelectionSettled && !!defaultId && ids.indexOf(defaultId) >= 0;
    if (!idsChanged && !applyInitialDefault) {
      if (!initialSelectionSettled && core.length) initialSelectionSettled = true;
      return;
    }

    // 优先保持 hash 指定的活动，其次保持当前选中
    var hashId = hashActivityId();
    var keepId = applyInitialDefault
      ? defaultId
      : (LOGOS.indexOf(hashId) >= 0 ? hashId : LOGOS[state.index]);
    if (idsChanged) buildDock(ids);
    var ni = LOGOS.indexOf(keepId);
    var previousIndex = state.index;
    state.index = ni >= 0 ? ni : LOGOS.length - 1;
    state.offset = 0;
    if (pages.length && previousIndex !== state.index && LOGOS[previousIndex]) {
      if (pages[previousIndex] !== pages[state.index]) releaseActivityView(previousIndex);
      else pages[state.index]._homeRenderToken = (pages[state.index]._homeRenderToken || 0) + 1;
      releaseActivityData(LOGOS[previousIndex]);
    }
    if (stagePageMode && stagePage) stagePage.dataset.page = LOGOS[state.index];
    initialSelectionSettled = !!(applyInitialDefault || core.length);

    render();
    var cur = LOGOS[state.index];
    for (var k = 0; k < pages.length; k++) {
      pages[k].classList.toggle('active', pages[k] === pages[state.index]);
    }
    applyPageMeta(cur);
    updateStartupLogo(cur);
    setRuntimeCacheActivity(cur);
    try { history.replaceState(null, '', '#' + cur); } catch (e) {}
    buildNav(cur);
    fillHomeSection(cur);
    refreshPlayerMedia();
    applyMusic(cur);
    applyWallpaper(cur);
  }

  /* ---------- 槽位渲染 ---------- */
  // 探针元素：用于取得 --slot 经 clamp() 解析后的实际像素值
  // （getComputedStyle 取自定义属性返回的是未解析的 clamp(...) 字符串，不能直接 parseFloat）
  var slotProbe = document.createElement('div');
  slotProbe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;width:var(--slot);';
  document.body.appendChild(slotProbe);

  function readSlotSize() {
    var w = slotProbe.getBoundingClientRect().width;
    if (w > 0) slotSize = w;
  }

  // 中心选中卡片的放大倍数（左右各 3 个侧槽保持原尺寸）
  var CENTER_SCALE = 1.16;

  // 卡片缩放随距虚拟中心的距离插值：|d|=0 → CENTER_SCALE，|d|>=1 → 1
  function scaleFor(d) {
    var t = Math.max(0, 1 - Math.abs(d));
    return 1 + (CENTER_SCALE - 1) * t;
  }

  var centerWidthFrame = 0;
  var centerWidthReady = false;
  function setCenterCardWidth(width) {
    document.documentElement.style.setProperty('--center-card-width', width.toFixed(2) + 'px');
    // 窗口缩放时中间卡片宽度有过渡；顶栏左右端必须跟随每一帧，避免停留在旧视口位置。
    layoutTopbarEdges();
  }

  // 第 2~6 张底栏卡片的最终视觉跨度：5.16 张基础卡宽 + 4 个间距
  function centerCardWidthTarget() {
    if (!items.length) return 0;
    var cardW = items[0].offsetWidth || slotSize;
    var gap = slotSize - cardW;
    if (!(gap > 0)) gap = 10;
    return (5 + (CENTER_SCALE - 1)) * cardW + 4 * gap;
  }

  function animateCenterCardWidth(target) {
    if (document.documentElement.classList.contains('performance-mode')) {
      if (centerWidthFrame) cancelAnimationFrame(centerWidthFrame);
      centerWidthFrame = 0;
      setCenterCardWidth(target);
      settleActiveSectionCards();
      return;
    }
    var root = document.documentElement;
    var currentValue = parseFloat(getComputedStyle(root).getPropertyValue('--center-card-width'));
    var current = isFinite(currentValue) ? currentValue : target;
    if (!centerWidthReady) {
      centerWidthReady = true;
      setCenterCardWidth(target);
      settleActiveSectionCards();
      return;
    }
    if (Math.abs(current - target) < 0.25) {
      setCenterCardWidth(target);
      settleActiveSectionCards();
      return;
    }
    if (centerWidthFrame) cancelAnimationFrame(centerWidthFrame);
    var start = current;
    var startTime = 0;
    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min(1, (ts - startTime) / 500);
      var eased = 1 - Math.pow(1 - progress, 3);
      setCenterCardWidth(start + (target - start) * eased);
      if (progress < 1) {
        centerWidthFrame = requestAnimationFrame(step);
      } else {
        centerWidthFrame = 0;
        settleActiveSectionCards();
      }
    }
    centerWidthFrame = requestAnimationFrame(step);
  }

  function syncCenterCardWidth() {
    if (Math.abs(state.offset) > 0.001) {
      if (centerWidthFrame) {
        cancelAnimationFrame(centerWidthFrame);
        centerWidthFrame = 0;
      }
      return;
    }
    var target = centerCardWidthTarget();
    if (target > 0) animateCenterCardWidth(target);
  }

  var portraitLayoutActive = false;
  var portraitLayoutReady = false;
  var innerScreenLayoutActive = false;
  var innerScreenLayoutReady = false;
  var outerScreenLayoutActive = false;
  var outerScreenLayoutReady = false;

  // 折叠屏内屏分界：小于底栏第 1~7 张卡片的完整视觉跨度 + 2 个卡片间距。
  function shouldUseInnerScreenLayout() {
    if (!items.length) return false;
    readSlotSize();
    var cardW = parseFloat(getComputedStyle(items[0]).width);
    if (!isFinite(cardW) || cardW <= 0) cardW = items[0].offsetWidth || slotSize;
    var gap = slotSize - cardW;
    if (!(gap > 0)) gap = 10;
    var firstToSeventh = (6 + CENTER_SCALE) * cardW + 6 * gap;
    var viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    return viewportWidth < firstToSeventh + 2 * gap;
  }

  // 外屏分界：内屏时顶部导航左边界与右列卡片左边界对齐的位置。
  function shouldUseOuterScreenLayout() {
    var viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    var rootStyle = getComputedStyle(document.documentElement);
    var gap = parseFloat(rootStyle.getPropertyValue('--card-gap')) || 10;
    var navWidth = 224;
    var rightColumnLeft = 16 + (viewportWidth - 32 - gap) / 3 + gap;
    return viewportWidth / 2 - navWidth / 2 < rightColumnLeft;
  }

  // 正屏分界：右侧自适应列小于底栏一张未选中卡片宽度的 2 倍时，切换为两列布局。
  function shouldUsePortraitLayout() {
    if (!items.length) return false;
    readSlotSize();
    var cardW = parseFloat(getComputedStyle(items[0]).width);
    if (!isFinite(cardW) || cardW <= 0) cardW = items[0].offsetWidth || slotSize;
    var gap = slotSize - cardW;
    if (!(gap > 0)) gap = 10;
    var centerWidth = (5 + (CENTER_SCALE - 1)) * cardW + 4 * gap;
    var viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    var sectionContentWidth = Math.max(0, Math.min(viewportWidth, 2 * centerWidth + 2 * gap + 32) - 32);
    var sideWidth = Math.max(0, (sectionContentWidth - centerWidth - 2 * gap) / 2);
    return sideWidth < cardW * 2;
  }

  function updateResponsiveLayoutMode() {
    var nextOuterScreen = shouldUseOuterScreenLayout();
    var nextInnerScreen = shouldUseInnerScreenLayout() || nextOuterScreen;
    var nextPortrait = nextInnerScreen || shouldUsePortraitLayout();
    if (
      innerScreenLayoutReady && nextInnerScreen === innerScreenLayoutActive &&
      portraitLayoutReady && nextPortrait === portraitLayoutActive &&
      outerScreenLayoutReady && nextOuterScreen === outerScreenLayoutActive
    ) return;
    var outerModeChanged = outerScreenLayoutReady && nextOuterScreen !== outerScreenLayoutActive;
    innerScreenLayoutReady = true;
    portraitLayoutReady = true;
    outerScreenLayoutReady = true;
    innerScreenLayoutActive = nextInnerScreen;
    portraitLayoutActive = nextPortrait;
    outerScreenLayoutActive = nextOuterScreen;
    document.documentElement.classList.toggle('inner-screen-layout', nextInnerScreen);
    document.documentElement.classList.toggle('portrait-layout', nextPortrait);
    document.documentElement.classList.toggle('outer-screen-layout', nextOuterScreen);
    syncNonOuterCardBlurLayers();
    if (outerModeChanged && curNavLogo) buildNav(curNavLogo);
    if (!nextOuterScreen) {
      var outerStateSections = document.querySelectorAll('.outer-show-viewer, .outer-show-secondary');
      for (var outerStateIndex = 0; outerStateIndex < outerStateSections.length; outerStateIndex++) {
        outerStateSections[outerStateIndex].classList.remove('outer-show-viewer', 'outer-show-secondary');
      }
    } else {
      var outerFilesSections = document.querySelectorAll('.files-section');
      for (var outerFilesIndex = 0; outerFilesIndex < outerFilesSections.length; outerFilesIndex++) {
        outerFilesSections[outerFilesIndex].classList.remove('portrait-show-schedule');
      }
    }
    if (!nextInnerScreen && innerActivityPicker && innerActivityPicker.classList.contains('open')) closeInnerActivityPicker();
    if (nextPortrait) {
      var cards = document.querySelectorAll('.section-card');
      for (var i = 0; i < cards.length; i++) cards[i].style.removeProperty('width');
    }
    var section = pagesWrap ? pagesWrap.querySelector('.page.active .page-section.active') : null;
    scheduleSectionCardSnap(section || document);
    configureTopActions();
    syncLiquidGlassRenderer(true);
    scheduleTopActionLiquidGlassSync(true);
    requestAnimationFrame(function () { syncLiquidGlassRenderer(true); });
  }

  function render() {
    updateResponsiveLayoutMode();
    readSlotSize();
    var cardW = items[0].offsetWidth || slotSize;
    var gap = slotSize - cardW;
    if (!(gap > 0)) gap = 10;

    var c = state.index + state.offset; // 虚拟中心（拖拽中带小数）
    var n = Math.floor(c + 1e-9);       // 虚拟中心左侧卡片下标
    var f = c - n;                      // 小数部分

    // 任意时刻，相邻卡片之间的视觉间隙恒为 gap：
    // 两张相邻卡片的中心距 = (它们的实际视觉宽度之和)/2 + gap
    function sAt(j) { return scaleFor(j - c); }
    function pitch(j) { return cardW * (sAt(j) + sAt(j + 1)) / 2 + gap; }

    // 锚点：中心左侧卡片随拖动从中心(0)线性滑向左侧一格，
    // 整条卡片带随手势实时移动，中心位置始终被卡片填满，不留空位
    var baseX = -f * pitch(n);

    function cardX(j) {
      var x = baseX;
      if (j >= n) {
        for (var k = n; k < j; k++) x += pitch(k);
      } else {
        for (var k2 = n - 1; k2 >= j; k2--) x -= pitch(k2);
      }
      return x;
    }

    for (var j = -EDGE_PAD; j < items.length + EDGE_PAD; j++) {
      var el = slotElAt(j);
      var isPh = j < 0 || j >= items.length;
      var d = j - c; // 相对虚拟中心的距离（带小数）
      var abs = Math.abs(d);

      var scl = sAt(j);
      var x = cardX(j);

      // 透明度：窗口内（左右各 3 个）始终全不透明；
      // 出界后在约 1 个槽位距离内逐渐淡出，形成截断消失效果而非瞬间消失
      var op;
      if (abs <= SIDE_SLOTS) {
        op = 1;
      } else {
        op = Math.max(0, (SIDE_SLOTS + 1 - abs));
      }

      el.style.transform =
        'translate(-50%,-50%) translateX(' + x.toFixed(2) + 'px) scale(' + scl.toFixed(3) + ')';
      el.style.opacity = op.toFixed(3);
      el.style.zIndex = String(100 - Math.round(abs * 10));
      // 占位框仅供显示：永不接收指针事件，不能被选中
      el.style.pointerEvents = (!isPh && op > 0.02) ? 'auto' : 'none';

      if (!isPh && j === state.index && Math.abs(state.offset) < 0.5) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }
    syncCenterCardWidth();
    scheduleCursorGlowUpdate(600, true);
  }

  /* ---------- 选择某个 logo ---------- */
  var audio = new Audio();
  audio.preload = 'none';
  audio.loop = true;
  audio.volume = 1; // 默认 100%
  var audioSettings = { mainVolume: 1, minigameVolume: 1 };
  var musicPausedByUser = false;
  var interacted = false;
  var startupOverlay = document.getElementById('startupOverlay');
  var startupVideo = document.getElementById('startupVideo');
  var startupLanding = document.getElementById('startupLanding');
  var startupAudioStart = document.getElementById('startupAudioStart');
  var startupLogo = document.getElementById('startupLogo');
  var startupEntryComplete = !startupOverlay;
  var startupAudioPending = false;
  var startupPlayAttempt = 0;
  var startupCrossfadeFrame = 0;
  var startupCrossfading = false;
  var startupLeaving = false;
  var startupCollapseTimer = 0;
  var bgFrontIsA = true;
  var wallpaperLoadToken = 0;
  var outerWallpaperBlurToken = 0;
  var outerWallpaperBlurTimer = 0;
  var outerWallpaperBlurUrl = '';
  var outerWallpaperBlurSource = null;

  /* ---------- 顶部导航：统一固定三项 ---------- */
  var SECTIONS = [
    ['home', '商店'],
    ['files', '资源'],
    ['news', '热点']
  ];
  // 外屏底栏使用实心图形图标，图标随按钮 currentColor 同步变色。
  var NAV_ICON_PATHS = {
    home: 'M994.742857 970.093714a53.833143 53.833143 0 0 1-53.686857 53.906286H82.944a53.833143 53.833143 0 0 1-53.686857-53.906286V394.093714a54.125714 54.125714 0 0 1 20.333714-42.276571L478.72 11.629714a53.467429 53.467429 0 0 1 66.486857 0l429.056 340.041143c12.873143 10.24 20.333714 25.819429 20.333714 42.349714v576.073143h0.146286zM243.858286 538.916571A268.873143 268.873143 0 0 0 512 808.448a268.873143 268.873143 0 0 0 268.214857-269.531429H673.060571c0 89.234286-72.045714 161.645714-160.914285 161.645715-88.868571 0-160.914286-72.411429-160.914286-161.645715H243.858286z',
    files: 'M74.752 285.257143V378.88h874.496V285.403429l30.72 34.596571c30.866286 34.742857 52.882286 44.032 40.521143 117.394286-5.339429 31.817143-19.748571 125.952-34.962286 226.450285l-5.412571 35.620572c-18.066286 119.149714-35.986286 238.08-40.594286 265.801143a65.024 65.024 0 0 1-62.098286 58.733714h-729.965714a65.170286 65.170286 0 0 1-63.049143-58.660571c-7.753143-47.323429-54.125714-357.888-74.020571-485.083429l-3.218286-20.48L3.657143 437.394286C-8.996571 364.032 13.165714 354.742857 43.958857 320l30.72-34.742857z m600.064 397.458286H349.184a51.2 51.2 0 0 0 0 102.4h325.632a51.2 51.2 0 0 0 0-102.4z m146.432-520.777143c4.242286 0.146286 51.638857 3.145143 51.638857 67.364571v67.510857H144.749714v-67.437714c0-67.510857 52.004571-67.510857 52.004572-67.510857l624.493714 0.146286zM719.945143 0H303.908571s-51.931429 0-51.931428 92.891429h520.045714C771.949714 0 719.872 0 719.872 0z',
    news: 'M140.666976 0h742.666048c37.301525 0.07314 67.581586 28.744116 67.508446 64.070855v895.74858c0 48.638263-54.855184 79.503446-99.836434 56.244848l-306.750188-158.568051a70.726617 70.726617 0 0 0-64.509696 0l-306.750188 158.568051C127.940574 1039.322881 73.15853 1008.457698 73.15853 959.819435V64.070855C73.08539 28.744116 103.292311 0.07314 140.666976 0z m408.561409 191.04232c-11.044177-27.573872-52.148995-27.573872-63.193172 0l-44.68869 111.904575a33.644513 33.644513 0 0 1-29.9875 20.552409l-125.874362 5.851219c-31.011464 1.462805-43.737867 38.471769-19.528445 56.903111L364.256705 461.222385a31.157744 31.157744 0 0 1 11.409878 33.425092l-33.05939 115.488447c-8.191707 28.451555 25.087104 51.344452 51.051891 35.107317l105.468233-65.533659a35.253598 35.253598 0 0 1 37.008964 0l105.468233 65.6068c26.037927 16.163994 59.243598-6.728903 51.125031-35.180458l-33.132531-115.488447a31.084604 31.084604 0 0 1 11.409879-33.425092l98.300489-74.895611c24.282561-18.431342 11.556159-55.513446-19.528446-56.976251L623.904575 323.572444a33.644513 33.644513 0 0 1-29.91436-20.625549l-44.68869-111.904575z',
    settings: 'M256.146286 256A256 256 0 0 1 512.292571 0a256 256 0 1 1-256.146285 256z m716.653714 512l33.792-38.473143A51.2 51.2 0 0 1 1024 768v204.8a51.2 51.2 0 0 1-51.2 51.2H51.2a51.2 51.2 0 0 1-51.2-51.2v-204.8a51.2 51.2 0 0 1 17.408-38.473143L51.2 768c-11.264-12.8-22.528-25.6-33.718857-38.546286l0.950857-0.731428 1.974857-1.755429a561.737143 561.737143 0 0 1 32.768-24.868571c30.354286-21.211429 62.171429-40.082286 95.158857-56.612572C229.668571 604.525714 372.077714 563.2 512.292571 563.2c140.214857 0 282.038857 41.398857 363.373715 82.285714 40.740571 20.48 72.923429 40.96 95.085714 56.612572 11.264 7.899429 22.235429 16.237714 32.841143 24.868571l1.974857 1.682286 0.658286 0.512-33.426286 38.838857z'
  };
  var navEl = document.getElementById('topnav');
  var topActionsEl = document.getElementById('topActions');
  var topActionLeft = document.getElementById('topActionLeft');
  var topActionNav = document.getElementById('topActionNav');
  var topActionRight = document.getElementById('topActionRight');
  var topActionRightSecondary = document.createElement('button');
  topActionRightSecondary.className = 'top-action-button top-action-right top-action-right-secondary';
  topActionRightSecondary.id = 'topActionRightSecondary';
  topActionRightSecondary.type = 'button';
  topActionRightSecondary.setAttribute('aria-label', '页面操作');
  if (topActionRight != null) {
    if (topActionRight.parentElement != null) topActionRight.parentElement.insertBefore(topActionRightSecondary, topActionRight);
  }
  var navCache = {};
  var activeNavKey = SECTIONS[0][0]; // 跨活动保持当前导航栏目

  function navItemsForLayout() {
    if (!document.documentElement.classList.contains('outer-screen-layout')) return SECTIONS;
    return SECTIONS.concat([['settings', '设置']]);
  }

  function buildNav(logo) {
    var itemsForLayout = navItemsForLayout();
    var hasActive = itemsForLayout.some(function (item) { return item[0] === activeNavKey; });
    navCache[logo] = {
      items: itemsForLayout,
      active: hasActive ? activeNavKey : itemsForLayout[0][0]
    };
    renderNav(logo);
    layoutTopbarIdentity();
  }

  var sectionCardSnapTimer = 0;

  // 将卡片宽度吸附到设备像素网格，使左右边框处于相同的小数相位，避免同一张卡两侧明暗不一致。
  function snapSectionCardWidths(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var cards = Array.prototype.slice.call(scope.querySelectorAll('.section-card'));
    if (scope.classList && scope.classList.contains('section-card')) cards.unshift(scope);
    if (!cards.length) return;
    if (document.documentElement.classList.contains('portrait-layout')) {
      for (var p = 0; p < cards.length; p++) cards[p].style.removeProperty('width');
      return;
    }
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    var previousWidths = new Array(cards.length);
    var naturalWidths = new Array(cards.length);

    for (var i = 0; i < cards.length; i++) {
      previousWidths[i] = cards[i].style.width;
      cards[i].style.width = '';
    }
    for (var j = 0; j < cards.length; j++) {
      naturalWidths[j] = parseFloat(getComputedStyle(cards[j]).width);
    }
    for (var k = 0; k < cards.length; k++) {
      var card = cards[k];
      var naturalWidth = naturalWidths[k];
      if (!isFinite(naturalWidth) || naturalWidth <= 0) {
        if (previousWidths[k]) card.style.width = previousWidths[k];
        continue;
      }
      var snappedWidth = Math.round(naturalWidth * dpr) / dpr;
      if (Math.abs(snappedWidth - naturalWidth) > 0.01) {
        card.style.width = snappedWidth.toFixed(4) + 'px';
      } else if (previousWidths[k]) {
        card.style.width = '';
      }
    }
  }

  function scheduleSectionCardSnap(root) {
    if (sectionCardSnapTimer) clearTimeout(sectionCardSnapTimer);
    sectionCardSnapTimer = setTimeout(function () {
      sectionCardSnapTimer = 0;
      requestAnimationFrame(function () {
        snapSectionCardWidths(root && root.isConnected ? root : document);
      });
    }, 0);
  }

  function settleActiveSectionCards() {
    var section = pagesWrap ? pagesWrap.querySelector('.page.active .page-section.active') : null;
    scheduleSectionCardSnap(section || document);
    syncLiquidGlassRenderer(true);
  }

  // 卡片被重建或页面被清空时，主动释放观察器和动画帧，避免分离 DOM 被长期持有。
  function disposeSectionCardResources(root) {
    if (!root || !root.querySelectorAll) return;
    var cards = root.querySelectorAll('.section-card');
    for (var i = 0; i < cards.length; i++) {
      if (typeof cards[i]._manualScrollCleanup === 'function') {
        cards[i]._manualScrollCleanup();
      }
    }
    disposeLineMarqueeResources(root);
  }

  function clearScrollIndicators(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var tracks = scope.querySelectorAll('.card-scroll-track.is-visible, .card-scroll-track.is-dragging');
    for (var i = 0; i < tracks.length; i++) {
      tracks[i].classList.remove('is-visible', 'is-dragging');
    }
  }

  // 手动滚动处理：原生滚动条不参与布局，使用覆盖式指示条跟随内容滚动。
  // 滚轮使用缓动动画；指示条支持拖动和点击轨道定位。
  function attachManualScroll(el) {
    var card = el.closest ? el.closest('.section-card') : null;
    if (!card) return;

    var track = document.createElement('div');
    track.className = 'card-scroll-track';
    track.setAttribute('role', 'scrollbar');
    track.setAttribute('aria-orientation', 'vertical');
    var thumb = document.createElement('i');
    thumb.className = 'card-scroll-thumb';
    track.appendChild(thumb);
    card.appendChild(track);

    var hideTimer = 0;
    var syncFrame = 0;
    var scrollAnimationFrame = 0;
    var targetScrollTop = el.scrollTop;
    var userInputAt = 0;
    var dragState = null;
    var resizeObserver = null;
    var mutationObserver = null;
    var fallbackResizeListener = false;
    var startupSyncFrame = 0;

    function maxScrollTop() { return Math.max(0, el.scrollHeight - el.clientHeight); }
    function clampScrollTop(value) { return Math.max(0, Math.min(maxScrollTop(), value)); }
    function canScroll() { return el.scrollHeight > el.clientHeight; }

    function syncThumb(clientHeight, scrollHeight) {
      var ratio = Math.min(1, clientHeight / scrollHeight);
      var thumbHeight = Math.min(clientHeight, Math.max(24, Math.round(clientHeight * ratio)));
      var maxScroll = scrollHeight - clientHeight;
      var maxThumbTop = clientHeight - thumbHeight;
      var thumbTop = maxScroll > 0 ? (el.scrollTop / maxScroll) * maxThumbTop : 0;
      thumb.style.height = thumbHeight.toFixed(2) + 'px';
      thumb.style.transform = 'translate3d(-50%, ' + thumbTop.toFixed(2) + 'px, 0)';

      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', String(Math.round(maxScroll)));
      track.setAttribute('aria-valuenow', String(Math.round(el.scrollTop)));
    }

    function syncScrollbar() {
      var clientHeight = el.clientHeight;
      var scrollHeight = el.scrollHeight;
      var scrollable = scrollHeight > clientHeight;
      track.classList.toggle('is-scrollable', scrollable);
      if (!scrollable) {
        track.classList.remove('is-visible', 'is-dragging');
        return;
      }

      var cardRect = card.getBoundingClientRect();
      var bodyRect = el.getBoundingClientRect();
      var trackWidth = track.offsetWidth || 14;
      var gap = Math.max(0, cardRect.right - bodyRect.right);
      track.style.top = (bodyRect.top - cardRect.top).toFixed(2) + 'px';
      track.style.height = clientHeight + 'px';
      track.style.right = Math.max(0, (gap - trackWidth) / 2).toFixed(2) + 'px';
      syncThumb(clientHeight, scrollHeight);
    }

    function scheduleSync() {
      if (syncFrame) return;
      syncFrame = requestAnimationFrame(function () {
        syncFrame = 0;
        syncScrollbar();
      });
    }

    function showScrollbar(keepVisible, skipSync) {
      if (!canScroll()) return;
      if (!skipSync) syncScrollbar();
      track.classList.add('is-visible');
      if (hideTimer) clearTimeout(hideTimer);
      if (!keepVisible) {
        hideTimer = setTimeout(function () {
          hideTimer = 0;
          if (!dragState) track.classList.remove('is-visible');
        }, 3000);
      }
    }

    function stopScrollAnimation() {
      if (scrollAnimationFrame) cancelAnimationFrame(scrollAnimationFrame);
      scrollAnimationFrame = 0;
      targetScrollTop = el.scrollTop;
    }
    el._stopManualScrollAnimation = stopScrollAnimation;

    function disposeManualScroll() {
      if (hideTimer) clearTimeout(hideTimer);
      if (syncFrame) cancelAnimationFrame(syncFrame);
      if (scrollAnimationFrame) cancelAnimationFrame(scrollAnimationFrame);
      if (startupSyncFrame) cancelAnimationFrame(startupSyncFrame);
      hideTimer = 0;
      syncFrame = 0;
      scrollAnimationFrame = 0;
      startupSyncFrame = 0;
      if (resizeObserver) resizeObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
      if (fallbackResizeListener) window.removeEventListener('resize', scheduleSync);
      resizeObserver = null;
      mutationObserver = null;
      dragState = null;
      if (track && track.parentNode) track.parentNode.removeChild(track);
      card._manualScrollCleanup = null;
      el._stopManualScrollAnimation = null;
    }
    card._manualScrollCleanup = disposeManualScroll;

    function animateScrollTo(value, duration) {
      targetScrollTop = clampScrollTop(value);
      if (scrollAnimationFrame) cancelAnimationFrame(scrollAnimationFrame);
      var start = el.scrollTop;
      var delta = targetScrollTop - start;
      if (Math.abs(delta) < 0.5) {
        el.scrollTop = targetScrollTop;
        scrollAnimationFrame = 0;
        return;
      }
      var startedAt = performance.now();
      function step(now) {
        var progress = Math.min(1, (now - startedAt) / Math.max(1, duration));
        var eased = 1 - Math.pow(1 - progress, 3);
        el.scrollTop = start + delta * eased;
        if (progress < 1) {
          scrollAnimationFrame = requestAnimationFrame(step);
        } else {
          scrollAnimationFrame = 0;
          targetScrollTop = el.scrollTop;
        }
      }
      scrollAnimationFrame = requestAnimationFrame(step);
    }

    function noteUserScrollInput() {
      userInputAt = performance.now();
    }

    el.addEventListener('wheel', function (e) {
      if (!canScroll()) return;
      e.preventDefault();
      e.stopPropagation();
      var delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 16;
      else if (e.deltaMode === 2) delta *= el.clientHeight;
      var base = scrollAnimationFrame ? targetScrollTop : el.scrollTop;
      targetScrollTop = clampScrollTop(base + delta);
      var distance = Math.abs(targetScrollTop - el.scrollTop);
      noteUserScrollInput();
      animateScrollTo(targetScrollTop, Math.min(360, 160 + distance * 0.35));
      showScrollbar(false, true);
    }, { passive: false });

    el.addEventListener('scroll', function () {
      scheduleSync();
      invalidateCursorTargetCache();
      if (performance.now() - userInputAt < 800) showScrollbar(false, true);
    }, { passive: true });

    el.addEventListener('touchstart', function () {
      noteUserScrollInput();
      stopScrollAnimation();
    }, { passive: true });
    el.addEventListener('touchmove', function () {
      noteUserScrollInput();
      showScrollbar(false, true);
    }, { passive: true });

    el.addEventListener('pointerdown', noteUserScrollInput, { passive: true });
    el.addEventListener('keydown', function (event) {
      var key = event.key;
      if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'PageUp' || key === 'PageDown' ||
          key === 'Home' || key === 'End' || key === ' ') {
        noteUserScrollInput();
      }
    }, { passive: true });

    function endScrollDrag(pointerId) {
      if (!dragState || (pointerId != null && dragState.pointerId !== pointerId)) return;
      try {
        if (track.hasPointerCapture && track.hasPointerCapture(dragState.pointerId)) {
          track.releasePointerCapture(dragState.pointerId);
        }
      } catch (err) {}
      dragState = null;
      track.classList.remove('is-dragging');
      showScrollbar(false);
    }

    track.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || !canScroll()) return;
      e.preventDefault();
      stopScrollAnimation();
      noteUserScrollInput();
      showScrollbar(false);

      var thumbRect = thumb.getBoundingClientRect();
      var onThumb = e.clientY >= thumbRect.top - 6 && e.clientY <= thumbRect.bottom + 6;
      if (onThumb) {
        showScrollbar(true);
        dragState = {
          pointerId: e.pointerId,
          startY: e.clientY,
          startScrollTop: el.scrollTop,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          maxScroll: maxScrollTop(),
          maxThumbTop: Math.max(0, el.clientHeight - thumb.offsetHeight),
          moved: false
        };
        track.classList.add('is-dragging');
        try { track.setPointerCapture(e.pointerId); } catch (err) {}
        return;
      }

      var trackRect = track.getBoundingClientRect();
      var maxThumbTop = Math.max(0, el.clientHeight - thumb.offsetHeight);
      var wantedThumbTop = Math.max(0, Math.min(maxThumbTop, e.clientY - trackRect.top - thumb.offsetHeight / 2));
      animateScrollTo(maxThumbTop ? (wantedThumbTop / maxThumbTop) * maxScrollTop() : 0, 240);
    });

    track.addEventListener('pointermove', function (e) {
      if (!dragState || dragState.pointerId !== e.pointerId) return;
      e.preventDefault();
      var deltaY = e.clientY - dragState.startY;
      if (!dragState.moved && Math.abs(deltaY) > 2) dragState.moved = true;
      var scrollDelta = dragState.maxThumbTop
        ? (deltaY / dragState.maxThumbTop) * dragState.maxScroll
        : 0;
      el.scrollTop = Math.max(0, Math.min(dragState.maxScroll, dragState.startScrollTop + scrollDelta));
      noteUserScrollInput();
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = 0;
      }
      track.classList.add('is-visible');
      syncThumb(dragState.clientHeight, dragState.scrollHeight);
    }, { passive: false });

    track.addEventListener('pointerup', function (e) { endScrollDrag(e.pointerId); });
    track.addEventListener('pointercancel', function (e) { endScrollDrag(e.pointerId); });
    track.addEventListener('lostpointercapture', function (e) { endScrollDrag(e.pointerId); });

    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(scheduleSync);
      resizeObserver.observe(card);
      resizeObserver.observe(el);
    } else {
      window.addEventListener('resize', scheduleSync);
      fallbackResizeListener = true;
    }
    if (window.MutationObserver) {
      mutationObserver = new MutationObserver(scheduleSync);
      mutationObserver.observe(el, { childList: true, subtree: true });
    }
    startupSyncFrame = requestAnimationFrame(function () {
      startupSyncFrame = 0;
      syncScrollbar();
    });
    return disposeManualScroll;
  }

  /* ---------- 热点页面：标题 / 内容 / 评论 ---------- */
  var HOTSPOT_KEY = 'fgexpig_hotspots_v1';
  var HOTSPOT_MAGIC = 'FGEXPIG-HOTSPOT-BACKUP';
  var HOTSPOT_POINT_MAGIC = 'FGEXPIG-HOTSPOT-POINT-BACKUP';
  var hotspotStore = { hotspots: {}, points: {} };
  var hotspotMemory = {};
  var hotspotUi = {};
  var hotspotActivityStats = {};
  var hotspotAggregatedStats = {};
  var hotspotLeaderboardStatsReady = false;

  function hotspotPostsOf(id) {
    var rows = (hotspotStore.hotspots || {})[id];
    return Array.isArray(rows) ? rows : [];
  }

  function hotspotPointsOf(id) {
    var rows = (hotspotStore.points || {})[id];
    return Array.isArray(rows) ? rows : [];
  }

  function hotspotState(id) {
    if (!hotspotMemory[id]) {
      hotspotMemory[id] = {
        posts: hotspotPostsOf(id),
        postsLoaded: Object.prototype.hasOwnProperty.call(hotspotStore.hotspots || {}, id),
        postsPromise: null,
        points: hotspotPointsOf(id),
        pointsLoaded: Object.prototype.hasOwnProperty.call(hotspotStore.points || {}, id),
        pointsPromise: null
      };
    }
    if (!hotspotUi[id]) hotspotUi[id] = { query: '', selectedId: null, expanded: {}, selectedKeywords: [] };
    var state = hotspotMemory[id];
    if (!state.postsLoaded && !state.postsPromise) {
      state.postsPromise = loadDataFragment('news', id).then(function (loaded) {
        state.postsLoaded = !!loaded;
        state.posts = hotspotPostsOf(id);
      });
    }
    if (!state.pointsLoaded && !state.pointsPromise) {
      state.pointsPromise = loadDataFragment('points', id).then(function (loaded) {
        state.pointsLoaded = !!loaded;
        state.points = hotspotPointsOf(id);
      });
    }
    return state;
  }

  function hotspotUiState(id) {
    hotspotState(id);
    return hotspotUi[id];
  }

  function normalizeHotspotComment(row) {
    if (typeof row === 'string') {
      var text = row.trim();
      var sep = text.search(/[：:]/);
      if (sep > 0) return { name: text.slice(0, sep).trim(), text: text.slice(sep + 1).trim(), replies: [] };
      return { name: '匿名', text: text, replies: [] };
    }
    row = row || {};
    return {
      name: String(row.name || row.author || row.nick || '匿名').trim(),
      text: String(row.text || row.content || row.body || ''),
      replies: Array.isArray(row.replies) ? row.replies.map(normalizeHotspotComment) : []
    };
  }

  function normalizeHotspotPost(row, index) {
    row = row || {};
    var comments = Array.isArray(row.comments) ? row.comments.map(normalizeHotspotComment) : [];
    var count = Number(row.commentCount);
    if (!isFinite(count) || count < 0) count = 0;
    return {
      id: String(row.id || ('hotspot-' + index)),
      title: String(row.title || row.name || ('热点 ' + (index + 1))).trim(),
      time: String(row.time || row.date || '').trim(),
      content: String(row.content || row.text || row.body || ''),
      comments: comments,
      commentCount: count || 0
    };
  }

  function normalizeHotspotPosts(rows) {
    if (!Array.isArray(rows)) rows = rows ? [rows] : [];
    return rows.map(normalizeHotspotPost).filter(function (post) {
      return !!(post && (post.title || post.content || post.comments.length));
    });
  }

  function normalizeHotspotPoints(rows) {
    if (!Array.isArray(rows)) rows = rows ? [rows] : [];
    var seen = {};
    return rows.map(function (row) { return String(row || '').trim(); }).filter(function (point) {
      if (!point || seen[point]) return false;
      seen[point] = true;
      return true;
    });
  }

  function parseHotspotPoints(text) {
    return normalizeHotspotPoints(String(text || '').split(/[\r\n，,、;；]+/));
  }

  function parseHotspotJson(text) {
    var parsed = JSON.parse(String(text || ''));
    var rows = Array.isArray(parsed) ? parsed : ((parsed && (parsed.posts || parsed.data || parsed.items)) || []);
    return Array.isArray(rows) ? rows.map(normalizeHotspotPost) : [];
  }

  function hotspotCommentIndent(line) {
    var tabs = 0;
    var spaces = 0;
    for (var i = 0; i < line.length; i++) {
      if (line.charAt(i) === '\t') tabs += 1;
      else if (line.charAt(i) === ' ') spaces += 1;
      else break;
    }
    return tabs + Math.ceil(spaces / 4);
  }

  function hotspotCommentFromLine(line) {
    var raw = String(line || '').replace(/^[\t ]+/, '').trim();
    if (!raw) return null;
    var sep = raw.search(/[：:]/);
    if (sep <= 0) return { level: hotspotCommentIndent(line), comment: normalizeHotspotComment(raw) };
    return {
      level: hotspotCommentIndent(line),
      comment: normalizeHotspotComment({ name: raw.slice(0, sep).trim(), text: raw.slice(sep + 1).trim(), replies: [] })
    };
  }

  function buildHotspotCommentTree(rows) {
    var roots = [];
    var stack = [];
    var baseLevel = null;
    rows.forEach(function (entry) {
      var level = Math.max(0, Number(entry.level) || 0);
      var comment = entry.comment;
      if (!comment) return;
      if (baseLevel === null) baseLevel = level;
      var depth = Math.max(0, level - baseLevel);
      if (depth === 0) {
        roots.push(comment);
        stack = [comment];
        return;
      }
      while (stack.length > depth) stack.pop();
      if (!stack.length) {
        roots.push(comment);
        stack = [comment];
        return;
      }
      var parent = stack[stack.length - 1];
      parent.replies.push(comment);
      stack.push(comment);
    });
    return roots;
  }

  // resources/<id>/news.txt：日期时间 / 标题 / --- / 正文 / --- / 缩进评论
  function parseNewsTxt(text) {
    var lines = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    var posts = [];
    var current = null;
    var mode = 'idle';

    function finishPost() {
      if (!current) return;
      current.comments = buildHotspotCommentTree(current.commentRows || []);
      current.content = (current.contentLines || []).join('\n').replace(/\n+$/, '');
      posts.push(normalizeHotspotPost(current, posts.length));
      current = null;
      mode = 'idle';
    }

    lines.forEach(function (line) {
      var timestamp = line.trim().match(/^\d{4}\/\d{1,2}\/\d{1,2}\/\d{1,2}:\d{2}$/);
      if (timestamp) {
        finishPost();
        current = { time: line.trim(), title: '', contentLines: [], commentRows: [] };
        mode = 'title';
        return;
      }
      if (!current) return;
      var value = line.trim();
      if (mode === 'title') {
        if (!value) return;
        current.title = value;
        mode = 'content-marker';
        return;
      }
      if (mode === 'content-marker') {
        if (!value) return;
        if (value === '---') mode = 'content';
        return;
      }
      if (mode === 'content') {
        if (value === '---') mode = 'comments';
        else current.contentLines.push(line);
        return;
      }
      if (mode === 'comments') {
        if (!value) return;
        var entry = hotspotCommentFromLine(line);
        if (entry) current.commentRows.push(entry);
      }
    });
    finishPost();
    return normalizeHotspotPosts(posts);
  }

  function saveHotspots() {
    try { void 0 && localStorage.setItem(HOTSPOT_KEY, JSON.stringify(hotspotStore)); } catch (err) {}
  }

  function loadHotspots() {
    try {
      var raw = null;
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      var rows = (parsed && parsed.hotspots) || {};
      var pointRows = (parsed && parsed.points) || {};
      hotspotStore = { hotspots: {}, points: {} };
      Object.keys(rows).forEach(function (id) {
        hotspotStore.hotspots[id] = normalizeHotspotPosts(rows[id]);
      });
      Object.keys(pointRows).forEach(function (id) {
        hotspotStore.points[id] = normalizeHotspotPoints(pointRows[id]);
      });
      return true;
    } catch (err) {}
    return false;
  }

  function hotspotCommentsTotal(posts) {
    return (posts || []).reduce(function (total, post) {
      return total + hotspotPostCommentCount(post);
    }, 0);
  }

  function applyHotspotData(id) {
    var ids = id ? [id] : Object.keys(hotspotStore.hotspots || {});
    ids.forEach(function (activityId) {
      var posts = hotspotStore.hotspots[activityId];
      if (!Array.isArray(posts)) posts = normalizeHotspotPosts(posts);
      hotspotStore.hotspots[activityId] = posts;
      setHotspotActivityStats(activityId, posts);
      if (hotspotMemory[activityId]) hotspotMemory[activityId].posts = posts;
      else hotspotState(activityId).posts = posts;
      if (hotspotUi[activityId] && !posts.length) {
        hotspotUi[activityId].selectedId = null;
      }
      var meta = document.getElementById('hotspotMeta');
      if (meta && (!id || dmActiveCat === activityId)) {
        var count = posts.length;
        meta.textContent = count
          ? ('已加载 ' + count + ' 个帖子 · ' + hotspotCommentsTotal(posts) + ' 条评论')
          : '未加载';
      }
      var pageIndex = LOGOS.indexOf(activityId);
      var page = pageIndex >= 0 ? pages[pageIndex] : null;
      var section = page ? page.querySelector('.page-section[data-section="news"]') : null;
      if (section && page.classList.contains('active') && page.dataset.page === activityId) renderHotspotSection(activityId, section);
    });
    refreshUserExperience();
  }

  function applyHotspotPoints(id) {
    var ids = id ? [id] : Object.keys(hotspotStore.points || {});
    ids.forEach(function (activityId) {
      var points = hotspotStore.points[activityId];
      if (!Array.isArray(points)) points = normalizeHotspotPoints(points);
      hotspotStore.points[activityId] = points;
      var state = hotspotState(activityId);
      state.points = points;
      state.pointsLoaded = true;
      state.pointsPromise = null;
      var ui = hotspotUiState(activityId);
      ui.selectedKeywords = (ui.selectedKeywords || []).filter(function (point) {
        return state.points.indexOf(point) >= 0;
      });
      var meta = document.getElementById('keywordMeta');
      if (meta && (!id || dmActiveCat === activityId)) {
        meta.textContent = state.points.length ? ('已加载 ' + state.points.length + ' 个关键词') : '未加载';
      }
      var pageIndex = LOGOS.indexOf(activityId);
      var page = pageIndex >= 0 ? pages[pageIndex] : null;
      var section = page ? page.querySelector('.page-section[data-section="news"]') : null;
      if (section && page.classList.contains('active') && page.dataset.page === activityId) renderHotspotKeywordChips(activityId, section);
    });
  }

  function exportHotspot(id) {
    var posts = hotspotPostsOf(id);
    var data = { hotspots: {} };
    data.hotspots[id] = posts;
    var payload = { magic: HOTSPOT_MAGIC, version: 1, exportedAt: new Date().toISOString(), data: data };
    payload.checksum = checksum(JSON.stringify(data));
    var content =
      '/* FGEXPIG 热点数据备份(' + id + ')（自动生成，请勿手动编辑）\n' +
      ' * 导出时间: ' + payload.exportedAt + '\n' +
      ' */\n' +
      'window.FGEXPIG_HOTSPOT_BACKUP = ' + JSON.stringify(payload, null, 2) + ';\n';
    var blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fgexpig_hotspot_' + id + '.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }

  function importHotspotFile(id, file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      try {
        var posts;
        var points = null;
        if (/\.js$/i.test(file.name) && text.indexOf(HOTSPOT_MAGIC) >= 0) {
          var m = text.match(/window\.FGEXPIG_HOTSPOT_BACKUP\s*=\s*(\{[\s\S]*\});/);
          if (!m) throw new Error('format');
          var payload = JSON.parse(m[1]);
          if (!payload || payload.magic !== HOTSPOT_MAGIC) throw new Error('magic');
          if (payload.checksum !== checksum(JSON.stringify(payload.data))) throw new Error('checksum');
          posts = normalizeHotspotPosts((payload.data && payload.data.hotspots && payload.data.hotspots[id]) || payload.data);
          if (payload.data && payload.data.points && Object.prototype.hasOwnProperty.call(payload.data.points, id)) {
            points = normalizeHotspotPoints(payload.data.points[id]);
          }
        } else {
          posts = parseNewsTxt(text);
          if (!posts.length) throw new Error('empty');
        }
        if (posts) hotspotStore.hotspots[id] = posts;
        if (points) hotspotStore.points[id] = points;
        saveHotspots();
        if (posts) applyHotspotData(id);
        if (points) applyHotspotPoints(id);
        if (points && !posts) alert('导入成功：' + points.length + ' 个关键词');
        else alert('导入成功：' + (posts || []).length + ' 个帖子，' + hotspotCommentsTotal(posts || []) + ' 条评论');
      } catch (err) {
        var msg = err.message === 'checksum' ? '备份校验未通过' : err.message === 'empty' ? '未解析到有效热点数据' : err.message === 'empty-points' ? '未解析到有效关键词' : '文件格式错误';
        alert('导入失败：' + msg);
      }
    };
    reader.readAsText(file);
  }

  function exportHotspotPoints(id) {
    var points = hotspotPointsOf(id);
    var data = { points: {} };
    data.points[id] = points;
    var payload = { magic: HOTSPOT_POINT_MAGIC, version: 1, exportedAt: new Date().toISOString(), data: data };
    payload.checksum = checksum(JSON.stringify(data));
    var content =
      '/* FGEXPIG 热点关键词备份(' + id + ')（自动生成，请勿手动编辑）\n' +
      ' * 导出时间: ' + payload.exportedAt + '\n' +
      ' */\n' +
      'window.FGEXPIG_HOTSPOT_POINT_BACKUP = ' + JSON.stringify(payload, null, 2) + ';\n';
    var blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fgexpig_hotspot_points_' + id + '.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }

  function importHotspotPointsFile(id, file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      try {
        var points;
        if (/\.js$/i.test(file.name) && text.indexOf(HOTSPOT_POINT_MAGIC) >= 0) {
          var m = text.match(/window\.FGEXPIG_HOTSPOT_POINT_BACKUP\s*=\s*(\{[\s\S]*\});/);
          if (!m) throw new Error('format');
          var payload = JSON.parse(m[1]);
          if (!payload || payload.magic !== HOTSPOT_POINT_MAGIC) throw new Error('magic');
          if (payload.checksum !== checksum(JSON.stringify(payload.data))) throw new Error('checksum');
          points = normalizeHotspotPoints((payload.data && payload.data.points && payload.data.points[id]) || []);
        } else {
          points = parseHotspotPoints(text);
        }
        if (!points.length) throw new Error('empty-points');
        hotspotStore.points[id] = points;
        saveHotspots();
        applyHotspotPoints(id);
        alert('导入成功：' + points.length + ' 个关键词');
      } catch (err) {
        var msg = err.message === 'checksum' ? '备份校验未通过' : err.message === 'empty-points' ? '未解析到有效关键词' : '文件格式错误';
        alert('导入失败：' + msg);
      }
    };
    reader.readAsText(file);
  }

  function hotspotCommentsCount(comments) {
    var total = 0;
    (comments || []).forEach(function (comment) {
      total += 1 + hotspotCommentsCount(comment && comment.replies);
    });
    return total;
  }

  function hotspotPostCommentCount(post) {
    if (!post) return 0;
    var count = hotspotCommentsCount(post.comments);
    return count || Number(post.commentCount) || 0;
  }

  // 评论与回复表情包：以反斜杠 + emoji 文件名触发，例如 \蛋仔凝视。
  var HOTSPOT_EMOJI_FILES = {
    '蛋仔凝视': 'emoji/蛋仔凝视.gif',
    '逗乐我了': 'emoji/逗乐我了.png',
    '多栋难过': 'emoji/多栋难过.png',
    '粉红兔子期待': 'emoji/粉红兔子期待.png',
    '叽叽喳喳新年特辑元宵节': 'emoji/叽叽喳喳新年特辑元宵节.gif',
    '吉伊憋笑': 'emoji/吉伊憋笑.gif',
    '吉伊加油': 'emoji/吉伊加油.gif',
    '家猫们谁懂啊': 'emoji/家猫们谁懂啊.gif',
    '鲤鱼惊讶': 'emoji/鲤鱼惊讶.png',
    '牛微笑': 'emoji/牛微笑.jpeg',
    '糖豆人盆栽好耶': 'emoji/糖豆人盆栽好耶.jpeg',
    '仙女笑': 'emoji/仙女笑.png',
    '香蕉猫拒绝': 'emoji/香蕉猫拒绝.gif',
    '小猫打滚': 'emoji/小猫打滚.gif',
    '小熊不好意思': 'emoji/小熊不好意思.gif',
    '冤枉啊清汤大老爷': 'emoji/冤枉啊清汤大老爷.jpeg',
    '猪的天': 'emoji/猪的天.png',
    'm豆拜': 'emoji/m豆拜.gif'
  };
  var HOTSPOT_EMOJI_KEYS = Object.keys(HOTSPOT_EMOJI_FILES).sort(function (a, b) {
    return b.length - a.length;
  });

  function hotspotEmojiAt(text, index) {
    if (text.charAt(index) !== '\\') return null;
    var tail = text.slice(index + 1);
    for (var i = 0; i < HOTSPOT_EMOJI_KEYS.length; i++) {
      var key = HOTSPOT_EMOJI_KEYS[i];
      if (tail.slice(0, key.length).toLowerCase() !== key.toLowerCase()) continue;
      var consumed = key.length;
      var extension = tail.slice(consumed).match(/^\.?(?:gif|png|jpe?g)/i);
      if (extension) consumed += extension[0].length;
      return { name: key, file: HOTSPOT_EMOJI_FILES[key], length: consumed + 1 };
    }

    // 新表情包无需再维护静态映射：按 \名称 提取候选文件名，
    // 后续由 img.onerror 在没有对应图片时回退为原文。
    var dynamic = tail.match(/^([^\s\\/，。！？!?、；;：:]+?)(?:\.(?:gif|png|jpe?g|webp))?(?=\s|$|[\s，。！？!?、；;：:])/i);
    if (dynamic && dynamic[1]) {
      return {
        name: dynamic[1],
        file: 'emoji/' + dynamic[1] + '.webp',
        length: dynamic[0].length + 1
      };
    }
    return null;
  }

  // 表情包必须作为单条独立文本发送，且文件名不含标点或空白。
  var HOTSPOT_EMOJI_NAME_INVALID_RE = /[\s\/\\.,!?;:'"()\[\]{}<>《》「」『』【】〔〕、，。！？；：…—～~·•\-_+=|@#$%^&*]/;

  function hotspotStandaloneCandidate(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text || text.charAt(0) !== '\\' || text.length < 2) return null;
    var body = text.slice(1);
    if (body.indexOf('\\') >= 0 || HOTSPOT_EMOJI_NAME_INVALID_RE.test(body)) return null;
    return text;
  }

  function hotspotStandaloneEmoji(value) {
    var text = hotspotStandaloneCandidate(value);
    if (!text) return null;
    var emoji = hotspotEmojiAt(text, 0);
    if (!emoji || emoji.length !== text.length) return null;
    return emoji;
  }

  function appendHotspotCommentContent(parent, value) {
    var text = String(value == null ? '' : value);
    var emoji = hotspotStandaloneEmoji(text);
    if (!emoji) {
      parent.appendChild(document.createTextNode(text));
      return parent;
    }
    var area = document.createElement('span');
    area.className = 'hotspot-emoji';
    var image = document.createElement('img');
    var rawText = text.trim();
    image.alt = '\\' + emoji.name;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.draggable = false;
    area.appendChild(image);
    image.onerror = function () {
      if (area.parentNode) area.parentNode.replaceChild(document.createTextNode(rawText), area);
    };
    parent.appendChild(area);
    if (window.FGEXPIG_EMOJI_TRIM) {
      window.FGEXPIG_EMOJI_TRIM.enhance(area, image, emoji.name);
    }
    bindResponsiveAsset(image, emoji.file);
    return parent;
  }

  function hotspotCommentSearchText(comments) {
    return (comments || []).map(function (comment) {
      return (comment.name || '') + ' ' + (comment.text || '') + ' ' + hotspotCommentSearchText(comment.replies);
    }).join(' ');
  }

  function hotspotPostMatches(post, query, keywords) {
    var haystack = [post.title, post.time, post.content, hotspotCommentSearchText(post.comments)].join(' ').toLowerCase();
    if (query && haystack.indexOf(query) < 0) return false;
    if (keywords && keywords.length) {
      var hasKeyword = keywords.some(function (keyword) {
        return haystack.indexOf(String(keyword || '').trim().toLowerCase()) >= 0;
      });
      if (!hasKeyword) return false;
    }
    return true;
  }

  function hotspotPostTimeValue(value) {
    var match = String(value || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5])
    );
  }

  function formatHotspotTime(value) {
    var text = String(value || '').trim();
    var match = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})[\/ ](\d{1,2}):(\d{2})$/);
    if (!match) return text;
    function pad2(part) { return String(Number(part)).padStart(2, '0'); }
    return match[1] + '-' + pad2(match[2]) + '-' + pad2(match[3]) + ' ' + pad2(match[4]) + ':' + match[5];
  }

  function compareHotspotPostsNewest(a, b) {
    var av = hotspotPostTimeValue(a && a.time);
    var bv = hotspotPostTimeValue(b && b.time);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av;
  }

  // 解析内容转义：\n \t \c \r \b \i \bi \m \e，以及 \#RRGGBB ... \\ 颜色范围。
  function renderHotspotRichText(value) {
    var root = document.createElement('div');
    root.className = 'hotspot-rich-text';
    var line = document.createElement('div');
    line.className = 'hotspot-rich-line';
    root.appendChild(line);

    var currentSpan = null;
    var currentKey = '';
    var bold = false;
    var italic = false;
    var size = '';
    var color = '';
    var textValue = String(value == null ? '' : value);

    function styleKey() { return (bold ? 'b' : '') + (italic ? 'i' : '') + '|' + size + '|' + color; }
    function ensureSpan() {
      var key = styleKey();
      if (currentSpan && currentKey === key) return currentSpan;
      var span = document.createElement('span');
      if (bold) span.style.fontWeight = '700';
      if (italic) span.style.fontStyle = 'italic';
      if (size === 'm') span.classList.add('hotspot-rich-size-m');
      if (size === 'e') span.classList.add('hotspot-rich-size-e');
      if (color) span.style.color = '#' + color;
      line.appendChild(span);
      currentSpan = span;
      currentKey = key;
      return span;
    }
    function appendText(text) {
      if (!text) return;
      ensureSpan().appendChild(document.createTextNode(text));
    }
    function newLine() {
      line = document.createElement('div');
      line.className = 'hotspot-rich-line';
      root.appendChild(line);
      currentSpan = null;
      currentKey = '';
      bold = false;
      italic = false;
      size = '';
    }

    for (var i = 0; i < textValue.length;) {
      var ch = textValue.charAt(i);
      if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && textValue.charAt(i + 1) === '\n') i += 1;
        newLine();
        i += 1;
        continue;
      }
      if (ch !== '\\') {
        var nextSlash = textValue.indexOf('\\', i);
        if (nextSlash < 0) nextSlash = textValue.length;
        appendText(textValue.slice(i, nextSlash));
        i = nextSlash;
        continue;
      }

      var match = textValue.slice(i).match(/^\\{1,2}#([0-9a-fA-F]{6})/);
      if (match) {
        color = match[1].toLowerCase();
        currentSpan = null;
        i += match[0].length;
        continue;
      }
      var next = textValue.charAt(i + 1);
      if (next === '\\') {
        if (color) {
          color = '';
          currentSpan = null;
        } else {
          appendText('\\');
        }
        i += 2;
        continue;
      }
      if (next === 'n') { newLine(); i += 2; continue; }
      if (next === 't') { appendText('\t'); i += 2; continue; }
      if (next === 'c') { line.style.textAlign = 'center'; i += 2; continue; }
      if (next === 'r') { line.style.textAlign = 'right'; i += 2; continue; }
      if (next === 'b' && textValue.charAt(i + 2) === 'i') { bold = true; italic = true; currentSpan = null; i += 3; continue; }
      if (next === 'b') { bold = true; currentSpan = null; i += 2; continue; }
      if (next === 'i') { italic = true; currentSpan = null; i += 2; continue; }
      if (next === 'm') { size = 'm'; currentSpan = null; i += 2; continue; }
      if (next === 'e') { size = 'e'; currentSpan = null; i += 2; continue; }
      appendText('\\');
      i += 1;
    }
    return root;
  }

  var reusableCardShellPool = {};

  function reusableMainShellsEnabled() {
    return !document.documentElement.classList.contains('outer-screen-layout');
  }

  function acquireReusableCardShell(key, extraClass, options) {
    options = options || {};
    var shell = reusableCardShellPool[key];
    if (!shell) {
      var card = document.createElement('div');
      var title = options.includeTitle === false ? null : document.createElement('div');
      var body = document.createElement('div');
      if (title) {
        title.className = 'section-card-title';
        card.appendChild(title);
      }
      body.className = 'section-card-body' + (options.bodyExtraClass ? ' ' + options.bodyExtraClass : '');
      card.appendChild(body);
      if (options.attachScroll !== false) attachManualScroll(body);
      shell = reusableCardShellPool[key] = { card: card, title: title, body: body };
    }
    disposeLineMarqueeResources(shell.body);
    shell.card.className = 'section-card' + (extraClass ? ' ' + extraClass : '');
    shell.card.setAttribute('data-reusable-card', '1');
    shell.card.removeAttribute('data-activity-id');
    if (shell.title) {
      shell.title.replaceChildren();
      shell.title.textContent = options.titleText || '';
    }
    if (!options.preserveBody) shell.body.replaceChildren();
    return shell;
  }

  function makeCenterShell(key, extraClass, titleText) {
    return acquireReusableCardShell(key, extraClass, { titleText: titleText });
  }

  function makeReusableCardShell(key, extraClass, titleText, manualScroll) {
    if (!reusableMainShellsEnabled()) return makeHotspotCard(titleText, extraClass, manualScroll);
    return acquireReusableCardShell(key, extraClass, { titleText: titleText, attachScroll: manualScroll !== false });
  }

  function makeReusableColumnShell(key, extraClass, bodyExtraClass) {
    if (!reusableMainShellsEnabled()) {
      var card = document.createElement('div');
      var body = document.createElement('div');
      card.className = 'section-card' + (extraClass ? ' ' + extraClass : '');
      body.className = 'section-card-body' + (bodyExtraClass ? ' ' + bodyExtraClass : '');
      card.appendChild(body);
      attachManualScroll(body);
      return { card: card, title: null, body: body };
    }
    return acquireReusableCardShell(key, extraClass, { includeTitle: false, bodyExtraClass: bodyExtraClass, preserveBody: true });
  }

  function makeReusableCenterCard(key, extraClass, titleText) {
    return makeReusableCardShell(key, extraClass, titleText, true);
  }

  function parkReusableCenterShells(root) {
    if (!reusableMainShellsEnabled() || !root || !root.querySelectorAll) return;
    var shells = root.querySelectorAll('[data-reusable-card="1"]');
    for (var i = 0; i < shells.length; i++) {
      disposeLineMarqueeResources(shells[i]);
      if (shells[i].parentNode) shells[i].parentNode.removeChild(shells[i]);
    }
  }

  function makeHotspotCard(title, extraClass, manualScroll) {
    var card = document.createElement('div');
    card.className = 'section-card' + (extraClass ? ' ' + extraClass : '');
    var titleEl = document.createElement('div');
    titleEl.className = 'section-card-title';
    titleEl.textContent = title;
    card.appendChild(titleEl);
    var body = document.createElement('div');
    body.className = 'section-card-body';
    card.appendChild(body);
    if (manualScroll !== false) attachManualScroll(body);
    return { card: card, title: titleEl, body: body };
  }

  function makeOuterBackButton(onBack, label) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'achv-detail-back achv-title-back outer-secondary-back';
    button.setAttribute('aria-label', label || '返回列表');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M20 12H4M12 4l-8 8 8 8"/></svg>';
    button.onclick = function () {
      if (typeof onBack === 'function') onBack();
    };
    return button;
  }

  function enableHotspotKeywordScroll(scroller) {
    if (!scroller) return;
    var drag = null;
    var suppressClick = false;

    scroller.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startLeft: scroller.scrollLeft,
        moved: false
      };
      scroller.classList.add('is-pressing');
    });

    scroller.addEventListener('pointermove', function (event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      var dx = event.clientX - drag.startX;
      if (!drag.moved && Math.abs(dx) > 4) {
        drag.moved = true;
        scroller.classList.add('is-dragging');
        try { scroller.setPointerCapture(event.pointerId); } catch (err) {}
      }
      if (!drag.moved) return;
      event.preventDefault();
      scroller.scrollLeft = drag.startLeft - dx;
    }, { passive: false });

    function endDrag(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.moved) suppressClick = true;
      if (scroller.releasePointerCapture) {
        try { scroller.releasePointerCapture(event.pointerId); } catch (err) {}
      }
      drag = null;
      scroller.classList.remove('is-pressing', 'is-dragging');
      setTimeout(function () { suppressClick = false; }, 0);
    }

    scroller.addEventListener('pointerup', endDrag);
    scroller.addEventListener('pointercancel', endDrag);
    scroller.addEventListener('lostpointercapture', endDrag);
    scroller.addEventListener('click', function (event) {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
    scroller.addEventListener('wheel', function (event) {
      if (scroller.scrollWidth <= scroller.clientWidth) return;
      var delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (!delta) return;
      event.preventDefault();
      scroller.scrollLeft += delta;
    }, { passive: false });
  }

  function renderHotspotKeywordChips(id, section) {
    if (!section || !section._hotspot || !section._hotspot.keywordList) return;
    var state = hotspotUiState(id);
    var data = hotspotState(id);
    var scroller = section._hotspot.keywordScroll;
    var list = section._hotspot.keywordList;
    var oldLeft = scroller.scrollLeft;
    section._hotspot.searchWrap.classList.add('has-keywords');
    var keywords = data.points.length ? data.points : ['全部'];
    var signature = keywords.join('\u0001') + '\u0002' + (state.selectedKeywords || []).join('\u0001');
    if (section._hotspot.keywordSignature !== signature) {
      list.innerHTML = '';
      keywords.forEach(function (keyword) {
        var isPlaceholder = !data.points.length;
        var selected = (state.selectedKeywords || []).indexOf(keyword) >= 0;
        var pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'hotspot-keyword-pill' + (isPlaceholder ? ' is-placeholder' : '') + (selected ? ' is-selected' : '');
        pill.textContent = keyword;
        pill.setAttribute('aria-pressed', selected ? 'true' : 'false');
        if (isPlaceholder) {
          pill.disabled = true;
          pill.setAttribute('aria-disabled', 'true');
        }
        pill.onclick = function () {
          if (isPlaceholder) return;
          state.selectedKeywords = state.selectedKeywords.length === 1 && state.selectedKeywords[0] === keyword ? [] : [keyword];
          renderHotspotSection(id, section);
        };
        list.appendChild(pill);
      });
      section._hotspot.keywordSignature = signature;
    }
    scroller.scrollLeft = oldLeft;
  }

  function updateHotspotPortraitTabs(section) {
    if (!section || !section._hotspot || !section._hotspot.portraitTabs) return;
    var activeView = section._hotspot.portraitView || 'content';
    section._hotspot.portraitTabs.forEach(function (tabs) {
      var buttons = tabs.querySelectorAll('.hotspot-portrait-tab');
      for (var i = 0; i < buttons.length; i++) {
        var isActive = buttons[i].dataset.view === activeView;
        buttons[i].classList.toggle('is-active', isActive);
        buttons[i].setAttribute('aria-selected', isActive ? 'true' : 'false');
      }
    });
  }

  function positionHotspotPortraitIndicator(tabs, view, animate) {
    if (!tabs || tabs.offsetParent === null) return;
    var button = tabs.querySelector('.hotspot-portrait-tab[data-view="' + view + '"]');
    var indicator = tabs.querySelector('.hotspot-portrait-tab-indicator');
    if (!button || !indicator || !button.offsetWidth) return;
    if (!animate) tabs.classList.add('no-anim');
    indicator.style.width = button.offsetWidth + 'px';
    indicator.style.transform = 'translateX(' + button.offsetLeft + 'px)';
    if (!animate) {
      void indicator.offsetWidth;
      tabs.classList.remove('no-anim');
    }
  }

  function setHotspotPortraitView(section, view, animateSwitch) {
    if (!section || !section._hotspot) return;
    var previousView = section._hotspot.portraitView || 'content';
    var nextView = view === 'comments' ? 'comments' : 'content';
    section._hotspot.portraitView = nextView;
    if (document.documentElement.classList.contains('outer-screen-layout')) section._outerNewsView = nextView;
    section.classList.toggle('portrait-show-comments', nextView === 'comments');
    updateHotspotPortraitTabs(section);
    requestAnimationFrame(function () {
      if (animateSwitch) {
        var nextBody = nextView === 'comments' ? section._hotspot.commentsBody : section._hotspot.contentBody;
        if (nextBody) animateCardBody(nextBody, 0);
      }
      section._hotspot.portraitTabs.forEach(function (tabs) {
        positionHotspotPortraitIndicator(tabs, previousView, false);
        requestAnimationFrame(function () { positionHotspotPortraitIndicator(tabs, nextView, true); });
      });
    });
  }

  function makeHotspotPortraitTabs(section) {
    var tabs = document.createElement('div');
    tabs.className = 'hotspot-portrait-tabs';
    tabs.setAttribute('role', 'tablist');
    [['content', '内容'], ['comments', '评论']].forEach(function (entry) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'hotspot-portrait-tab';
      button.dataset.view = entry[0];
      button.textContent = entry[1];
      button.setAttribute('role', 'tab');
      button.onclick = function () { setHotspotPortraitView(section, entry[0], true); };
      tabs.appendChild(button);
    });
    var indicator = document.createElement('i');
    indicator.className = 'hotspot-portrait-tab-indicator';
    tabs.appendChild(indicator);
    return tabs;
  }

  function decorateHotspotPortraitTitle(titleEl, labelText, section) {
    titleEl.textContent = '';
    var label = document.createElement('span');
    label.className = 'hotspot-card-title-label';
    label.textContent = labelText;
    titleEl._portraitLabel = label;
    titleEl.appendChild(label);
    var tabs = makeHotspotPortraitTabs(section);
    titleEl.appendChild(tabs);
    return tabs;
  }

  function buildHotspotSection(id, section) {
    if (!section || section._hotspotBuilt) return;
    section._hotspotBuilt = true;
    section.classList.add('hotspot-section');
    section.innerHTML = '';

    var titleCard = makeReusableCardShell('news-title', 'hotspot-title-card', '标题', true);
    var contentCard = makeReusableCenterCard('news', 'hotspot-content-card', '内容');
    var commentsCard = makeReusableCardShell('news-comments', 'hotspot-comments-card', '评论', true);
    contentCard.title.classList.add('hotspot-content-card-title');
    commentsCard.title.classList.add('hotspot-comments-card-title');
    var contentTabs = decorateHotspotPortraitTitle(contentCard.title, '内容', section);
    var commentsTabs = decorateHotspotPortraitTitle(commentsCard.title, '评论', section);
    var commentsBackBtn = document.createElement('button');
    commentsBackBtn.className = 'achv-detail-back achv-title-back';
    commentsBackBtn.type = 'button';
    commentsBackBtn.setAttribute('aria-label', '返回评论列表');
    commentsBackBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M20 12H4M12 4l-8 8 8 8"/></svg>';
    commentsBackBtn.hidden = true;
    commentsBackBtn.onclick = function () { showHotspotCommentsOverview(id, section); };
    commentsCard.title.appendChild(commentsBackBtn);
    var commentsSortModeBtn = document.createElement('button');
    commentsSortModeBtn.className = 'hotspot-comment-sort hotspot-comment-sort-type';
    commentsSortModeBtn.type = 'button';
    commentsSortModeBtn.setAttribute('aria-label', '切换为热度排序');
    commentsSortModeBtn.innerHTML = HOTSPOT_COMMENT_TIME_ICON;
    commentsSortModeBtn.onclick = function () {
      hotspotCommentSortMode = hotspotCommentSortMode === 'heat' ? 'time' : 'heat';
      updateHotspotCommentSortButton(section);
      renderHotspotComments(id, section);
    };
    commentsCard.title.appendChild(commentsSortModeBtn);

    var commentsSortBtn = document.createElement('button');
    commentsSortBtn.className = 'hotspot-comment-sort';
    commentsSortBtn.type = 'button';
    commentsSortBtn.setAttribute('aria-label', '切换评论排序');
    commentsSortBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M12 4v16M5 13l7 7 7-7"/></svg>';
    commentsSortBtn.onclick = function () {
      hotspotCommentSortDesc = !hotspotCommentSortDesc;
      updateHotspotCommentSortButton(section);
      renderHotspotComments(id, section);
    };
    commentsCard.title.appendChild(commentsSortBtn);
    contentCard.title.appendChild(makeOuterBackButton(function () {
      setHotspotOuterView(section, 'title', false);
    }, '返回标题列表'));
    commentsCard.title.appendChild(makeOuterBackButton(function () {
      setHotspotOuterView(section, 'title', false);
    }, '返回标题列表'));

    var searchWrap = document.createElement('div');
    searchWrap.className = 'hotspot-search-wrap';
    var search = document.createElement('input');
    search.type = 'search';
    search.className = 'hotspot-search';
    search.placeholder = '键入以搜索... 或快捷选择关键字';
    search.setAttribute('aria-label', '搜索热点帖子');
    search.autocomplete = 'off';
    var keywordScroll = document.createElement('div');
    keywordScroll.className = 'hotspot-keyword-scroll';
    var keywordList = document.createElement('div');
    keywordList.className = 'hotspot-keyword-list';
    keywordScroll.appendChild(keywordList);
    searchWrap.appendChild(search);
    searchWrap.appendChild(keywordScroll);
    enableHotspotKeywordScroll(keywordScroll);
    titleCard.body.appendChild(searchWrap);
    var postList = document.createElement('div');
    postList.className = 'hotspot-post-list';
    titleCard.body.appendChild(postList);
    attachManualScroll(postList);

    section.appendChild(titleCard.card);
    section.appendChild(contentCard.card);
    section.appendChild(commentsCard.card);
    section._hotspot = {
      titleCard: titleCard.card,
      contentCard: contentCard.card,
      commentsCard: commentsCard.card,
      contentTitle: contentCard.title,
      contentTitleLabel: contentCard.title._portraitLabel,
      searchWrap: searchWrap,
      search: search,
      keywordScroll: keywordScroll,
      keywordList: keywordList,
      postList: postList,
      contentBody: contentCard.body,
      commentsBody: commentsCard.body,
      commentsBackBtn: commentsBackBtn,
      sortBtn: commentsSortBtn,
      sortModeBtn: commentsSortModeBtn,
      id: id,
      commentsView: 'overview',
      activeComment: null,
      commentsOverviewScrollTop: 0,
      portraitView: 'content',
      portraitTabs: [contentTabs, commentsTabs]
    };
    setHotspotPortraitView(section, 'content');
    section._outerNewsView = 'title';
    configureTopActions();

    search.addEventListener('input', function () {
      var state = hotspotUiState(id);
      state.query = search.value;
      renderHotspotSection(id, section);
    });
    renderHotspotSection(id, section);
  }

  function resetHotspotCommentsView(section) {
    if (!section || !section._hotspot) return;
    section._hotspot.commentsView = 'overview';
    section._hotspot.activeComment = null;
    section._hotspot.commentsBackBtn.hidden = true;
    section._hotspot.commentsOverviewScrollTop = 0;
    section._hotspot.commentsBody.scrollTop = 0;
  }

  var hotspotCommentSortDesc = true;
  var hotspotCommentSortMode = 'time';
  var HOTSPOT_COMMENT_TIME_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 2"/></svg>';
  var HOTSPOT_COMMENT_HEAT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';
  var HOTSPOT_COMMENT_SORT_DOWN_ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="m3 6 5 5 5-5"/></svg>';
  var HOTSPOT_COMMENT_SORT_UP_ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="m3 10 5-5 5 5"/></svg>';

  function hotspotCommentSortLabel() {
    return (hotspotCommentSortMode === 'heat' ? '热度' : '时间') + (hotspotCommentSortDesc ? '降序' : '升序');
  }

  function hotspotCommentSortCombinedIcon() {
    var base = hotspotCommentSortMode === 'heat' ? HOTSPOT_COMMENT_HEAT_ICON : HOTSPOT_COMMENT_TIME_ICON;
    var arrow = hotspotCommentSortDesc ? HOTSPOT_COMMENT_SORT_DOWN_ARROW : HOTSPOT_COMMENT_SORT_UP_ARROW;
    return '<span class="hotspot-comment-sort-combined"><span class="hotspot-comment-sort-base">' + base + '</span><span class="hotspot-comment-sort-arrow">' + arrow + '</span></span>';
  }

  function cycleHotspotCommentSort() {
    if (hotspotCommentSortMode === 'time' && hotspotCommentSortDesc) {
      hotspotCommentSortDesc = false;
    } else if (hotspotCommentSortMode === 'time') {
      hotspotCommentSortMode = 'heat';
      hotspotCommentSortDesc = true;
    } else if (hotspotCommentSortDesc) {
      hotspotCommentSortDesc = false;
    } else {
      hotspotCommentSortMode = 'time';
      hotspotCommentSortDesc = true;
    }
  }

  function hotspotCommentReplyCount(comment) {
    return hotspotCommentsCount(comment && comment.replies);
  }

  function orderHotspotRows(rows, descending, mode) {
    var ordered = (rows || []).slice();
    if (mode !== 'heat') return descending ? ordered.reverse() : ordered;
    return ordered.map(function (comment, index) {
      return { comment: comment, index: index, heat: hotspotCommentReplyCount(comment) };
    }).sort(function (a, b) {
      var heatDiff = descending ? b.heat - a.heat : a.heat - b.heat;
      if (heatDiff) return heatDiff;
      return descending ? b.index - a.index : a.index - b.index;
    }).map(function (entry) {
      return entry.comment;
    });
  }

  function updateHotspotCommentSortButton(section) {
    if (!section || !section._hotspot) return;
    var hotspot = section._hotspot;
    var isHeat = hotspotCommentSortMode === 'heat';
    if (hotspot.sortBtn) {
      hotspot.sortBtn.classList.toggle('is-ascending', !hotspotCommentSortDesc);
      hotspot.sortBtn.setAttribute('aria-label', isHeat ? '切换评论热度排序方向' : '切换评论时间排序方向');
    }
    if (hotspot.sortModeBtn) {
      hotspot.sortModeBtn.classList.toggle('is-heat', isHeat);
      hotspot.sortModeBtn.setAttribute('aria-label', isHeat ? '切换为时间排序' : '切换为热度排序');
      hotspot.sortModeBtn.setAttribute('aria-pressed', isHeat ? 'true' : 'false');
      hotspot.sortModeBtn.innerHTML = isHeat ? HOTSPOT_COMMENT_HEAT_ICON : HOTSPOT_COMMENT_TIME_ICON;
    }
  }
  function hotspotCommentIdentity(comment) {
    comment = comment || {};
    return String(comment.name || '匿名').trim() + '\n' + String(comment.text || '').trim();
  }
  function dedupeConsecutiveComments(comments) {
    var result = [];
    var lastKey = null;
    (comments || []).forEach(function (comment) {
      var key = hotspotCommentIdentity(comment);
      if (key === lastKey) return;
      lastKey = key;
      result.push(comment);
    });
    return result;
  }
  function dedupeConsecutiveCommentEntries(entries) {
    var result = [];
    var lastKey = null;
    (entries || []).forEach(function (entry) {
      var comment = entry && entry.comment ? entry.comment : entry;
      var key = hotspotCommentIdentity(comment);
      if (key === lastKey) return;
      lastKey = key;
      result.push(entry);
    });
    return result;
  }
  function flattenHotspotReplies(replies, parent, result) {
    result = result || [];
    (replies || []).forEach(function (reply) {
      result.push({ comment: reply, parent: parent || null });
      flattenHotspotReplies(reply.replies, reply, result);
    });
    return result;
  }

  function makeHotspotReplyNode(entry) {
    var comment = entry.comment || entry;
    var row = document.createElement('div');
    row.className = 'hotspot-reply';
    var name = document.createElement('span');
    name.className = 'hotspot-reply-name';
    name.textContent = (comment.name || '匿名') + '：';
    row.appendChild(name);
    appendHotspotCommentContent(row, comment.text || '');
    return row;
  }

  function makeHotspotCommentNode(comment, index, id, state, section) {
    var node = document.createElement('div');
    node.className = 'hotspot-comment';
    var avatar = document.createElement('div');
    avatar.className = 'hotspot-comment-avatar';
    setAvatar(avatar, comment.name || '匿名');
    var main = document.createElement('div');
    main.className = 'hotspot-comment-main';
    var name = document.createElement('div');
    name.className = 'hotspot-comment-name';
    name.textContent = comment.name || '匿名';
    var text = document.createElement('div');
    text.className = 'hotspot-comment-text';
    appendHotspotCommentContent(text, comment.text || '');
    main.appendChild(name);
    main.appendChild(text);

    var replies = dedupeConsecutiveCommentEntries(flattenHotspotReplies(comment.replies, comment, []));
    if (replies.length) {
      var replyBox = document.createElement('div');
      replyBox.className = 'hotspot-reply-box';
      replyBox.setAttribute('role', 'button');
      replyBox.tabIndex = 0;
      replyBox.classList.add('is-clickable');
      replies.slice(0, 3).forEach(function (reply) {
        replyBox.appendChild(makeHotspotReplyNode(reply));
      });
      if (replies.length > 3) {
        var more = document.createElement('div');
        more.className = 'hotspot-reply-more';
        more.textContent = '共 ' + replies.length + ' 条回复';
        replyBox.appendChild(more);
      }
      replyBox.onclick = function () { showHotspotCommentDetail(id, section, comment); };
      replyBox.onkeydown = function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        showHotspotCommentDetail(id, section, comment);
      };
      main.appendChild(replyBox);
    }
    node.appendChild(avatar);
    node.appendChild(main);
    return node;
  }

  function makeHotspotDetailCommentNode(comment, parentName) {
    var node = document.createElement('div');
    node.className = 'hotspot-comment hotspot-comment-detail-row';
    var avatar = document.createElement('div');
    avatar.className = 'hotspot-comment-avatar';
    setAvatar(avatar, comment.name || '匿名');
    var main = document.createElement('div');
    main.className = 'hotspot-comment-main';
    var name = document.createElement('div');
    name.className = 'hotspot-comment-name';
    name.textContent = comment.name || '匿名';
    var text = document.createElement('div');
    text.className = 'hotspot-comment-text';
    if (parentName) {
      var replyWord = document.createElement('span');
      replyWord.textContent = '回复';
      var target = document.createElement('span');
      target.className = 'hotspot-reply-target';
      target.textContent = parentName;
      var colon = document.createElement('span');
      colon.textContent = '：';
      text.appendChild(replyWord);
      text.appendChild(target);
      text.appendChild(colon);
      appendHotspotCommentContent(text, comment.text || '');
    } else {
      appendHotspotCommentContent(text, comment.text || '');
    }
    main.appendChild(name);
    main.appendChild(text);
    node.appendChild(avatar);
    node.appendChild(main);
    return node;
  }

  function renderHotspotCommentDetail(id, section, comment, keepScrollTop) {
    if (section._hotspot.sortBtn) section._hotspot.sortBtn.hidden = true;
    if (section._hotspot.sortModeBtn) section._hotspot.sortModeBtn.hidden = true;
    updateHotspotCommentSortButton(section);
    var body = section._hotspot.commentsBody;
    var oldTop = typeof keepScrollTop === 'number' ? keepScrollTop : body.scrollTop;
    body.innerHTML = '';
    var list = document.createElement('div');
    list.className = 'hotspot-comment-detail-list';
    list.appendChild(makeHotspotDetailCommentNode(comment, ''));
    dedupeConsecutiveCommentEntries(flattenHotspotReplies(comment.replies, comment, [])).forEach(function (entry) {
      list.appendChild(makeHotspotDetailCommentNode(entry.comment, (entry.parent && entry.parent.name) || comment.name || '原评论'));
    });
    body.appendChild(list);
    body.scrollTop = oldTop;
    animateCardBody(body, 0);
  }

  function showHotspotCommentDetail(id, section, comment) {
    if (!section || !section._hotspot || !comment) return;
    id = id || section._hotspot.id;
    var outerMode = document.documentElement.classList.contains('outer-screen-layout');
    section._hotspot.commentsOverviewScrollTop = outerMode ? section.scrollTop : section._hotspot.commentsBody.scrollTop;
    section._hotspot.commentsView = 'detail';
    section._hotspot.activeComment = comment;
    section._hotspot.commentsBackBtn.hidden = false;
    renderHotspotCommentDetail(id, section, comment, 0);
    if (outerMode) setOuterPageScroll(section, 0);
    configureTopActions();
  }

  function showHotspotCommentsOverview(id, section) {
    if (!section || !section._hotspot) return;
    id = id || section._hotspot.id;
    var outerMode = document.documentElement.classList.contains('outer-screen-layout');
    var overviewTop = section._hotspot.commentsOverviewScrollTop || 0;
    section._hotspot.commentsView = 'overview';
    section._hotspot.activeComment = null;
    section._hotspot.commentsBackBtn.hidden = true;
    renderHotspotComments(id, section, overviewTop);
    if (outerMode) setOuterPageScroll(section, overviewTop);
    configureTopActions();
  }

  function renderHotspotComments(id, section, keepScrollTop) {
    if (!section || !section._hotspot) return;
    if (section._hotspot.sortBtn) section._hotspot.sortBtn.hidden = false;
    if (section._hotspot.sortModeBtn) section._hotspot.sortModeBtn.hidden = false;
    if (section._hotspot.commentsView === 'detail' && section._hotspot.activeComment) {
      renderHotspotCommentDetail(id, section, section._hotspot.activeComment, keepScrollTop);
      return;
    }
    updateHotspotCommentSortButton(section);
    var state = hotspotUiState(id);
    var data = hotspotState(id);
    var post = null;
    for (var i = 0; i < data.posts.length; i++) {
      if (data.posts[i].id === state.selectedId) { post = data.posts[i]; break; }
    }
    var body = section._hotspot.commentsBody;
    var oldTop = typeof keepScrollTop === 'number' ? keepScrollTop : body.scrollTop;
    body.innerHTML = '';
    if (post && post.comments.length) {
      var list = document.createElement('div');
      list.className = 'hotspot-comment-list';
      orderHotspotRows(dedupeConsecutiveComments(post.comments), hotspotCommentSortDesc, hotspotCommentSortMode).map(function (comment, index) {
        return { comment: comment, index: index };
      }).forEach(function (entry) {
        list.appendChild(makeHotspotCommentNode(entry.comment, entry.index, id, state, section));
      });
      body.appendChild(list);
    }
    body.scrollTop = oldTop;
    animateCardBody(body, 0);
  }

  function renderHotspotContent(id, section) {
    if (!section || !section._hotspot) return;
    var state = hotspotUiState(id);
    var data = hotspotState(id);
    var post = null;
    for (var i = 0; i < data.posts.length; i++) {
      if (data.posts[i].id === state.selectedId) { post = data.posts[i]; break; }
    }
    var title = section._hotspot.contentTitle;
    var titleLabel = section._hotspot.contentTitleLabel;
    var body = section._hotspot.contentBody;
    if (titleLabel) titleLabel.textContent = post ? post.title : '内容';
    else title.textContent = post ? post.title : '内容';
    title.title = post ? post.title : '';
    body.innerHTML = '';
    if (post) {
      var rich = renderHotspotRichText(post.content || '');
      rich.classList.add('hotspot-content-text');
      body.appendChild(rich);
    }
    animateCardBody(body, 0);
  }

  function renderHotspotSection(id, section) {
    if (!section) return;
    buildHotspotSection(id, section);
    var state = hotspotUiState(id);
    if (section._hotspot.search.value !== state.query) section._hotspot.search.value = state.query;
    var data = hotspotState(id);
    var query = state.query.trim().toLowerCase();
    var selectedKeywords = state.selectedKeywords || [];
    var filtered = data.posts.filter(function (post) {
      return hotspotPostMatches(post, query, selectedKeywords);
    }).sort(compareHotspotPostsNewest);
    var postListSignature = filtered.map(function (post) { return post.id; }).join('\u0001');
    var previousPostListSignature = section._hotspot.postListSignature;
    var postListNeedsRender = previousPostListSignature !== postListSignature;
    var postListChanged = previousPostListSignature != null && previousPostListSignature !== postListSignature;
    if (!filtered.some(function (post) { return post.id === state.selectedId; })) {
      var nextSelectedId = filtered.length ? filtered[0].id : null;
      if (state.selectedId !== nextSelectedId) resetHotspotCommentsView(section);
      state.selectedId = nextSelectedId;
    }

    if (postListNeedsRender) {
      section._hotspot.postList.innerHTML = '';
      if (filtered.length) {
        filtered.forEach(function (post) {
          var item = document.createElement('button');
          item.type = 'button';
          item.className = 'hotspot-post-item' + (post.id === state.selectedId ? ' is-selected' : '');
          item.setAttribute('aria-pressed', post.id === state.selectedId ? 'true' : 'false');
          var postTitle = document.createElement('div');
          postTitle.className = 'hotspot-post-title';
          postTitle.textContent = post.title;
          var meta = document.createElement('div');
          meta.className = 'hotspot-post-meta';
          var time = document.createElement('span');
          time.className = 'hotspot-post-time';
          time.textContent = formatHotspotTime(post.time);
          var count = document.createElement('span');
          count.className = 'hotspot-post-count';
          count.textContent = hotspotPostCommentCount(post) + '评论';
          meta.appendChild(time);
          meta.appendChild(count);
          item.appendChild(postTitle);
          item.appendChild(meta);
          item.onclick = function () {
            if (state.selectedId !== post.id) {
              state.selectedId = post.id;
              resetHotspotCommentsView(section);
            }
            renderHotspotSection(id, section);
            if (document.documentElement.classList.contains('outer-screen-layout')) {
              setHotspotOuterView(section, 'content', false);
            }
          };
          section._hotspot.postList.appendChild(item);
        });
      }
      section._hotspot.postListSignature = postListSignature;
      if (postListChanged) animateCardBody(section._hotspot.postList, 0);
    } else {
      var currentItems = section._hotspot.postList.querySelectorAll('.hotspot-post-item');
      for (var itemIndex = 0; itemIndex < currentItems.length; itemIndex++) {
        var isSelected = filtered[itemIndex] && filtered[itemIndex].id === state.selectedId;
        currentItems[itemIndex].classList.toggle('is-selected', !!isSelected);
        currentItems[itemIndex].setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      }
    }
    renderHotspotKeywordChips(id, section);
    renderHotspotContent(id, section);
    renderHotspotComments(id, section);
  }

  /* ---------- 资源页：浏览 / 观赏 / 日程 ---------- */
  var resourcePageState = {};
  var RESOURCE_LIST_KEY = 'fgexpig_resource_lists_v1';
  var RESOURCE_LIST_MAGIC = 'FGEXPIG-RESOURCE-LIST-BACKUP';
  var resourceListStore = { lists: {} };
  var resourceListFetchPromises = {};

  function filesPageState(id) {
    if (!resourcePageState[id]) {
      resourcePageState[id] = {
        items: null,
        dates: null,
        listPromise: null,
        datePromise: null,
        selectedPicture: null,
        selectedDate: null
      };
    }
    return resourcePageState[id];
  }

  function resourcePictureName(value) {
    var name = String(value || '').trim();
    if (!name || name.charAt(0) === '#') return '';
    if (name.indexOf('/') >= 0 || name.indexOf('\\') >= 0) return '';
    if (!/\.(?:png|jpe?g|gif|webp)$/i.test(name)) name += '.png';
    return name;
  }

  function resourcePictureUrl(id, file) {
    return 'resources/' + id + '/pictures/' + encodeURIComponent(file);
  }

  function normalizeResourceListRows(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (row) {
      row = row || {};
      var file = resourcePictureName(row.file || row.name || row.filename);
      if (!file) return null;
      return {
        file: file,
        title: String(row.title === undefined ? '' : row.title).trim(),
        category: String(row.category === undefined ? '' : row.category).trim()
      };
    }).filter(Boolean);
  }

  function parseResourceListTxt(text) {
    var rows = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var raw = line.trim();
      if (!raw || raw.charAt(0) === '#') return;
      var parts = raw.split(/[，,]/);
      if (parts.length < 2) return;
      var file = resourcePictureName(parts.shift());
      if (!file) return;
      rows.push({
        file: file,
        title: String(parts.shift() || '').trim(),
        category: parts.join('，').trim()
      });
    });
    return rows;
  }

  function resourceListRowsOf(id) {
    return (resourceListStore.lists || {})[id] || [];
  }

  function saveResourceLists() {
    try { void 0 && localStorage.setItem(RESOURCE_LIST_KEY, JSON.stringify(resourceListStore)); } catch (e) {}
  }

  function loadResourceLists() {
    try {
      var raw = null;
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.lists) return false;
      Object.keys(parsed.lists).forEach(function (id) {
        parsed.lists[id] = normalizeResourceListRows(parsed.lists[id]);
      });
      resourceListStore = parsed;
      return true;
    } catch (e) {}
    return false;
  }

  function applyResourceListData(id) {
    var rows = resourceListRowsOf(id);
    var state = filesPageState(id);
    state.items = rows;
    if (!rows.some(function (row) { return row.file === state.selectedPicture; })) {
      state.selectedPicture = rows.length ? rows[0].file : null;
    }
    var meta = document.getElementById('resourceListMeta');
    if (meta) meta.textContent = rows.length ? ('已加载 ' + rows.length + ' 条资源') : '未加载';
    var pageIndex = LOGOS.indexOf(id);
    var page = pageIndex >= 0 ? pages[pageIndex] : null;
    var section = page ? page.querySelector('.page-section[data-section="files"]') : null;
    if (section && section._files && page.dataset.page === id) renderFilesPage(id, section);
  }

  function exportResourceList(id) {
    var data = { lists: {} };
    data.lists[id] = resourceListRowsOf(id);
    var payload = { magic: RESOURCE_LIST_MAGIC, version: 1, exportedAt: new Date().toISOString(), data: data };
    payload.checksum = checksum(JSON.stringify(data));
    var content =
      '/* FGEXPIG 资源列表数据备份(' + id + ')（自动生成）\n' +
      ' * 导出时间: ' + payload.exportedAt + '\n' +
      ' */\n' +
      'window.FGEXPIG_RESOURCE_LIST_BACKUP = ' + JSON.stringify(payload, null, 2) + ';\n';
    var blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fgexpig_resource_list_' + id + '.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }

  function importResourceListFile(id, file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      try {
        var rows;
        if (/\.js$/i.test(file.name) && text.indexOf(RESOURCE_LIST_MAGIC) >= 0) {
          var match = text.match(/window\.FGEXPIG_RESOURCE_LIST_BACKUP\s*=\s*(\{[\s\S]*\});/);
          if (!match) throw new Error('format');
          var payload = JSON.parse(match[1]);
          if (!payload || payload.magic !== RESOURCE_LIST_MAGIC) throw new Error('magic');
          if (payload.checksum !== checksum(JSON.stringify(payload.data))) throw new Error('checksum');
          rows = normalizeResourceListRows(payload.data && payload.data.lists && payload.data.lists[id]);
        } else {
          rows = parseResourceListTxt(text);
        }
        if (!rows.length) throw new Error('empty');
        if (!resourceListStore.lists) resourceListStore.lists = {};
        resourceListStore.lists[id] = rows;
        saveResourceLists();
        applyResourceListData(id);
        alert('导入成功：' + id + ' 共 ' + rows.length + ' 条资源');
      } catch (err) {
        alert('导入失败：' + (err.message === 'checksum' ? '校验未通过' : err.message === 'empty' ? '未解析到有效资源' : '文件格式错误'));
      }
    };
    reader.readAsText(file);
  }

  function fetchResourceList(id) {
    return loadDataFragment('list', id);
  }

  function loadResourceItems(id) {
    var state = filesPageState(id);
    if (state.listPromise) return state.listPromise;
    state.listPromise = fetchResourceList(id).then(function () {
      var rows = resourceListRowsOf(id);
      state.items = rows;
      if (!rows.some(function (row) { return row.file === state.selectedPicture; })) {
        state.selectedPicture = rows.length ? rows[0].file : null;
      }
      return rows;
    });
    return state.listPromise;
  }

  var SCHEDULE_KEY = 'fgexpig_schedules_v1';
  var SCHEDULE_MAGIC = 'FGEXPIG-SCHEDULE-BACKUP';
  var scheduleStore = { schedules: {} };
  var scheduleFetchPromises = {};

  function scheduleText(value) {
    return value === undefined || value === null ? '' : String(value).trim();
  }

  function resourceDateKey(date) {
    return date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }

  function resourceDateObject(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    var match = String(value || '').match(/^(\d{4})\s*(?:年|[\/-])\s*(\d{1,2})\s*(?:月|[\/-])\s*(\d{1,2})\s*日?/);
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function normalizeScheduleRows(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (row) {
      row = row || {};
      var date = resourceDateObject(row.date || row.key);
      if (!date) return null;
      return {
        date: resourceDateKey(date),
        text: scheduleText(row.text !== undefined ? row.text : row.schedule)
      };
    }).filter(Boolean).sort(function (a, b) {
      return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
    });
  }

  function scheduleRowsOf(id) {
    return (scheduleStore.schedules || {})[id] || [];
  }

  function saveSchedules() {
    try { void 0 && localStorage.setItem(SCHEDULE_KEY, JSON.stringify(scheduleStore)); } catch (e) {}
  }

  function loadSchedules() {
    try {
      var raw = null;
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.schedules) return false;
      Object.keys(parsed.schedules).forEach(function (id) {
        parsed.schedules[id] = normalizeScheduleRows(parsed.schedules[id]);
      });
      scheduleStore = parsed;
      return true;
    } catch (e) {}
    return false;
  }

  function applyScheduleData(id) {
    var meta = document.getElementById('scheduleMeta');
    if (!meta) return;
    if (!id) {
      var total = Object.keys(scheduleStore.schedules || {}).length;
      meta.textContent = total ? ('已加载 ' + total + ' 个活动日程') : '未加载';
      return;
    }
    var rows = scheduleRowsOf(id);
    var state = filesPageState(id);
    state.dates = rows;
    var hasSelected = rows.some(function (row) { return row.date === state.selectedDate; });
    if (!hasSelected) state.selectedDate = rows.length ? rows[0].date : null;
    meta.textContent = rows.length ? ('已加载 ' + rows.length + ' 条日程') : '未加载';
    var pageIndex = LOGOS.indexOf(id);
    var page = pageIndex >= 0 ? pages[pageIndex] : null;
    var section = page ? page.querySelector('.page-section[data-section="files"]') : null;
    if (section && section._files && page.dataset.page === id) renderFilesPage(id, section);
  }

  function exportSchedule(id) {
    var data = { schedules: {} };
    data.schedules[id] = scheduleRowsOf(id);
    var payload = { magic: SCHEDULE_MAGIC, version: 1, exportedAt: new Date().toISOString(), data: data };
    payload.checksum = checksum(JSON.stringify(data));
    var content =
      '/* FGEXPIG 日程数据备份(' + id + ')（自动生成）\n' +
      ' * 导出时间: ' + payload.exportedAt + '\n' +
      ' */\n' +
      'window.FGEXPIG_SCHEDULE_BACKUP = ' + JSON.stringify(payload, null, 2) + ';\n';
    var blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fgexpig_schedule_' + id + '.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }

  function importScheduleFile(id, file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      try {
        var rows;
        if (/\.js$/i.test(file.name) && text.indexOf(SCHEDULE_MAGIC) >= 0) {
          var match = text.match(/window\.FGEXPIG_SCHEDULE_BACKUP\s*=\s*(\{[\s\S]*\});/);
          if (!match) throw new Error('format');
          var payload = JSON.parse(match[1]);
          if (!payload || payload.magic !== SCHEDULE_MAGIC) throw new Error('magic');
          if (payload.checksum !== checksum(JSON.stringify(payload.data))) throw new Error('checksum');
          rows = normalizeScheduleRows(payload.data && payload.data.schedules && payload.data.schedules[id]);
        } else {
          rows = parseResourceDateTxt(text);
        }
        if (!rows.length) throw new Error('empty');
        if (!scheduleStore.schedules) scheduleStore.schedules = {};
        scheduleStore.schedules[id] = rows;
        saveSchedules();
        applyScheduleData(id);
        alert('导入成功：' + id + ' 共 ' + rows.length + ' 条日程');
      } catch (err) {
        alert('导入失败：' + (err.message === 'checksum' ? '校验未通过' : err.message === 'empty' ? '未解析到有效日程' : '文件格式错误'));
      }
    };
    reader.readAsText(file);
  }

  function fetchSchedule(id) {
    return loadDataFragment('schedule', id);
  }

  function parseResourceDateTxt(text) {
    var rows = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var raw = line.trim();
      if (!raw) return;
      var match = raw.match(/^\[?\s*(\d{4})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{1,2})\s*\]?\s*(.*)$/);
      if (!match) return;
      var year = Number(match[1]);
      var month = Number(match[2]);
      var day = Number(match[3]);
      var date = new Date(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return;
      rows.push({
        date: resourceDateKey(date),
        text: scheduleText(match[4].replace(/^\s*[\uFF1A:,\uFF0C\u3001-]\s*/, ''))
      });
    });
    return normalizeScheduleRows(rows);
  }

  function loadResourceDates(id) {
    var state = filesPageState(id);
    if (state.datePromise) return state.datePromise;
    state.datePromise = fetchSchedule(id).then(function () {
      var rows = scheduleRowsOf(id);
      state.dates = rows;
      if (rows.length && !state.selectedDate) state.selectedDate = rows[0].date;
      if (rows.length && !rows.some(function (row) { return row.date === state.selectedDate; })) {
        state.selectedDate = rows[0].date;
      }
      return rows;
    });
    return state.datePromise;
  }

  function makeResourcePreviewCard(id, section, item, index) {
    var state = filesPageState(id);
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'hotspot-post-item resource-preview-card' + (state.selectedPicture === item.file ? ' is-selected' : '');
    card.setAttribute('aria-label', '选择资源 ' + (item.title || item.file));
    card._resourceFile = item.file;

    var title = document.createElement('div');
    title.className = 'hotspot-post-title';
    title.textContent = item.title || item.file;
    card.appendChild(title);
    if (item.category) {
      var meta = document.createElement('div');
      meta.className = 'hotspot-post-meta';
      var category = document.createElement('span');
      category.className = 'hotspot-post-time';
      category.textContent = item.category;
      meta.appendChild(category);
      card.appendChild(meta);
    }

    card.onclick = function () {
      selectResourcePicture(id, section, item.file);
    };
    return card;
  }

  function enableResourceViewerZoom(viewer, image) {
    if (!viewer || !image) return;
    var MIN_SCALE = 1;
    var MAX_SCALE = 6;
    var scale = 1;
    var tx = 0;
    var ty = 0;
    var drag = null;
    var pointers = Object.create(null);
    var pinch = null;
    var interactionMoved = false;

    function applyTransform() {
      image.style.transform = 'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) scale(' + scale.toFixed(4) + ')';
    }

    function clampTranslation(nextScale) {
      var viewportWidth = viewer.clientWidth;
      var viewportHeight = viewer.clientHeight;
      var imageWidth = image.offsetWidth || 0;
      var imageHeight = image.offsetHeight || 0;
      var scaledWidth = imageWidth * nextScale;
      var scaledHeight = imageHeight * nextScale;
      var maxX = Math.max(0, (scaledWidth - viewportWidth) / 2);
      tx = Math.max(-maxX, Math.min(maxX, tx));
      var verticalOverflow = scaledHeight - viewportHeight;
      if (viewer.classList.contains('is-tall')) {
        var maxTallY = Math.max(0, verticalOverflow);
        ty = Math.max(-maxTallY, Math.min(0, ty));
      } else {
        var maxY = Math.max(0, verticalOverflow / 2);
        ty = Math.max(-maxY, Math.min(maxY, ty));
      }
    }

    function pointerList() {
      var list = [];
      for (var id in pointers) {
        if (Object.prototype.hasOwnProperty.call(pointers, id)) list.push(pointers[id]);
      }
      return list;
    }

    function pointerCount() {
      return pointerList().length;
    }

    function beginPinch() {
      interactionMoved = true;
      var points = pointerList();
      if (points.length < 2) return;
      var a = points[0];
      var b = points[1];
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 1) return;
      var rect = viewer.getBoundingClientRect();
      pinch = {
        startDistance: distance,
        startScale: scale,
        startTx: tx,
        startTy: ty,
        startMidX: (a.x + b.x) / 2 - (rect.left + rect.width / 2),
        startMidY: (a.y + b.y) / 2 - (rect.top + rect.height / 2)
      };
      drag = null;
      viewer.classList.remove('is-pressing', 'is-dragging');
      viewer.classList.add('is-pinching');
    }

    function updatePinch() {
      if (!pinch) return;
      var points = pointerList();
      if (points.length < 2) return;
      var a = points[0];
      var b = points[1];
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 1) return;
      var rect = viewer.getBoundingClientRect();
      var midX = (a.x + b.x) / 2 - (rect.left + rect.width / 2);
      var midY = (a.y + b.y) / 2 - (rect.top + rect.height / 2);
      var nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinch.startScale * distance / pinch.startDistance));
      var localX = (pinch.startMidX - pinch.startTx) / pinch.startScale;
      var localY = (pinch.startMidY - pinch.startTy) / pinch.startScale;
      scale = nextScale;
      tx = midX - localX * scale;
      ty = midY - localY * scale;
      clampTranslation(scale);
      applyTransform();
    }

    viewer.addEventListener('wheel', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var delta = event.deltaY;
      if (event.deltaMode === 1) delta *= 16;
      else if (event.deltaMode === 2) delta *= viewer.clientHeight || 1;
      var upperScale = Math.max(MAX_SCALE, scale);
      var nextScale = Math.max(MIN_SCALE, Math.min(upperScale, scale * Math.exp(-delta * 0.0015)));
      if (Math.abs(nextScale - scale) < 0.0001) return;

      var rect = viewer.getBoundingClientRect();
      var cursorX = event.clientX - (rect.left + rect.width / 2);
      var cursorY = event.clientY - (rect.top + rect.height / 2);
      var localX = (cursorX - tx) / scale;
      var localY = (cursorY - ty) / scale;
      tx = cursorX - localX * nextScale;
      ty = cursorY - localY * nextScale;
      scale = nextScale;
      clampTranslation(scale);
      applyTransform();
    }, { passive: false });

    viewer.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (pointerCount() === 0) interactionMoved = false;
      pointers[event.pointerId] = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        pointerType: event.pointerType || ''
      };
      try { viewer.setPointerCapture(event.pointerId); } catch (err) {}
      if (event.pointerType !== 'mouse' && pointerCount() >= 2) {
        beginPinch();
        return;
      }
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startTx: tx,
        startTy: ty,
        moved: false
      };
      viewer.classList.add('is-pressing');
    });

    viewer.addEventListener('pointermove', function (event) {
      var pointer = pointers[event.pointerId];
      if (!pointer) return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;

      if (pinch) {
        if (pointerCount() >= 2) {
          event.preventDefault();
          updatePinch();
        }
        return;
      }

      if (!drag || drag.pointerId !== event.pointerId) return;
      var dx = event.clientX - drag.startX;
      var dy = event.clientY - drag.startY;
      if (!drag.moved && Math.sqrt(dx * dx + dy * dy) > 4) {
        drag.moved = true;
        interactionMoved = true;
        viewer.classList.add('is-dragging');
      }
      if (!drag.moved) return;
      event.preventDefault();
      tx = drag.startTx + dx;
      ty = drag.startTy + dy;
      clampTranslation(scale);
      applyTransform();
    });

    function endViewerPointer(event) {
      if (event && event.pointerId != null) delete pointers[event.pointerId];
      if (pinch && pointerCount() < 2) {
        pinch = null;
        viewer.classList.remove('is-pinching');
      }
      if (drag && (!event || event.pointerId == null || drag.pointerId === event.pointerId)) {
        try {
          if (viewer.hasPointerCapture && viewer.hasPointerCapture(drag.pointerId)) {
            viewer.releasePointerCapture(drag.pointerId);
          }
        } catch (err) {}
        drag = null;
        viewer.classList.remove('is-pressing', 'is-dragging');
      }
      if (!drag && !pinch && pointerCount() === 1 && (!event || event.pointerType !== 'mouse')) {
        var remaining = pointerList()[0];
        drag = {
          pointerId: remaining.id,
          startX: remaining.x,
          startY: remaining.y,
          startTx: tx,
          startTy: ty,
          moved: false
        };
        viewer.classList.add('is-pressing');
      }
    }

    viewer.addEventListener('pointerup', endViewerPointer);
    viewer.addEventListener('pointercancel', endViewerPointer);
    viewer.addEventListener('lostpointercapture', endViewerPointer);
    viewer.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    viewer.addEventListener('dblclick', function (event) {
      event.preventDefault();
      event.stopPropagation();
      interactionMoved = false;
      var imageWidth = image.offsetWidth || image.naturalWidth || 0;
      var imageHeight = image.offsetHeight || image.naturalHeight || 0;
      if (!imageWidth || !viewer.clientWidth) return;
      if (scale > 1.001 || Math.abs(tx) > 0.5 || Math.abs(ty) > 0.5) {
        scale = 1;
        tx = 0;
        ty = 0;
        applyTransform();
        return;
      }
      var fitWidthScale = viewer.clientWidth / imageWidth;
      if (fitWidthScale <= 1.001) return;
      scale = Math.max(MIN_SCALE, fitWidthScale);
      tx = 0;
      ty = imageHeight ? (imageHeight * scale - viewer.clientHeight) / 2 : 0;
      clampTranslation(scale);
      applyTransform();
    });
    image.style.transformOrigin = 'center center';
    applyTransform();
    function resetTransform() {
      scale = 1;
      tx = 0;
      ty = 0;
      clampTranslation(scale);
      applyTransform();
    }
    viewer._resourceZoom = {
      reset: function () {
        interactionMoved = false;
        resetTransform();
      },
      wasMoved: function () {
        return interactionMoved;
      },
      clearMoved: function () {
        interactionMoved = false;
      },
      zoomBy: function (direction, amount) {
        if (!direction || !amount) return;
        var nextScale = direction > 0
          ? Math.min(MAX_SCALE, scale * (1 + amount))
          : Math.max(MIN_SCALE, scale / (1 + amount));
        if (Math.abs(nextScale - scale) < 0.0001) return;
        var centerX = viewer.clientWidth / 2;
        var centerY = viewer.clientHeight / 2;
        var localX = (centerX - tx) / scale;
        var localY = (centerY - ty) / scale;
        scale = nextScale;
        tx = centerX - localX * scale;
        ty = centerY - localY * scale;
        clampTranslation(scale);
        applyTransform();
      },
      panBy: function (dx, dy) {
        if (!dx && !dy) return;
        tx += dx;
        ty += dy;
        clampTranslation(scale);
        applyTransform();
      }
    };
  }

  function makeResourceGameEntry(id) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'hotspot-post-item resource-game-entry';
    button.setAttribute('aria-label', id === 'JFES110' ? '进入打地鼠小游戏' : '进入小游戏');
    var title = document.createElement('div');
    title.className = 'hotspot-post-title';
    title.textContent = id === 'JFES110' ? '打地鼠' : '迷你游戏';
    var meta = document.createElement('div');
    meta.className = 'hotspot-post-meta';
    var category = document.createElement('span');
    category.className = 'hotspot-post-time';
    category.textContent = '迷你游戏';
    meta.appendChild(category);
    button.appendChild(title);
    button.appendChild(meta);

    button.onclick = function () {
      var api = window.FGEXPIG_MINIGAMES;
      if (api && typeof api.open === 'function') api.open(id);
    };
    return button;
  }

  function makeResourceCalendar(id, rows) {
    var calendar = document.createElement('div');
    calendar.className = 'resource-calendar';
    if (!rows.length) return calendar;

    var info = infoOf(id);
    var monthDate = resourceDateObject(info && info.releaseDate) || resourceDateObject(rows[0].date);
    if (!monthDate) return calendar;
    var month = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    var start = new Date(month.getFullYear(), month.getMonth(), 1);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

    var events = {};
    rows.forEach(function (row) {
      if (!events[row.date]) events[row.date] = [];
      if (row.text) events[row.date].push(row);
    });

    var head = document.createElement('div');
    head.className = 'resource-calendar-head';
    var title = document.createElement('div');
    title.className = 'resource-calendar-title';
    title.textContent = month.getFullYear() + '/' + (month.getMonth() + 1);
    head.appendChild(title);
    calendar.appendChild(head);

    var weekdays = document.createElement('div');
    weekdays.className = 'resource-calendar-weekdays';
    ['一', '二', '三', '四', '五', '六', '日'].forEach(function (day) {
      var cell = document.createElement('span');
      cell.textContent = day;
      weekdays.appendChild(cell);
    });
    calendar.appendChild(weekdays);

    var cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    for (var dayIndex = 0; dayIndex < 42; dayIndex++) {
      (function (date) {
        var key = resourceDateKey(date);
        var day = document.createElement('div');
        day.className = 'resource-calendar-day';
        if (date.getMonth() !== month.getMonth()) day.classList.add('is-outside');
        if (events[key] && events[key].length) day.classList.add('has-event');
        var value = document.createElement('span');
        value.className = 'resource-calendar-day-number';
        value.textContent = String(date.getDate());
        day.appendChild(value);
        calendar.appendChild(day);
      })(cursor);
      cursor.setDate(cursor.getDate() + 1);
    }
    return calendar;
  }

  function resourceRelativeDayText(value) {
    var date = resourceDateObject(value);
    if (!date) return '';
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var dateUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    var todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    var diff = Math.round((dateUtc - todayUtc) / 86400000);
    if (diff === 0) return '今天';
    return Math.abs(diff) + '天' + (diff < 0 ? '前' : '后');
  }

  function resourceSortedScheduleRows(rows) {
    var todayKey = resourceDateKey(new Date());
    var pending = [];
    var completed = [];
    (rows || []).forEach(function (row) {
      if (!row || !row.date) return;
      (row.date >= todayKey ? pending : completed).push(row);
    });
    pending.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    completed.sort(function (a, b) { return a.date > b.date ? -1 : (a.date < b.date ? 1 : 0); });
    if (pending.length) return pending.concat(completed);
    return completed;
  }

  function makeResourceDaySchedule(rows) {
    var schedule = document.createElement('div');
    schedule.className = 'resource-day-schedule';
    resourceSortedScheduleRows(rows).forEach(function (row) {
      if (!row.text) return;
      var item = document.createElement('div');
      item.className = 'hotspot-post-item resource-day-schedule-item';
      var title = document.createElement('div');
      title.className = 'hotspot-post-title';
      title.textContent = row.text;
      var meta = document.createElement('div');
      meta.className = 'hotspot-post-meta';
      var date = document.createElement('span');
      date.className = 'hotspot-post-time';
      date.textContent = row.date;
      var relative = document.createElement('span');
      relative.className = 'hotspot-post-count';
      var relativeText = resourceRelativeDayText(row.date);
      relative.textContent = relativeText;
      if (/^(今天|[1-7]天后)$/.test(relativeText)) item.classList.add('is-upcoming');
      meta.appendChild(date);
      meta.appendChild(relative);
      item.appendChild(title);
      item.appendChild(meta);
      schedule.appendChild(item);
    });
    return schedule;
  }

  function renderResourceViewer(id, section, selected, animate) {
    var viewerBody = section._files.viewerBody;
    var oldViewer = viewerBody.querySelector('.resource-viewer');
    if (!selected) {
      viewerBody.innerHTML = '';
      return;
    }
    var viewer = document.createElement('div');
    viewer.className = 'resource-viewer';
    var image = document.createElement('img');
    image.alt = selected.title || selected.file;
    image.decoding = 'async';
    image.loading = 'eager';
    image.draggable = false;
    bindResponsiveAsset(image, resourcePictureUrl(id, selected.file));
    viewer.appendChild(image);
    enableResourceViewerZoom(viewer, image);
    if (!oldViewer || !animate) {
      viewerBody.innerHTML = '';
      viewerBody.appendChild(viewer);
      return;
    }
    viewer.classList.add('is-entering');
    viewerBody.appendChild(viewer);
    oldViewer.classList.add('is-leaving');
    setTimeout(function () {
      if (oldViewer.parentNode) oldViewer.remove();
    }, 260);
  }

  function openResourceImageOverlay(id, selected) {
    if (!selected) return;
    var oldOverlay = document.querySelector('.resource-image-overlay');
    if (oldOverlay && oldOverlay.parentNode) oldOverlay.parentNode.removeChild(oldOverlay);
    var overlay = document.createElement('div');
    overlay.className = 'resource-image-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', selected.title || '浏览图片');
    var image = document.createElement('img');
    image.className = 'resource-image-overlay-img';
    image.alt = selected.title || selected.file;
    image.decoding = 'async';
    image.loading = 'eager';
    image.draggable = false;
    bindResponsiveAsset(image, resourcePictureUrl(id, selected.file));
    overlay.appendChild(image);
    document.body.appendChild(overlay);
    enableResourceViewerZoom(overlay, image);
    var closeTimer = 0;

    function closeOverlay() {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = 0;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    function layoutDefault() {
      var naturalWidth = image.naturalWidth || image.width || 0;
      var naturalHeight = image.naturalHeight || image.height || 0;
      if (!naturalWidth || !naturalHeight) return;
      var displayWidth = Math.min(naturalWidth, window.innerWidth);
      var displayHeight = naturalHeight * displayWidth / naturalWidth;
      overlay.style.padding = '0';
      image.style.margin = '0';
      image.style.maxHeight = 'none';
      image.style.width = displayWidth + 'px';
      image.style.height = 'auto';
      overlay.classList.toggle('is-tall', displayHeight > window.innerHeight);
      requestAnimationFrame(function () {
        if (!overlay.isConnected) return;
        overlay.classList.toggle('is-tall', (image.offsetHeight || displayHeight) > window.innerHeight);
        if (overlay._resourceZoom) overlay._resourceZoom.reset();
      });
    }

    if (image.complete) layoutDefault();
    else image.addEventListener('load', layoutDefault, { once: true });

    overlay.addEventListener('click', function (event) {
      if (event.target !== overlay && event.target !== image) return;
      if (overlay._resourceZoom && overlay._resourceZoom.wasMoved()) return;
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = 0;
        return;
      }
      closeTimer = setTimeout(closeOverlay, 220);
    });
    overlay.addEventListener('dblclick', function () {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = 0;
      }
    });
  }

  function openDonationImagesOverlay(sources) {
    sources = (sources || []).filter(Boolean);
    if (!sources.length) return;
    var oldOverlay = document.querySelector('.resource-image-overlay');
    if (oldOverlay && oldOverlay.parentNode) oldOverlay.parentNode.removeChild(oldOverlay);
    var overlay = document.createElement('div');
    overlay.className = 'resource-image-overlay donation-image-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', '捐赠');
    var stack = document.createElement('div');
    stack.className = 'resource-image-overlay-stack';
    var images = sources.map(function (src, index) {
      var image = document.createElement('img');
      image.className = 'resource-image-overlay-img';
      image.alt = index === 0 ? '微信捐赠' : '支付宝捐赠';
      image.decoding = 'async';
      image.loading = 'eager';
      image.draggable = false;
      image.src = src;
      stack.appendChild(image);
      return image;
    });
    overlay.appendChild(stack);
    document.body.appendChild(overlay);
    enableResourceViewerZoom(overlay, stack);

    function layoutDefault() {
      if (!overlay.isConnected) return;
      var maxNaturalWidth = 1;
      var imagesReady = true;
      images.forEach(function (image) {
        if (!image.naturalWidth || !image.naturalHeight) imagesReady = false;
        maxNaturalWidth = Math.max(maxNaturalWidth, image.naturalWidth || 0);
      });
      if (!imagesReady) return;
      var displayWidth = Math.min(maxNaturalWidth, window.innerWidth);
      stack.style.width = displayWidth + 'px';
      stack.style.margin = '0';
      stack.style.padding = '0';
      images.forEach(function (image) {
        image.style.width = '100%';
        image.style.height = 'auto';
        image.style.margin = '0';
        image.style.maxWidth = 'none';
        image.style.maxHeight = 'none';
      });
      requestAnimationFrame(function () {
        if (!overlay.isConnected) return;
        overlay.classList.toggle('is-tall', (stack.offsetHeight || 0) > window.innerHeight);
        if (overlay._resourceZoom) overlay._resourceZoom.reset();
      });
    }

    var loaded = 0;
    images.forEach(function (image) {
      var onImageReady = function () {
        loaded += 1;
        if (loaded >= images.length) layoutDefault();
      };
      if (image.complete) onImageReady();
      else image.addEventListener('load', onImageReady, { once: true });
      image.addEventListener('error', onImageReady, { once: true });
    });

    var closeTimer = 0;
    function closeOverlay() {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = 0;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    overlay.addEventListener('click', function (event) {
      if (event.target !== overlay && event.target !== stack && !stack.contains(event.target)) return;
      if (overlay._resourceZoom && overlay._resourceZoom.wasMoved()) return;
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = 0;
        return;
      }
      closeTimer = setTimeout(closeOverlay, 220);
    });
    overlay.addEventListener('dblclick', function () {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = 0;
      }
    });
  }
  function selectResourcePicture(id, section, file) {
    var state = filesPageState(id);
    state.selectedPicture = file;
    var cards = section._files.browseBody.querySelectorAll('.resource-preview-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('is-selected', cards[i]._resourceFile === file);
    }
    var selected = (state.items || []).filter(function (item) {
      return item.file === file;
    })[0] || null;
    var outerViewer = document.documentElement.classList.contains('outer-screen-layout');
    if (outerViewer) {
      openResourceImageOverlay(id, selected);
      return;
    }
    renderResourceViewer(id, section, selected, true);
  }

  function renderFilesPage(id, section) {
    if (!section || !section._files) return;
    var state = filesPageState(id);
    var items = state.items || [];
    var dates = state.dates || [];
    var browseBody = section._files.browseBody;
    var scheduleBody = section._files.scheduleBody;

    browseBody.innerHTML = '';
    var selected = items.filter(function (item) { return item.file === state.selectedPicture; })[0] || items[0];
    var gameApi = window.FGEXPIG_MINIGAMES;
    if (gameApi && typeof gameApi.has === 'function' && gameApi.has(id)) {
      browseBody.appendChild(makeResourceGameEntry(id));
    } else {
      var summary = document.createElement('div');
      summary.className = 'resource-browse-summary';
      summary.setAttribute('aria-hidden', 'true');
      browseBody.appendChild(summary);
    }

    if (items.length) {
      var grid = document.createElement('div');
      grid.className = 'resource-preview-grid';
      var fragment = document.createDocumentFragment();
      items.forEach(function (item, index) {
        fragment.appendChild(makeResourcePreviewCard(id, section, item, index));
      });
      grid.appendChild(fragment);
      browseBody.appendChild(grid);
    }

    renderResourceViewer(id, section, selected);

    if (scheduleBody._scheduleListCleanup) {
      scheduleBody._scheduleListCleanup();
      scheduleBody._scheduleListCleanup = null;
    }
    scheduleBody.innerHTML = '';
    if (dates.length) {
      var scheduleView = document.createElement('div');
      scheduleView.className = 'resource-schedule-view';
      var daySchedule = makeResourceDaySchedule(dates);
      scheduleView.appendChild(makeResourceCalendar(id, dates));
      scheduleView.appendChild(daySchedule);
      scheduleBody.appendChild(scheduleView);
      scheduleBody._scheduleListCleanup = attachManualScroll(daySchedule);
    }
  }

  function ensureFilesData(id, section) {
    if (!section) return null;
    if (section._filesId !== id) {
      section._filesId = id;
      section._filesLoading = null;
      section._filesToken = (section._filesToken || 0) + 1;
      if (section._files) {
        [section._files.browseBody, section._files.viewerBody, section._files.scheduleBody].forEach(function (body) {
          if (body) body.replaceChildren();
        });
      }
    }
    if (section._filesLoading) return section._filesLoading;
    var renderToken = section._filesToken || 0;
    section._filesLoading = Promise.all([loadResourceItems(id), loadResourceDates(id)]).then(function () {
      if (!section.isConnected || renderToken !== (section._filesToken || 0)) return;
      renderFilesPage(id, section);
      var page = section.closest('.page');
      if (page && page.classList.contains('active') && section.classList.contains('active')) {
        playInterfaceAnimation(false);
      }
    });
    return section._filesLoading;
  }

  var FILES_PAGE_IMAGE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect fill="none" stroke="currentColor" stroke-width="2" x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.7" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m4 17 5-5 4 4 2-2 5 5"/></svg>';
  var FILES_PAGE_CALENDAR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect fill="none" stroke="currentColor" stroke-width="2" x="3" y="5" width="18" height="16" rx="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3 10h18M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>';

  function setFilesPortraitPage(section, page, animateSwitch) {
    if (!section || !section._files) return;
    var nextPage = page === 'schedule' ? 'schedule' : 'browse';
    var showingSchedule = nextPage === 'schedule';
    section._files.portraitPage = nextPage;
    if (document.documentElement.classList.contains('outer-screen-layout')) section._outerFilesView = showingSchedule ? 'schedule' : 'browse';
    section.classList.toggle('portrait-show-schedule', showingSchedule);
    var buttons = section.querySelectorAll('.files-portrait-page-btn');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].innerHTML = showingSchedule ? FILES_PAGE_CALENDAR_ICON : FILES_PAGE_IMAGE_ICON;
      buttons[i].dataset.icon = showingSchedule ? 'calendar' : 'image';
      buttons[i].setAttribute('aria-label', showingSchedule ? '当前为日程页，切换到浏览卡片' : '当前为浏览页，切换到日程卡片');
    }
    if (animateSwitch) {
      var nextBody = showingSchedule ? section._files.scheduleBody : section._files.browseBody;
      requestAnimationFrame(function () {
        if (section.isConnected && nextBody) animateCardBody(nextBody, 0);
      });
    }
  }

  function makeFilesPortraitPageButton(section) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'achv-detail-back files-portrait-page-btn';
    button.innerHTML = FILES_PAGE_IMAGE_ICON;
    button.dataset.icon = 'image';
    button.onclick = function () {
      var current = section && section._files ? section._files.portraitPage : 'browse';
      setFilesPortraitPage(section, current === 'schedule' ? 'browse' : 'schedule', true);
    };
    return button;
  }

  function buildFilesSection(id, section) {
    if (!section || section._filesBuilt) return;
    section._filesBuilt = true;
    section.classList.add('files-section');
    section.innerHTML = '';
    var browseCard = makeReusableCardShell('files-browse', 'files-browse-card', '浏览', true);
    var viewerCard = makeReusableCenterCard('files', 'files-viewer-card', '观赏');
    var scheduleCard = makeReusableCardShell('files-schedule', 'files-schedule-card', '日程', false);
    viewerCard.title.appendChild(makeOuterBackButton(function () {
      setFilesOuterView(section, 'browse', true);
    }, '返回浏览卡片'));
    browseCard.title.appendChild(makeFilesPortraitPageButton(section));
    scheduleCard.title.appendChild(makeFilesPortraitPageButton(section));
    section.appendChild(browseCard.card);
    section.appendChild(viewerCard.card);
    section.appendChild(scheduleCard.card);
    section._files = {
      browseBody: browseCard.body,
      viewerBody: viewerCard.body,
      scheduleBody: scheduleCard.body,
      portraitPage: 'browse'
    };
    section._outerFilesView = 'browse';
    section._filesId = id;
    section.classList.add('outer-show-browse');
    setFilesPortraitPage(section, 'browse');
    renderFilesPage(id, section);
    configureTopActions();
    syncNonOuterCardBlurLayers();
  }

  // 为 logo 页面创建板块子页容器（每个导航项对应一个独立子页）
  function ensureSections(logo) {
    var data = navCache[logo];
    if (!data) return;
    var page = pages[LOGOS.indexOf(logo)];
    if (!page) return;
    // 仅当已有合法的 page-section 子元素时才跳过；否则（空页或子元素异常）重建
    var hasSections = page.querySelector('.page-section') !== null;
    if (hasSections) return;
    // 清理可能残留的非法子元素
    disposeSectionCardResources(page);
    page.innerHTML = '';
    var activeKey = data.active || (data.items[0] && data.items[0][0]);
    for (var i = 0; i < data.items.length; i++) {
      var key = data.items[i][0];
      var div = document.createElement('div');
      div.className = 'page-section';
      div.dataset.section = key;

      // 非首页板块：3 列空卡片占位；热点与资源使用各自的专用布局
      if (key !== 'home' && key !== 'news' && key !== 'files' && key !== 'settings') {
        [1, 2, 3].forEach(function (n) {
          var c = document.createElement('div');
          c.className = 'section-card';
          var t = document.createElement('div');
          t.className = 'section-card-title';
          t.textContent = data.items[i][1];
          c.appendChild(t);
          var b = document.createElement('div');
          b.className = 'section-card-body';
          attachManualScroll(b);
          c.appendChild(b);
          div.appendChild(c);
        });
      }

      page.appendChild(div);
      // Only materialize the visible section. Hidden sections are built on first use.
      if (key === 'news' && key === activeKey) {
        buildHotspotSection(logo, div);
      } else if (key === 'files' && key === activeKey) {
        buildFilesSection(logo, div);
      }
    }
    syncNonOuterCardBlurLayers();
  }

  function resetOuterPageScroll(section) {
    clearOuterPageScroll(section);
  }

  function setOuterPageScroll(section, top) {
    if (section == null) return;
    if (document.documentElement.classList.contains('outer-screen-layout') === false) return;
    section.scrollTop = top;
    requestAnimationFrame(function () {
      if (section.isConnected) section.scrollTop = top;
    });
  }

  function clearOuterPageScroll(section) {
    if (section == null) return;
    section._outerSecondaryActive = false;
    section._outerFirstLevelScrollTop = 0;
    setOuterPageScroll(section, 0);
  }

  function enterOuterSecondary(section, resetToTop) {
    if (section == null) return;
    if (document.documentElement.classList.contains('outer-screen-layout') === false) return;
    if (section._outerSecondaryActive === true) {
      if (resetToTop === false) return;
      setOuterPageScroll(section, 0);
      return;
    }
    section._outerFirstLevelScrollTop = section.scrollTop;
    section._outerSecondaryActive = true;
    if (resetToTop === false) return;
    setOuterPageScroll(section, 0);
  }

  function leaveOuterSecondary(section) {
    if (section == null) return;
    if (document.documentElement.classList.contains('outer-screen-layout') === false) return;
    var top = 0;
    if (typeof section._outerFirstLevelScrollTop === 'number') top = section._outerFirstLevelScrollTop;
    section._outerSecondaryActive = false;
    setOuterPageScroll(section, top);
  }

  // 切换 logo 页内的板块子页
  function showSection(logo, key) {
    var page = pages[LOGOS.indexOf(logo)];
    if (!page) return;
    if (key === 'settings') {
      var settingsSection = page.querySelector('.page-section[data-section="settings"]');
      if (!settingsSection) {
        settingsSection = document.createElement('div');
        settingsSection.className = 'page-section';
        settingsSection.dataset.section = 'settings';
        page.appendChild(settingsSection);
      }
      buildSettingsSection(settingsSection);
    }
    // 兜底：若板块子页尚未创建，先创建再切换
    if (!page.querySelector('.page-section')) {
      ensureSections(logo);
    }
    var kids = page.children;
    var found = false;
    for (var j = 0; j < kids.length; j++) {
      var isActive = kids[j].dataset.section === key;
      kids[j].classList.toggle('active', isActive);
      if (isActive) found = true;
      if (isActive && key === 'news') {
        buildHotspotSection(logo, kids[j]);
        var hotspot = kids[j]._hotspot;
        if (hotspot && hotspot.id !== logo) {
          hotspot.id = logo;
          hotspot.postListSignature = null;
          hotspot.search.value = '';
          hotspot.postList.replaceChildren();
          hotspot.contentBody.replaceChildren();
          hotspot.commentsBody.replaceChildren();
          resetHotspotCommentsView(kids[j]);
        }
        if (hotspot) {
          var hotspotSection = kids[j];
          var hotspotDataState = hotspotState(logo);
          if (hotspotDataState.postsLoaded) {
            renderHotspotSection(logo, hotspotSection);
            if (hotspot.keywordList) animateCardBody(hotspot.keywordList, 0);
          } else if (hotspotDataState.postsPromise) {
            var hotspotToken = (hotspotSection._hotspotRenderToken || 0) + 1;
            hotspotSection._hotspotRenderToken = hotspotToken;
            hotspotDataState.postsPromise.then(function () {
              if (hotspotSection._hotspotRenderToken !== hotspotToken || hotspot.id !== logo) return;
              if (!hotspotDataState.postsLoaded) renderHotspotSection(logo, hotspotSection);
            });
          }
        }
      }
      if (isActive && key === 'files') {
        buildFilesSection(logo, kids[j]);
        ensureFilesData(logo, kids[j]);
      }
    }
    // 若未找到目标板块（异常情况），强制激活第一个子页保证页面可交互
    if (!found && kids.length) {
      kids[0].classList.add('active');
    }
    if (key === 'settings') {
      var activeSettingsSection = page.querySelector('.page-section[data-section="settings"].active');
      if (activeSettingsSection) setSettingsOuterView(activeSettingsSection, activeSettingsSection._outerSettingsView || 'rank', false);
    }
    resetOuterPageScroll(page.querySelector('.page-section.active'));
    configureTopActions();
  }

  var TOP_ACTION_BACK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="M20 12H4M12 4l-8 8 8 8"/></svg>';
  var TOP_ACTION_SORT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="M8 4v16M4 16l4 4 4-4M16 20V4M12 8l4-4 4 4"/></svg>';
  var TOP_ACTION_SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10.5 3a7.5 7.5 0 1 0 4.55 13.45l4.25 4.25 1.41-1.41-4.25-4.25A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z"/></svg>';
  var topActionFrame = 0;
  var topActionConfig = null;
  var topActionSelectTimer = 0;
  var topActionThumbX = 0;
  var topActionThumbW = 0;
  var topActionThumbAnimFrame = 0;
  var topActionDragFollowFrame = 0;
  var topActionDragFollowTime = 0;
  var topActionDrag = null;
  var topActionSuppressClick = false;
  var topActionColorOverlay = null;
  var topActionColorItems = [];
  var settingsPersonalViews = [];

  function currentActionSection() {
    return pagesWrap ? pagesWrap.querySelector('.page.active .page-section.active') : null;
  }

  function hideTopActions() {
    if (!topActionsEl) return;
    if (topActionSelectTimer) clearTimeout(topActionSelectTimer);
    topActionSelectTimer = 0;
    topActionDrag = null;
    topActionsEl.hidden = true;
    topActionsEl.dataset.mode = '';
    topActionNav.classList.remove('pressing', 'dragging', 'no-anim', 'nav-thumb-animating');
    topActionNav.innerHTML = '';
    topActionColorOverlay = null;
    topActionColorItems = [];
    hideTopActionLiquidGlassSurface();
    topActionRight.hidden = true;
    topActionRightSecondary.hidden = true;
  }

  function applyTopActionThumbPosition() {
    var thumb = topActionNav ? topActionNav.querySelector('.top-action-thumb') : null;
    if (!thumb) return;
    thumb.style.width = topActionThumbW + 'px';
    thumb.style.transform = 'translateX(' + topActionThumbX + 'px) scale(var(--top-action-thumb-scale, 1))';
    scheduleTopActionLiquidGlassRender();
    syncTopActionColorOverlay();
  }

  function topActionThumbGeometry(button) {
    if (!button) return { x: 0, w: 0 };
    var label = button.querySelector('.topnav-item-label');
    var textWidth = label ? label.offsetWidth : button.offsetWidth;
    var width = Math.max(1, Math.round(textWidth * 1.2));
    var x = Math.round(button.offsetLeft + (button.offsetWidth - width) / 2);
    return { x: x, w: width };
  }

  function positionTopActionThumb() {
    if (!topActionNav) return;
    var active = topActionNav.querySelector('.top-action-item.is-active');
    if (!active) return;
    var geometry = topActionThumbGeometry(active);
    topActionThumbX = geometry.x;
    topActionThumbW = geometry.w;
    applyTopActionThumbPosition();
  }

  function animateTopActionThumbTo(targetX, targetW, duration) {
    if (topActionThumbAnimFrame) cancelAnimationFrame(topActionThumbAnimFrame);
    topActionNav.classList.add('nav-thumb-animating');
    var animationDuration = Math.max(1, Number(duration) || 380);
    var startX = topActionThumbX;
    var started = 0;
    topActionThumbW = targetW;
    topActionThumbAnimFrame = requestAnimationFrame(function frame(now) {
      if (!started) started = now;
      var progress = Math.min(1, (now - started) / animationDuration);
      var eased = 1 - Math.pow(1 - progress, 3);
      topActionThumbX = startX + (targetX - startX) * eased;
      applyTopActionThumbPosition();
      if (progress < 1) {
        topActionThumbAnimFrame = requestAnimationFrame(frame);
      } else {
        topActionThumbAnimFrame = 0;
        topActionThumbX = targetX;
        topActionNav.classList.remove('nav-thumb-animating');
        applyTopActionThumbPosition();
      }
    });
  }

  function scheduleTopActionSync() {
    if (topActionFrame) cancelAnimationFrame(topActionFrame);
    topActionFrame = requestAnimationFrame(function () {
      topActionFrame = 0;
      positionTopActionThumb();
    });
  }

  function topActionKeyAt(centerX) {
    if (!topActionNav) return null;
    var buttons = topActionNav.querySelectorAll('.top-action-item');
    var best = null;
    var bestDistance = Infinity;
    for (var i = 0; i < buttons.length; i++) {
      var center = buttons[i].offsetLeft + buttons[i].offsetWidth * 0.5;
      var distance = Math.abs(center - centerX);
      if (distance < bestDistance) { bestDistance = distance; best = buttons[i].dataset.view; }
    }
    return best;
  }

  function setTopActionThumbX(x) {
    if (!topActionNav || !topActionNav.querySelector('.top-action-thumb')) return;
    topActionThumbX = x;
    applyTopActionThumbPosition();
  }

  function clearTopActionLabelMask(label) {
    if (!label) return;
    label.style.webkitMaskImage = 'none';
    label.style.maskImage = 'none';
    label.style.webkitMaskRepeat = '';
    label.style.maskRepeat = '';
    label.style.webkitMaskSize = '';
    label.style.maskSize = '';
  }

  function syncTopActionColorOverlay() {
    if (!topActionColorOverlay || !topActionNav) return;
    var navRect = topActionNav.getBoundingClientRect();
    var thumbEl = topActionNav.querySelector('.top-action-thumb');
    var thumbHeight = 28;
    var thumbTop = 4;
    if (thumbEl) {
      var thumbStyle = getComputedStyle(thumbEl);
      var computedHeight = parseFloat(thumbStyle.height);
      var computedTop = parseFloat(thumbStyle.top);
      if (isFinite(computedHeight)) thumbHeight = computedHeight;
      if (isFinite(computedTop)) thumbTop = computedTop;
    }
    var press = topActionLiquidGlass ? topActionLiquidGlass.press : 0;
    var scale = 1 + ((74 / 56) - 1) * press;
    var left = topActionThumbX - (topActionThumbW * (scale - 1) * 0.5);
    var top = thumbTop - (thumbHeight * (scale - 1) * 0.5);
    var width = topActionThumbW * scale;
    var height = thumbHeight * scale;
    topActionColorOverlay.style.left = left.toFixed(2) + 'px';
    topActionColorOverlay.style.top = top.toFixed(2) + 'px';
    topActionColorOverlay.style.width = width.toFixed(2) + 'px';
    topActionColorOverlay.style.height = height.toFixed(2) + 'px';
    for (var i = 0; i < topActionColorItems.length; i++) {
      var item = topActionColorItems[i];
      var labelStyle = getComputedStyle(item.label);
      item.copy.style.fontFamily = labelStyle.fontFamily;
      item.copy.style.fontSize = labelStyle.fontSize;
      item.copy.style.fontWeight = labelStyle.fontWeight;
      item.copy.style.lineHeight = labelStyle.lineHeight;
      item.copy.style.letterSpacing = labelStyle.letterSpacing;
      var rect = item.button.getBoundingClientRect();
      item.copy.style.left = (rect.left - navRect.left - left).toFixed(2) + 'px';
      item.copy.style.top = '50%';
      item.copy.style.transform = 'translateY(-50%)';
      var labelRect = item.label.getBoundingClientRect();
      var capsuleLeft = navRect.left + left;
      var capsuleRight = capsuleLeft + width;
      if (labelRect.right <= capsuleLeft - 2 || labelRect.left >= capsuleRight + 2) {
        clearTopActionLabelMask(item.label);
        continue;
      }
      var maskX = (navRect.left + left + width * 0.5) - labelRect.left;
      var maskY = (navRect.top + top + height * 0.5) - labelRect.top;
      var maskRx = width * 0.5 + 4;
      var maskRy = height * 0.5 + 4;
      var maskImage = 'radial-gradient(ellipse ' + maskRx.toFixed(2) + 'px ' + maskRy.toFixed(2) + 'px at ' + maskX.toFixed(2) + 'px ' + maskY.toFixed(2) + 'px, transparent 0 98%, #000 100%)';
      item.label.style.webkitMaskImage = maskImage;
      item.label.style.maskImage = maskImage;
      item.label.style.webkitMaskRepeat = 'no-repeat';
      item.label.style.maskRepeat = 'no-repeat';
      item.label.style.webkitMaskSize = '100% 100%';
      item.label.style.maskSize = '100% 100%';
    }
  }

  function buildTopActionColorOverlay(buttons) {
    if (!topActionNav) return;
    if (topActionColorOverlay && topActionColorOverlay.parentNode) {
      topActionColorOverlay.parentNode.removeChild(topActionColorOverlay);
    }
    topActionColorOverlay = document.createElement('div');
    topActionColorOverlay.className = 'topnav-color-overlay top-action-color-overlay';
    topActionColorOverlay.setAttribute('aria-hidden', 'true');
    topActionColorItems = [];
    var navRect = topActionNav.getBoundingClientRect();
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var label = btn.querySelector('.topnav-item-label');
      var content = btn.querySelector('.topnav-item-content');
      if (!label || !content) continue;
      var rect = btn.getBoundingClientRect();
      var style = getComputedStyle(label);
      var copy = content.cloneNode(true);
      copy.className = 'topnav-color-label';
      copy.style.left = (rect.left - navRect.left) + 'px';
      copy.style.top = (rect.top - navRect.top) + 'px';
      copy.style.width = rect.width + 'px';
      copy.style.height = rect.height + 'px';
      copy.style.fontFamily = style.fontFamily;
      copy.style.fontSize = style.fontSize;
      copy.style.fontWeight = style.fontWeight;
      copy.style.lineHeight = style.lineHeight;
      topActionColorOverlay.appendChild(copy);
      topActionColorItems.push({ button: btn, label: content, copy: copy });
    }
    topActionNav.appendChild(topActionColorOverlay);
    syncTopActionColorOverlay();
    requestAnimationFrame(syncTopActionColorOverlay);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncTopActionColorOverlay);
  }

  function updateTopActionGlassPointer(event) {
    if (!topActionNav || !topActionLiquidGlass || !topActionGlassActive()) return;
    var rect = topActionNav.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    var y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    topActionNav.style.setProperty('--glass-pointer-x', (x / rect.width * 100).toFixed(2) + '%');
    topActionNav.style.setProperty('--glass-pointer-y', (y / rect.height * 100).toFixed(2) + '%');
    topActionLiquidGlassPointer.x = x;
    topActionLiquidGlassPointer.y = y;
    topActionLiquidGlassPointer.active = true;
    scheduleTopActionLiquidGlassRender();
  }

  function clearTopActionGlassPointer() {
    if (topActionNav) {
      topActionNav.style.setProperty('--glass-pointer-x', '50%');
      topActionNav.style.setProperty('--glass-pointer-y', '50%');
    }
    topActionLiquidGlassPointer.active = false;
    scheduleTopActionLiquidGlassRender();
  }

  function stopTopActionDragFollow() {
    if (topActionDragFollowFrame) cancelAnimationFrame(topActionDragFollowFrame);
    topActionDragFollowFrame = 0;
    topActionDragFollowTime = 0;
  }

  function stepTopActionDragFollow(now) {
    topActionDragFollowFrame = 0;
    if (!topActionDrag || !topActionDrag.moved || typeof topActionDrag.targetX !== 'number') return;
    var dt = topActionDragFollowTime ? Math.min(32, Math.max(8, now - topActionDragFollowTime)) : 16;
    topActionDragFollowTime = now;
    var diff = topActionDrag.targetX - topActionThumbX;
    if (Math.abs(diff) < 0.08) {
      topActionThumbX = topActionDrag.targetX;
      applyTopActionThumbPosition();
      return;
    }
    var response = 1 - Math.exp(-dt / 18);
    topActionThumbX += diff * response;
    applyTopActionThumbPosition();
    topActionDragFollowFrame = requestAnimationFrame(stepTopActionDragFollow);
  }

  function startTopActionDragFollow() {
    if (!topActionDrag || !topActionDrag.moved || topActionDragFollowFrame) return;
    topActionDragFollowTime = performance.now();
    topActionDragFollowFrame = requestAnimationFrame(stepTopActionDragFollow);
  }

  function endTopActionPress(event) {
    if (!topActionDrag || topActionDrag.pointerId !== event.pointerId) return;
    var drag = topActionDrag;
    stopTopActionDragFollow();
    topActionDrag = null;
    topActionNav.classList.remove('pressing', 'dragging');
    scheduleTopActionLiquidGlassRender();
    syncTopActionColorOverlay();
    if (topActionNav.releasePointerCapture) { try { topActionNav.releasePointerCapture(event.pointerId); } catch (err) {} }
    if (event.type !== 'pointerup' || !drag.moved) return;
    var finalX = typeof drag.targetX === 'number' ? drag.targetX : topActionThumbX;
    var key = topActionKeyAt(finalX + topActionThumbW * 0.5) || drag.hitKey;
    if (key) selectTopAction(key, true);
  }

  function bindTopActionEvents() {
    if (!topActionNav || topActionNav._topActionEventsBound) return;
    topActionNav._topActionEventsBound = true;
  }
  function selectTopAction(key, animate) {
    var config = topActionConfig;
    var active = topActionNav.querySelector('.top-action-item.is-active');
    var target = topActionNav.querySelector('.top-action-item[data-view="' + key + '"]');
    if (!target) return;
    if (target === active) {
      if (config && typeof config.onSelect === 'function') config.onSelect(key);
      return;
    }
    active.classList.remove('is-active');
    target.classList.add('is-active');
    var geometry = topActionThumbGeometry(target);
    var targetW = geometry.w;
    var targetX = geometry.x;
    if (animate !== false && innerScreenLayoutActive && topActionLiquidGlass) {
      animateTopActionThumbTo(targetX, targetW);
    } else {
      if (topActionThumbAnimFrame) { cancelAnimationFrame(topActionThumbAnimFrame); topActionThumbAnimFrame = 0; }
      topActionNav.classList.remove('nav-thumb-animating');
      topActionThumbX = targetX;
      topActionThumbW = targetW;
      applyTopActionThumbPosition();
    }
    if (config && typeof config.onSelect === 'function') config.onSelect(key);
  }

  function showTopActionSearch(section) {
    if (!topActionsEl || !topActionNav || !section || !section._hotspot) return;
    var searchValue = section._hotspot.search ? section._hotspot.search.value : '';
    var existingInput = topActionNav.querySelector('.top-action-search');
    if (topActionNav.classList.contains('top-action-search-nav') && existingInput) {
      topActionConfig = null;
      topActionsEl.hidden = false;
      topActionsEl.dataset.mode = 'news-search';
      topActionLeft.hidden = true;
      topActionRight.hidden = true;
    topActionRightSecondary.hidden = true;
      if (existingInput.value !== searchValue) existingInput.value = searchValue;
      scheduleTopActionLiquidGlassSync(true);
      return;
    }
    topActionConfig = null;
    topActionsEl.hidden = false;
    topActionsEl.dataset.mode = 'news-search';
    topActionLeft.hidden = true;
    topActionRight.hidden = true;
    topActionRightSecondary.hidden = true;
    topActionNav.classList.remove('pressing', 'dragging', 'no-anim', 'nav-thumb-animating', 'liquid-glass-ready');
    topActionNav.classList.add('top-action-search-nav');
    hideTopActionLiquidGlassSurface();
    topActionNav.innerHTML = '';
    topActionColorOverlay = null;
    topActionColorItems = [];
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'top-action-search';
    input.inputMode = 'search';
    input.enterKeyHint = 'search';
    input.setAttribute('aria-label', '搜索热点帖子');
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.value = searchValue;
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Backspace' || event.key === 'Delete' || event.keyCode === 8 || event.keyCode === 46) {
        event.stopPropagation();
      }
    });
    input.addEventListener('input', function () {
      if (section._hotspot.search) section._hotspot.search.value = input.value;
      var id = curNavLogo;
      if (!id) return;
      hotspotUiState(id).query = input.value;
      renderHotspotSection(id, section);
    });
    var icon = document.createElement('span');
    icon.className = 'top-action-search-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = TOP_ACTION_SEARCH_ICON;
    topActionNav.appendChild(input);
    topActionNav.appendChild(icon);
    scheduleTopActionLiquidGlassSync(true);
  }

  function showTopActions(config) {
    if (!topActionsEl || !topActionNav || !topActionLeft || !topActionRight || !config || !config.items || !config.items.length) {
      hideTopActions();
      return;
    }
    var previousConfig = topActionConfig;
    var sameItems = previousConfig && previousConfig.mode === config.mode && previousConfig.items.length === config.items.length;
    if (sameItems) {
      for (var si = 0; si < config.items.length; si++) {
        if (previousConfig.items[si][0] !== config.items[si][0] || previousConfig.items[si][1] !== config.items[si][1]) {
          sameItems = false;
          break;
        }
      }
    }
    if (sameItems && topActionNav.querySelector('.top-action-item')) {
      topActionConfig = config;
      var sameButtons = topActionNav.querySelectorAll('.top-action-item');
      for (var sbi = 0; sbi < sameButtons.length; sbi++) {
        sameButtons[sbi].classList.toggle('is-active', sameButtons[sbi].dataset.view === config.active);
      }
      topActionLeft.innerHTML = config.leftIcon || TOP_ACTION_BACK_ICON;
      topActionLeft.setAttribute('aria-label', config.leftLabel || '返回');
      topActionLeft.onclick = config.onLeft || function () {};
      topActionRight.hidden = !config.rightAction;
      topActionRightSecondary.hidden = config.rightAction2 ? false : true;
      topActionRightSecondary.innerHTML = config.rightIcon2 ? config.rightIcon2 : '';
      topActionRightSecondary.setAttribute('aria-label', config.rightLabel2 ? config.rightLabel2 : '页面操作');
      topActionRightSecondary.onclick = config.rightAction2 ? config.rightAction2 : function () {};
      topActionRight.classList.toggle('is-ascending', config.rightAscending === true);
      topActionRight.innerHTML = config.rightIcon || '';
      topActionRight.setAttribute('aria-label', config.rightLabel || '页面操作');
      topActionRight.onclick = config.rightAction || function () {};
      topActionLeft.hidden = config.showLeft === false;
      if (!topActionThumbAnimFrame) positionTopActionThumb();
      scheduleTopActionLiquidGlassSync(true);
      return;
    }
    topActionConfig = config;
    topActionsEl.hidden = false;
    topActionsEl.dataset.mode = config.mode || '';
    topActionLeft.hidden = config.showLeft === false;
    topActionLeft.innerHTML = config.leftIcon || TOP_ACTION_BACK_ICON;
    topActionLeft.setAttribute('aria-label', config.leftLabel || '返回');
    topActionLeft.onclick = config.onLeft || function () {};
    topActionRight.hidden = !config.rightAction;
      topActionRightSecondary.hidden = config.rightAction2 ? false : true;
      topActionRightSecondary.innerHTML = config.rightIcon2 ? config.rightIcon2 : '';
      topActionRightSecondary.setAttribute('aria-label', config.rightLabel2 ? config.rightLabel2 : '页面操作');
      topActionRightSecondary.onclick = config.rightAction2 ? config.rightAction2 : function () {};
      topActionRight.classList.toggle('is-ascending', config.rightAscending === true);
    topActionRight.innerHTML = config.rightIcon || '';
    topActionRight.setAttribute('aria-label', config.rightLabel || '页面操作');
    topActionRight.onclick = config.rightAction || function () {};
    topActionNav.classList.add('no-anim');
    topActionNav.classList.remove('pressing', 'nav-thumb-animating', 'liquid-glass-ready', 'top-action-search-nav');
    hideTopActionLiquidGlassSurface();
    topActionNav.innerHTML = '';
    var thumb = document.createElement('div');
    thumb.className = 'topnav-thumb top-action-thumb';
    topActionNav.appendChild(thumb);
    var topActionButtons = [];
    config.items.forEach(function (entry) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'topnav-item top-action-item' + (entry[0] === config.active ? ' is-active' : '');
      button.dataset.view = entry[0];
      var content = document.createElement('span');
      content.className = 'topnav-item-content';
      var label = document.createElement('span');
      label.className = 'topnav-item-label';
      label.textContent = entry[1];
      content.appendChild(label);
      button.appendChild(content);
      button.onclick = function () {
        selectTopAction(entry[0]);
      };
      topActionButtons.push(button);
      topActionNav.appendChild(button);
    });
    topActionColorOverlay = null;
    topActionColorItems = [];
    bindTopActionEvents();
    positionTopActionThumb();
    scheduleTopActionLiquidGlassSync(true);
    requestAnimationFrame(function () {
      topActionNav.classList.remove('no-anim');
      positionTopActionThumb();
      scheduleTopActionLiquidGlassSync(false);
    });
  }

  function setHomeOuterView(section, view, animate) {
    if (!section) return;
    var next = view === 'achv' ? 'achv' : 'home';
    if (next === 'achv' && section._outerAchvSecondary && typeof section._outerAchvBack === 'function') {
      section._outerAchvBack();
      return;
    }
    if (next !== 'achv') section._outerAchvSecondary = false;
    section._outerHomeView = next;
    section.classList.remove('outer-home-view-home', 'outer-home-view-detail', 'outer-home-view-achv', 'outer-home-view-review');
    section.classList.add('outer-home-view-' + next);
    resetOuterPageScroll(section);
    var card = section.querySelector(next === 'achv' ? '.home-achv-card' : '.home-detail-card');
    var body = card ? card.querySelector('.section-card-body') : null;
    if (body) {
      body.scrollTop = 0;
      if (animate) requestAnimationFrame(function () { animateCardBody(body, 0); });
    }
    scheduleSectionCardSnap(section);
    configureTopActions();
  }

  function setFilesOuterView(section, view, animate) {
    if (!section) return;
    var next = view === 'viewer' ? 'viewer' : view === 'schedule' ? 'schedule' : 'browse';
    section._outerFilesView = next === 'viewer' ? 'browse' : next;
    section.classList.toggle('outer-show-browse', next === 'browse');
    section.classList.toggle('outer-show-viewer', next === 'viewer');
    section.classList.toggle('outer-show-schedule', next === 'schedule');
    if (next === 'viewer') {
      enterOuterSecondary(section, true);
    } else if (next === 'browse') {
      if (section._outerSecondaryActive === true) leaveOuterSecondary(section);
      else resetOuterPageScroll(section);
    } else {
      resetOuterPageScroll(section);
    }
    if (section._files) {
      setFilesPortraitPage(section, next === 'schedule' ? 'schedule' : 'browse', false);
      var body = next === 'viewer' ? section._files.viewerBody : next === 'schedule' ? section._files.scheduleBody : section._files.browseBody;
      if (body) {
        body.scrollTop = 0;
        if (animate) requestAnimationFrame(function () { animateCardBody(body, 0); });
      }
    }
    scheduleSectionCardSnap(section);
    configureTopActions();
  }

  function setHotspotOuterView(section, view, animate) {
    if (!section || !section._hotspot) return;
    var next = view === 'content' ? 'content' : view === 'comments' ? 'comments' : 'title';
    section._outerNewsView = next;
    if (next === 'title') {
      if (section._outerSecondaryActive === true) leaveOuterSecondary(section);
      else resetOuterPageScroll(section);
    } else if (section._outerSecondaryActive !== true) {
      enterOuterSecondary(section, false);
    }
    if (next === 'title') {
      section.classList.remove('outer-show-secondary');
      section._hotspot.portraitView = 'content';
      section.classList.remove('portrait-show-comments');
      updateHotspotPortraitTabs(section);
    } else {
      section.classList.add('outer-show-secondary');
      setHotspotPortraitView(section, next, animate);
    }
    scheduleSectionCardSnap(section);
    configureTopActions();
  }

  function syncSettingsPersonalExp() {
    for (var i = 0; i < settingsPersonalViews.length; i++) {
      var view = settingsPersonalViews[i];
      if (view == null) continue;
      if (view.level == null) continue;
      if (sidebarLevelBadge) view.level.textContent = sidebarLevelBadge.textContent + '：';
      if (sidebarLevelRow) {
        if (view.row) view.row.className = 'settings-personal-exp ' + sidebarLevelRow.className;
      }
      if (sidebarExpTotal) view.total.textContent = sidebarExpTotal.textContent;
      if (sidebarExpFill) view.fill.style.width = sidebarExpFill.style.width;
      if (sidebarExpValue) view.value.textContent = sidebarExpValue.textContent;
    }
  }

  function openSettingsPersonalPanel(openPanel) {
    openSidebar('left');
    sidebarPanelOrigin = 'home';
    openPanel();
  }

  function makeSettingsPersonalAction(iconMarkup, label, handler) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'sidebar-item settings-personal-action';
    button.innerHTML = iconMarkup + '<span>' + label + '</span>';
    button.onclick = handler;
    return button;
  }

  function makeSettingsPersonalStatus(label, value) {
    var row = document.createElement('div');
    row.className = 'sidebar-item settings-personal-action is-fixed';
    row.innerHTML = '<span>' + label + '</span><span class="settings-personal-status-value">' + value + '</span>';
    return row;
  }

  function buildSettingsSection(section) {
    if (!section || section._settingsBuilt) return;
    section._settingsBuilt = true;
    section.classList.add('settings-section');
    section.innerHTML = '';

    var rankCard = makeHotspotCard('排名', 'settings-rank-card', false);
    var personalCard = makeHotspotCard('个人', 'settings-personal-card', false);
    var rankList = document.createElement('div');
    rankList.className = 'settings-rank-list';
    var rankSlots = [];
    ['experience', 'value', 'comments'].forEach(function (type) {
      var slot = document.createElement('div');
      slot.className = 'pause-ad-slot settings-rank-slot';
      slot.setAttribute('data-leaderboard', type);
      rankList.appendChild(slot);
      rankSlots.push(slot);
    });
    rankCard.body.appendChild(rankList);

    if (document.documentElement.classList.contains('outer-screen-layout')) {
      if (performanceModeInput) performanceModeInput.checked = false;
      setImageQuality(IMAGE_QUALITY_MIN, false);
      applyThemeSettings(98, 0, 0, IMAGE_QUALITY_MIN, false);
    }

    var actions = document.createElement('div');
    actions.className = 'settings-personal-actions';
    actions.appendChild(makeSettingsPersonalAction('', '用户切换', function () { openOuterAccountPage(); }));
    actions.appendChild(makeSettingsPersonalAction('', '称号', function () { openOuterPersonalSubpage(section, 'titles'); }));
    actions.appendChild(makeSettingsPersonalAction('', '开源', function () {
      window.open('https://github.com/JianZhaNoSwine/FGEXPIG-Official-Website', '_blank', 'noopener,noreferrer');
    }));
    actions.appendChild(makeSettingsPersonalAction('', '捐赠', function () {
      openDonationImagesOverlay(['wallpaper/wx.png', 'wallpaper/zfb.jpg']);
    }));
    personalCard.body.appendChild(actions);
    var personalSubpage = document.createElement('div');
    personalSubpage.className = 'settings-personal-subpage';
    personalSubpage.hidden = true;
    personalCard.body.appendChild(personalSubpage);

    section.appendChild(rankCard.card);
    section.appendChild(personalCard.card);
    section._outerSettingsView = 'rank';
    section.classList.add('outer-settings-view-rank');
    section._settingsPersonal = null;
    section._settingsPersonalActions = actions;
    section._settingsPersonalSubpage = personalSubpage;
    section._outerSettingsPersonalSubpage = '';
    syncSettingsPersonalExp();

    for (var i = 0; i < rankSlots.length; i++) {
      if (typeof pauseAdSlots !== 'undefined' && pauseAdSlots.indexOf(rankSlots[i]) < 0) pauseAdSlots.push(rankSlots[i]);
      if (typeof pauseLeaderboardResizeObserver !== 'undefined' && pauseLeaderboardResizeObserver) pauseLeaderboardResizeObserver.observe(rankSlots[i]);
    }
  }

  function setSettingsOuterView(section, view, animate) {
    if (!section || !section._settingsBuilt) return;
    if (section._outerSettingsPersonalSubpage) {
      section._outerSettingsPersonalSubpage = '';
      if (section._settingsPersonalSubpage) {
        section._settingsPersonalSubpage.hidden = true;
        section._settingsPersonalSubpage.innerHTML = '';
      }
      if (section._settingsPersonalActions) section._settingsPersonalActions.hidden = false;
    }
    var next = view === 'personal' ? 'personal' : 'rank';
    section._outerSettingsView = next;
    resetOuterPageScroll(section);
    section.classList.toggle('outer-settings-view-rank', next === 'rank');
    section.classList.toggle('outer-settings-view-personal', next === 'personal');
    if (next === 'rank') {
      renderPauseLeaderboards();
      schedulePauseLeaderboardViewportUpdate();
    } else {
      syncSettingsPersonalExp();
    }
    if (animate) {
      var card = section.querySelector(next === 'rank' ? '.settings-rank-card' : '.settings-personal-card');
      var body = card ? card.querySelector('.section-card-body') : null;
      if (body) requestAnimationFrame(function () { animateCardBody(body, 0); });
    }
    configureTopActions();
  }

  function configureTopActions() {
    if (!topActionsEl || !document.documentElement.classList.contains('outer-screen-layout')) {
      hideTopActions();
      return;
    }
    var section = currentActionSection();
    if (!section) {
      hideTopActions();
      return;
    }
    var sectionKey = section.dataset.section;
    if (sectionKey === 'home') {
      var homeAchvBack = section._outerAchvSecondary === true && typeof section._outerAchvBack === 'function';
      var homeReviewBack = section._outerReviewDetail === true && typeof section._outerReviewBack === 'function';
      var homeDetailBack = !!section.querySelector('.home-right-column.portrait-detail-secondary') && typeof section._homeDetailBack === 'function';
      var homeLeftBack = homeAchvBack ? section._outerAchvBack : (homeReviewBack ? section._outerReviewBack : (homeDetailBack ? section._homeDetailBack : null));
      var homeLeftLabel = homeAchvBack ? '返回奖杯组' : (homeReviewBack ? '返回测评总览' : '返回详情');
      showTopActions({
        mode: 'home',
        items: [['home', '首页'], ['achv', '实绩']],
        active: section._outerHomeView === 'achv' ? 'achv' : 'home',
        showLeft: !!homeLeftBack,
        leftLabel: homeLeftLabel,
        onLeft: homeLeftBack,
        onSelect: function (view) { setHomeOuterView(section, view, true); }
      });
      return;
    }
    if (sectionKey === 'files') {
      var filesView = section._outerFilesView || (section.classList.contains('outer-show-viewer') ? 'browse' : section.classList.contains('outer-show-schedule') ? 'schedule' : 'browse');
      showTopActions({
        mode: 'files',
        items: [['browse', '浏览'], ['schedule', '日程']],
        active: filesView === 'schedule' ? 'schedule' : 'browse',
        showLeft: section.classList.contains('outer-show-viewer'),
        leftLabel: '回到浏览',
        onLeft: function () { setFilesOuterView(section, 'browse', true); },
        onSelect: function (view) { setFilesOuterView(section, view, true); }
      });
      return;
    }
    if (sectionKey === 'settings') {
      buildSettingsSection(section);
      var personalSubpageActive = false;
      if (section._outerSettingsPersonalSubpage) personalSubpageActive = true;
      showTopActions({
        mode: 'settings',
        items: [['rank', '排名'], ['personal', '个人']],
        active: section._outerSettingsView === 'personal' ? 'personal' : 'rank',
        showLeft: personalSubpageActive,
        leftLabel: '返回个人',
        onLeft: function () { closeOuterPersonalSubpage(section); },
        onSelect: function (view) {
          closeOuterPersonalSubpage(section);
          setSettingsOuterView(section, view, true);
        }
      });
      return;
    }
    if (sectionKey === 'news') {
      var newsView = section._outerNewsView || (section.classList.contains('outer-show-secondary') ? (section.classList.contains('portrait-show-comments') ? 'comments' : 'content') : 'title');
      if (newsView === 'title') {
        showTopActionSearch(section);
        return;
      }
      var newsRightAction = null;
      var newsRightIcon = TOP_ACTION_SORT_ICON;
      var newsRightLabel = '切换评论排序方向';
      var newsLeftAction = function () { setHotspotOuterView(section, 'title', true); };
      var newsLeftLabel = '返回帖子列表';
      if (newsView === 'comments' && section._hotspot && section._hotspot.commentsView === 'detail') {
        newsLeftAction = function () { showHotspotCommentsOverview(curNavLogo, section); };
        newsLeftLabel = '返回评论';
      }
      if (newsView === 'comments' && section._hotspot && section._hotspot.commentsView !== 'detail' && curNavLogo) {
        newsRightAction = function () {
          cycleHotspotCommentSort();
          updateHotspotCommentSortButton(section);
          renderHotspotComments(curNavLogo, section);
          configureTopActions();
        };
        newsRightIcon = hotspotCommentSortCombinedIcon();
        newsRightLabel = '当前评论排序：' + hotspotCommentSortLabel() + '，点击切换';
      }
      showTopActions({
        mode: 'news',
        items: [['content', '内容'], ['comments', '评论']],
        active: newsView,
        leftLabel: newsLeftLabel,
        rightAction: newsRightAction,
        rightIcon: newsRightIcon,
        rightLabel: newsRightLabel,
        onLeft: newsLeftAction,
        onSelect: function (view) { setHotspotOuterView(section, view, true); }
      });
      return;
    }
    hideTopActions();
  }

  var curNavLogo = null; // 当前导航对应的 logo
  var thumbX = 0;        // 白色滑动胶囊当前 translateX
  var thumbW = 0;        // 白色滑动胶囊当前宽
  var navDrag = null;    // 导航拖动状态
  var navThumbAnimFrame = 0;
  var navDragFollowFrame = 0;
  var navDragFollowTime = 0;
  var navColorOverlay = null;
  var navColorItems = [];

  // 液体玻璃高光跟随指针移动；仅内屏模式的样式会使用这两个变量。
  function updateNavGlassPointer(e) {
    var rect = navEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    var y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    navEl.style.setProperty('--glass-pointer-x', (x / rect.width * 100).toFixed(2) + '%');
    navEl.style.setProperty('--glass-pointer-y', (y / rect.height * 100).toFixed(2) + '%');
    liquidGlassPointer.x = x;
    liquidGlassPointer.y = y;
    liquidGlassPointer.active = true;
    scheduleLiquidGlassRender();
  }
  navEl.addEventListener('pointermove', updateNavGlassPointer);
  navEl.addEventListener('pointerleave', function () {
    navEl.style.setProperty('--glass-pointer-x', '50%');
    navEl.style.setProperty('--glass-pointer-y', '50%');
    liquidGlassPointer.active = false;
    scheduleLiquidGlassRender();
  });
  function clearNavLabelMask(label) {
    if (!label) return;
    label.style.webkitMaskImage = '';
    label.style.maskImage = '';
    label.style.webkitMaskRepeat = '';
    label.style.maskRepeat = '';
    label.style.webkitMaskSize = '';
    label.style.maskSize = '';
  }

  function clearNavColorMasks() {
    for (var i = 0; i < navColorItems.length; i++) {
      clearNavLabelMask(navColorItems[i].label);
    }
  }

  function syncNavColorOverlay() {
    if (!navColorOverlay || !navEl) return;
    var navRect = navEl.getBoundingClientRect();
    var thumbEl = navEl.querySelector('.topnav-thumb');
    var thumbHeight = 28;
    var thumbTop = 4;
    if (thumbEl) {
      var thumbStyle = getComputedStyle(thumbEl);
      var computedHeight = parseFloat(thumbStyle.height);
      var computedTop = parseFloat(thumbStyle.top);
      if (isFinite(computedHeight)) thumbHeight = computedHeight;
      if (isFinite(computedTop)) thumbTop = computedTop;
    }
    var scale = liquidGlass ? 1 + ((74 / 56) - 1) * liquidGlass.press : 1;
    var left = thumbX - (thumbW * (scale - 1) * 0.5);
    var top = thumbTop - (thumbHeight * (scale - 1) * 0.5);
    var width = thumbW * scale;
    var height = thumbHeight * scale;
    navColorOverlay.style.left = left.toFixed(2) + "px";
    navColorOverlay.style.top = top.toFixed(2) + "px";
    navColorOverlay.style.width = width.toFixed(2) + "px";
    navColorOverlay.style.height = height.toFixed(2) + "px";
    for (var i = 0; i < navColorItems.length; i++) {
      var item = navColorItems[i];
      var labelStyle = getComputedStyle(item.label);
      item.copy.style.fontFamily = labelStyle.fontFamily;
      item.copy.style.fontSize = labelStyle.fontSize;
      item.copy.style.fontWeight = labelStyle.fontWeight;
      item.copy.style.lineHeight = labelStyle.lineHeight;
      item.copy.style.letterSpacing = labelStyle.letterSpacing;
      var rect = item.button.getBoundingClientRect();
      item.copy.style.left = (rect.left - navRect.left - left).toFixed(2) + "px";
      item.copy.style.top = "50%";
      item.copy.style.transform = "translateY(-50%)";
      var labelRect = item.label.getBoundingClientRect();
      var capsuleLeft = navRect.left + left;
      var capsuleRight = capsuleLeft + width;
      if (labelRect.right <= capsuleLeft - 2 || labelRect.left >= capsuleRight + 2) {
        clearNavLabelMask(item.label);
        continue;
      }
      var maskX = (navRect.left + left + width * 0.5) - labelRect.left;
      var maskY = (navRect.top + top + height * 0.5) - labelRect.top;
      var maskRx = width * 0.5 + 4;
      var maskRy = height * 0.5 + 4;
      var maskImage = "radial-gradient(ellipse " + maskRx.toFixed(2) + "px " + maskRy.toFixed(2) + "px at " + maskX.toFixed(2) + "px " + maskY.toFixed(2) + "px, transparent 0 98%, #000 100%)";
      item.label.style.webkitMaskImage = maskImage;
      item.label.style.maskImage = maskImage;
      item.label.style.webkitMaskRepeat = "no-repeat";
      item.label.style.maskRepeat = "no-repeat";
      item.label.style.webkitMaskSize = "100% 100%";
      item.label.style.maskSize = "100% 100%";
    }
  }


  function buildNavColorOverlay(buttons) {
    navColorOverlay = document.createElement("div");
    navColorOverlay.className = "topnav-color-overlay";
    navColorOverlay.setAttribute("aria-hidden", "true");
    navColorItems = [];
    var navRect = navEl.getBoundingClientRect();
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var label = btn.querySelector(".topnav-item-label");
      var content = btn.querySelector(".topnav-item-content");
      if (!label || !content) continue;
      var rect = btn.getBoundingClientRect();
      var style = getComputedStyle(label);
      var copy = content.cloneNode(true);
      copy.className = "topnav-color-label";
      copy.style.left = (rect.left - navRect.left) + "px";
      copy.style.top = (rect.top - navRect.top) + "px";
      copy.style.width = rect.width + "px";
      copy.style.height = rect.height + "px";
      copy.style.fontFamily = style.fontFamily;
      copy.style.fontSize = style.fontSize;
      copy.style.fontWeight = style.fontWeight;
      copy.style.lineHeight = style.lineHeight;
      navColorOverlay.appendChild(copy);
      navColorItems.push({ button: btn, label: content, copy: copy });
    }
    navEl.appendChild(navColorOverlay);
    syncNavColorOverlay();
    requestAnimationFrame(syncNavColorOverlay);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncNavColorOverlay);
  }


  function navItems() {
    return navEl.querySelectorAll('.topnav-item');
  }

  function innerNavThumbWidth(btns) {
    var width = 54;
    for (var i = 0; i < btns.length; i++) {
      width = Math.max(width, Math.round(btns[i].offsetWidth));
    }
    return width;
  }

  function applyNavThumbPosition() {
    var thumb = navEl.querySelector('.topnav-thumb');
    if (!thumb) return;
    thumb.style.width = thumbW + 'px';
    thumb.style.transform = 'translateX(' + thumbX + 'px) scale(var(--glass-thumb-scale, 1))';
    scheduleLiquidGlassRender();
    syncNavColorOverlay();
  }

  function animateNavThumbTo(targetX, targetW, duration) {
    if (navThumbAnimFrame) cancelAnimationFrame(navThumbAnimFrame);
    navEl.classList.add('nav-thumb-animating');
    var animationDuration = Math.max(1, Number(duration) || 380);
    var startX = thumbX;
    thumbW = targetW;
    var started = 0;
    navThumbAnimFrame = requestAnimationFrame(function frame(now) {
      if (!started) started = now;
      var progress = Math.min(1, (now - started) / animationDuration);
      var eased = 1 - Math.pow(1 - progress, 3);
      thumbX = startX + (targetX - startX) * eased;
      applyNavThumbPosition();
      if (progress < 1) {
        navThumbAnimFrame = requestAnimationFrame(frame);
      } else {
        navThumbAnimFrame = 0;
        thumbX = targetX;
        navEl.classList.remove('nav-thumb-animating');
        applyNavThumbPosition();
      }
    });
  }

  function stopNavDragFollow() {
    if (navDragFollowFrame) cancelAnimationFrame(navDragFollowFrame);
    navDragFollowFrame = 0;
    navDragFollowTime = 0;
  }

  function stepNavDragFollow(now) {
    navDragFollowFrame = 0;
    if (!navDrag || !navDrag.moved || typeof navDrag.targetX !== 'number') return;
    var dt = navDragFollowTime ? Math.min(32, Math.max(8, now - navDragFollowTime)) : 16;
    navDragFollowTime = now;
    var diff = navDrag.targetX - thumbX;
    if (Math.abs(diff) < 0.08) {
      thumbX = navDrag.targetX;
      applyNavThumbPosition();
      return;
    }
    var response = 1 - Math.exp(-dt / 18);
    thumbX += diff * response;
    applyNavThumbPosition();
    navDragFollowFrame = requestAnimationFrame(stepNavDragFollow);
  }

  function startNavDragFollow() {
    if (!navDrag || !navDrag.moved || navDragFollowFrame) return;
    navDragFollowTime = performance.now();
    navDragFollowFrame = requestAnimationFrame(stepNavDragFollow);
  }

  // 将选中短指示条移动到目标项目
  function moveThumb(key, animate) {
    var thumb = navEl.querySelector('.topnav-thumb');
    if (!thumb) return;
    var btns = navItems();
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].dataset.key === key) {
        // 选中层与当前项目等宽，短指示条始终居中于文字
        var nextW = innerScreenLayoutActive
          ? innerNavThumbWidth(btns)
          : Math.max(54, Math.round(btns[i].offsetWidth));
        var nextX = Math.round(btns[i].offsetLeft + btns[i].offsetWidth / 2 - nextW / 2);
        if (animate && innerScreenLayoutActive && liquidGlass) {
          animateNavThumbTo(nextX, nextW);
          break;
        }
        if (navThumbAnimFrame) {
          cancelAnimationFrame(navThumbAnimFrame);
          navThumbAnimFrame = 0;
        }
        navEl.classList.remove('nav-thumb-animating');
        thumbW = nextW;
        thumbX = nextX;
        if (!animate) thumb.classList.add('no-anim');
        applyNavThumbPosition();
        if (!animate) {
          void thumb.offsetWidth; // 强制应用后再恢复过渡
          thumb.classList.remove('no-anim');
        }
        break;
      }
    }
  }

  function resetOuterNavEntry(logo, key) {
    if (!document.documentElement.classList.contains('outer-screen-layout')) return;
    if (!logo || !key) return;
    var page = pages[LOGOS.indexOf(logo)];
    var section = page ? page.querySelector('.page-section[data-section="' + key + '"]') : null;
    if (!section) return;
    if (key === 'home') {
      section._outerHomeView = 'home';
      setHomeOuterView(section, 'home', false);
    } else if (key === 'files') {
      section._outerFilesView = 'browse';
      setFilesOuterView(section, 'browse', false);
    } else if (key === 'settings') {
      if (typeof window.closeOuterPersonalSubpage === 'function') window.closeOuterPersonalSubpage(section);
      section._outerSettingsView = 'rank';
      setSettingsOuterView(section, 'rank', false);
    } else if (key === 'news') {
      section._outerNewsView = 'title';
      setHotspotOuterView(section, 'title', false);
    }
    configureTopActions();
  }

  // 选中某项：下划线滑动到该项 + 切换子页（文字颜色不变）
  function selectNav(key, animate) {
    var data = navCache[curNavLogo];
    if (!data) return;
    var previousKey = data.active;
    activeNavKey = key;
    data.active = key;
    var btns = navItems();
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.key === key);
    }
    moveThumb(key, animate !== false);
    showSection(curNavLogo, key);
    resetOuterNavEntry(curNavLogo, key);
    invalidateCursorTargetCache();
    if (animate !== false) {
      playInterfaceAnimation(false);
      // 顶栏切到热点时单独补播关键词胶囊，避免被全局卡片动画清除。
      if (key === 'news' && previousKey !== 'news') {
        var page = pages[LOGOS.indexOf(curNavLogo)];
        var newsSection = page ? page.querySelector('.page-section[data-section="news"]') : null;
        if (newsSection && newsSection._hotspot && newsSection._hotspot.keywordList) {
          animateCardBody(newsSection._hotspot.keywordList, 0);
        }
      }
    }
  }

  // 选中层中心所覆盖的项（拖动时实时更新选中态）
  function hitKeyAt(centerX) {
    var btns = navItems();
    for (var i = 0; i < btns.length; i++) {
      var l = btns[i].offsetLeft;
      if (centerX >= l && centerX < l + btns[i].offsetWidth) {
        return btns[i].dataset.key;
      }
    }
    return null;
  }

  // 距离选中层中心最近的项（松手吸附）
  function nearestNavKey(centerX) {
    var btns = navItems();
    var best = null;
    var bestD = Infinity;
    for (var i = 0; i < btns.length; i++) {
      var c = btns[i].offsetLeft + btns[i].offsetWidth / 2;
      var d = Math.abs(c - centerX);
      if (d < bestD) {
        bestD = d;
        best = btns[i].dataset.key;
      }
    }
    return best;
  }

  function renderNav(logo) {
    var data = navCache[logo];
    if (!data || !data.items.length) {
      navEl.classList.add('empty');
      navEl.innerHTML = '';
      if (liquidGlassCanvas) liquidGlassCanvas.remove();
      if (liquidGlassBackdrop) liquidGlassBackdrop.remove();
      liquidGlassCanvas = null;
      liquidGlassBackdrop = null;
      liquidGlass = null;
      navColorOverlay = null;
      liquidGlassFailed = false;
      navEl.classList.remove('liquid-glass-ready');
      curNavLogo = null;
      return;
    }

    ensureSections(logo);
    curNavLogo = logo;
    navEl.classList.remove('empty');
    navEl.classList.remove('liquid-glass-ready');
    navEl.innerHTML = '';
    liquidGlassCanvas = ensureLiquidGlassCanvas();

    // 独立滑动选中层：仅作为命中范围和阴影载体，玻璃本体由 WebGL 着色器绘制。
    var thumb = document.createElement('div');
    thumb.className = 'topnav-thumb no-anim';
    var inner = document.createElement('div');
    inner.className = 'topnav-thumb-inner';
    thumb.appendChild(inner);
    navEl.appendChild(thumb);

    for (var i = 0; i < data.items.length; i++) {
      (function (key, label) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'topnav-item' + (data.active === key ? ' active' : '');
        var effect = document.createElement('img');
        effect.className = 'topnav-item-effect';
        bindResponsiveAsset(effect, 'logo/choose.png');
        effect.alt = '';
        effect.decoding = 'async';
        effect.draggable = false;
        effect.setAttribute('aria-hidden', 'true');
        var content = document.createElement('span');
        content.className = 'topnav-item-content';
        if (NAV_ICON_PATHS[key]) {
          var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          icon.classList.add('topnav-item-icon');
          icon.setAttribute('viewBox', '0 0 1024 1024');
          icon.setAttribute('aria-hidden', 'true');
          icon.setAttribute('focusable', 'false');
          var iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          iconPath.setAttribute('fill', 'currentColor');
          iconPath.setAttribute('fill-rule', 'nonzero');
          iconPath.setAttribute('clip-rule', 'nonzero');
          iconPath.setAttribute('d', NAV_ICON_PATHS[key]);
          icon.appendChild(iconPath);
          content.appendChild(icon);
        }
        var text = document.createElement('span');
        text.className = 'topnav-item-label';
        text.textContent = label;
        content.appendChild(text);
        btn.appendChild(effect);
        btn.appendChild(content);
        btn.dataset.key = key;
        navEl.appendChild(btn);
      })(data.items[i][0], data.items[i][1]);
    }

    buildNavColorOverlay(Array.prototype.slice.call(navEl.querySelectorAll('.topnav-item')));

    // 初始定位选中短指示条（无动画）并显示默认子页
    moveThumb(data.active, false);
    showSection(logo, data.active);
    syncLiquidGlassRenderer(true);
  }

  /* 顶部导航交互：轻点切换（下划线滑动过去），按住左右拖动（下划线跟手，松手吸附最近项） */
  navEl.addEventListener('pointerdown', function (e) {
    if (!curNavLogo) return;
    stopNavDragFollow();
    if (navThumbAnimFrame) { cancelAnimationFrame(navThumbAnimFrame); navThumbAnimFrame = 0; }
    navEl.classList.remove('nav-thumb-animating');
    var btn = e.target.closest ? e.target.closest('.topnav-item') : null;
    var data = navCache[curNavLogo];
    var pressTargetX = thumbX;
    if (btn && btn.dataset.key) {
      var btns = navItems();
      var targetW = innerScreenLayoutActive
        ? innerNavThumbWidth(btns)
        : Math.max(54, Math.round(btn.offsetWidth));
      var navRect = navEl.getBoundingClientRect();
      var borderLeft = parseFloat(getComputedStyle(navEl).borderLeftWidth) || 0;
      var pointerX = e.clientX - navRect.left - borderLeft;
      var firstC = btns[0].offsetLeft + btns[0].offsetWidth / 2;
      var lastC = btns[btns.length - 1].offsetLeft + btns[btns.length - 1].offsetWidth / 2;
      pressTargetX = Math.max(firstC - targetW / 2, Math.min(lastC - targetW / 2, pointerX - targetW / 2));
      animateNavThumbTo(pressTargetX, targetW);
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i] === btn);
      }
    }
    navDrag = {
      startX: e.clientX,
      startTX: pressTargetX,
      moved: false,
      downKey: btn ? btn.dataset.key : null,
      hitKey: btn ? btn.dataset.key : (data ? data.active : null),
      pointerId: e.pointerId,
      snapUntil: performance.now() + 160
    };
    navEl.classList.add('pressing'); // 长按反馈：选中层轻微变淡
    scheduleLiquidGlassRender();
    try { navEl.setPointerCapture(e.pointerId); } catch (err) {}
  });

  navEl.addEventListener('pointermove', function (e) {
    if (!navDrag || !curNavLogo) return;
    var dx = e.clientX - navDrag.startX;

    if (!navDrag.moved) {
      if (Math.abs(dx) <= 4) return;
      if (navThumbAnimFrame) {
        cancelAnimationFrame(navThumbAnimFrame);
        navThumbAnimFrame = 0;
      }
      navEl.classList.remove('nav-thumb-animating');
      navDrag.moved = true;
      navEl.classList.add('dragging');
    }

    var btns = navItems();
    if (!btns.length) return;
    var first = btns[0];
    var last = btns[btns.length - 1];
    var firstC = first.offsetLeft + first.offsetWidth / 2;
    var lastC = last.offsetLeft + last.offsetWidth / 2;
    var min = firstC - thumbW / 2;
    var max = lastC - thumbW / 2;
    var targetX = Math.max(min, Math.min(max, navDrag.startTX + dx));
    navDrag.targetX = targetX;
    startNavDragFollow();

    // 选中层中心覆盖到哪项即实时标记哪项（松手时正式选中）
    var hit = hitKeyAt(targetX + thumbW / 2);
    if (hit && hit !== navDrag.hitKey) {
      navDrag.hitKey = hit;
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].dataset.key === hit);
      }
    }
  });

  function endNavDrag() {
    if (!navDrag) return;
    // 显式释放指针捕获
    if (navDrag.pointerId != null && navEl.releasePointerCapture) {
      try { navEl.releasePointerCapture(navDrag.pointerId); } catch (err) {}
    }
    stopNavDragFollow();
    navEl.classList.remove('pressing', 'dragging');
    scheduleLiquidGlassRender();

    if (navDrag.moved) {
      var finalThumbX = typeof navDrag.targetX === 'number' ? navDrag.targetX : thumbX;
      selectNav(nearestNavKey(finalThumbX + thumbW / 2), true);
    } else if (navDrag.downKey) {
      selectNav(navDrag.downKey, true);
    }
    navDrag = null;
  }
  navEl.addEventListener('pointerup', endNavDrag);
  navEl.addEventListener('pointercancel', endNavDrag);

  /* ---------- 折叠屏顶栏：WebGL 液态玻璃 ----------
     将圆角 SDF 折射、色散、高光和按压缩放实现为 WebGL2。
     浏览器不支持 WebGL2 时保留前面的 CSS 近似作为兼容回退。 */
  var LIQUID_GLASS_PADDING = 18;
  var liquidGlassBackdrop = null;
  var liquidGlassCanvas = null;
  var liquidGlass = null;
  var liquidGlassWallpaperImage = null;
  var liquidGlassRenderFrame = 0;
  var liquidGlassFailed = false;
  var liquidGlassPointer = { x: 0, y: 0, active: false };
  var liquidGlassTextureSize = [0, 0];

  var LIQUID_GLASS_VERTEX = [
    '#version 300 es',
    'in vec2 aPos;',
    'void main() {',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var LIQUID_GLASS_FRAGMENT = [
    '#version 300 es',
    'precision highp float;',
    'out vec4 outColor;',
    '',
    'uniform sampler2D uBackdrop;',
    'uniform vec2 uCanvasSize;',
    'uniform vec2 uViewportSize;',
    'uniform vec2 uCanvasOrigin;',
    'uniform float uDpr;',
    'uniform float uHasTexture;',
    'uniform float uDimTop;',
    'uniform float uDimBottom;',
    'uniform vec2 uBaseCenter;',
    'uniform vec2 uBaseHalf;',
    'uniform float uBaseRadius;',
    'uniform float uBaseRefractionHeight;',
    'uniform float uBaseRefractionAmount;',
    'uniform vec2 uThumbCenter;',
    'uniform vec2 uThumbHalf;',
    'uniform float uThumbRadius;',
    'uniform float uThumbRefractionHeight;',
    'uniform float uThumbRefractionAmount;',
    'uniform float uThumbMagnification;',
    'uniform float uPress;',
    'uniform float uContentSample;',
    'uniform vec2 uPointer;',
    'uniform float uGlassDarken;',
    '',
    'const vec3 DARK = vec3(0.031372549, 0.035294118, 0.054901961);',
    'const vec3 SURFACE = vec3(0.98, 0.98, 0.98);',
    '',
    'float radiusAt(vec2 coord, vec4 radii) {',
    '  if (coord.x >= 0.0) {',
    '    if (coord.y <= 0.0) return radii.y;',
    '    return radii.z;',
    '  }',
    '  if (coord.y <= 0.0) return radii.x;',
    '  return radii.w;',
    '}',
    '',
    'float sdRoundedRect(vec2 coord, vec2 halfSize, float radius) {',
    '  vec2 cornerCoord = abs(coord) - (halfSize - vec2(radius));',
    '  float outside = length(max(cornerCoord, vec2(0.0))) - radius;',
    '  float inside = min(max(cornerCoord.x, cornerCoord.y), 0.0);',
    '  return outside + inside;',
    '}',
    '',
    'vec2 gradSdRoundedRect(vec2 coord, vec2 halfSize, float radius) {',
    '  vec2 cornerCoord = abs(coord) - (halfSize - vec2(radius));',
    '  if (cornerCoord.x >= 0.0 || cornerCoord.y >= 0.0) {',
    '    return sign(coord) * normalize(max(cornerCoord, vec2(0.0)));',
    '  }',
    '  float gradX = step(cornerCoord.y, cornerCoord.x);',
    '  return sign(coord) * vec2(gradX, 1.0 - gradX);',
    '}',
    '',
    'vec2 safeNormalize(vec2 value) {',
    '  float len = length(value);',
    '  return len > 0.0001 ? value / len : vec2(0.0, 1.0);',
    '}',
    'float circleMap(float x) {',
    '  x = clamp(x, 0.0, 1.0);',
    '  return 1.0 - sqrt(max(0.0, 1.0 - x * x));',
    '}',
    '',
    'float coverage(float sd) {',
    '  float aa = max(fwidth(sd), 0.65);',
    '  return 1.0 - smoothstep(-aa, aa, sd);',
    '}',
    '',
    'vec3 fallbackBackdrop(vec2 coord) {',
    '  vec2 uv = (coord + uCanvasOrigin) / max(uViewportSize, vec2(1.0));',
    '  vec3 c = mix(vec3(0.06, 0.07, 0.11), vec3(0.25, 0.15, 0.35), uv.y);',
    '  c += vec3(0.12, 0.11, 0.18) * (1.0 - uv.x);',
    '  return c;',
    '}',
    '',
    'vec3 sampleBackdrop(vec2 coord) {',
    '  vec3 c;',
    '  if (uHasTexture > 0.5) {',
    '    vec2 uv = (coord + uCanvasOrigin) / max(uViewportSize, vec2(1.0));',
    '    uv.y = 1.0 - uv.y;',
    '    // 屏幕顶部直接对应纹理 v=0。',
    '    c = texture(uBackdrop, uv).rgb;',
    '  } else {',
    '    c = fallbackBackdrop(coord);',
    '  }',

    '  vec2 screenCoord = coord + uCanvasOrigin;',
    '  float dim = mix(uDimTop, uDimBottom, clamp(screenCoord.y / max(uViewportSize.y, 1.0), 0.0, 1.0));',
    '  c = mix(c, DARK, dim);',
    '  return clamp(c, 0.0, 1.0);',
    '}',
    '',
    'vec2 baseHalfSize() {',
    '  return max(uBaseHalf - vec2(3.0 * uPress), vec2(1.0));',
    '}',
    '',
    'float baseRadiusSize() {',
    '  return max(uBaseRadius - 3.0 * uPress, 1.0);',
    '}',
    '',
    'vec3 baseLayerAt(vec2 coord, vec2 baseHalf, float baseRadius) {',
    '  vec2 centered = coord - uBaseCenter;',
    '  float sd = sdRoundedRect(centered, baseHalf, baseRadius);',
    '  float cov = coverage(sd);',
    '  vec3 raw = sampleBackdrop(coord);',
    '  vec3 surface;',
    '  if (-sd >= uBaseRefractionHeight) {',
    '    surface = mix(raw, SURFACE, 0.10);',
    '  } else {',
    '    float insideSd = min(sd, 0.0);',
    '    float d = circleMap(1.0 + insideSd / max(uBaseRefractionHeight, 0.001)) * uBaseRefractionAmount;',
    '    float gradRadius = min(baseRadius * 1.5, min(baseHalf.x, baseHalf.y));',
    '    vec2 grad = safeNormalize(gradSdRoundedRect(centered, baseHalf, max(gradRadius, 1.0)));',
    '    vec2 refractedCoord = coord + d * grad;',
    '    surface = mix(sampleBackdrop(refractedCoord), SURFACE, 0.10);',
    '  }',
    '  return mix(raw, surface, cov);',
    '}',
    '',
    'vec3 baseLayer(vec2 coord) {',
    '  return baseLayerAt(coord, uBaseHalf, uBaseRadius);',
    '}',
    '',
    'vec3 innerBaseLayer(vec2 coord) {',
    '  return baseLayerAt(coord, baseHalfSize(), baseRadiusSize());',
    '}',
    '',
    'vec3 selectedLayer(vec2 coord) {',
    '  vec2 centered = coord - uThumbCenter;',
    '  float sd = sdRoundedRect(centered, uThumbHalf, uThumbRadius);',
    '  float cov = coverage(sd);',
    '  vec3 raw = baseLayer(coord);',
    '  if (cov <= 0.001) return raw;',
    '  vec2 magnifiedCoord = uThumbCenter + centered / max(uThumbMagnification, 1.0);',
    '  vec3 visible;',
    '  if (-sd >= uThumbRefractionHeight) {',
    '    visible = baseLayer(magnifiedCoord);',
    '  } else {',
    '    float insideSd = min(sd, 0.0);',
    '    float d = circleMap(1.0 + insideSd / max(uThumbRefractionHeight, 0.001)) * uThumbRefractionAmount;',
    '    float gradRadius = min(uThumbRadius * 1.5, min(uThumbHalf.x, uThumbHalf.y));',
    '    vec2 grad = safeNormalize(gradSdRoundedRect(centered, uThumbHalf, max(gradRadius, 1.0)));',
    '    vec2 refractedCoord = magnifiedCoord + d * grad;',
    '    float dispersionIntensity = clamp((centered.x * centered.y) / max(uThumbHalf.x * uThumbHalf.y, 1.0), -1.0, 1.0);',
    '    vec2 dispersedCoord = d * grad * dispersionIntensity;',
    '    vec3 c = vec3(0.0);',
    '    c.r += baseLayer(refractedCoord + dispersedCoord).r / 3.5;',
    '    c.r += baseLayer(refractedCoord + dispersedCoord * (2.0 / 3.0)).r / 3.5;',
    '    c.g += baseLayer(refractedCoord + dispersedCoord * (2.0 / 3.0)).g / 7.0;',
    '    c.r += baseLayer(refractedCoord + dispersedCoord * (1.0 / 3.0)).r / 3.5;',
    '    c.g += baseLayer(refractedCoord + dispersedCoord * (1.0 / 3.0)).g / 3.5;',
    '    c.g += baseLayer(refractedCoord).g / 3.5;',
    '    c.g += baseLayer(refractedCoord - dispersedCoord * (1.0 / 3.0)).g / 3.5;',
    '    c.b += baseLayer(refractedCoord - dispersedCoord * (1.0 / 3.0)).b / 3.0;',
    '    c.b += baseLayer(refractedCoord - dispersedCoord * (2.0 / 3.0)).b / 3.0;',
    '    c.r += baseLayer(refractedCoord - dispersedCoord).r / 7.0;',
    '    c.b += baseLayer(refractedCoord - dispersedCoord).b / 3.0;',
    '    visible = c;',
    '  }',
    '  visible = mix(visible, vec3(1.0), 0.1 * (1.0 - uPress));',
    '  visible = mix(visible, vec3(0.0), 0.03 * uPress);',
    '  return mix(raw, visible, cov);',
    '}',
    '',
    'float highlight(vec2 coord, vec2 center, vec2 halfSize, float radius) {',
    '  vec2 centered = coord - center;',
    '  float sd = sdRoundedRect(centered, halfSize, radius);',
    '  float ring = 1.0 - smoothstep(0.0, 1.5, abs(sd));',
    '  float gradRadius = min(radius * 1.5, min(halfSize.x, halfSize.y));',
    '  vec2 grad = safeNormalize(gradSdRoundedRect(centered, halfSize, max(gradRadius, 1.0)));',
    '  float d = abs(dot(grad, vec2(0.70710678, 0.70710678)));',
    '  float directional = 0.65 + 0.35 * d;',
    '  return ring * directional * 0.5;',
    '}',
    '',
    'float innerShadow(vec2 coord) {',
    '  if (uPress <= 0.001) return 0.0;',
    '  vec2 centered = coord - uThumbCenter;',
    '  float sd = sdRoundedRect(centered, uThumbHalf, uThumbRadius);',
    '  float edge = 1.0 - smoothstep(0.0, 8.0 * uPress, max(-sd, 0.0));',
    '  float bottom = smoothstep(-uThumbHalf.y * 0.2, uThumbHalf.y, centered.y);',
    '  return edge * bottom * 0.15 * uPress;',
    '}',
    '',
    'float interactiveHighlight(vec2 coord) {',
    '  if (uPress <= 0.001) return 0.0;',
    '  float radius = min(uThumbHalf.x, uThumbHalf.y) * 1.5;',
    '  float radial = 1.0 - smoothstep(radius * 0.5, radius, distance(coord, uPointer));',
    '  return 0.03 * uPress * radial;',
    '}',
    '',
    'void main() {',
    '  vec2 coord = vec2(gl_FragCoord.x, uCanvasSize.y * uDpr - gl_FragCoord.y) / uDpr;',
    '  vec2 innerBaseHalf = baseHalfSize();',
    '  float innerBaseRadius = baseRadiusSize();',
    '  vec3 normalBase = baseLayer(coord);',
    '  vec3 innerBase = normalBase;',
    '  float baseCoverage = coverage(sdRoundedRect(coord - uBaseCenter, uBaseHalf, uBaseRadius));',
    '  float innerBaseCoverage = coverage(sdRoundedRect(coord - uBaseCenter, innerBaseHalf, innerBaseRadius));',
    '  float thumbSd = sdRoundedRect(coord - uThumbCenter, uThumbHalf, uThumbRadius);',
    '  float thumbCoverage = coverage(thumbSd);',
    '  vec3 selected = selectedLayer(coord);',
    '  selected += vec3(highlight(coord, uThumbCenter, uThumbHalf, uThumbRadius));',
    '  float pressMix = smoothstep(0.0, 1.0, uPress);',
    '  float localPress = thumbCoverage * pressMix;',
    '  float thumbRingCoverage = (1.0 - smoothstep(0.0, 1.5, abs(thumbSd))) * pressMix;',
    '  float thumbHighlight = clamp(highlight(coord, uThumbCenter, uThumbHalf, uThumbRadius) * 2.0, 0.0, 1.0);',
    '  vec3 color = mix(normalBase, innerBase, localPress);',
    '  float activeBaseCoverage = mix(baseCoverage, innerBaseCoverage, localPress);',
    '  float baseHighlight = highlight(coord, uBaseCenter, uBaseHalf, uBaseRadius);',
    '  float innerBaseHighlight = highlight(coord, uBaseCenter, innerBaseHalf, innerBaseRadius);',
    '  color += vec3(mix(baseHighlight, innerBaseHighlight, localPress));',
    '  color = mix(color, selected, thumbCoverage * (1.0 - pressMix));',
    '  color = mix(color, vec3(1.0), thumbHighlight * thumbRingCoverage);',
    '  float alpha = max(activeBaseCoverage, thumbRingCoverage * thumbHighlight);',
    '  alpha *= mix(1.0, 0.42, uContentSample);',
    '  alpha = mix(alpha, max(alpha, thumbCoverage), uContentSample);',
    '  color = mix(color, DARK, uGlassDarken);',
    '  outColor = vec4(clamp(color, 0.0, 1.0), alpha);',
    '}'
  ].join('\n');

  function ensureLiquidGlassCanvas() {
    if (!liquidGlassBackdrop) {
      liquidGlassBackdrop = document.createElement('div');
      liquidGlassBackdrop.className = 'topnav-glass-backdrop';
      liquidGlassBackdrop.setAttribute('aria-hidden', 'true');
      if (navEl && navEl.parentElement) navEl.parentElement.insertBefore(liquidGlassBackdrop, navEl);
    }
    if (!liquidGlassCanvas) {
      liquidGlassCanvas = document.createElement('canvas');
      liquidGlassCanvas.className = 'topnav-liquid-glass';
      liquidGlassCanvas.setAttribute('aria-hidden', 'true');
      if (navEl && navEl.parentElement) navEl.parentElement.insertBefore(liquidGlassCanvas, navEl);
    }
    return liquidGlassCanvas;
  }

  function compileLiquidGlassShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message || 'shader compile error');
    }
    return shader;
  }

  function initLiquidGlassRenderer() {
    if (liquidGlass || liquidGlassFailed || !liquidGlassCanvas) return liquidGlass;
    var gl = liquidGlassCanvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });
    if (!gl) {
      liquidGlassFailed = true;
      console.warn('Liquid Glass WebGL2 unavailable');
      return null;
    }
    try {
      var vertex = compileLiquidGlassShader(gl, gl.VERTEX_SHADER, LIQUID_GLASS_VERTEX);
      var fragment = compileLiquidGlassShader(gl, gl.FRAGMENT_SHADER, LIQUID_GLASS_FRAGMENT);
      var program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'program link error');
      }
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      var vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var position = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      var uniformNames = [
        'uBackdrop', 'uCanvasSize', 'uViewportSize', 'uCanvasOrigin', 'uDpr', 'uHasTexture',
        'uDimTop', 'uDimBottom', 'uBaseCenter', 'uBaseHalf', 'uBaseRadius',
        'uBaseRefractionHeight', 'uBaseRefractionAmount', 'uThumbCenter',
        'uThumbHalf', 'uThumbRadius', 'uThumbRefractionHeight',
        'uThumbRefractionAmount', 'uThumbMagnification', 'uPress', 'uContentSample', 'uPointer', 'uGlassDarken'
      ];
      var uniforms = {};
      uniformNames.forEach(function (name) { uniforms[name] = gl.getUniformLocation(program, name); });
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.useProgram(program);
      gl.uniform1i(uniforms.uBackdrop, 0);
      liquidGlass = {
        gl: gl,
        program: program,
        uniforms: uniforms,
        texture: texture,
        textureCanvas: document.createElement('canvas'),
        width: 0,
        height: 0,
        dpr: 1,
        press: 0,
        lastTime: 0,
        hasTexture: false
      };
      navEl.classList.add('liquid-glass-ready');
      liquidGlassCanvas.classList.add('is-ready');
      syncLiquidGlassRenderer(true);
      return liquidGlass;
    } catch (err) {
      liquidGlassFailed = true;
      liquidGlass = null;
      navEl.classList.remove('liquid-glass-ready');
      if (liquidGlassCanvas) liquidGlassCanvas.classList.remove('is-ready');
      console.warn('Liquid Glass WebGL2 init failed', err);
      return null;
    }
  }

  function uploadLiquidGlassTexture() {
    if (!liquidGlass || !liquidGlassWallpaperImage) return;
    var image = liquidGlassWallpaperImage;
    var viewportWidth = Math.max(1, window.innerWidth);
    var viewportHeight = Math.max(1, window.innerHeight);
    var textureDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var canvas = liquidGlass.textureCanvas;
    var pixelWidth = Math.max(1, Math.round(viewportWidth * textureDpr));
    var pixelHeight = Math.max(1, Math.round(viewportHeight * textureDpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var naturalWidth = image.naturalWidth || image.width || viewportWidth;
    var naturalHeight = image.naturalHeight || image.height || viewportHeight;
    var cover = Math.max(viewportWidth / naturalWidth, viewportHeight / naturalHeight);
    var drawWidth = naturalWidth * cover;
    var drawHeight = naturalHeight * cover;
    ctx.filter = 'saturate(150%) blur(' + (1.5 * textureDpr).toFixed(2) + 'px)';
    ctx.drawImage(
      image,
      (viewportWidth - drawWidth) * 0.5 * textureDpr,
      (viewportHeight - drawHeight) * 0.5 * textureDpr,
      drawWidth * textureDpr,
      drawHeight * textureDpr
    );
    ctx.filter = 'none';
    var gl = liquidGlass.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, liquidGlass.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    liquidGlass.hasTexture = true;
    liquidGlassTextureSize = [viewportWidth, viewportHeight];
    scheduleLiquidGlassRender();
  }

  function updateLiquidGlassWallpaper(image) {
    liquidGlassWallpaperImage = image || null;
    if (liquidGlass && liquidGlassWallpaperImage) uploadLiquidGlassTexture();
    if (topActionLiquidGlass && liquidGlassWallpaperImage) uploadTopActionLiquidGlassTexture();
  }

  function resizeLiquidGlassRenderer() {
    if (!liquidGlass || !liquidGlassCanvas) return false;
    var rect = navEl.getBoundingClientRect();
    var thumbEl = navEl.querySelector('.topnav-thumb');
    var navWidth = Math.max(1, rect.width);
    var navHeight = Math.max(1, rect.height);
    var thumbHeight = thumbEl ? Math.max(1, thumbEl.offsetHeight) : 28;
    var thumbTop = 4;
    if (thumbEl) {
      var computedThumbTop = parseFloat(getComputedStyle(thumbEl).top);
      if (isFinite(computedThumbTop)) thumbTop = computedThumbTop;
    }
    var pad = LIQUID_GLASS_PADDING;
    var width = navWidth + pad * 2;
    var height = navHeight + pad * 2;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pixelWidth = Math.max(1, Math.round(width * dpr));
    var pixelHeight = Math.max(1, Math.round(height * dpr));
    var changed = false;
    if (liquidGlassCanvas.width !== pixelWidth) {
      liquidGlassCanvas.width = pixelWidth;
      changed = true;
    }
    if (liquidGlassCanvas.height !== pixelHeight) {
      liquidGlassCanvas.height = pixelHeight;
      changed = true;
    }
    liquidGlass.width = width;
    liquidGlass.height = height;
    liquidGlass.navWidth = navWidth;
    liquidGlass.navHeight = navHeight;
    liquidGlass.thumbHeight = thumbHeight;
    liquidGlass.thumbTop = thumbTop;
    liquidGlass.padding = pad;
    liquidGlass.dpr = dpr;
    liquidGlassCanvas.style.left = (rect.left - pad) + 'px';
    if (document.documentElement.classList.contains('outer-screen-layout')) {
      liquidGlassCanvas.style.top = '';
      liquidGlassCanvas.style.bottom = (window.innerHeight - rect.bottom - pad) + 'px';
      if (liquidGlassBackdrop) {
        liquidGlassBackdrop.style.left = rect.left + 'px';
        liquidGlassBackdrop.style.top = '';
        liquidGlassBackdrop.style.bottom = (window.innerHeight - rect.bottom) + 'px';
        liquidGlassBackdrop.style.width = navWidth + 'px';
        liquidGlassBackdrop.style.height = navHeight + 'px';
      }
    } else {
      liquidGlassCanvas.style.bottom = '';
      if (liquidGlassBackdrop) {
        liquidGlassBackdrop.style.left = '';
        liquidGlassBackdrop.style.bottom = '';
        liquidGlassBackdrop.style.width = '';
        liquidGlassBackdrop.style.height = '';
      }
      var topbarRect = navEl.parentElement.getBoundingClientRect();
      liquidGlassCanvas.style.top = (rect.top - topbarRect.top - pad) + 'px';
    }
    liquidGlassCanvas.style.width = width + 'px';
    liquidGlassCanvas.style.height = height + 'px';
    liquidGlass.gl.viewport(0, 0, pixelWidth, pixelHeight);
    if (
      liquidGlassTextureSize[0] !== window.innerWidth ||
      liquidGlassTextureSize[1] !== window.innerHeight
    ) uploadLiquidGlassTexture();
    return changed;
  }

  function scheduleLiquidGlassRender() {
    if (!liquidGlass || liquidGlassRenderFrame || !innerScreenLayoutActive) return;
    liquidGlassRenderFrame = requestAnimationFrame(renderLiquidGlass);
  }

  function renderLiquidGlass(now) {
    liquidGlassRenderFrame = 0;
    if (!liquidGlass || !innerScreenLayoutActive || navEl.classList.contains('empty')) return;
    if (document.documentElement.classList.contains('ui-hidden') || document.hidden) return;
    resizeLiquidGlassRenderer();
    var gl = liquidGlass.gl;
    var uniforms = liquidGlass.uniforms;
    var targetPress = navEl.classList.contains('pressing') ? 1 : 0;
    var dt = liquidGlass.lastTime ? Math.min(48, now - liquidGlass.lastTime) : 16;
    liquidGlass.lastTime = now;
    var mix = 1 - Math.exp(-dt / 72);
    liquidGlass.press += (targetPress - liquidGlass.press) * mix;
    if (Math.abs(liquidGlass.press - targetPress) < 0.002) liquidGlass.press = targetPress;
    var baseScale = 1;
    var baseHalfWidth = liquidGlass.navWidth * baseScale * 0.5;
    var baseHalfHeight = liquidGlass.navHeight * baseScale * 0.5;
    var thumbScale = 1 + ((74 / 56) - 1) * liquidGlass.press;
    var thumbHeight = liquidGlass.thumbHeight || 28;
    var thumbTop = typeof liquidGlass.thumbTop === 'number' ? liquidGlass.thumbTop : 4;
    var thumbHalfHeight = thumbHeight * 0.5;
    var thumbSizeScale = thumbHeight / 28;
    var thumbCenterX = liquidGlass.padding + thumbX + thumbW * 0.5;
    var thumbCenterY = liquidGlass.padding + thumbTop + thumbHalfHeight;
    var pointerX = liquidGlassPointer.active ? liquidGlass.padding + liquidGlassPointer.x : thumbCenterX;
    var pointerY = liquidGlassPointer.active ? liquidGlass.padding + liquidGlassPointer.y : thumbCenterY;
    gl.useProgram(liquidGlass.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, liquidGlass.texture);
    var rootStyle = getComputedStyle(document.documentElement);
    gl.uniform2f(uniforms.uCanvasSize, liquidGlass.width, liquidGlass.height);
    var navRect = navEl.getBoundingClientRect();
    gl.uniform2f(uniforms.uViewportSize, window.innerWidth, window.innerHeight);
    gl.uniform2f(uniforms.uCanvasOrigin, navRect.left - liquidGlass.padding, navRect.top - liquidGlass.padding);
    gl.uniform1f(uniforms.uDpr, liquidGlass.dpr);
    gl.uniform1f(uniforms.uHasTexture, liquidGlass.hasTexture ? 1 : 0);
    gl.uniform1f(uniforms.uDimTop, parseFloat(rootStyle.getPropertyValue('--wallpaper-dim-top')) || 0.175);
    gl.uniform1f(uniforms.uDimBottom, parseFloat(rootStyle.getPropertyValue('--wallpaper-dim-bottom')) || 0.42);
    gl.uniform2f(uniforms.uBaseCenter, liquidGlass.padding + liquidGlass.navWidth * 0.5, liquidGlass.padding + liquidGlass.navHeight * 0.5);
    gl.uniform2f(uniforms.uBaseHalf, baseHalfWidth, baseHalfHeight);
    gl.uniform1f(uniforms.uBaseRadius, Math.min(baseHalfWidth, baseHalfHeight));
    gl.uniform1f(uniforms.uBaseRefractionHeight, 12);
    gl.uniform1f(uniforms.uBaseRefractionAmount, -12);
    gl.uniform2f(uniforms.uThumbCenter, thumbCenterX, thumbCenterY);
    gl.uniform2f(uniforms.uThumbHalf, Math.max(14, thumbW * thumbScale * 0.5), thumbHalfHeight * thumbScale);
    gl.uniform1f(uniforms.uThumbRadius, Math.min(Math.max(14, thumbW * thumbScale * 0.5), thumbHalfHeight * thumbScale));
    gl.uniform1f(uniforms.uThumbRefractionHeight, 5 * thumbSizeScale * thumbScale);
    gl.uniform1f(uniforms.uThumbRefractionAmount, -7 * thumbSizeScale * thumbScale);
    gl.uniform1f(uniforms.uThumbMagnification, thumbScale);
    gl.uniform1f(uniforms.uPress, liquidGlass.press);
    gl.uniform1f(uniforms.uContentSample, document.documentElement.classList.contains('outer-screen-layout') ? 1 : 0);
    gl.uniform2f(uniforms.uPointer, pointerX, pointerY);
    var glassDarken = parseFloat(rootStyle.getPropertyValue('--glass-darken')) || 0.175;
    gl.uniform1f(uniforms.uGlassDarken, Math.max(0, Math.min(1, glassDarken)));
    navEl.style.setProperty('--glass-shadow-alpha', (liquidGlass.press * 0.1).toFixed(3));
    syncNavColorOverlay();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (Math.abs(liquidGlass.press - targetPress) > 0.002) scheduleLiquidGlassRender();
  }

  function syncLiquidGlassRenderer(force) {
    if (!innerScreenLayoutActive || !liquidGlassCanvas) {
      clearNavColorMasks();
      if (navEl) navEl.classList.remove('liquid-glass-ready');
      if (liquidGlassCanvas) liquidGlassCanvas.classList.remove('is-ready');
      return;
    }
    if (!liquidGlass && !initLiquidGlassRenderer()) return;
    if (!liquidGlass) return;
    navEl.classList.add('liquid-glass-ready');
    liquidGlassCanvas.classList.add('is-ready');
    resizeLiquidGlassRenderer();
    if (force && liquidGlassWallpaperImage) uploadLiquidGlassTexture();
    scheduleLiquidGlassRender();
  }

  /* 顶部文字导航使用独立的 WebGL 上下文，但着色器和参数完全复用底栏。 */
  var topActionLiquidGlassBackdrop = null;
  var topActionLiquidGlassCanvas = null;
  var topActionLiquidGlass = null;
  var topActionLiquidGlassRenderFrame = 0;
  var topActionLiquidGlassSyncFrame = 0;
  var topActionLiquidGlassFailed = false;
  var topActionLiquidGlassPointer = { x: 0, y: 0, active: false };
  var topActionLiquidGlassTextureSize = [0, 0];

  function topActionGlassActive() {
    return false;
  }
  function hideTopActionLiquidGlassSurface() {
    if (topActionLiquidGlassRenderFrame) {
      cancelAnimationFrame(topActionLiquidGlassRenderFrame);
      topActionLiquidGlassRenderFrame = 0;
    }
    if (topActionNav) topActionNav.classList.remove('liquid-glass-ready');
    if (topActionLiquidGlassCanvas) {
      topActionLiquidGlassCanvas.classList.remove('is-ready');
      topActionLiquidGlassCanvas.style.display = 'none';
    }
    if (topActionLiquidGlassBackdrop) topActionLiquidGlassBackdrop.style.display = 'none';
  }

  function clearTopActionColorMasks() {
    for (var i = 0; i < topActionColorItems.length; i++) {
      clearTopActionLabelMask(topActionColorItems[i].label);
    }
  }

  function scheduleTopActionLiquidGlassSync(force) {
    syncTopActionLiquidGlassRenderer(force);
    if (topActionLiquidGlassSyncFrame) cancelAnimationFrame(topActionLiquidGlassSyncFrame);
    topActionLiquidGlassSyncFrame = requestAnimationFrame(function () {
      topActionLiquidGlassSyncFrame = 0;
      syncTopActionLiquidGlassRenderer(false);
    });
  }

  function ensureTopActionLiquidGlassCanvas() {
    if (!topActionLiquidGlassBackdrop) {
      topActionLiquidGlassBackdrop = document.createElement('div');
      topActionLiquidGlassBackdrop.className = 'top-action-glass-backdrop';
      topActionLiquidGlassBackdrop.setAttribute('aria-hidden', 'true');
    }
    if (!topActionLiquidGlassBackdrop.parentNode) document.body.appendChild(topActionLiquidGlassBackdrop);
    if (!topActionLiquidGlassCanvas) {
      topActionLiquidGlassCanvas = document.createElement('canvas');
      topActionLiquidGlassCanvas.className = 'top-action-liquid-glass';
      topActionLiquidGlassCanvas.setAttribute('aria-hidden', 'true');
    }
    if (!topActionLiquidGlassCanvas.parentNode) document.body.appendChild(topActionLiquidGlassCanvas);
    return topActionLiquidGlassCanvas;
  }

  function initTopActionLiquidGlassRenderer() {
    if (topActionLiquidGlass || topActionLiquidGlassFailed || !topActionLiquidGlassCanvas) return topActionLiquidGlass;
    var gl = topActionLiquidGlassCanvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });
    if (!gl) {
      topActionLiquidGlassFailed = true;
      console.warn('Liquid Glass WebGL2 unavailable');
      return null;
    }
    try {
      var vertex = compileLiquidGlassShader(gl, gl.VERTEX_SHADER, LIQUID_GLASS_VERTEX);
      var fragment = compileLiquidGlassShader(gl, gl.FRAGMENT_SHADER, LIQUID_GLASS_FRAGMENT);
      var program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'program link error');
      }
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      var vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var position = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      var uniformNames = [
        'uBackdrop', 'uCanvasSize', 'uViewportSize', 'uCanvasOrigin', 'uDpr', 'uHasTexture',
        'uDimTop', 'uDimBottom', 'uBaseCenter', 'uBaseHalf', 'uBaseRadius',
        'uBaseRefractionHeight', 'uBaseRefractionAmount', 'uThumbCenter',
        'uThumbHalf', 'uThumbRadius', 'uThumbRefractionHeight',
        'uThumbRefractionAmount', 'uThumbMagnification', 'uPress', 'uContentSample', 'uPointer', 'uGlassDarken'
      ];
      var uniforms = {};
      uniformNames.forEach(function (name) { uniforms[name] = gl.getUniformLocation(program, name); });
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.useProgram(program);
      gl.uniform1i(uniforms.uBackdrop, 0);
      topActionLiquidGlass = {
        gl: gl,
        program: program,
        uniforms: uniforms,
        texture: texture,
        textureCanvas: document.createElement('canvas'),
        width: 0,
        height: 0,
        dpr: 1,
        press: 0,
        lastTime: 0,
        hasTexture: false
      };
      topActionNav.classList.add('liquid-glass-ready');
      topActionLiquidGlassCanvas.classList.add('is-ready');
      syncTopActionLiquidGlassRenderer(true);
      return topActionLiquidGlass;
    } catch (err) {
      topActionLiquidGlassFailed = true;
      topActionLiquidGlass = null;
      topActionNav.classList.remove('liquid-glass-ready');
      if (topActionLiquidGlassCanvas) topActionLiquidGlassCanvas.classList.remove('is-ready');
      console.warn('Liquid Glass WebGL2 init failed', err);
      return null;
    }
  }

  function uploadTopActionLiquidGlassTexture() {
    if (!topActionLiquidGlass || !liquidGlassWallpaperImage) return;
    var image = liquidGlassWallpaperImage;
    var viewportWidth = Math.max(1, window.innerWidth);
    var viewportHeight = Math.max(1, window.innerHeight);
    var textureDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var canvas = topActionLiquidGlass.textureCanvas;
    var pixelWidth = Math.max(1, Math.round(viewportWidth * textureDpr));
    var pixelHeight = Math.max(1, Math.round(viewportHeight * textureDpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var naturalWidth = image.naturalWidth || image.width || viewportWidth;
    var naturalHeight = image.naturalHeight || image.height || viewportHeight;
    var cover = Math.max(viewportWidth / naturalWidth, viewportHeight / naturalHeight);
    var drawWidth = naturalWidth * cover;
    var drawHeight = naturalHeight * cover;
    ctx.filter = 'saturate(150%) blur(' + (1.5 * textureDpr).toFixed(2) + 'px)';
    ctx.drawImage(
      image,
      (viewportWidth - drawWidth) * 0.5 * textureDpr,
      (viewportHeight - drawHeight) * 0.5 * textureDpr,
      drawWidth * textureDpr,
      drawHeight * textureDpr
    );
    ctx.filter = 'none';
    var gl = topActionLiquidGlass.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, topActionLiquidGlass.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    topActionLiquidGlass.hasTexture = true;
    topActionLiquidGlassTextureSize = [viewportWidth, viewportHeight];
    scheduleTopActionLiquidGlassRender();
  }

  function resizeTopActionLiquidGlassRenderer() {
    if (!topActionLiquidGlass || !topActionLiquidGlassCanvas) return false;
    var rect = topActionNav.getBoundingClientRect();
    var thumbEl = topActionNav.querySelector('.top-action-thumb');
    var navWidth = Math.max(1, rect.width);
    var navHeight = Math.max(1, rect.height);
    var thumbHeight = thumbEl ? Math.max(1, thumbEl.offsetHeight) : 28;
    var thumbTop = 4;
    if (thumbEl) {
      var computedThumbTop = parseFloat(getComputedStyle(thumbEl).top);
      if (isFinite(computedThumbTop)) thumbTop = computedThumbTop;
    }
    var pad = LIQUID_GLASS_PADDING;
    var width = navWidth + pad * 2;
    var height = navHeight + pad * 2;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pixelWidth = Math.max(1, Math.round(width * dpr));
    var pixelHeight = Math.max(1, Math.round(height * dpr));
    var changed = false;
    if (topActionLiquidGlassCanvas.width !== pixelWidth) {
      topActionLiquidGlassCanvas.width = pixelWidth;
      changed = true;
    }
    if (topActionLiquidGlassCanvas.height !== pixelHeight) {
      topActionLiquidGlassCanvas.height = pixelHeight;
      changed = true;
    }
    topActionLiquidGlass.width = width;
    topActionLiquidGlass.height = height;
    topActionLiquidGlass.navWidth = navWidth;
    topActionLiquidGlass.navHeight = navHeight;
    topActionLiquidGlass.thumbHeight = thumbHeight;
    topActionLiquidGlass.thumbTop = thumbTop;
    topActionLiquidGlass.padding = pad;
    topActionLiquidGlass.dpr = dpr;
    topActionLiquidGlassCanvas.style.left = (rect.left - pad) + 'px';
    topActionLiquidGlassCanvas.style.top = (rect.top - pad) + 'px';
    topActionLiquidGlassCanvas.style.bottom = 'auto';
    if (topActionLiquidGlassBackdrop) {
      topActionLiquidGlassBackdrop.style.left = rect.left + 'px';
      topActionLiquidGlassBackdrop.style.top = rect.top + 'px';
      topActionLiquidGlassBackdrop.style.bottom = 'auto';
      topActionLiquidGlassBackdrop.style.width = navWidth + 'px';
      topActionLiquidGlassBackdrop.style.height = navHeight + 'px';
    }
    topActionLiquidGlassCanvas.style.width = width + 'px';
    topActionLiquidGlassCanvas.style.height = height + 'px';
    topActionLiquidGlass.gl.viewport(0, 0, pixelWidth, pixelHeight);
    if (
      topActionLiquidGlassTextureSize[0] !== window.innerWidth ||
      topActionLiquidGlassTextureSize[1] !== window.innerHeight
    ) uploadTopActionLiquidGlassTexture();
    return changed;
  }

  function scheduleTopActionLiquidGlassRender() {
    if (!topActionLiquidGlass || topActionLiquidGlassRenderFrame || !topActionGlassActive()) return;
    topActionLiquidGlassRenderFrame = requestAnimationFrame(renderTopActionLiquidGlass);
  }

  function renderTopActionLiquidGlass(now) {
    topActionLiquidGlassRenderFrame = 0;
    if (!topActionLiquidGlass || !topActionGlassActive() || topActionNav.classList.contains('empty')) return;
    if (document.documentElement.classList.contains('ui-hidden') || document.hidden) return;
    resizeTopActionLiquidGlassRenderer();
    var gl = topActionLiquidGlass.gl;
    var uniforms = topActionLiquidGlass.uniforms;
    var targetPress = topActionNav.classList.contains('pressing') ? 1 : 0;
    var dt = topActionLiquidGlass.lastTime ? Math.min(48, now - topActionLiquidGlass.lastTime) : 16;
    topActionLiquidGlass.lastTime = now;
    var mix = 1 - Math.exp(-dt / 72);
    topActionLiquidGlass.press += (targetPress - topActionLiquidGlass.press) * mix;
    if (Math.abs(topActionLiquidGlass.press - targetPress) < 0.002) topActionLiquidGlass.press = targetPress;
    var baseScale = 1;
    var baseHalfWidth = topActionLiquidGlass.navWidth * baseScale * 0.5;
    var baseHalfHeight = topActionLiquidGlass.navHeight * baseScale * 0.5;
    var searchMode = topActionNav.classList.contains('top-action-search-nav');
    var thumbScale = searchMode ? 1 : 1 + ((74 / 56) - 1) * topActionLiquidGlass.press;
    var thumbHeight = searchMode ? topActionLiquidGlass.navHeight : (topActionLiquidGlass.thumbHeight || 28);
    var thumbTop = searchMode ? 0 : (typeof topActionLiquidGlass.thumbTop === 'number' ? topActionLiquidGlass.thumbTop : 4);
    var thumbHalfHeight = thumbHeight * 0.5;
    var thumbSizeScale = searchMode ? 1 : thumbHeight / 28;
    var thumbCenterX = searchMode
      ? topActionLiquidGlass.padding + topActionLiquidGlass.navWidth * 0.5
      : topActionLiquidGlass.padding + topActionThumbX + topActionThumbW * 0.5;
    var thumbCenterY = searchMode
      ? topActionLiquidGlass.padding + topActionLiquidGlass.navHeight * 0.5
      : topActionLiquidGlass.padding + thumbTop + thumbHalfHeight;
    var pointerX = topActionLiquidGlassPointer.active ? topActionLiquidGlass.padding + topActionLiquidGlassPointer.x : thumbCenterX;
    var pointerY = topActionLiquidGlassPointer.active ? topActionLiquidGlass.padding + topActionLiquidGlassPointer.y : thumbCenterY;
    gl.useProgram(topActionLiquidGlass.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, topActionLiquidGlass.texture);
    var rootStyle = getComputedStyle(document.documentElement);
    gl.uniform2f(uniforms.uCanvasSize, topActionLiquidGlass.width, topActionLiquidGlass.height);
    var navRect = topActionNav.getBoundingClientRect();
    gl.uniform2f(uniforms.uViewportSize, window.innerWidth, window.innerHeight);
    gl.uniform2f(uniforms.uCanvasOrigin, navRect.left - topActionLiquidGlass.padding, navRect.top - topActionLiquidGlass.padding);
    gl.uniform1f(uniforms.uDpr, topActionLiquidGlass.dpr);
    gl.uniform1f(uniforms.uHasTexture, topActionLiquidGlass.hasTexture ? 1 : 0);
    gl.uniform1f(uniforms.uDimTop, parseFloat(rootStyle.getPropertyValue('--wallpaper-dim-top')) || 0.175);
    gl.uniform1f(uniforms.uDimBottom, parseFloat(rootStyle.getPropertyValue('--wallpaper-dim-bottom')) || 0.42);
    gl.uniform2f(uniforms.uBaseCenter, topActionLiquidGlass.padding + topActionLiquidGlass.navWidth * 0.5, topActionLiquidGlass.padding + topActionLiquidGlass.navHeight * 0.5);
    gl.uniform2f(uniforms.uBaseHalf, baseHalfWidth, baseHalfHeight);
    gl.uniform1f(uniforms.uBaseRadius, Math.min(baseHalfWidth, baseHalfHeight));
    gl.uniform1f(uniforms.uBaseRefractionHeight, 12);
    gl.uniform1f(uniforms.uBaseRefractionAmount, -12);
    var thumbUniformWidth = searchMode ? topActionLiquidGlass.navWidth * 0.5 : Math.max(14, topActionThumbW * thumbScale * 0.5);
    var thumbUniformHeight = searchMode ? topActionLiquidGlass.navHeight * 0.5 : thumbHalfHeight * thumbScale;
    gl.uniform2f(uniforms.uThumbCenter, thumbCenterX, thumbCenterY);
    gl.uniform2f(uniforms.uThumbHalf, thumbUniformWidth, thumbUniformHeight);
    gl.uniform1f(uniforms.uThumbRadius, Math.min(thumbUniformWidth, thumbUniformHeight));
    gl.uniform1f(uniforms.uThumbRefractionHeight, searchMode ? 12 : 5 * thumbSizeScale * thumbScale);
    gl.uniform1f(uniforms.uThumbRefractionAmount, searchMode ? -12 : -7 * thumbSizeScale * thumbScale);
    gl.uniform1f(uniforms.uThumbMagnification, searchMode ? 1 : thumbScale);
    gl.uniform1f(uniforms.uPress, topActionLiquidGlass.press);
    gl.uniform1f(uniforms.uContentSample, document.documentElement.classList.contains('outer-screen-layout') ? 1 : 0);
    gl.uniform2f(uniforms.uPointer, pointerX, pointerY);
    var glassDarken = parseFloat(rootStyle.getPropertyValue('--glass-darken')) || 0.175;
    gl.uniform1f(uniforms.uGlassDarken, Math.max(0, Math.min(1, glassDarken)));
    topActionNav.style.setProperty('--glass-shadow-alpha', (topActionLiquidGlass.press * 0.1).toFixed(3));
    syncTopActionColorOverlay();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (Math.abs(topActionLiquidGlass.press - targetPress) > 0.002) scheduleTopActionLiquidGlassRender();
  }

  function syncTopActionLiquidGlassRenderer(force) {
    if (!topActionGlassActive()) {
      hideTopActionLiquidGlassSurface();
      clearTopActionColorMasks();
      return;
    }
    if (!topActionLiquidGlassCanvas) {
      ensureTopActionLiquidGlassCanvas();
      if (!topActionLiquidGlassCanvas) return;
    }
    if (!topActionLiquidGlass && !initTopActionLiquidGlassRenderer()) return;
    if (!topActionLiquidGlass) return;
    topActionNav.classList.add('liquid-glass-ready');
    topActionLiquidGlassCanvas.classList.add('is-ready');
    topActionLiquidGlassCanvas.style.display = 'block';
    if (topActionLiquidGlassBackdrop) topActionLiquidGlassBackdrop.style.display = 'block';
    resizeTopActionLiquidGlassRenderer();
    if (force && liquidGlassWallpaperImage) uploadTopActionLiquidGlassTexture();
    scheduleTopActionLiquidGlassRender();
  }

  window.addEventListener('resize', function () {
    if (liquidGlass) syncLiquidGlassRenderer(false);
    scheduleTopActionLiquidGlassSync(false);
    scheduleOuterWallpaperBlurUpdate();
  }, { passive: true });

  function releaseActivityData(id) {
    if (!id) return;
    activityReleaseVersions[id] = (activityReleaseVersions[id] || 0) + 1;
    if (reviewStore.reviews) delete reviewStore.reviews[id];
    if (achvStore.achievements) delete achvStore.achievements[id];
    if (scheduleStore.schedules) delete scheduleStore.schedules[id];
    if (resourceListStore.lists) delete resourceListStore.lists[id];
    delete resourcePageState[id];
    var keepHotspotWhileLeaderboardLoads = !!allHotspotLeaderboardLoadPromise && !hotspotLeaderboardStatsReady;
    if (!keepHotspotWhileLeaderboardLoads) {
      if (hotspotStore.hotspots) delete hotspotStore.hotspots[id];
      if (hotspotStore.points) delete hotspotStore.points[id];
    }
    if (!keepHotspotWhileLeaderboardLoads) delete hotspotMemory[id];
    delete hotspotUi[id];
  }

  function releaseActivityView(index) {
    var page = pages[index];
    if (!page) return;
    page._homeRenderToken = (page._homeRenderToken || 0) + 1;
    var sections = page.querySelectorAll('.page-section');
    for (var i = 0; i < sections.length; i++) {
      sections[i]._filesToken = (sections[i]._filesToken || 0) + 1;
    }
    parkReusableCenterShells(page);
    disposeSectionCardResources(page);
    var images = page.querySelectorAll('img');
    for (var k = 0; k < images.length; k++) {
      images[k].removeAttribute('src');
      images[k].removeAttribute('srcset');
    }
    page.innerHTML = '';
    invalidateCursorTargetCache();
  }

  function select(i) {
    i = Math.max(0, Math.min(LOGOS.length - 1, i));
    if (i === state.index && state.offset === 0) return;

    var previousIndex = state.index;
    state.index = i;
    state.offset = 0;

    var name = LOGOS[i];
    if (previousIndex !== i) {
      if (pages[previousIndex] !== pages[i]) releaseActivityView(previousIndex);
      else pages[i]._homeRenderToken = (pages[i]._homeRenderToken || 0) + 1;
      releaseActivityData(LOGOS[previousIndex]);
    }
    if (stagePageMode && stagePage) stagePage.dataset.page = name;
    setRuntimeCacheActivity(name);
    updateStartupLogo(name);

    // 先切换页面（保证即使 render 抛错也能看到新页）
    for (var k = 0; k < pages.length; k++) {
      pages[k].classList.toggle('active', pages[k] === pages[i]);
    }
    applyPageMeta(name);

    // render 可能在 items 为空等极端情况下抛错，用 try-catch 保护后续逻辑
    try { render(); } catch (err) {}

    applyWallpaper(name);
    applyMusic(name);
    buildNav(name);
    // buildNav 已经切换到当前栏目；这里只保留栏目名用于校准，不重复 showSection。
    var keepSection = (navCache[name] && navCache[name].active) || activeNavKey || SECTIONS[0][0];
    resetOuterNavEntry(name, keepSection);
    invalidateCursorTargetCache();
    fillHomeSection(name);
    playInterfaceAnimation(false);

    // 路由：hash 即页面唯一标识（file:// 下部分浏览器禁止 replaceState）
    try { history.replaceState(null, '', '#' + name); } catch (err) {}

    // 外屏仍保留下一轮校准；固定舞台不需要再次 showSection。
    if (!stagePageMode) {
      setTimeout(function () {
        if (state.index !== i) return;
        for (var k2 = 0; k2 < pages.length; k2++) {
          pages[k2].classList.toggle('active', pages[k2] === pages[i]);
        }
        showSection(name, keepSection);
      }, 0);
    }
  }

  /* ---------- 壁纸：按当前画质目录加载 ---------- */
  function revokeOuterWallpaperBlurUrl() {
    if (!outerWallpaperBlurUrl) return;
    try { URL.revokeObjectURL(outerWallpaperBlurUrl); } catch (err) {}
    outerWallpaperBlurUrl = '';
  }
  function clearOuterWallpaperBlurLayer() {
    outerWallpaperBlurToken++;
    outerWallpaperBlurSource = null;
    if (outerWallpaperBlurTimer) { clearTimeout(outerWallpaperBlurTimer); outerWallpaperBlurTimer = 0; }
    revokeOuterWallpaperBlurUrl();
    document.documentElement.style.removeProperty('--outer-wallpaper-blur-image');
    document.documentElement.style.removeProperty('--outer-monet-1');
    document.documentElement.style.removeProperty('--outer-monet-2');
    document.documentElement.style.removeProperty('--outer-monet-3');
  }
  function renderOuterWallpaperBlur(image) {
    if (!image || !image.naturalWidth || !image.naturalHeight) return;
    var token = ++outerWallpaperBlurToken;
    var viewportWidth = Math.max(1, window.innerWidth || 1);
    var viewportHeight = Math.max(1, window.innerHeight || 1);
    var scale = Math.min(1, 480 / viewportWidth, 1200 / viewportHeight);
    var canvasWidth = Math.max(1, Math.round(viewportWidth * scale));
    var canvasHeight = Math.max(1, Math.round(viewportHeight * scale));
    var canvas = document.createElement('canvas');
    canvas.width = canvasWidth; canvas.height = canvasHeight;
    var ctx; try { ctx = canvas.getContext('2d'); } catch (err) { ctx = null; }
    if (!ctx) return;
    var sourceWidth = image.naturalWidth, sourceHeight = image.naturalHeight;
    var coverScale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight) * 1.08;
    var drawWidth = sourceWidth * coverScale, drawHeight = sourceHeight * coverScale;
    var drawX = (canvasWidth - drawWidth) * 0.5, drawY = (canvasHeight - drawHeight) * 0.5;
    if ('filter' in ctx) ctx.filter = 'blur(' + Math.max(10, Math.round(canvasWidth * 0.05)) + 'px) saturate(160%) brightness(1.05)';
    try { ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight); } catch (err) { return; }
    if ('filter' in ctx) ctx.filter = 'none';
    var applyUrl = function (url, objectUrl) {
      if (token !== outerWallpaperBlurToken) { if (objectUrl) { try { URL.revokeObjectURL(url); } catch (err) {} } return; }
      var previousUrl = outerWallpaperBlurUrl;
      document.documentElement.style.setProperty('--outer-wallpaper-blur-image', 'url("' + url + '")');
      outerWallpaperBlurUrl = objectUrl ? url : '';
      if (previousUrl) { try { URL.revokeObjectURL(previousUrl); } catch (err) {} }
    };
    if (typeof canvas.toBlob === 'function' && typeof URL.createObjectURL === 'function') {
      canvas.toBlob(function (blob) { if (!blob) return; var objectUrl = URL.createObjectURL(blob); applyUrl(objectUrl, true); }, 'image/jpeg', 0.86);
      return;
    }
    applyUrl(canvas.toDataURL('image/jpeg', 0.86), false);
  }
  function renderOuterMonetPalette(image) {
    if (!image || !image.naturalWidth || !image.naturalHeight) return;
    var sampleSize = 64;
    var canvas = document.createElement('canvas');
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    var ctx;
    try { ctx = canvas.getContext('2d', { willReadFrequently: true }); } catch (err) { ctx = null; }
    if (!ctx) return;
    var sourceWidth = image.naturalWidth;
    var sourceHeight = image.naturalHeight;
    var coverScale = Math.max(sampleSize / sourceWidth, sampleSize / sourceHeight);
    var drawWidth = sourceWidth * coverScale;
    var drawHeight = sourceHeight * coverScale;
    var drawX = (sampleSize - drawWidth) * 0.5;
    var drawY = (sampleSize - drawHeight) * 0.5;
    try {
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      var sampleTop = Math.floor(sampleSize * 0.40);
      var pixels = [];
      var data = ctx.getImageData(0, sampleTop, sampleSize, sampleSize - sampleTop).data;
      for (var i = 0; i < data.length; i += 4) {
        var r = data[i], g = data[i + 1], b = data[i + 2];
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        var sat = (max - min) / 255;
        if (lum < 0.05 || lum > 0.96 || sat > 0.92) continue;
        pixels.push({ r: r, g: g, b: b, lum: lum, sat: sat });
      }
      if (!pixels.length) pixels.push({ r: 42, g: 96, b: 126, lum: 0.35, sat: 0.5 });
      var centers = [];
      var first = { r: 0, g: 0, b: 0 };
      pixels.forEach(function (pixel) { first.r += pixel.r; first.g += pixel.g; first.b += pixel.b; });
      first.r /= pixels.length; first.g /= pixels.length; first.b /= pixels.length;
      centers.push(first);
      while (centers.length < 4) {
        var next = pixels[0], bestDistance = -1;
        pixels.forEach(function (pixel) {
          var nearest = Infinity;
          centers.forEach(function (center) {
            var dr = pixel.r - center.r, dg = pixel.g - center.g, db = pixel.b - center.b;
            nearest = Math.min(nearest, dr * dr + dg * dg + db * db);
          });
          if (nearest > bestDistance) { bestDistance = nearest; next = pixel; }
        });
        centers.push({ r: next.r, g: next.g, b: next.b });
      }
      for (var iteration = 0; iteration < 8; iteration++) {
        var sums = centers.map(function () { return { r: 0, g: 0, b: 0, count: 0 }; });
        pixels.forEach(function (pixel) {
          var best = 0, bestDistance = Infinity;
          for (var c = 0; c < centers.length; c++) {
            var dr = pixel.r - centers[c].r, dg = pixel.g - centers[c].g, db = pixel.b - centers[c].b;
            var distance = dr * dr + dg * dg + db * db;
            if (distance < bestDistance) { bestDistance = distance; best = c; }
          }
          sums[best].r += pixel.r; sums[best].g += pixel.g; sums[best].b += pixel.b; sums[best].count++;
        });
        for (var c2 = 0; c2 < centers.length; c2++) {
          if (!sums[c2].count) continue;
          centers[c2].r = sums[c2].r / sums[c2].count;
          centers[c2].g = sums[c2].g / sums[c2].count;
          centers[c2].b = sums[c2].b / sums[c2].count;
        }
      }
      function mix(a, b, amount) {
        return {
          r: Math.round(a.r * (1 - amount) + b.r * amount),
          g: Math.round(a.g * (1 - amount) + b.g * amount),
          b: Math.round(a.b * (1 - amount) + b.b * amount)
        };
      }
      function rgbToHsl(color) {
        var r = color.r / 255, g = color.g / 255, b = color.b / 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h = 0, s = 0, l = (max + min) / 2;
        var d = max - min;
        if (d) {
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          else if (max === g) h = ((b - r) / d + 2) / 6;
          else h = ((r - g) / d + 4) / 6;
        }
        return { h: h, s: s, l: l };
      }
      function hslToRgb(hsl) {
        var h = hsl.h, s = hsl.s, l = hsl.l;
        function hue(p, q, t) {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        }
        if (!s) return { r: Math.round(l * 255), g: Math.round(l * 255), b: Math.round(l * 255) };
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        return {
          r: Math.round(hue(p, q, h + 1 / 3) * 255),
          g: Math.round(hue(p, q, h) * 255),
          b: Math.round(hue(p, q, h - 1 / 3) * 255)
        };
      }
      var dominant = null;
      for (var c3 = 0; c3 < centers.length; c3++) {
        var stats = sums[c3] || { r: 0, g: 0, b: 0, count: 0 };
        var count = stats.count || 0;
        if (count && (!dominant || count > dominant.count)) {
          dominant = {
            count: count,
            r: stats.r / count,
            g: stats.g / count,
            b: stats.b / count
          };
        }
      }
      if (!dominant) dominant = { r: pixels[0].r, g: pixels[0].g, b: pixels[0].b, count: 1 };
      var chosen = dominant;
      var accent = chosen;
      var soft = mix(chosen, { r: 255, g: 255, b: 255 }, 0.48);
      var rootStyle = document.documentElement.style;
      rootStyle.setProperty('--outer-monet-1', chosen.r + ', ' + chosen.g + ', ' + chosen.b);
      rootStyle.setProperty('--outer-monet-dark', accent.r + ', ' + accent.g + ', ' + accent.b);
      rootStyle.setProperty('--outer-monet-soft', soft.r + ', ' + soft.g + ', ' + soft.b);
    } catch (err) {
      var fallback = document.documentElement.style;
      fallback.setProperty('--outer-monet-1', '52, 102, 124');
      fallback.setProperty('--outer-monet-dark', '52, 102, 124');
      fallback.setProperty('--outer-monet-soft', '151, 178, 190');
    }
  }

  function scheduleOuterWallpaperBlurUpdate() {
    if (!outerWallpaperBlurSource) return;
    if (outerWallpaperBlurTimer) clearTimeout(outerWallpaperBlurTimer);
    outerWallpaperBlurTimer = setTimeout(function () { outerWallpaperBlurTimer = 0; renderOuterMonetPalette(outerWallpaperBlurSource); renderOuterWallpaperBlur(outerWallpaperBlurSource); }, 180);
  }
  function updateOuterWallpaperLayer(image) {
    if (image == null) return;
    var src = image.currentSrc ? image.currentSrc : image.src;
    if (!src) return;
    outerWallpaperBlurSource = image;
    document.documentElement.style.setProperty('--outer-wallpaper-image', 'url("' + src + '")');
    renderOuterMonetPalette(image);
    renderOuterWallpaperBlur(image);
  }

  function applyWallpaper(name) {
    var url = wallpaperUrl(name);
    var show = bgFrontIsA ? bgA : bgB;
    var hide = bgFrontIsA ? bgB : bgA;
    var loadToken = ++wallpaperLoadToken;

    var im = new Image();
    im.decoding = 'async';
    im.onload = function () {
      if (loadToken !== wallpaperLoadToken) {
        im.onload = null;
        im.onerror = null;
        return;
      }
      im.onload = null;
      im.onerror = null;
      show.style.backgroundImage = "url('" + url + "')";
      show.getAnimations().forEach(function (animation) { animation.cancel(); });
      hide.getAnimations().forEach(function (animation) { animation.cancel(); });
      // 旧壁纸始终留在底层并保持不透明；新壁纸置顶后仅由透明淡入。
      show.classList.remove('show');
      hide.classList.add('show');
      show.style.opacity = '0';
      hide.style.opacity = '1';
      show.style.zIndex = '1';
      hide.style.zIndex = '0';
      if (show.animate) {
        var fadeIn = show.animate([
          { opacity: 0 },
          { opacity: 1 }
        ], { duration: 650, easing: 'ease-in-out', fill: 'both' });
        fadeIn.onfinish = function () {
          show.classList.add('show');
          show.style.removeProperty('opacity');
          fadeIn.cancel();
        };
      } else {
        show.classList.add('show');
        show.style.removeProperty('opacity');
      }
      updateLiquidGlassWallpaper(im);
      updateOuterWallpaperLayer(im);
      bgFrontIsA = !bgFrontIsA;
    };
    im.onerror = function () {
      if (loadToken !== wallpaperLoadToken) {
        im.onload = null;
        im.onerror = null;
        return;
      }
      im.onload = null;
      im.onerror = null;
      // 新壁纸加载失败时继续保留当前壁纸；仅首次加载失败才使用兜底背景。
      show.classList.remove('show');
      if (hide.style.backgroundImage) hide.classList.add('show');
      else hide.classList.remove('show');
      clearOuterWallpaperBlurLayer();
    };
    im.src = url;
  }

  /* ---------- 音乐 ---------- */
  var playerName = document.getElementById('playerName');
  var playerCover = document.getElementById('playerCover');
  var playerCoverArt = document.getElementById('playerCoverArt');
  var playerRing = document.getElementById('playerRing');
  var userExpRing = document.getElementById('userExpRing');
  var userPillLevel = document.getElementById('userPillLevel');

  // 圆环周长（r=18.1，viewBox 40），stroke-dashoffset 按进度从 C → 0
  var RING_C = 2 * Math.PI * 18.1;
  function initRing(el, ratio) {
    if (!el) return;
    ratio = Math.max(0, Math.min(1, ratio || 0));
    el.style.strokeDasharray = String(RING_C);
    el.style.strokeDashoffset = String(RING_C * (1 - ratio));
  }
  initRing(playerRing, 0);
  var userRingLength = userExpRing && userExpRing.getTotalLength ? userExpRing.getTotalLength() : RING_C * 0.75;
  if (!isFinite(userRingLength) || userRingLength <= 0) userRingLength = RING_C * 0.75;
  function initUserExpRing() {
    if (!userExpRing) return;
    userExpRing.style.strokeDasharray = String(userRingLength);
    userExpRing.style.strokeDashoffset = String(userRingLength);
  }
  initUserExpRing();
  function setRing(ratio) {
    if (!playerRing) return;
    ratio = Math.max(0, Math.min(1, ratio || 0));
    playerRing.style.strokeDashoffset = String(RING_C * (1 - ratio));
  }
  function setUserExpRing(ratio) {
    if (!userExpRing) return;
    ratio = Math.max(0, Math.min(1, ratio || 0));
    userExpRing.style.strokeDasharray = String(userRingLength);
    userExpRing.style.strokeDashoffset = String(userRingLength * (1 - ratio));
  }

  // 当前活动的音乐名：优先取核心数据中的 music 字段，缺省用活动 ID
  function trackTitle(logo) {
    var core = (dataStore && dataStore.core) || [];
    for (var i = 0; i < core.length; i++) {
      if (core[i].id === logo && core[i].music) return core[i].music;
    }
    return logo;
  }

  // 设置曲名：纯文本、右对齐、不滚动
  function setTrackName(text) {
    if (playerName) playerName.textContent = text;
  }

  // 刷新播放器曲名与专辑封面
  function refreshPlayerMedia() {
    var logo = LOGOS[state.index];
    setTrackName(trackTitle(logo));
    if (playerCoverArt) bindResponsiveAsset(playerCoverArt, 'music/' + logo + '.jpg');
    syncInnerActivityButton(logo);
  }

  function applyMusic(name) {
    var src = musicUrl(name);
    if (audio.dataset.src === src) return;
    audio.dataset.src = src;
    audio.src = src;
    setRing(0);
    setTrackName(trackTitle(name));
    if (playerCoverArt) bindResponsiveAsset(playerCoverArt, 'music/' + name + '.jpg');
    syncInnerActivityButton(name);
    if (interacted && !musicPausedByUser) {
      audio.currentTime = 0;
      var p = audio.play();
      if (p && p.catch) p.catch(function () {});
    }
  }

  // 播放进度实时更新到专辑内描边圆环
  audio.addEventListener('timeupdate', function () {
    if (audio.duration && isFinite(audio.duration)) {
      setRing(audio.currentTime / audio.duration);
    }
  });

  // 播放时唱片层顺时针旋转，暂停时停转
  audio.addEventListener('play', function () { playerCover.classList.add('playing'); });
  audio.addEventListener('pause', function () { playerCover.classList.remove('playing'); });

  // 按指针位置换算圆环进度（正上方为 0，顺时针）；不在圆环描边带附近返回 null
  function ringRatioAt(clientX, clientY) {
    var r = playerCover.getBoundingClientRect();
    var dx = clientX - (r.left + r.width / 2);
    var dy = clientY - (r.top + r.height / 2);
    var dist = Math.sqrt(dx * dx + dy * dy);
    var outer = r.width / 2;
    if (dist < outer - 7 || dist > outer + 2) return null;
    var ang = Math.atan2(dy, dx) + Math.PI / 2; // 以正上方为 0
    if (ang < 0) ang += Math.PI * 2;
    return ang / (Math.PI * 2);
  }

  // 点击封面中部 = 播放/暂停；按住圆环描边 = 跳转并可拖动
  var ringScrubbing = false;
  var suppressCoverClick = false;
  playerCover.addEventListener('pointerdown', function (e) {
    var ratio = ringRatioAt(e.clientX, e.clientY);
    if (ratio === null || !audio.duration || !isFinite(audio.duration)) return;
    e.preventDefault();
    ringScrubbing = true;
    suppressCoverClick = true;
    audio.currentTime = ratio * audio.duration;
    setRing(ratio);
    try { playerCover.setPointerCapture(e.pointerId); } catch (err) {}
  });
  playerCover.addEventListener('pointermove', function (e) {
    if (!ringScrubbing || !audio.duration || !isFinite(audio.duration)) return;
    var r2 = playerCover.getBoundingClientRect();
    var dx = e.clientX - (r2.left + r2.width / 2);
    var dy = e.clientY - (r2.top + r2.height / 2);
    var ang = Math.atan2(dy, dx) + Math.PI / 2;
    if (ang < 0) ang += Math.PI * 2;
    var ratio = ang / (Math.PI * 2);
    audio.currentTime = ratio * audio.duration;
    setRing(ratio);
  });
  function endRingScrub(e) {
    ringScrubbing = false;
    // 显式释放指针捕获
    if (e && e.pointerId != null && playerCover.releasePointerCapture) {
      try { playerCover.releasePointerCapture(e.pointerId); } catch (err) {}
    }
  }
  playerCover.addEventListener('pointerup', endRingScrub);
  playerCover.addEventListener('pointercancel', endRingScrub);
  function toggleMusicPlayback() {
    if (audio.paused) {
      musicPausedByUser = false;
      if (!interacted) {
        startActivityMusic();
        return;
      }
      var playPromise = audio.play();
      if (playPromise && playPromise.catch) playPromise.catch(function () {});
    } else {
      musicPausedByUser = true;
      audio.pause();
    }
  }
  function seekMusicBy(seconds) {
    if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
    setRing(audio.currentTime / audio.duration);
  }
  // 中部点击（非拖环）播放/暂停；刚拖过环则吞掉本次 click
  playerCover.addEventListener('click', function () {
    if (suppressCoverClick) { suppressCoverClick = false; return; }
    toggleMusicPlayback();
  });

  // 浏览器自动播放限制：首次交互后启动音乐
  function startActivityMusic() {
    if (interacted) return;
    interacted = true;
    audio.preload = 'auto';
    window.removeEventListener('pointerdown', onFirstInteract);
    window.removeEventListener('wheel', onFirstInteract);
    if (!audio.src) audio.src = musicUrl(LOGOS[state.index]);
    if (musicPausedByUser) return;
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
  }
  function onFirstInteract() {
    if (startupOverlay && !startupOverlay.hidden && !startupEntryComplete) return;
    startActivityMusic();
  }
  window.addEventListener('pointerdown', onFirstInteract);
  window.addEventListener('wheel', onFirstInteract);

  /* ---------- 顶栏 ---------- */
  var topbar = document.getElementById('topbar');

  /* ---------- 交互 1：滚轮切换 ---------- */
  var lastWheel = 0;
  dock.addEventListener('wheel', function (e) {
    e.preventDefault();
    resumeBorderGlow();
    var now = performance.now();
    if (now - lastWheel < 180) return;
    var d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(d) < 4) return;
    lastWheel = now;
    select(state.index + (d > 0 ? 1 : -1));
  }, { passive: false });

  /* ---------- 交互 2：长按拖动（鼠标 / 触摸统一用 Pointer Events） ---------- */
  var drag = null;
  var borderGlowPaused = false;
  var borderGlowResumeTimer = 0;

  function resumeBorderGlow() {
    if (borderGlowResumeTimer) {
      clearTimeout(borderGlowResumeTimer);
      borderGlowResumeTimer = 0;
    }
    if (!borderGlowPaused) return;
    borderGlowPaused = false;
    scheduleCursorGlowUpdate(0, false);
  }

  dock.addEventListener('pointerdown', function (e) {
    if (borderGlowResumeTimer) {
      clearTimeout(borderGlowResumeTimer);
      borderGlowResumeTimer = 0;
    }
    // 记录按下时所在的卡片：pointerup 时若未拖动即视为"轻点切换"
    // （setPointerCapture 会把 click 重定向到 dock，故不依赖 click 判定）
    var card = e.target && e.target.closest ? e.target.closest('.dock-item') : null;
    drag = {
      startX: e.clientX,
      moved: false,
      pointerId: e.pointerId,
      itemIndex: card ? items.indexOf(card) : -1
    };
    if (dock.setPointerCapture) {
      try { dock.setPointerCapture(e.pointerId); } catch (err) {}
    }
    dock.classList.add('pressing');
  });

  dock.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.startX;

    if (!drag.moved && Math.abs(dx) > 10) {
      drag.moved = true;
      borderGlowPaused = true;
      dock.classList.add('dragging');
      updateCursorGlow(false);
    }
    if (!drag.moved) return;

    readSlotSize();
    var off = -dx / slotSize; // 向左拖 → 下一个 logo
    // 两端橡皮筋阻尼
    if (state.index === 0 && off < 0) off *= 0.35;
    if (state.index === LOGOS.length - 1 && off > 0) off *= 0.35;

    state.offset = off;
    render();
  });

  function endDrag(e) {
    if (!drag) return;
    // 显式释放指针捕获，避免捕获残留导致页面区域交互失效
    if (drag.pointerId != null && dock.releasePointerCapture) {
      try { dock.releasePointerCapture(drag.pointerId); } catch (err) {}
    }
    dock.classList.remove('pressing', 'dragging');

    var moved = drag.moved;
    if (moved) {
      var target = state.index + Math.round(state.offset);
      select(target);
    } else if (drag.itemIndex >= 0) {
      // 轻点某张卡片 → 切换到该 logo 页面
      select(drag.itemIndex);
    }
    drag = null;
    if (moved) {
      if (borderGlowResumeTimer) clearTimeout(borderGlowResumeTimer);
      borderGlowResumeTimer = setTimeout(resumeBorderGlow, 520);
    } else {
      resumeBorderGlow();
    }
  }
  dock.addEventListener('pointerup', endDrag);
  dock.addEventListener('pointercancel', endDrag);

  /* ---------- 用户系统：暂停菜单 / 数据侧栏 / 登录 / admin ---------- */
  var userMenuBtn = document.getElementById('userMenuBtn');
  var pauseMenu = document.getElementById('pauseMenu');
  var sidebarMask = document.getElementById('sidebarMask');
  var sidebarRight = document.getElementById('sidebarRight');
  var sidebarLeft = document.getElementById('sidebarLeft');
  var editBtn = document.getElementById('editBtn');
  var consoleBtn = document.getElementById('consoleBtn');
  var consoleContent = document.getElementById('consoleContent');
  var consoleMainPage = document.getElementById('consoleMainPage');
  var consoleIgnoredPage = document.getElementById('consoleIgnoredPage');
  var consoleIgnoredBtn = document.getElementById('consoleIgnoredBtn');
  var consoleIgnoredBack = document.getElementById('consoleIgnoredBack');
  var consoleIgnoredContent = document.getElementById('consoleIgnoredContent');
  var loginOverlay = document.getElementById('loginOverlay');
  var loginUser = document.getElementById('loginUser');
  var loginPass = document.getElementById('loginPass');
  var loginError = document.getElementById('loginError');
  var loginSubmit = document.getElementById('loginSubmit');
  var loginCancel = document.getElementById('loginCancel');
  var loginLogout = document.getElementById('loginLogout');
  var navAccountSwitch = document.getElementById('navAccountSwitch');
  var GUEST_NAME = '访客用户';
  var user = { name: GUEST_NAME, isAdmin: false, media: '', lv: 1, exp: 0, expMax: 271 };
  var sidebarLevelRow = document.getElementById('sidebarLevelRow');
  var sidebarLevelBadge = document.getElementById('sidebarLevelBadge');
  var sidebarExpFill = document.getElementById('sidebarExpFill');
  var sidebarExpValue = document.getElementById('sidebarExpValue');
  var sidebarExpTotal = document.getElementById('bottomExpTotal');

  /* ---------- 用户经验：评论/回复、库存项目、称号等级实时派生 ---------- */
  var MAX_USER_LEVEL = 100;
  var USER_LEVEL_TIERS = [
    { start: 1, end: 9, cls: 'tier-gray' },
    { start: 10, end: 19, cls: 'tier-green' },
    { start: 20, end: 29, cls: 'tier-cyan' },
    { start: 30, end: 39, cls: 'tier-blue' },
    { start: 40, end: 49, cls: 'tier-pink' },
    { start: 50, end: 59, cls: 'tier-purple' },
    { start: 60, end: 69, cls: 'tier-gold' },
    { start: 70, end: 79, cls: 'tier-orange' },
    { start: 80, end: 89, cls: 'tier-red' },
    { start: 90, end: 99, cls: 'tier-black' },
    { start: 100, end: 100, cls: 'tier-iridescent' }
  ];
  var USER_LEVEL_EXP_TO_NEXT = [0];
  var USER_LEVEL_REQUIRED_TOTAL = [0, 0];
  for (var userLevelIndex = 1; userLevelIndex < MAX_USER_LEVEL; userLevelIndex += 1) {
    var userLevelRequirement = Math.round(0.6 * userLevelIndex * userLevelIndex + 160 * userLevelIndex + 110);
    USER_LEVEL_EXP_TO_NEXT[userLevelIndex] = userLevelRequirement;
    USER_LEVEL_REQUIRED_TOTAL[userLevelIndex + 1] = USER_LEVEL_REQUIRED_TOTAL[userLevelIndex] + userLevelRequirement;
  }
  var EMOJI_STICKER_SENTINEL = '\uE000';
  var LARGE_TEXT_GRAPHEME_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u2E80-\u2FFF\u3000-\u303F\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFE30-\uFE4F\uFF01-\uFF60\uFFE0-\uFFE6]/u;
  var graphemeSegmenter = null;
  if (window.Intl && typeof window.Intl.Segmenter === 'function') {
    try { graphemeSegmenter = new window.Intl.Segmenter('zh-CN', { granularity: 'grapheme' }); } catch (err) {}
  }

  function experienceNameKey(name) {
    return String(name == null ? '' : name).trim().toLowerCase();
  }

  function graphemesOf(text) {
    if (graphemeSegmenter) {
      try {
        return Array.from(graphemeSegmenter.segment(text), function (part) { return part.segment; });
      } catch (err) {}
    }
    return Array.from(String(text || ''));
  }

  function hotspotCommentExperience(text) {
    var source = String(text == null ? '' : text);
    var normalized = hotspotStandaloneEmoji(source) ? EMOJI_STICKER_SENTINEL : source;

    var units = graphemesOf(normalized);
    var total = 0;
    for (var k = 0; k < units.length; k += 1) {
      var unit = units[k];
      if (unit === EMOJI_STICKER_SENTINEL) total += 10;
      else if (/^\s+$/u.test(unit)) continue;
      else total += LARGE_TEXT_GRAPHEME_RE.test(unit) ? 4 : 2;
      if (total >= 100) return 100;
    }
    return Math.min(100, total);
  }

  function rebuildHotspotAggregatedStats() {
    var aggregate = Object.create(null);
    Object.keys(hotspotActivityStats).forEach(function (id) {
      var stats = hotspotActivityStats[id] || {};
      Object.keys(stats).forEach(function (key) {
        var source = stats[key];
        var target = aggregate[key] || (aggregate[key] = { experience: 0, characters: 0 });
        target.experience += Number(source.experience) || 0;
        target.characters += Number(source.characters) || 0;
      });
    });
    hotspotAggregatedStats = aggregate;
  }

  function setHotspotActivityStats(id, posts) {
    var activityId = String(id || '');
    if (!activityId) return;
    var stats = Object.create(null);
    function walk(comments) {
      (comments || []).forEach(function (comment) {
        if (!comment) return;
        var key = experienceNameKey(comment.name);
        if (key) {
          var row = stats[key] || (stats[key] = { experience: 0, characters: 0 });
          row.experience += hotspotCommentExperience(comment.text || '');
          row.characters += hotspotCommentCharacterScore(comment.text || '');
        }
        walk(comment.replies);
      });
    }
    (posts || []).forEach(function (post) {
      walk(post && post.comments);
    });
    hotspotActivityStats[activityId] = stats;
    rebuildHotspotAggregatedStats();
  }

  function hotspotExperienceForUser(name) {
    var target = experienceNameKey(name);
    if (!target) return 0;
    if (hotspotLeaderboardStatsReady || Object.keys(hotspotActivityStats).length) {
      var cached = hotspotAggregatedStats[target];
      return cached ? (Number(cached.experience) || 0) : 0;
    }
    var total = 0;

    function walk(comments) {
      (comments || []).forEach(function (comment) {
        if (!comment) return;
        if (experienceNameKey(comment.name) === target) {
          total += hotspotCommentExperience(comment.text || '');
        }
        walk(comment.replies);
      });
    }

    Object.keys((hotspotStore && hotspotStore.hotspots) || {}).forEach(function (id) {
      var posts = hotspotStore.hotspots[id];
      if (!Array.isArray(posts)) posts = normalizeHotspotPosts(posts);
      posts.forEach(function (post) { walk(post && post.comments); });
    });
    return total;
  }

  function normalizeTitleLevel(value) {
    var raw = String(value == null ? '' : value).trim().toUpperCase();
    if (raw === 'P1' || raw === 'P2') return raw;
    var level = parseInt(raw, 10);
    if (!isFinite(level)) return 1;
    return Math.max(1, Math.min(6, level));
  }

  function isSpecialTitleLevel(level) {
    var value = String(level == null ? '' : level).trim().toUpperCase();
    return value === 'P1' || value === 'P2';
  }

  function titleExperienceValue(level) {
    if (level === 'P1') return 3000;
    if (level === 'P2') return 2000;
    return Number(level || 0) * 100;
  }

  function normalizeTitleRecord(title) {
    var source = title || {};
    var raw = String(source.raw || '').trim();
    var match = raw.match(/^\[([^\]]+)\]/);
    var level = normalizeTitleLevel(match ? match[1] : source.lv);
    var text = String(source.text == null ? '' : source.text).trim();
    if (!text && raw) text = raw.replace(/^\[[^\]]+\]\s*/, '').trim();
    return { lv: level, text: text, raw: '[' + level + ']' + text };
  }

  function ownedItemExperienceCount(name) {
    var record = libraryRecordFor(name);
    if (!record) return 0;
    var seen = {};
    (record.entries || []).forEach(function (entry) {
      var id = String(entry && entry.id || '').trim().toLowerCase();
      var item = String(entry && entry.version || '').trim().toLowerCase();
      if (id && item) seen[id + '\u0000' + item] = true;
    });
    return Object.keys(seen).length;
  }

  /* ---------- 成就型称号：由网站数据实时计算，无需导入任何数据文件 ----------
     每组 6 档，恰好对应称号等级 1~6（[1]青铜 … [6]幻彩）；
     数据变化后重新计算，达标即自动获得，未达标不发放。 */
  var ACHIEVEMENT_TITLE_GROUPS = [
    {
      id: 'level',
      name: '老登等级榜',
      tiers: [
        { text: '初来乍到', need: 5 },
        { text: '小试牛刀', need: 10 },
        { text: '崭露头角', need: 20 },
        { text: '老当益壮', need: 30 },
        { text: '登峰造极', need: 40 },
        { text: '傲视群雄', need: 50 }
      ]
    },
    {
      id: 'value',
      name: '全勤价值榜',
      tiers: [
        { text: '白手起家', need: 10 },
        { text: '积少成多', need: 20 },
        { text: '日进斗金', need: 40 },
        { text: '富甲一方', need: 60 },
        { text: '腰缠万贯', need: 80 },
        { text: '富可敌国', need: 100 }
      ]
    },
    {
      id: 'comment',
      name: '水军发言榜',
      tiers: [
        { text: '潜水摸鱼', need: 5000 },
        { text: '侃侃而谈', need: 10000 },
        { text: '滔滔不绝', need: 20000 },
        { text: '口若悬河', need: 30000 },
        { text: '覆水难收', need: 40000 },
        { text: '龙王驾到', need: 50000 }
      ]
    }
  ];

  // 第 1 档 = [1]，第 6 档 = [6]
  function achievementTitleLevel(index) {
    return Math.max(1, Math.min(6, Number(index) + 1));
  }

  // 按当前数值挑出已达成的那几档
  function achievementTitleRecords(state) {
    var list = [];
    ACHIEVEMENT_TITLE_GROUPS.forEach(function (group) {
      var current = Number(state[group.id]) || 0;
      group.tiers.forEach(function (tier, index) {
        if (current + 1e-9 < tier.need) return;
        var lv = achievementTitleLevel(index);
        list.push({ lv: lv, text: tier.text, raw: '[' + lv + ']' + tier.text });
      });
    });
    return list;
  }

  // 某个用户的成就数值与已达成称号。
  // 等级榜看的是等级，而成就称号本身也加经验，所以多算几轮直到不再变化。
  function achievementStateForUser(nick) {
    var name = String(nick == null ? '' : nick);
    var state = { level: 1, value: 0, comment: 0, earned: [] };
    if (!name) return state;

    var importedKeys = {};
    importedTitlesOf(name).forEach(function (title) {
      importedKeys[title.lv + '\u0000' + String(title.text || '').trim().toLowerCase()] = true;
    });

    var baseExp = baseExperienceForUser(name);
    state.value = accountValueForUser(name);
    state.comment = hotspotCharacterCountForUser(name);

    var earned = [];
    for (var pass = 0; pass < 8; pass += 1) {
      // 与导入称号重名的成就称号不重复加经验
      var extraExp = titleExperienceSum(earned.filter(function (title) {
        return !importedKeys[title.lv + '\u0000' + String(title.text || '').trim().toLowerCase()];
      }));
      state.level = userLevelMetrics(baseExp + extraExp).level;
      var next = achievementTitleRecords(state);
      if (next.length === earned.length) break;
      earned = next;
    }
    state.earned = earned;
    return state;
  }

  // 当前已获得的成就称号（字段与普通称号完全一样，直接混进称号列表）
  function earnedAchievementTitles(nick) {
    return achievementStateForUser(nick).earned;
  }

  function titleExperienceSum(list) {
    var seen = {};
    var total = 0;
    (list || []).forEach(function (title) {
      if (!title) return;
      var level = normalizeTitleLevel(title.lv);
      var key = level + '\u0000' + String(title.text || '').trim().toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      total += titleExperienceValue(level);
    });
    return total;
  }

  // 只统计导入的称号（成就型称号另外算，避免两边互相调用）
  function importedTitleExperienceForUser(name) {
    return titleExperienceSum(importedTitlesOf(name));
  }

  // 全部称号（导入 + 成就型）带来的经验
  function titleExperienceForUser(name) {
    return titleExperienceSum(titlesOf(name));
  }

  function userLevelTierClass(level) {
    for (var i = 0; i < USER_LEVEL_TIERS.length; i += 1) {
      if (level >= USER_LEVEL_TIERS[i].start && level <= USER_LEVEL_TIERS[i].end) return USER_LEVEL_TIERS[i].cls;
    }
    return 'tier-iridescent';
  }

  function userLevelMetrics(experience) {
    var exp = Math.max(0, Math.floor(Number(experience) || 0));
    var level = 1;
    var low = 1;
    var high = MAX_USER_LEVEL;
    while (low <= high) {
      var middle = Math.floor((low + high) / 2);
      if (USER_LEVEL_REQUIRED_TOTAL[middle] <= exp) {
        level = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    if (level >= MAX_USER_LEVEL) {
      return {
        level: MAX_USER_LEVEL,
        label: String(MAX_USER_LEVEL),
        current: 0,
        max: 0,
        nextRequiredExp: USER_LEVEL_REQUIRED_TOTAL[MAX_USER_LEVEL],
        ratio: 1,
        cls: userLevelTierClass(MAX_USER_LEVEL),
        maxed: true
      };
    }

    var requiredTotal = USER_LEVEL_REQUIRED_TOTAL[level];
    var requiredNext = USER_LEVEL_EXP_TO_NEXT[level] || 0;
    var current = Math.max(0, exp - requiredTotal);
    return {
      level: level,
      label: String(level),
      current: current,
      max: requiredNext,
      nextRequiredExp: USER_LEVEL_REQUIRED_TOTAL[level + 1],
      ratio: requiredNext ? current / requiredNext : 0,
      cls: userLevelTierClass(level),
      maxed: false
    };
  }

  function formatExperienceNumber(value) {
    if (value === Infinity) return '∞';
    return Number(value || 0).toLocaleString('en-US');
  }

  // 不含成就型称号的基础经验（成就称号由当前数据实时算出，计入总量时另加）
  function baseExperienceForUser(name) {
    var hotspotExp = hotspotExperienceForUser(name);
    var inventoryExp = ownedItemExperienceCount(name) * 100;
    return hotspotExp + inventoryExp + importedTitleExperienceForUser(name);
  }

  // 用户总经验 = 评论 + 库存 + 全部称号（含成就型称号）
  function totalExperienceForUser(name) {
    var hotspotExp = hotspotExperienceForUser(name);
    var inventoryExp = ownedItemExperienceCount(name) * 100;
    var titleExp = titleExperienceForUser(name);
    return hotspotExp + inventoryExp + titleExp;
  }

  function refreshUserExperience() {
    var totalExp = totalExperienceForUser(user.name);
    var metrics = userLevelMetrics(totalExp);
    user.exp = totalExp;
    user.lv = metrics.level || 0;
    user.expMax = metrics.max;

    if (sidebarLevelRow) sidebarLevelRow.className = 'sidebar-level-row ' + metrics.cls;
    if (sidebarLevelBadge) sidebarLevelBadge.textContent = 'Lv' + metrics.label;
    if (userPillLevel) userPillLevel.textContent = 'Lv' + metrics.label;
    if (sidebarExpFill) sidebarExpFill.style.width = (Math.max(0, Math.min(1, metrics.ratio)) * 100).toFixed(2) + '%';
    if (sidebarExpTotal) sidebarExpTotal.textContent = formatExperienceNumber(totalExp);
    if (sidebarExpValue) {
      sidebarExpValue.textContent = formatExperienceNumber(metrics.nextRequiredExp);
    }
    setUserExpRing(metrics.ratio);
    syncSettingsPersonalExp();
    schedulePauseLeaderboardRender();
    // 数据变化后成就型称号可能新增，称号页开着时同步刷新
    if (titleListEl && currentSidebarPanel === 'titles') renderTitleList();
  }

  var startupLandingShown = false;
  var startupClosing = false;
  var startupCloseTimer = 0;

  function showStartupAudioStart() {
    if (!startupAudioStart || startupLandingShown || startupClosing) return;
    startupAudioPending = true;
    startupAudioStart.hidden = false;
  }

  function updateStartupLogo(name) {
    if (!startupLogo) return;
    startupLogo.hidden = true;
    startupLogo.onload = null;
    startupLogo.onerror = null;
    if (!name) {
      startupLogo.removeAttribute('src');
      return;
    }
    startupLogo.alt = activityTitle(name);
    startupLogo.onload = function () {
      startupLogo.hidden = false;
    };
    startupLogo.onerror = function () {
      startupLogo.hidden = true;
    };
    bindResponsiveAsset(startupLogo, 'logo/' + name + '.png');
  }

  function attemptStartupVideoPlay() {
    if (!startupVideo || startupClosing) return;
    if (startupCollapseTimer) {
      clearTimeout(startupCollapseTimer);
      startupCollapseTimer = 0;
    }
    var attempt = ++startupPlayAttempt;
    startupAudioPending = false;
    if (startupAudioStart) startupAudioStart.hidden = true;
    startupLeaving = false;
    if (startupOverlay) startupOverlay.classList.remove('is-leaving');
    startupLandingShown = false;
    if (startupLanding) startupLanding.hidden = true;
    if (startupOverlay) startupOverlay.classList.remove('is-landing');
    startupVideo.muted = false;
    var playPromise;
    try {
      playPromise = startupVideo.play();
    } catch (err) {
      showStartupAudioStart();
      return;
    }
    if (playPromise && playPromise.catch) {
      playPromise.catch(function () {
        if (attempt === startupPlayAttempt && startupVideo.paused) showStartupAudioStart();
      });
    }
  }

  function startupCrossfadeStep() {
    startupCrossfadeFrame = 0;
    if (!startupVideo || !startupOverlay || startupClosing || startupVideo.paused || startupVideo.ended) return;
    var duration = Number(startupVideo.duration);
    if (isFinite(duration) && duration > 0) {
      var progress = startupVideo.currentTime / duration;
      if (progress >= 0.5) {
        if (!startupCrossfading) {
          startupCrossfading = true;
          startupOverlay.classList.add('is-crossfading');
        }
        var fade = Math.min(1, Math.max(0, (progress - 0.5) * 2));
        startupOverlay.style.opacity = String(1 - fade);
      }
    }
    startupCrossfadeFrame = requestAnimationFrame(startupCrossfadeStep);
  }

  function scheduleStartupCrossfade() {
    if (startupCrossfadeFrame || startupClosing || startupLandingShown) return;
    startupCrossfadeFrame = requestAnimationFrame(startupCrossfadeStep);
  }

  function leaveStartupLanding() {
    if (!startupOverlay || !startupLandingShown || startupLeaving || startupClosing) return;
    startupLeaving = true;
    startupOverlay.classList.add('is-leaving');
    if (startupCollapseTimer) clearTimeout(startupCollapseTimer);
    startupCollapseTimer = setTimeout(function () {
      startupCollapseTimer = 0;
      attemptStartupVideoPlay();
    }, 430);
  }

  function showStartupLanding() {
    if (!startupOverlay || !startupLanding || startupClosing) return;
    startupAudioPending = false;
    startupLeaving = false;
    startupOverlay.classList.remove('is-leaving');
    if (startupAudioStart) startupAudioStart.hidden = true;
    startupLandingShown = true;
    startupLanding.hidden = false;
    startupOverlay.classList.add('is-landing');
  }

  function releaseStartupVideoSource() {
    if (!startupVideo) return;
    try {
      startupVideo.pause();
      startupVideo.removeAttribute('src');
      startupVideo.removeAttribute('srcset');
      startupVideo.load();
    } catch (err) {}
  }

  function closeStartupOverlay() {
    if (!startupOverlay || startupClosing) return;
    startupClosing = true;
    startupEntryComplete = true;
    if (startupCollapseTimer) clearTimeout(startupCollapseTimer);
    startupCollapseTimer = 0;
    if (startupCrossfadeFrame) cancelAnimationFrame(startupCrossfadeFrame);
    startupCrossfadeFrame = 0;
    if (startupCrossfading) startupOverlay.style.opacity = '0';
    startupAudioPending = false;
    if (startupAudioStart) startupAudioStart.hidden = true;
    var outerSlideOut = !!(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);
    startupOverlay.classList.add(outerSlideOut ? 'is-outer-sliding' : 'is-closing');
    document.body.classList.remove('startup-lock');
    syncImmersiveCursorState();
    startActivityMusic();
    requestAnimationFrame(function () { syncLiquidGlassRenderer(true); });
    if (startupCloseTimer) clearTimeout(startupCloseTimer);
    startupCloseTimer = setTimeout(function () {
      startupOverlay.hidden = true;
      releaseStartupVideoSource();
      syncLiquidGlassRenderer(true);
      startupCloseTimer = 0;
    }, outerSlideOut ? 650 : 500);
  }

  function initStartupOverlay() {
    if (!startupOverlay || !startupVideo || !startupLanding) {
      startupEntryComplete = true;
      return;
    }
    document.body.classList.add('startup-lock');
    syncImmersiveCursorState();
    if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) {
      startupVideo.pause();
      showStartupLanding();
      startupOverlay.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        closeStartupOverlay();
      });
      document.addEventListener('keydown', function (event) {
        if (startupOverlay && startupOverlay.hidden) return;
        event.preventDefault();
        event.stopPropagation();
        closeStartupOverlay();
      }, true);
      return;
    }

    startupVideo.addEventListener('ended', closeStartupOverlay);
    startupVideo.addEventListener('error', closeStartupOverlay);
    startupVideo.addEventListener('play', scheduleStartupCrossfade);
    startupVideo.addEventListener('playing', scheduleStartupCrossfade);
    showStartupLanding();

    startupOverlay.addEventListener('click', function (event) {
      if (startupAudioPending) {
        event.preventDefault();
        event.stopPropagation();
        attemptStartupVideoPlay();
        return;
      }
      if (startupLandingShown) {
        event.preventDefault();
        event.stopPropagation();
        leaveStartupLanding();
        return;
      }
      if (startupClosing || startupLeaving || startupVideo.paused || startupVideo.ended) return;
      event.preventDefault();
      event.stopPropagation();
      startupVideo.pause();
      closeStartupOverlay();
    });

    document.addEventListener('keydown', function (event) {
      if (startupAudioPending) {
        event.preventDefault();
        event.stopPropagation();
        attemptStartupVideoPlay();
        return;
      }
      if (startupLandingShown) {
        event.preventDefault();
        event.stopPropagation();
        leaveStartupLanding();
        return;
      }
      if (startupClosing || startupLeaving || startupVideo.paused || startupVideo.ended) return;
      event.preventDefault();
      event.stopPropagation();
      startupVideo.pause();
      closeStartupOverlay();
    }, true);
  }

  /* ---------- 登录态持久化：写入 localStorage，刷新后保持，手动退出才清除 ---------- */
  var SESSION_KEY = 'fgexpig_session_v1';
  function saveSession() {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ name: user.name, isAdmin: !!user.isAdmin, media: user.media || '' }));
    } catch (e) {}
  }
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }
  function restoreSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && s.name) {
        user.name = s.name;
        user.isAdmin = !!s.isAdmin;
        user.media = s.media || '';
      }
    } catch (e) {}
  }

  /* ---------- 称号系统：resources/title.txt（昵称，[等级]称号，...），选择按昵称持久化 ---------- */
  var TITLE_KEY = 'fgexpig_titles_v1';        // 称号数据缓存
  var TITLE_DATA_MAGIC = 'FGEXPIG-TITLE-BACKUP';
  var TITLE_SEL_KEY = 'fgexpig_title_sel_v1'; // 每个昵称选中的称号
  var titleStore = { titles: {} };
  var titleSelMap = loadTitleSel();

  // 每行「昵称，[等级]称号名，[等级]称号名，…」，无称号的行（昵称后为空）解析为空列表
  function titleMapFromTxt(text) {
    var map = {};
    String(text).split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var parts = line.split(/[，,]/).map(function (s) { return s.trim(); });
      var nick = parts[0];
      if (!nick) return;
      var list = [];
      parts.slice(1).forEach(function (seg) {
        if (!seg) return;
        var m = seg.match(/^\[([Pp][12]|\d+)\]\s*(.*)$/);
        if (m) {
          var level = normalizeTitleLevel(m[1]);
          var titleText = m[2].trim();
          list.push({
            lv: level,
            text: titleText,
            raw: '[' + level + ']' + titleText
          });
        }
      });
      map[nick] = list;
    });
    return map;
  }
  function saveTitles() {
    try { void 0 && localStorage.setItem(TITLE_KEY, JSON.stringify(titleStore)); } catch (e) {}
  }
  function loadTitles() {
    try {
      var raw = null;
      if (raw) { titleStore = JSON.parse(raw); return true; }
    } catch (e) {}
    return false;
  }
  function loadTitleSel() {
    try {
      var raw = localStorage.getItem(TITLE_SEL_KEY);
      if (raw) return JSON.parse(raw) || {};
    } catch (e) {}
    return {};
  }
  function persistTitleSel() {
    try { localStorage.setItem(TITLE_SEL_KEY, JSON.stringify(titleSelMap)); } catch (e) {}
  }

  function applyTitleData() {
    var meta = document.getElementById('titleMeta');
    if (titleStore && titleStore.titles) {
      Object.keys(titleStore.titles).forEach(function (nick) {
        var list = titleStore.titles[nick];
        if (Array.isArray(list)) titleStore.titles[nick] = list.map(normalizeTitleRecord);
      });
    }
    var n = Object.keys(titleStore.titles || {}).length;
    if (meta) meta.textContent = n ? ('已加载 ' + n + ' 个成员称号') : '未加载';
    applyUserTitle();
    refreshUserExperience();
  }

  function exportTitles() {
    var payload = {
      magic: TITLE_DATA_MAGIC,
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      data: titleStore
    };
    payload.checksum = checksum(JSON.stringify(titleStore));
    var content =
      '/* FGEXPIG 称号数据备份（自动生成，请勿手动编辑）\n' +
      ' * 导出时间: ' + payload.exportedAt + '\n' +
      ' * 还原方式: <script src="本文件.js"></script> 后读取 window.FGEXPIG_TITLE_BACKUP.data\n' +
      ' */\n' +
      'window.FGEXPIG_TITLE_BACKUP = ' + JSON.stringify(payload, null, 2) + ';\n';
    var blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var d = new Date();
    var stamp = '' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    a.download = 'fgexpig_titles_' + stamp + '.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }

  function importTitleFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      try {
        if (/\.js$/i.test(file.name) && text.indexOf(TITLE_DATA_MAGIC) >= 0) {
          var m = text.match(/window\.FGEXPIG_TITLE_BACKUP\s*=\s*(\{[\s\S]*\});/);
          if (!m) throw new Error('format');
          var payload = JSON.parse(m[1]);
          if (!payload || payload.magic !== TITLE_DATA_MAGIC) throw new Error('magic');
          if (payload.checksum !== checksum(JSON.stringify(payload.data))) throw new Error('checksum');
          titleStore = payload.data;
        } else {
          var map = titleMapFromTxt(text);
          if (!Object.keys(map).length) throw new Error('empty');
          titleStore = { titles: map };
        }
        saveTitles();
        applyTitleData();
        alert('导入成功：共 ' + Object.keys(titleStore.titles || {}).length + ' 个成员称号');
      } catch (err) {
        var msg = '文件格式错误';
        if (err.message === 'checksum') msg = '备份校验未通过，数据可能已损坏';
        else if (err.message === 'magic') msg = '不是有效的 FGEXPIG 称号备份文件';
        else if (err.message === 'empty') msg = '未解析到有效数据（每行格式：昵称，[等级]称号，…）';
        alert('导入失败：' + msg);
      }
    };
    reader.readAsText(file);
  }

  function formatTitleText(value) {
    return String(value || '')
      .replace(/([\u3400-\u9FFF])([A-Za-z0-9])/g, '$1\u2009$2')
      .replace(/([A-Za-z0-9])([\u3400-\u9FFF])/g, '$1\u2009$2');
  }

  // 导入的称号（resources/title.txt 或数据管理导入）
  function importedTitlesOf(nick) {
    var list = titleStore && titleStore.titles && titleStore.titles[nick];
    return Array.isArray(list) ? list.map(normalizeTitleRecord) : [];
  }
  // 全部可用称号 = 导入称号 + 成就型称号（成就型由网站数据实时算出，不写入数据文件）
  function titlesOf(nick) {
    return importedTitlesOf(nick).concat(earnedAchievementTitles(nick));
  }
  // 默认称号：等级最高者；同级有多个时取列表中靠后的
  function defaultTitle(nick) {
    var list = titlesOf(nick);
    var best = null;
    for (var i = 0; i < list.length; i++) {
      if (isSpecialTitleLevel(list[i].lv)) continue;
      if (!best || list[i].lv >= best.lv) best = list[i];
    }
    return best;
  }
  // 当前生效称号：优先缓存的选择（已不存在则回退默认）
  function currentTitle(nick) {
    var list = titlesOf(nick);
    var raw = titleSelMap[nick];
    if (raw) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].raw === raw && !isSpecialTitleLevel(list[i].lv)) return list[i];
      }
    }
    return defaultTitle(nick);
  }

  var userTitleEl = document.getElementById('userTitle');
  var userPillNameEl = document.getElementById('userPillName');
  var cursorGlowEl = document.getElementById('cursorGlow');
  var cursorGlowFrame = 0;
  var cursorGlowTrackUntil = 0;
  var cursorX = -100;
  var cursorY = -100;
  var cursorNearTargets = [];
  var cursorGlowTrackMode = 'full';
  var cursorTargetCache = null;

  var cursorTargetWarmTimer = 0;
  function warmCursorTargetCache() {
    cursorTargetWarmTimer = 0;
    if (!cursorTargetCache && document.documentElement.classList.contains('fx-cursor')) getCursorTargetCache();
  }

  function invalidateCursorTargetCache() {
    cursorTargetCache = null;
    if (!cursorTargetWarmTimer) {
      cursorTargetWarmTimer = window.setTimeout(warmCursorTargetCache, 120);
    }
  }

  function makeCursorTarget(el) {
    return { el: el, rect: null, localW: 0, localH: 0 };
  }

  function refreshCursorTargetCacheRects(cache, force) {
    if (!cache) return;
    if (!force && cache.rectsAt) return;
    cache.rectsAt = performance.now();
    ['outer', 'soft', 'docks'].forEach(function (key) {
      var targets = cache[key];
      for (var i = 0; i < targets.length; i++) {
        var target = targets[i];
        var el = target.el;
        if (!el || !el.isConnected) continue;
        var rect = el.getBoundingClientRect();
        target.rect = rect;
        target.localW = el.offsetWidth || rect.width;
        target.localH = el.offsetHeight || rect.height;
      }
    });
  }

  function getCursorTargetCache() {
    if (!cursorTargetCache) {
      cursorTargetCache = {
        outer: Array.prototype.slice.call(document.querySelectorAll('.page-section.active .section-card')).map(makeCursorTarget),
        soft: Array.prototype.slice.call(document.querySelectorAll('.page-section.active .review-item, .page-section.active .home-achv, .page-section.active .achv-summary, .page-section.active .achv-group-row')).map(makeCursorTarget),
        docks: Array.prototype.slice.call(document.querySelectorAll('.dock-item')).map(makeCursorTarget),
        rectsAt: 0
      };
      refreshCursorTargetCacheRects(cursorTargetCache, true);
    }
    return cursorTargetCache;
  }

  var GLOW_THEMES = {
    0: { a: '#eef1f7', b: '#ffffff', c: '#aeb6c5', d: '#dce1ea', duration: '7s', border: 'rgba(255,255,255,0.82)', shadow: 'rgba(220,225,234,0.48)', inset: 'rgba(255,255,255,0.1)' },
    1: { a: '#7a421d', b: '#e5a166', c: '#4b240f', d: '#c8753a', duration: '6s', border: 'rgba(208,138,74,0.9)', shadow: 'rgba(184,115,51,0.5)', inset: 'rgba(184,115,51,0.12)' },
    2: { a: '#8b929d', b: '#f2f4f7', c: '#5f6672', d: '#c9ced6', duration: '6s', border: 'rgba(225,230,238,0.9)', shadow: 'rgba(201,206,214,0.5)', inset: 'rgba(201,206,214,0.12)' },
    3: { a: '#8a5a00', b: '#ffe596', c: '#c18c00', d: '#fff1a8', duration: '5s', border: 'rgba(240,200,75,0.92)', shadow: 'rgba(227,180,35,0.52)', inset: 'rgba(227,180,35,0.13)' },
    4: { a: '#4f7fa3', b: '#e8f8ff', c: '#7db7dc', d: '#bdeaff', duration: '6s', border: 'rgba(215,243,255,0.92)', shadow: 'rgba(180,224,255,0.56)', inset: 'rgba(180,224,255,0.14)' },
    5: { a: '#b15cff', b: '#e6c7ff', c: '#8b3dff', d: '#c77dff', duration: '6s', border: 'rgba(199,125,255,0.95)', shadow: 'rgba(177,92,255,0.58)', inset: 'rgba(199,125,255,0.15)' },
    6: { a: '#ff91c8', b: '#78b4ff', c: '#78e6dc', d: '#ffde8c', duration: '6s', border: 'rgba(185,150,255,0.95)', shadow: 'rgba(120,180,255,0.58)', inset: 'rgba(185,150,255,0.15)' }
  };

  function applyCursorGlowTheme(t) {
    var theme = GLOW_THEMES[t && GLOW_THEMES[t.lv] ? t.lv : 0];
    var root = document.documentElement;
    root.style.setProperty('--glow-a', theme.a);
    root.style.setProperty('--glow-b', theme.b);
    root.style.setProperty('--glow-c', theme.c);
    root.style.setProperty('--glow-d', theme.d);
    root.style.setProperty('--glow-duration', theme.duration);
    root.style.setProperty('--glow-border', theme.border);
    root.style.setProperty('--glow-shadow', theme.shadow);
    root.style.setProperty('--glow-inset', theme.inset);
  }

  function clearCursorNearTargets() {
    for (var i = 0; i < cursorNearTargets.length; i++) {
      cursorNearTargets[i].classList.remove('cursor-near');
      cursorNearTargets[i].classList.remove('cursor-near-soft');
      cursorNearTargets[i].style.setProperty('--glow-fill-color', 'transparent');
    }
    cursorNearTargets = [];
  }

  function setGlowOrigin(el, rect, localW, localH) {
    localW = localW || rect.width || 1;
    localH = localH || rect.height || 1;
    var scaleX = rect.width / localW || 1;
    var scaleY = rect.height / localH || 1;
    var localX = localW / 2 + (cursorX - (rect.left + rect.width / 2)) / scaleX;
    var localY = localH / 2 + (cursorY - (rect.top + rect.height / 2)) / scaleY;
    el.style.setProperty('--glow-x-local', localX.toFixed(2) + 'px');
    el.style.setProperty('--glow-y-local', localY.toFixed(2) + 'px');
  }

  function updateCursorGlowPosition() {
    if (!cursorGlowEl) return;
    var overNav = false;
    if (innerScreenLayoutActive && navEl) {
      var navRect = navEl.getBoundingClientRect();
      overNav = cursorX >= navRect.left - 6 && cursorX <= navRect.right + 6 && cursorY >= navRect.top - 6 && cursorY <= navRect.bottom + 6;
    }
    cursorGlowEl.classList.toggle('is-over-nav', overNav);
    cursorGlowEl.style.transform = 'translate3d(' + (cursorX - 10.5) + 'px,' + (cursorY - 10.5) + 'px,0)';
  }

  function updateCursorGlow(dockOnly) {
    updateCursorGlowPosition();
    if (!cursorGlowEl) return;
    clearCursorNearTargets();
    var root = document.documentElement;
    if (root.classList.contains('pause-menu-open') || document.body.classList.contains('startup-lock')) return;
    var tintOn = root.classList.contains('fx-glow');
    var borderOn = root.classList.contains('fx-border') && !borderGlowPaused;
    var overTopbar = false;
    if (topbar) {
      var topbarHitRect = topbar.getBoundingClientRect();
      var topbarGlowPad = 20;
      overTopbar = cursorX >= topbarHitRect.left - topbarGlowPad &&
        cursorX <= topbarHitRect.right + topbarGlowPad &&
        cursorY >= topbarHitRect.top - topbarGlowPad &&
        cursorY <= topbarHitRect.bottom + topbarGlowPad;
    }
    root.classList.toggle('topbar-glow-suppressed', overTopbar);
    if (!tintOn && !borderOn) return;
    var cache = getCursorTargetCache();
    refreshCursorTargetCacheRects(cache, false);

    if (!dockOnly && !overTopbar) {
      for (var k = 0; k < cache.outer.length; k++) {
        var outerTarget = cache.outer[k];
        var el = outerTarget.el;
        var r = outerTarget.rect;
        if (!el || !r || !el.isConnected || (+(el.style.opacity || '1')) < 0.05) continue;
        var dx = Math.max(r.left - cursorX, 0, cursorX - r.right);
        var dy = Math.max(r.top - cursorY, 0, cursorY - r.bottom);
        if (dx * dx + dy * dy <= 112 * 112) {
          setGlowOrigin(el, r, outerTarget.localW, outerTarget.localH);

          if (tintOn) el.style.setProperty('--glow-fill-color', 'var(--glow-shadow)');
          if (borderOn) el.classList.add('cursor-near');
          if (tintOn || borderOn) cursorNearTargets.push(el);
        }
      }

      for (var n = 0; n < cache.soft.length; n++) {
        var softTarget = cache.soft[n];
        var softEl = softTarget.el;
        var sr = softTarget.rect;
        if (!softEl || !sr || !softEl.isConnected || (+(softEl.style.opacity || '1')) < 0.05) continue;
        var sdx = Math.max(sr.left - cursorX, 0, cursorX - sr.right);
        var sdy = Math.max(sr.top - cursorY, 0, cursorY - sr.bottom);
        if (sdx * sdx + sdy * sdy <= 82 * 82) {
          setGlowOrigin(softEl, sr, softTarget.localW, softTarget.localH);

          if (tintOn) softEl.style.setProperty('--glow-fill-color', 'var(--glow-inset)');
          if (borderOn) softEl.classList.add('cursor-near-soft');
          if (tintOn || borderOn) cursorNearTargets.push(softEl);
        }
      }
    }

    var dockCandidates = [];
    for (var q = 0; q < cache.docks.length; q++) {
      var dockTargetCache = cache.docks[q];
      var dockEl = dockTargetCache.el;
      var dr = dockTargetCache.rect;
      if (!dockEl || !dr || !dockEl.isConnected || (+(dockEl.style.opacity || '1')) < 0.05) continue;
      var ddx = Math.max(dr.left - cursorX, 0, cursorX - dr.right);
      var ddy = Math.max(dr.top - cursorY, 0, cursorY - dr.bottom);
      var d2 = ddx * ddx + ddy * ddy;
      if (d2 <= 112 * 112) dockCandidates.push({ el: dockEl, rect: dr, localW: dockTargetCache.localW, localH: dockTargetCache.localH, dist: d2 });
    }
    dockCandidates.sort(function (a, b) { return a.dist - b.dist; });
    var dockTargets = [];
    for (var qc = 0; qc < dockCandidates.length && dockTargets.length < 3; qc++) {
      dockTargets.push(dockCandidates[qc]);
    }
    for (var q2 = 0; q2 < dockTargets.length; q2++) {
      var dockTarget = dockTargets[q2];
      var targetEl = dockTarget.el;
      setGlowOrigin(targetEl, dockTarget.rect, dockTarget.localW, dockTarget.localH);

      if (tintOn) targetEl.style.setProperty('--glow-fill-color', 'var(--glow-shadow)');
      if (borderOn) targetEl.classList.add('cursor-near');
      if (tintOn || borderOn) cursorNearTargets.push(targetEl);
    }
  }
  function runCursorGlowFrame() {
    cursorGlowFrame = 0;
    updateCursorGlow(cursorGlowTrackMode === 'dock');
    if (performance.now() < cursorGlowTrackUntil) {
      cursorGlowFrame = requestAnimationFrame(runCursorGlowFrame);
    } else {
      cursorGlowTrackMode = 'full';
    }
  }

  function scheduleCursorGlowUpdate(trackMs, dockOnly) {
    if (!cursorGlowEl || cursorX < 0 || cursorY < 0 || !document.documentElement.classList.contains('fx-cursor')) return;
    if (trackMs) {
      cursorGlowTrackUntil = Math.max(cursorGlowTrackUntil, performance.now() + trackMs);
      cursorGlowTrackMode = dockOnly ? 'dock' : 'full';
    } else {
      cursorGlowTrackMode = 'full';
    }
    if (!cursorGlowFrame) cursorGlowFrame = requestAnimationFrame(runCursorGlowFrame);
  }
  function onCursorMove(e) {
    if (e.pointerType === 'touch') {
      setInputMode('keyboard');
      return;
    }
    // 暂停菜单/启动层期间仍记录真实鼠标位置，返回后才不会先闪到旧坐标。
    cursorX = e.clientX;
    cursorY = e.clientY;
    setInputMode('keyboard');
    if (!cursorGlowEl || !document.documentElement.classList.contains('fx-cursor')) return;
    cursorGlowEl.classList.add('is-visible');
    scheduleCursorGlowUpdate(0);
  }

  function hideCursorGlow() {
    if (cursorGlowFrame) {
      cancelAnimationFrame(cursorGlowFrame);
      cursorGlowFrame = 0;
    }
    cursorGlowTrackUntil = 0;
    cursorGlowTrackMode = 'full';
    if (cursorGlowEl) cursorGlowEl.classList.remove('is-visible');
    document.documentElement.classList.remove('topbar-glow-suppressed');
    clearCursorNearTargets();
  }

  function immersiveShellOpen() {
    return document.body.classList.contains('startup-lock') ||
      document.documentElement.classList.contains('pause-menu-open') ||
      document.documentElement.classList.contains('ui-hidden');
  }

  function syncImmersiveCursorState() {
    var root = document.documentElement;
    var desired = root.dataset.fxCursorDesired === '1';
    var next = desired && !immersiveShellOpen();
    var wasActive = root.classList.contains('fx-cursor');
    root.classList.toggle('fx-cursor', next);
    // 从暂停菜单等沉浸层返回时，先应用当前鼠标坐标，再允许自定义光标显示。
    if (next && !wasActive && cursorGlowEl && cursorX >= 0 && cursorY >= 0) {
      updateCursorGlowPosition();
    }
  }

  function toggleUiHidden() {
    var root = document.documentElement;
    var hidden = root.classList.toggle('ui-hidden');
    if (hidden && document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    syncImmersiveCursorState();
    if (hidden) hideCursorGlow();
  }

  function moveTopNavBy(delta) {
    var data = navCache[curNavLogo];
    if (!data || !data.items || !data.items.length) return;
    var keys = data.items.map(function (item) { return item[0]; });
    var current = keys.indexOf(data.active);
    var target = current + delta;
    if (current < 0 || target < 0 || target >= keys.length) return;
    selectNav(keys[target], true);
  }

  function moveActivityBy(delta) {
    var target = state.index + delta;
    if (target < 0 || target >= LOGOS.length) return;
    select(target);
  }
  function moveActivityBatch(delta) {
    if (!LOGOS.length) return;
    var target = state.index + delta;
    if (target < 0) target = 0;
    else if (target >= LOGOS.length) target = LOGOS.length - 1;
    if (target !== state.index) select(target);
  }

  function openSettingsShortcut() {
    if (!pauseMenu.classList.contains('open')) openSidebar('left');
    openSettingsPanel(currentSettingsTab || 'interface');
  }

  function performKeyAction(actionId) {
    var root = document.documentElement;
    if (actionId !== 'toggleUi' && root.classList.contains('ui-hidden')) return;
    if (pauseMenu && pauseMenu.classList.contains('open') &&
        (actionId === 'prevNav' || actionId === 'nextNav' || actionId === 'prevActivity' || actionId === 'nextActivity')) {
      return;
    }
    if (actionId === 'prevNav') moveTopNavBy(-1);
    else if (actionId === 'nextNav') moveTopNavBy(1);
    else if (actionId === 'prevActivity') moveActivityBy(-1);
    else if (actionId === 'nextActivity') moveActivityBy(1);
    else if (actionId === 'toggleMusic') toggleMusicPlayback();
    else if (actionId === 'rewindMusic') seekMusicBy(-5);
    else if (actionId === 'forwardMusic') seekMusicBy(5);
    else if (actionId === 'toggleUi') toggleUiHidden();
    else if (actionId === 'openSettings') openSettingsShortcut();
    else if (actionId === 'pauseBack') {
      if (sponsorOverlay && !sponsorOverlay.hidden) {
        sponsorOverlay.hidden = true;
        if (sponsorImage) sponsorImage.removeAttribute('src');
      } else if ((!pauseMenu || !pauseMenu.classList.contains('open')) && returnActivePageDetailsToRoot()) {
        return;
      } else if (pauseMenu && pauseMenu.classList.contains('open')) {
        if (pauseMenu.classList.contains('is-subpage-open')) resetSidebarPanel();
        else closeSidebars();
      } else {
        openSidebar('left');
      }
    }
  }

  function isTypingTarget(target) {
    if (!target || !target.tagName) return false;
    var tag = target.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag === 'input') {
      var type = String(target.type || 'text').toLowerCase();
      return ['text', 'search', 'password', 'email', 'number', 'tel', 'url'].indexOf(type) >= 0;
    }
    return !!target.isContentEditable;
  }

  function initCursorGlow() {
    window.addEventListener('pointermove', onCursorMove, { passive: true });
    window.addEventListener('pointerdown', function () { setInputMode('keyboard'); }, { passive: true });
    window.addEventListener('wheel', function () { setInputMode('keyboard'); }, { passive: true });
    window.addEventListener('blur', hideCursorGlow);
    window.addEventListener('pagehide', hideCursorGlow);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) hideCursorGlow();
    });
    window.addEventListener('mouseout', function (e) {
      if (!e.relatedTarget) hideCursorGlow();
    });
    applyCursorGlowTheme(currentTitle(user.name));
  }

  function layoutTopbarEdges() {
    var section = document.querySelector('.page.active .page-section.active');
    if (!section) return;
    var cards = section.querySelectorAll('.section-card');
    var sectionRect = section.getBoundingClientRect();
    var leftEdge = Infinity;
    var rightEdge = -Infinity;
    for (var i = 0; i < cards.length; i++) {
      if (!cards[i].offsetWidth) continue;
      var cardLeft = sectionRect.left + cards[i].offsetLeft;
      var cardRight = cardLeft + cards[i].offsetWidth;
      leftEdge = Math.min(leftEdge, cardLeft);
      rightEdge = Math.max(rightEdge, cardRight);
    }
    if (!isFinite(leftEdge) || !isFinite(rightEdge)) return;

    var rootStyle = document.documentElement.style;
    rootStyle.setProperty('--topbar-left-edge', leftEdge + 'px');
    rootStyle.setProperty('--topbar-right-edge', (window.innerWidth - rightEdge) + 'px');

    if (userMenuBtn) {
      var avatarRing = userMenuBtn.querySelector('.tb-avatar-ring');
      var avatarRect = userMenuBtn.getBoundingClientRect();
      var avatarRingRect = avatarRing ? avatarRing.getBoundingClientRect() : avatarRect;
      rootStyle.setProperty('--topbar-left-shift', (avatarRect.left - avatarRingRect.left) + 'px');
    }
    if (playerCover) {
      var coverRing = playerCover.querySelector('.tb-cover-ring');
      var coverRect = playerCover.getBoundingClientRect();
      var coverRingRect = coverRing ? coverRing.getBoundingClientRect() : coverRect;
      rootStyle.setProperty('--topbar-right-shift', (coverRect.right - coverRingRect.right) + 'px');
    }
  }

  function layoutTopbarIdentity() {
    layoutTopbarEdges();
    if (!userTitleEl || !userPillNameEl || !navEl) return;
    var navRect = navEl.getBoundingClientRect();
    if (!navRect.width) return;
    userPillNameEl.classList.remove('is-collision-hidden');
    var nameRect = userPillNameEl.getBoundingClientRect();
    var titleRect = userTitleEl.classList.contains('is-hidden') ? null : userTitleEl.getBoundingClientRect();
    var identityRight = titleRect && titleRect.width ? titleRect.right : nameRect.right;
    if (identityRight > navRect.left - 14) {
      userPillNameEl.classList.add('is-collision-hidden');
    }
  }

  function applyUserTitle() {
    if (!userTitleEl) return;
    var t = currentTitle(user.name);
    applyCursorGlowTheme(t);
    userTitleEl.className = 'tb-ribbon';
    if (!t) {
      userTitleEl.classList.add('is-hidden');
      userTitleEl.textContent = '';
      layoutTopbarIdentity();
      return;
    }
    userTitleEl.classList.add('t-lv-' + t.lv);
    userTitleEl.textContent = '⁓' + formatTitleText(t.text) + '⁓';
    layoutTopbarIdentity();
  }

  // 头像：profile/<昵称> 原图/优化版本存在则用图片；否则昵称首字符 + 按昵称哈希出的彩色渐变
  var avatarCache = {}; // 头像 URL -> 是否存在
  function avatarUrl(nick) {
    return responsiveImageUrl('profile/' + encodeURIComponent(nick) + '.jpg');
  }
  function hueOfName(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0;
    return h % 360;
  }
  function setAvatar(el, nick) {
    if (!el) return;
    nick = nick || GUEST_NAME;
    var token = (el._avatarToken = (el._avatarToken || 0) + 1);
    var ch = nick.charAt(0).toUpperCase();
    var currentAvatarUrl = avatarUrl(nick);

    function showLetter() {
      if (el._avatarToken !== token) return;
      var hue = hueOfName(nick);
      el.textContent = ch;
      el.classList.add('is-letter');
      el.style.background =
        'linear-gradient(135deg, hsl(' + hue + ',68%,58%), hsl(' + ((hue + 42) % 360) + ',62%,46%))';
    }
    function showImage(url) {
      if (el._avatarToken !== token) return;
      el.textContent = '';
      el.classList.remove('is-letter');
      el.style.background = "url('" + url + "') center / cover no-repeat";
    }

    if (Object.prototype.hasOwnProperty.call(avatarCache, currentAvatarUrl)) {
      (avatarCache[currentAvatarUrl] ? showImage(currentAvatarUrl) : showLetter());
      return;
    }
    // 探测期间先显示字母底，避免空白闪烁
    showLetter();
    imgExists(currentAvatarUrl).then(function (ok) {
      avatarCache[currentAvatarUrl] = ok;
      if (ok) showImage(currentAvatarUrl);
    });
  }

  function updateUserUI() {
    var nameEl = document.getElementById('userPillName');
    if (nameEl) nameEl.textContent = user.name;
    var sidebarNicknameEl = document.getElementById('sidebarNickname');
    if (sidebarNicknameEl) sidebarNicknameEl.textContent = user.name;
    setAvatar(document.getElementById('userPillAvatar'), user.name);
    setAvatar(document.getElementById('sidebarAvatar'), user.name);
    if (editBtn) {
      editBtn.hidden = !user.isAdmin;
      editBtn.setAttribute('aria-hidden', user.isAdmin ? 'false' : 'true');
    }
    if (consoleBtn) {
      consoleBtn.hidden = !user.isAdmin;
      consoleBtn.setAttribute('aria-hidden', user.isAdmin ? 'false' : 'true');
    }
    applyUserTitle();
    refreshReviewPersonalScore();
    refreshHomeLibraryBar();
    refreshUserExperience();

  }

  function setPauseMenuOpen(open) {
    if (!pauseMenu) return;
    if (open && document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    pauseMenu.classList.toggle('open', !!open);
    pauseMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.documentElement.classList.toggle('pause-menu-open', !!open);
    syncImmersiveCursorState();
    if (open) {
      clearCursorNearTargets();
      pauseMenuSelectionIndex = 0;
      requestAnimationFrame(function () {
        updatePauseMenuSelection();
        renderPauseLeaderboards();
      });
    } else {
      updatePauseMenuSelection();
    }
  }
  function openSidebar(side) {
    if (side === 'right') {
      setPauseMenuOpen(false);
      if (sidebarLeft) sidebarLeft.classList.remove('open');
      sidebarRight.classList.add('open');
      sidebarMask.classList.add('show');
      return;
    }
    if (side === 'console') {
      setPauseMenuOpen(false);
      sidebarRight.classList.remove('open');
      if (sidebarLeft) sidebarLeft.classList.add('open');
      sidebarMask.classList.add('show');
      showHotspotConsoleMainPage();
      renderHotspotConsole();
      return;
    }
    sidebarRight.classList.remove('open');
    if (sidebarLeft) sidebarLeft.classList.remove('open');
    sidebarMask.classList.remove('show');
    sidebarPanelOrigin = 'menu';
    resetSidebarPanelCore();
    setPauseMenuOpen(true);
  }
  function closeSidebars() {
    sidebarPanelOrigin = 'menu';
    var replayHomeAnimation = !!(pauseMenu && pauseMenu.classList.contains('open'));
    if (replayHomeAnimation) playInterfaceAnimation(true);
    setPauseMenuOpen(false);
    sidebarRight.classList.remove('open');
    if (sidebarLeft) sidebarLeft.classList.remove('open');
    sidebarMask.classList.remove('show');
    resetSidebarPanelCore();
  }

  var HOTSPOT_CONSOLE_EMOJI_NAMES = (function () {
    var names = [];
    var seen = {};
    function add(name) {
      var value = String(name || '').trim();
      var key = value.toLowerCase();
      if (!value || seen[key]) return;
      seen[key] = true;
      names.push(value);
    }
    var manifest = Array.isArray(window.FGEXPIG_EMOJI_MANIFEST) ? window.FGEXPIG_EMOJI_MANIFEST : [];
    manifest.forEach(add);
    Object.keys(HOTSPOT_EMOJI_FILES || {}).forEach(add);
    return names.sort(function (a, b) {
      return b.length - a.length || a.localeCompare(b);
    });
  })();
  var hotspotConsoleFileChecks = {};
  var hotspotConsoleRenderToken = 0;
  var HOTSPOT_CONSOLE_IGNORED_KEY = 'fgexpig_console_ignored_v1';
  var hotspotConsoleIgnoredItems = (function () {
    try {
      var parsed = JSON.parse(localStorage.getItem(HOTSPOT_CONSOLE_IGNORED_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      var seen = {};
      return parsed.map(function (item) {
        return { text: String(item && item.text || item || '') };
      }).filter(function (item) {
        if (!item.text || seen[item.text]) return false;
        seen[item.text] = true;
        return true;
      });
    } catch (err) {
      return [];
    }
  })();
  var hotspotConsoleIgnoredKeys = {};
  hotspotConsoleIgnoredItems.forEach(function (item) {
    hotspotConsoleIgnoredKeys[item.text] = true;
  });

  function ensureHotspotConsoleData(id) {
    var state = hotspotMemory[id];
    if (state && state.postsLoaded) return Promise.resolve(true);
    if (state && state.postsPromise) return state.postsPromise;
    return loadDataFragment('news', id);
  }

  function hotspotConsoleCommentEntries(id) {
    var entries = [];
    (hotspotPostsOf(id) || []).forEach(function (post) {
      function walk(comments) {
        (comments || []).forEach(function (comment) {
          if (!comment) return;
          var text = String(comment.text || '');
          if (text) {
            entries.push({
              id: id,
              post: post,
              comment: comment,
              name: comment.name || '匿名',
              text: text
            });
          }
          walk(comment.replies);
        });
      }
      walk(post.comments);
    });
    return entries;
  }

  function hotspotConsoleEntryPrefix(entry) {
    var parts = [entry.id];
    if (entry.post && entry.post.title) parts.push(entry.post.title);
    if (entry.name) parts.push(entry.name);
    return '[' + parts.join(' / ') + '] ';
  }

  function hotspotConsoleYellowNames(text) {
    var value = String(text == null ? '' : text);
    if (!value) return [];
    var lower = value.toLowerCase();
    var occupied = [];
    var found = [];
    HOTSPOT_CONSOLE_EMOJI_NAMES.forEach(function (name) {
      var needle = String(name || '').toLowerCase();
      if (!needle) return;
      var search = 0;
      while (search < lower.length) {
        var index = lower.indexOf(needle, search);
        if (index < 0) break;
        var end = index + needle.length;
        var overlaps = occupied.some(function (range) { return index < range[1] && end > range[0]; });
        if (!overlaps) {
          occupied.push([index, end]);
          var escaped = index > 0 && value.charAt(index - 1) === '\\';
          var oneCharBoundary = needle.length > 1 || index === 0 || end === value.length ||
            /[\s，。！？!?、；;：:、（）()【】\[\]《》]/.test(value.charAt(index - 1)) ||
            /[\s，。！？!?、；;：:、（）()【】\[\]《》]/.test(value.charAt(end));
          if (!escaped && oneCharBoundary && found.indexOf(name) < 0) found.push(name);
        }
        search = end;
      }
    });
    return found;
  }

  function hotspotConsoleImageUrl(file, level) {
    return qualityImageUrlAtLevel(file, 'emoji', level);
  }

  function hotspotConsoleMissingQualityLevels(file) {
    var levels = [1, 2, 3, 4, 5];
    return Promise.all(levels.map(function (level) {
      var url = hotspotConsoleImageUrl(file, level);
      if (!hotspotConsoleFileChecks[url]) hotspotConsoleFileChecks[url] = imgExists(url);
      return hotspotConsoleFileChecks[url];
    })).then(function (results) {
      var missing = [];
      results.forEach(function (exists, index) {
        if (!exists) missing.push(levels[index]);
      });
      return missing;
    });
  }

  function collectHotspotConsoleIssues(ids) {
    var red = [];
    var yellow = [];
    var checks = [];
    var usedEmoji = {};
    ids.forEach(function (id) {
      hotspotConsoleCommentEntries(id).forEach(function (entry) {
        var text = entry.text;
        var prefix = hotspotConsoleEntryPrefix(entry);
        hotspotConsoleYellowNames(text).forEach(function (yellowName) {
          yellow.push({ text: prefix + '疑似缺少转义：' + yellowName });
        });
        var candidate = hotspotStandaloneCandidate(text);
        if (!candidate) return;
        var emoji = hotspotEmojiAt(candidate, 0);
        if (!emoji || emoji.length !== candidate.length) {
          red.push({ text: prefix + '未找到表情包：' + candidate });
          return;
        }
        usedEmoji[String(emoji.name || '').toLowerCase()] = true;
        (function (token, emojiInfo, entryInfo) {
          checks.push(hotspotConsoleMissingQualityLevels(emojiInfo.file).then(function (missingLevels) {
            if (missingLevels.length) {
              red.push({
                text: hotspotConsoleEntryPrefix(entryInfo) + '未找到表情包：' + token + '（缺失画质：' + missingLevels.join('、') + '）'
              });
            }
          }));
        })(candidate, emoji, entry);
      });
    });
    return Promise.all(checks).then(function () {
      var unused = [];
      HOTSPOT_CONSOLE_EMOJI_NAMES.forEach(function (name) {
        var key = String(name || '').toLowerCase();
        if (!key || usedEmoji[key]) return;
        unused.push({ text: '未使用的表情包：' + name, name: name });
      });
      unused.sort(function (a, b) {
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
      });
      return { red: red, yellow: yellow.concat(unused) };
    });
  }

  function hotspotConsoleIgnoreKey(item) {
    return String(item && item.text || '');
  }
  function saveHotspotConsoleIgnored() {
    try {
      localStorage.setItem(HOTSPOT_CONSOLE_IGNORED_KEY, JSON.stringify(hotspotConsoleIgnoredItems.map(function (item) {
        return item.text;
      })));
    } catch (err) {}
  }
  function showHotspotConsoleMainPage() {
    if (consoleMainPage) consoleMainPage.hidden = false;
    if (consoleIgnoredPage) consoleIgnoredPage.hidden = true;
  }
  function renderHotspotConsoleIgnoredPage() {
    if (!consoleIgnoredContent) return;
    consoleIgnoredContent.innerHTML = '';
    if (!hotspotConsoleIgnoredItems.length) {
      var empty = document.createElement('div');
      empty.className = 'console-item is-muted';
      empty.textContent = '暂无已忽略提示';
      consoleIgnoredContent.appendChild(empty);
      return;
    }
    hotspotConsoleIgnoredItems.forEach(function (item) {
      var el = document.createElement('div');
      el.className = 'console-item is-yellow';
      el.textContent = item.text;
      consoleIgnoredContent.appendChild(el);
    });
  }
  function showHotspotConsoleIgnoredPage() {
    if (consoleMainPage) consoleMainPage.hidden = true;
    if (consoleIgnoredPage) consoleIgnoredPage.hidden = false;
    renderHotspotConsoleIgnoredPage();
  }
  function ignoreHotspotConsoleItem(item, element) {
    var key = hotspotConsoleIgnoreKey(item);
    if (!key) return;
    if (!hotspotConsoleIgnoredKeys[key]) {
      hotspotConsoleIgnoredKeys[key] = true;
      hotspotConsoleIgnoredItems.push({ text: key });
      saveHotspotConsoleIgnored();
    }
    if (element && element.parentNode) element.parentNode.removeChild(element);
    renderHotspotConsoleIgnoredPage();
  }
  function renderHotspotConsole() {
    if (!consoleContent) return;
    var renderToken = ++hotspotConsoleRenderToken;
    consoleContent.innerHTML = '';
    var loading = document.createElement('div');
    loading.className = 'console-item is-muted';
    loading.textContent = '正在检查热点表情包...';
    consoleContent.appendChild(loading);
    var ids = ((dataStore && dataStore.core) || []).map(function (row) {
      return row && row.id ? String(row.id) : '';
    }).filter(Boolean);
    if (!ids.length) {
      loading.textContent = '未发现热点表情包转义问题';
      return;
    }
    Promise.all(ids.map(ensureHotspotConsoleData)).then(function () {
      return collectHotspotConsoleIssues(ids);
    }).then(function (result) {
      if (renderToken !== hotspotConsoleRenderToken) return;
      consoleContent.innerHTML = '';
      function append(items, className, removable) {
        items.forEach(function (item) {
          var el = document.createElement('div');
          el.className = 'console-item ' + className + (removable ? ' is-ignorable' : '');
          if (removable) {
            var text = document.createElement('span');
            text.className = 'console-item-text';
            text.textContent = item.text;
            var remove = document.createElement('button');
            remove.className = 'console-ignore-btn';
            remove.type = 'button';
            remove.textContent = '×';
            remove.setAttribute('aria-label', '忽略此提示');
            remove.onclick = (function (capturedItem, capturedEl) {
              return function () { ignoreHotspotConsoleItem(capturedItem, capturedEl); };
            })(item, el);
            el.appendChild(text);
            el.appendChild(remove);
          } else {
            el.textContent = item.text;
          }
          consoleContent.appendChild(el);
        });
      }
      var visibleYellow = result.yellow.filter(function (item) {
        return !hotspotConsoleIgnoredKeys[hotspotConsoleIgnoreKey(item)];
      });
      append(result.red, 'is-red', false);
      append(visibleYellow, 'is-yellow', true);
      if (!result.red.length && !visibleYellow.length) {
        var empty = document.createElement('div');
        empty.className = 'console-item is-muted';
        empty.textContent = '未发现热点表情包转义问题';
        consoleContent.appendChild(empty);
      }
    }).catch(function () {
      if (renderToken !== hotspotConsoleRenderToken) return;
      consoleContent.innerHTML = '';
      var failed = document.createElement('div');
      failed.className = 'console-item is-muted';
      failed.textContent = '热点表情包检查失败';
      consoleContent.appendChild(failed);
    });
  }

  /* ---------- 暂停菜单：称号 / 设置子页面 ---------- */
  var panelMenu = document.getElementById('panelMenu');
  var panelTitles = document.getElementById('panelTitles');
  var panelAccounts = document.getElementById('panelAccounts');
  var panelSettings = document.getElementById('panelSettings');
  var accountLogoutTop = document.getElementById('accountLogoutTop');
  var accountLoginForm = document.getElementById('accountLoginForm');
  var accountLoginUser = document.getElementById('accountLoginUser');
  var accountLoginPass = document.getElementById('accountLoginPass');
  var accountLoginError = document.getElementById('accountLoginError');
  var accountLoginClear = document.getElementById('accountLoginClear');
  var settingsBackBtn = document.getElementById('settingsBack');
  var settingsNav = panelSettings ? panelSettings.querySelector('.settings-tabs') : null;
  var settingsThumb = settingsNav ? settingsNav.querySelector('.topnav-thumb') : null;
  var settingsTabs = panelSettings ? panelSettings.querySelectorAll('.settings-tab') : [];
  var settingsSections = panelSettings ? panelSettings.querySelectorAll('[data-settings-panel]') : [];
  var settingsDescriptionTitle = document.getElementById('settingsDescriptionTitle');
  var settingsDescriptionText = document.getElementById('settingsDescriptionText');
  var settingsDescriptionSubtitle = document.getElementById('settingsDescriptionSubtitle');
  var settingsDescriptionExtra = document.getElementById('settingsDescriptionExtra');
  var sponsorOverlay = document.getElementById('sponsorOverlay');
  var sponsorImage = document.getElementById('sponsorImage');
  var titleListEl = document.getElementById('titleList');
  var titleBackTop = document.getElementById('titleBackTop');
  var fontListEl = document.getElementById('fontList');
  var keybindListEl = document.getElementById('keybindList');
  var wallpaperDimInput = document.getElementById('wallpaperDim');
  var cardBlurInput = document.getElementById('cardBlur');
  var wallpaperDimVal = document.getElementById('wallpaperDimVal');
  var cardBlurVal = document.getElementById('cardBlurVal');
  var fxLevelInput = document.getElementById('fxLevel');
  var fxLevelVal = document.getElementById('fxLevelVal');
  var fxLevelControl = document.getElementById('fxLevelControl');
  var performanceModeInput = document.getElementById('performanceMode');
  var performanceModeCard = document.getElementById('performanceModeCard');
  var performanceModeVal = document.getElementById('performanceModeVal');
  var imageQualityInput = document.getElementById('imageQuality');
  var imageQualityVal = document.getElementById('imageQualityVal');
  var imageQualityPrev = document.getElementById('imageQualityPrev');
  var imageQualityNext = document.getElementById('imageQualityNext');
  var qualityCategoryList = document.getElementById('qualityCategoryList');
  var mainVolumeInput = document.getElementById('mainVolume');
  var minigameVolumeInput = document.getElementById('minigameVolume');
  var mainVolumeVal = document.getElementById('mainVolumeVal');
  var minigameVolumeVal = document.getElementById('minigameVolumeVal');
  var titlePendingRaw = null; // 称号页当前选中项
  var currentSidebarPanel = 'menu';
  // 二级页的来源：'menu' = 从暂停菜单进的，'home' = 从首页顶栏快捷入口进的
  // 返回时按来源回到对应位置
  var sidebarPanelOrigin = 'menu';

  var THEME_KEY = 'fgexpig_theme_v1';
  var FONT_KEY = 'fgexpig_font_v1';
  var AUDIO_KEY = 'fgexpig_audio_v1';
  var KEYBIND_KEY = 'fgexpig_keybinds_v1';
  var KEYBIND_ACTIONS = [
    { id: 'prevNav', label: '上一个导航', defaultKey: 'q', xbox: 'LB', playstation: 'L1', gamepadButton: 4 },
    { id: 'nextNav', label: '下一个导航', defaultKey: 'e', xbox: 'RB', playstation: 'R1', gamepadButton: 5 },
    { id: 'prevActivity', label: '上一个活动', defaultKey: 'a', xbox: 'LT', playstation: 'L2', gamepadButton: 6 },
    { id: 'nextActivity', label: '下一个活动', defaultKey: 'd', xbox: 'RT', playstation: 'R2', gamepadButton: 7 },
    { id: 'toggleMusic', label: '音乐暂停', defaultKey: 'x', xbox: 'X', playstation: '□', gamepadButton: 2 },
    { id: 'rewindMusic', label: '音乐回退', defaultKey: 'z', xbox: '←', playstation: '←', gamepadButton: 14 },
    { id: 'forwardMusic', label: '音乐快进', defaultKey: 'c', xbox: '→', playstation: '→', gamepadButton: 15 },
    { id: 'toggleUi', label: '隐藏/显示HUD', defaultKey: 'tab', xbox: 'Y', playstation: '△', gamepadButton: 3 },
    { id: 'openSettings', label: '设置页', defaultKey: 'i', xbox: '', playstation: '' }
  ];
  var GAMEPAD_ACTION_BY_BUTTON = {};
  KEYBIND_ACTIONS.forEach(function (action) {
    if (typeof action.gamepadButton === 'number') GAMEPAD_ACTION_BY_BUTTON[action.gamepadButton] = action.id;
  });
  function normalizeKeyName(value) {
    if (value === undefined || value === null) return '';
    var key = String(value);
    if (!key) return '';
    if (key === ' ') return 'space';
    return key.toLowerCase();
  }
  function isModifierKey(value) {
    var key = normalizeKeyName(value);
    return key === 'shift' || key === 'control' || key === 'alt' || key === 'meta' || key === 'capslock';
  }
  function keyDisplayName(value) {
    var key = normalizeKeyName(value);
    var names = {
      escape: 'ESC',
      tab: 'Tab',
      space: 'Space',
      enter: 'Enter',
      backspace: 'Backspace',
      delete: 'Delete',
      arrowup: '↑',
      arrowdown: '↓',
      arrowleft: '←',
      arrowright: '→'
    };
    if (names[key]) return names[key];
    if (!key) return '未设置';
    if (/^f\d{1,2}$/.test(key)) return key.toUpperCase();
    return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
  }
  function loadKeybindings() {
    var map = {};
    KEYBIND_ACTIONS.forEach(function (action) { map[action.id] = action.defaultKey; });
    try {
      var saved = JSON.parse(localStorage.getItem(KEYBIND_KEY) || '{}');
      KEYBIND_ACTIONS.forEach(function (action) {
        if (saved && typeof saved[action.id] === 'string') map[action.id] = normalizeKeyName(saved[action.id]);
      });
    } catch (err) {}
    return map;
  }
  function saveKeybindings() {
    try { localStorage.setItem(KEYBIND_KEY, JSON.stringify(keybindings)); } catch (err) {}
  }
  var keybindings = loadKeybindings();
  var keyCaptureActionId = null;
  var FONT_OPTIONS = [
    { id: 'sarasa', name: '等距更纱黑体（默认）', family: "'SarasaGothic'", previewWeight: 700 },
    { id: 'kaiti', name: '楷体', family: "'FgexpigKaiti'", previewWeight: 700 },
    { id: 'mengya-bear', name: '萌芽熊体', family: "'FgexpigMengyaBear'", previewWeight: 100 },
    { id: 'shanhai-summer', name: '山海仲夏夜物语', family: "'FgexpigShanhaiSummer'", previewWeight: 400 }
  ];
  var currentFontId = FONT_OPTIONS[0].id;
  var currentSettingsTab = 'interface';
  var SETTINGS_DESCRIPTIONS = {
    display: { title: '显示', text: '调整性能模式和画质。性能模式会关闭网页动画并禁用沉浸光效。' },
    control: {
      title: '控制',
      text: '点击右侧按键框后按下新按键即可修改。重复按键会与其他功能交换。'
    },
    audio: { title: '音频', text: '调整网页主音量和小游戏音量。音量设置会自动保存到本机。' },
    font: { title: '字体', text: '选择网页使用的字体。切换后会立即应用，并自动保存到本机。' },
    sponsor: { title: '赞助', text: '选择微信或支付宝向网页开发者捐赠。' },
    interface: {
      title: '界面',
      text: '调整亮度、模糊和沉浸光效。性能模式开启时，沉浸光效会暂时禁用。',
      subtitle: '沉浸光感',
      extra: '0级使用默认鼠标指针\n1级使用称号等级鼠标指针\n2级增加沉浸光感\n3级增加边框描边'
    }
  };

  function syncSettingsRangeFill(input) {
    if (!input || input.type !== 'range') return;
    var min = Number(input.min);
    var max = Number(input.max);
    var value = Number(input.value);
    if (!isFinite(min)) min = 0;
    if (!isFinite(max) || max === min) max = min + 1;
    if (!isFinite(value)) value = min;
    var ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
    input.style.setProperty('--range-progress', (ratio * 100).toFixed(3) + '%');
  }

  function normalizeAudioVolume(value) {
    var number = Number(value);
    if (!isFinite(number)) return 1;
    if (number > 1) number /= 100;
    return Math.max(0, Math.min(1, number));
  }

  function applyAudioSettings(persist) {
    audioSettings.mainVolume = normalizeAudioVolume(audioSettings.mainVolume);
    audioSettings.minigameVolume = normalizeAudioVolume(audioSettings.minigameVolume);
    var currentVolume = minigameModeActive ? audioSettings.minigameVolume : audioSettings.mainVolume;
    if (audio) audio.volume = currentVolume;
    if (startupVideo) startupVideo.volume = audioSettings.mainVolume;
    if (mainVolumeInput) mainVolumeInput.value = String(Math.round(audioSettings.mainVolume * 100));
    if (minigameVolumeInput) minigameVolumeInput.value = String(Math.round(audioSettings.minigameVolume * 100));
    if (mainVolumeVal) mainVolumeVal.textContent = Math.round(audioSettings.mainVolume * 100) + '%';
    if (minigameVolumeVal) minigameVolumeVal.textContent = Math.round(audioSettings.minigameVolume * 100) + '%';
    syncSettingsRangeFill(mainVolumeInput);
    syncSettingsRangeFill(minigameVolumeInput);
    if (persist) {
      try {
        localStorage.setItem(AUDIO_KEY, JSON.stringify({
          mainVolume: audioSettings.mainVolume,
          minigameVolume: audioSettings.minigameVolume
        }));
      } catch (err) {}
    }
  }

  function initAudioSettings() {
    try {
      var raw = localStorage.getItem(AUDIO_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        audioSettings.mainVolume = normalizeAudioVolume(saved.mainVolume);
        audioSettings.minigameVolume = normalizeAudioVolume(saved.minigameVolume);
      }
    } catch (err) {}
    applyAudioSettings(false);
  }

  function showSidebarPanel(which) {
    currentSidebarPanel = which;
    panelMenu.hidden = which !== 'menu';
    panelTitles.hidden = which !== 'titles';
    panelAccounts.hidden = which !== 'accounts';
    panelSettings.hidden = which !== 'settings';
    var isSubpage = which !== 'menu';
    if (pauseMenu) {
      pauseMenu.classList.toggle('is-subpage-open', isSubpage);
      pauseMenu.classList.toggle('is-settings-open', which === 'settings');
    }
    document.documentElement.classList.toggle('pause-settings-open', which === 'settings');
    invalidateCursorTargetCache();
  }
  // 二级页“返回”：从首页进来的直接回首页，从暂停菜单进来的回暂停菜单
  function resetSidebarPanel() {
    if (sidebarPanelOrigin === 'home') {
      closeSidebars();
      return;
    }
    resetSidebarPanelCore();
  }

  // 只把侧栏面板复位到主菜单（不改变来源，供关闭侧栏时直接调用）
  function resetSidebarPanelCore() {
    var previous = currentSidebarPanel;
    showSidebarPanel('menu');
    if (previous === 'settings') resetSettingsStickAcceleration();
    if (previous === 'titles') resetTitleStickNavigation();
    if (previous !== 'menu') {
      var returnFocus = {
        accounts: 'navAccountSwitch',
        titles: 'navTitleSwitch',
        settings: 'navSettings'
      }[previous];
      var items = pauseMenuItems();
      for (var i = 0; i < items.length; i++) {
        if (!returnFocus || items[i].id === returnFocus) {
          pauseMenuSelectionIndex = i;
          break;
        }
      }
      updatePauseMenuSelection();
    }
  }

  function showSettingsTab(tabId) {
    var desc = SETTINGS_DESCRIPTIONS[tabId] || SETTINGS_DESCRIPTIONS.interface;
    currentSettingsTab = SETTINGS_DESCRIPTIONS[tabId] ? tabId : 'interface';
    Array.prototype.forEach.call(settingsTabs, function (tab) {
      var active = tab.getAttribute('data-settings-tab') === currentSettingsTab;
      tab.classList.toggle('active', active);
      tab.classList.toggle('is-active', active);
    });
    Array.prototype.forEach.call(settingsSections, function (section) {
      section.hidden = section.getAttribute('data-settings-panel') !== currentSettingsTab;
    });
    if (settingsDescriptionTitle) settingsDescriptionTitle.textContent = desc.title;
    if (settingsDescriptionText) {
      if (desc.textHtml) settingsDescriptionText.innerHTML = desc.textHtml;
      else settingsDescriptionText.textContent = desc.text;
    }
    if (settingsDescriptionSubtitle) {
      settingsDescriptionSubtitle.hidden = !desc.subtitle;
      settingsDescriptionSubtitle.textContent = desc.subtitle || '';
    }
    if (settingsDescriptionExtra) {
      settingsDescriptionExtra.hidden = !desc.extra;
      settingsDescriptionExtra.textContent = desc.extra || '';
    }
    if (currentSettingsTab === 'control') renderKeybindList();
    settingsSelectionIndex = 0;
    resetSettingsStickAcceleration();
    updateSettingsSelection();
    moveSettingsThumb(currentSettingsTab, true);
  }

  function moveSettingsThumb(tabId, animate) {
    if (!settingsNav || !settingsThumb) return;
    var buttons = settingsNav.querySelectorAll('.topnav-item');
    for (var i = 0; i < buttons.length; i += 1) {
      if (buttons[i].getAttribute('data-settings-tab') !== tabId) continue;
      var width = Math.max(54, Math.round(buttons[i].offsetWidth));
      var x = Math.round(buttons[i].offsetLeft + buttons[i].offsetWidth / 2 - width / 2);
      if (!animate) settingsThumb.classList.add('no-anim');
      settingsThumb.style.width = width + 'px';
      settingsThumb.style.transform = 'translateX(' + x + 'px)';
      if (!animate) {
        void settingsThumb.offsetWidth;
        settingsThumb.classList.remove('no-anim');
      }
      break;
    }
  }

  function openSettingsPanel(tabId) {
    renderFontList();
    renderKeybindList();
    Array.prototype.forEach.call(settingsTabs, function (tab) {
      var effect = tab.querySelector('.topnav-item-effect');
      if (effect && !effect.getAttribute('data-asset-original')) bindResponsiveAsset(effect, 'logo/choose.png');
    });
    showSidebarPanel('settings');
    showSettingsTab(tabId || 'interface');
    moveSettingsThumb(currentSettingsTab, false);
  }

  function qualityLabel(value) {
    var labels = { 1: '极低', 2: '低', 3: '中', 4: '高', 5: '极高' };
    return labels[normalizeImageQuality(value)] || labels[1];
  }

  function qualityCategoryById(id) {
    for (var i = 0; i < IMAGE_QUALITY_CATEGORIES.length; i += 1) {
      if (IMAGE_QUALITY_CATEGORIES[i].id === id) return IMAGE_QUALITY_CATEGORIES[i];
    }
    return null;
  }

  function qualityCategoryValues() {
    return IMAGE_QUALITY_CATEGORIES.map(function (category) {
      return normalizeImageQuality(imageQualityCategories[category.id]);
    });
  }

  function qualityCategorySignature() {
    return qualityCategoryValues().join('|');
  }

  function qualityIsUniform() {
    var values = qualityCategoryValues();
    for (var i = 1; i < values.length; i += 1) {
      if (values[i] !== values[0]) return false;
    }
    return true;
  }

  function renderQualityCategoryRows() {
    if (!qualityCategoryList) return;
    if (!qualityCategoryList.children.length) {
      IMAGE_QUALITY_CATEGORIES.forEach(function (category) {
        var row = document.createElement('div');
        row.className = 'theme-control quality-category-control';
        row.setAttribute('data-quality-category', category.id);

        var label = document.createElement('span');
        label.className = 'settings-card-label';
        label.textContent = category.label;

        var control = document.createElement('div');
        control.className = 'settings-card-control';
        var value = document.createElement('span');
        value.className = 'theme-value quality-category-value';
        value.setAttribute('data-quality-category-value', category.id);

        var stepper = document.createElement('div');
        stepper.className = 'settings-stepper';
        var prev = document.createElement('button');
        prev.type = 'button';
        prev.className = 'settings-step-btn';
        prev.setAttribute('aria-label', '降低' + category.label + '画质');
        prev.textContent = '‹';
        var next = document.createElement('button');
        next.type = 'button';
        next.className = 'settings-step-btn';
        next.setAttribute('aria-label', '提高' + category.label + '画质');
        next.textContent = '›';
        prev.addEventListener('click', function () {
          setCategoryImageQuality(category.id, Number(imageQualityCategories[category.id]) - 1, true);
        });
        next.addEventListener('click', function () {
          setCategoryImageQuality(category.id, Number(imageQualityCategories[category.id]) + 1, true);
        });

        stepper.appendChild(prev);
        stepper.appendChild(next);
        control.appendChild(value);
        control.appendChild(stepper);
        row.appendChild(label);
        row.appendChild(control);
        qualityCategoryList.appendChild(row);
      });
    }
  }

  function renderQualityControls() {
    renderQualityCategoryRows();
    var values = qualityCategoryValues();
    var uniform = qualityIsUniform();
    if (uniform) imageQualityLevel = values[0];
    if (imageQualityVal) imageQualityVal.textContent = uniform ? qualityLabel(values[0]) : '自定义';
    if (qualityCategoryList) {
      var valueNodes = qualityCategoryList.querySelectorAll('[data-quality-category-value]');
      for (var i = 0; i < valueNodes.length; i += 1) {
        var id = valueNodes[i].getAttribute('data-quality-category-value');
        valueNodes[i].textContent = qualityLabel(imageQualityCategories[id]);
      }
    }
    if (imageQualityInput) imageQualityInput.value = String(uniform ? values[0] : imageQualityLevel);
  }

  function setImageQuality(value, persist) {
    var level = normalizeImageQuality(value);
    IMAGE_QUALITY_CATEGORIES.forEach(function (category) {
      imageQualityCategories[category.id] = level;
    });
    imageQualityLevel = level;
    renderQualityControls();
    applyThemeFromControls(!!persist);
  }

  function setCategoryImageQuality(categoryId, value, persist) {
    if (!qualityCategoryById(categoryId)) return;
    imageQualityCategories[categoryId] = normalizeImageQuality(value);
    if (qualityIsUniform()) imageQualityLevel = imageQualityCategories[categoryId];
    renderQualityControls();
    applyThemeFromControls(!!persist);
  }

  function syncNonOuterCardBlurLayers() {
    var layers = document.querySelectorAll('.card-blur-layer');
    for (var i = layers.length - 1; i >= 0; i--) layers[i].remove();
  }

  function applyThemeSettings(brightness, blur, level, quality, persist) {
    brightness = Math.max(0, Math.min(100, Number(brightness)));
    blur = Math.max(0, Math.min(24, Number(blur)));
    level = Math.max(0, Math.min(3, Math.round(Number(level))));
    quality = normalizeImageQuality(quality);
    if (!isFinite(brightness)) brightness = 65;
    if (!isFinite(blur)) blur = 0;
    if (!isFinite(level)) level = 3;
    var dim = 100 - brightness;

    var performanceOn = !!(performanceModeInput && performanceModeInput.checked);
    var nextQualitySignature = qualityCategorySignature();
    var qualityChanged = imageQualityLevel !== quality || appliedQualitySignature !== nextQualitySignature;
    appliedQualitySignature = nextQualitySignature;
    imageQualityLevel = quality;
    var cursorOn = !performanceOn && level >= 1;
    var glowOn = !performanceOn && level >= 2;
    var borderOn = !performanceOn && level >= 3;

    var ratio = dim / 100;
    var root = document.documentElement;
    root.style.setProperty('--wallpaper-dim-top', String(ratio * 0.5));
    root.style.setProperty('--wallpaper-dim-bottom', String(Math.min(1, ratio * 1.2)));
    root.style.setProperty('--card-blur', blur + 'px');
    root.classList.toggle('performance-mode', performanceOn);
    root.classList.toggle('has-card-blur', blur > 0);
    syncNonOuterCardBlurLayers();
    root.dataset.fxCursorDesired = cursorOn ? '1' : '0';
    syncImmersiveCursorState();
    root.classList.toggle('fx-glow', glowOn);
    root.classList.toggle('fx-border', borderOn);
    root.dataset.imageQuality = String(imageQualityLevel);
    root.dataset.imageQualityWallpaper = String(imageQualityCategories.wallpaper);
    root.dataset.imageQualityProfileMusic = String(imageQualityCategories.profileMusic);
    root.dataset.imageQualityAchievements = String(imageQualityCategories.achievements);
    root.dataset.imageQualityBadges = String(imageQualityCategories.badges);
    root.dataset.imageQualityResources = String(imageQualityCategories.resources);
    root.dataset.imageQualityEmoji = String(imageQualityCategories.emoji);

    wallpaperDimInput.value = String(brightness);
    cardBlurInput.value = String(blur);
    wallpaperDimVal.textContent = brightness + '%';
    cardBlurVal.textContent = blur + 'px';
    fxLevelInput.value = String(level);
    fxLevelVal.textContent = level + '级';
    fxLevelInput.disabled = performanceOn;
    if (fxLevelControl) fxLevelControl.classList.toggle('is-disabled', performanceOn);
    if (performanceModeVal) performanceModeVal.textContent = performanceOn ? '开启' : '关闭';
    if (imageQualityInput) imageQualityInput.value = String(imageQualityLevel);
    if (imageQualityVal) imageQualityVal.textContent = qualityLabel(imageQualityLevel);
    syncSettingsRangeFill(wallpaperDimInput);
    syncSettingsRangeFill(cardBlurInput);
    syncSettingsRangeFill(fxLevelInput);
    renderQualityControls();

    if (qualityChanged && track && track.children.length) {
      refreshResponsiveAssets(document);
      if (typeof user !== 'undefined' && user) {
        setAvatar(document.getElementById('userPillAvatar'), user.name);
        setAvatar(document.getElementById('sidebarAvatar'), user.name);
      }
      refreshPlayerMedia();
      applyWallpaper(LOGOS[state.index]);
    syncNonOuterCardBlurLayers();
    setTimeout(syncNonOuterCardBlurLayers, 0);
    }

    if (!cursorOn) {
      hideCursorGlow();
    } else if (cursorX >= 0 && cursorY >= 0) {
      updateCursorGlow(false);
    }
    var qualityCategorySnapshot = {};
    IMAGE_QUALITY_CATEGORIES.forEach(function (category) {
      qualityCategorySnapshot[category.id] = imageQualityCategories[category.id];
    });
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, JSON.stringify({
          dim: dim,
          blur: blur,
          fxLevel: level,
          performance: performanceOn,
          imageQuality: imageQualityLevel,
          imageQualityCategories: qualityCategorySnapshot
        }));
      } catch (err) {}
    }
  }

  function initThemeSettings() {
    var saved = null;
    try {
      var raw = localStorage.getItem(THEME_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (err) {}
    if (performanceModeInput) performanceModeInput.checked = !!(saved && saved.performance);
    var quality = IMAGE_QUALITY_MIN;
    if (saved && Object.prototype.hasOwnProperty.call(saved, 'imageQuality')) {
      quality = saved.imageQuality;
    } else if (saved && saved.superResolution) {
      quality = IMAGE_QUALITY_MAX;
    }
    quality = normalizeImageQuality(quality);
    if (saved && saved.imageQualityCategories && typeof saved.imageQualityCategories === 'object') {
      IMAGE_QUALITY_CATEGORIES.forEach(function (category) {
        if (Object.prototype.hasOwnProperty.call(saved.imageQualityCategories, category.id)) {
          imageQualityCategories[category.id] = normalizeImageQuality(saved.imageQualityCategories[category.id]);
        }
      });
      if (qualityIsUniform()) quality = qualityCategoryValues()[0];
    } else {
      IMAGE_QUALITY_CATEGORIES.forEach(function (category) {
        imageQualityCategories[category.id] = quality;
      });
    }
    var level = 3;
    if (saved && Object.prototype.hasOwnProperty.call(saved, 'fxLevel')) {
      level = saved.fxLevel;
    } else if (saved && Object.prototype.hasOwnProperty.call(saved, 'cursor')) {
      if (!saved.cursor) level = 0;
      else if (!saved.glow) level = 1;
      else if (!saved.border) level = 2;
    }
    var brightness = 65;
    if (saved && Object.prototype.hasOwnProperty.call(saved, 'dim')) brightness = 100 - Number(saved.dim);
    applyThemeSettings(brightness, saved ? saved.blur : 0, level, quality, false);
  }

  function fontOptionById(id) {
    for (var i = 0; i < FONT_OPTIONS.length; i++) {
      if (FONT_OPTIONS[i].id === id) return FONT_OPTIONS[i];
    }
    return FONT_OPTIONS[0];
  }

  function applyFont(id, persist) {
    var opt = fontOptionById(id);
    currentFontId = opt.id;
    document.documentElement.style.setProperty('--app-font', opt.family);
    document.documentElement.setAttribute('data-font', opt.id);
    if (navEl && navColorOverlay) {
      if (curNavLogo && navCache[curNavLogo]) moveThumb(navCache[curNavLogo].active, false);
      syncNavColorOverlay();
      requestAnimationFrame(syncNavColorOverlay);
    }
    layoutTopbarIdentity();
    if (document.fonts && document.fonts.load) {
      document.fonts.load('15px ' + opt.family).then(function () {
        layoutTopbarIdentity();
        if (navEl && navColorOverlay) {
          if (curNavLogo && navCache[curNavLogo]) moveThumb(navCache[curNavLogo].active, false);
          syncNavColorOverlay();
        }
      }).catch(function () {});
    }
    if (persist) {
      try { localStorage.setItem(FONT_KEY, opt.id); } catch (err) {}
    }
  }

  function initFontSetting() {
    var saved = null;
    try { saved = localStorage.getItem(FONT_KEY); } catch (err) {}
    applyFont(saved, false);
  }

  function renderFontList() {
    fontListEl.innerHTML = '';
    FONT_OPTIONS.forEach(function (opt) {
      var item = document.createElement('div');
      item.className = 'font-item' + (opt.id === currentFontId ? ' is-active' : '');
      item.dataset.fontId = opt.id;
      item.style.setProperty('font-family', opt.family, 'important');
      item.setAttribute('role', 'button');
      item.tabIndex = 0;
      item.setAttribute('aria-pressed', opt.id === currentFontId ? 'true' : 'false');

      var main = document.createElement('span');
      main.className = 'font-item-main';

      var name = document.createElement('span');
      name.className = 'font-item-name';
      name.dataset.fontId = opt.id;
      name.style.setProperty('font-family', opt.family, 'important');
      name.style.setProperty('font-weight', String(opt.previewWeight || 700), 'important');
      name.textContent = opt.name;

      main.appendChild(name);

      var toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'theme-toggle font-item-toggle';
      toggle.checked = opt.id === currentFontId;
      toggle.setAttribute('aria-label', '使用' + opt.name);

      item.appendChild(main);
      item.appendChild(toggle);
      toggle.addEventListener('click', function (event) {
        event.stopPropagation();
      });
      toggle.addEventListener('change', function () {
        if (!toggle.checked) {
          toggle.checked = true;
          return;
        }
        applyFont(opt.id, true);
        renderFontList();
      });
      item.addEventListener('click', function () {
        applyFont(opt.id, true);
        renderFontList();
      });
      item.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        applyFont(opt.id, true);
        renderFontList();
      });
      fontListEl.appendChild(item);
    });
  }

  function assignKeybinding(actionId, rawKey) {
    var key = normalizeKeyName(rawKey);
    if (!key || isModifierKey(rawKey)) return false;
    var oldKey = keybindings[actionId] || '';
    KEYBIND_ACTIONS.forEach(function (action) {
      if (action.id !== actionId && keybindings[action.id] === key) keybindings[action.id] = oldKey;
    });
    keybindings[actionId] = key;
    saveKeybindings();
    return true;
  }

  function renderKeybindList() {
    if (!keybindListEl) return;
    keybindListEl.innerHTML = '';
    KEYBIND_ACTIONS.forEach(function (action) {
      var row = document.createElement('div');
      row.className = 'theme-control keybind-control';

      var label = document.createElement('span');
      label.className = 'settings-card-label';
      label.textContent = action.label;

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'keybind-button' + (keyCaptureActionId === action.id ? ' is-capturing' : '');
      button.setAttribute('data-keybind-action', action.id);
      button.setAttribute('aria-label', '修改' + action.label + '快捷键');
      button.setAttribute('aria-pressed', keyCaptureActionId === action.id ? 'true' : 'false');
      button.textContent = keyCaptureActionId === action.id ? '请按键…' : keyDisplayName(keybindings[action.id]);
      button.addEventListener('click', function () {
        keyCaptureActionId = keyCaptureActionId === action.id ? null : action.id;
        renderKeybindList();
      });

      var xbox = document.createElement('span');
      xbox.className = 'keybind-button gamepad-keybind' + (action.xbox ? '' : ' is-empty');
      xbox.textContent = action.xbox;
      xbox.setAttribute('aria-hidden', 'true');

      var playstation = document.createElement('span');
      playstation.className = 'keybind-button gamepad-keybind' + (action.playstation ? '' : ' is-empty');
      playstation.textContent = action.playstation;
      playstation.setAttribute('aria-hidden', 'true');

      row.appendChild(label);
      row.appendChild(button);
      row.appendChild(xbox);
      row.appendChild(playstation);
      keybindListEl.appendChild(row);
    });
  }

  function renderTitleList() {
    titleListEl.innerHTML = '';
    // 成就型称号已经混在 titlesOf 里，按普通称号一样排序显示：只显示已获得的
    var list = titlesOf(user.name);

    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'title-empty';
      empty.textContent = '暂无可使用的称号';
      titleListEl.appendChild(empty);
      return;
    }

    // 正常称号优先；P1、P2 放在正常称号后面，并保持数据中的原始顺序。
    function titleSortRank(title) {
      if (isSpecialTitleLevel(title.lv)) return 0;
      return 10 + Number(title.lv || 0);
    }
    var ordered = list.map(function (t, i) { return { t: t, i: i }; })
      .sort(function (a, b) {
        var rankDiff = titleSortRank(b.t) - titleSortRank(a.t);
        if (rankDiff) return rankDiff;
        if (isSpecialTitleLevel(a.t.lv) && isSpecialTitleLevel(b.t.lv)) return b.i - a.i;
        return b.i - a.i;
      });

    ordered.forEach(function (entry) {
      var t = entry.t;
      var special = isSpecialTitleLevel(t.lv);
      var levelClass = String(t.lv).toLowerCase();
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'title-item' + (t.lv === 5 ? ' title-item-lv-5' : '') +
        (special ? ' title-item-special is-locked' : '') +
        (t.raw === titlePendingRaw ? ' is-selected' : '');
      if (special) {
        item.disabled = true;
        item.setAttribute('aria-disabled', 'true');
      }

      var badge = document.createElement('span');
      badge.className = 'title-badge t-lv-' + levelClass;
      badge.textContent = formatTitleText(t.text);

      item.appendChild(badge);
      if (!special) item.addEventListener('click', function () {
        titlePendingRaw = t.raw;
        titleSelectionIndex = titleItems().indexOf(item);
        var items = titleItems();
        for (var i = 0; i < items.length; i++) {
          items[i].classList.toggle('is-selected', items[i] === item);
        }
        titleSelMap[user.name] = t.raw;
        persistTitleSel();
        applyUserTitle();
      });
      titleListEl.appendChild(item);
    });
  }

  function openTitlePanel() {
    var cur = currentTitle(user.name);
    titlePendingRaw = cur ? cur.raw : null;
    renderTitleList();
    showSidebarPanel('titles');
    resetTitleSelection();
  }

  function titleItems() {
    return titleListEl ? Array.prototype.slice.call(titleListEl.querySelectorAll('.title-item:not(.is-locked)')) : [];
  }
  function resetTitleSelection() {
    var items = titleItems();
    titleSelectionIndex = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].classList.contains('is-selected')) {
        titleSelectionIndex = i;
        break;
      }
    }
    if (items[titleSelectionIndex] && items[titleSelectionIndex].scrollIntoView) {
      items[titleSelectionIndex].scrollIntoView({ block: 'nearest' });
    }
  }
  function moveTitleSelection(delta) {
    var items = titleItems();
    if (!items.length) return;
    var next = Math.max(0, Math.min(items.length - 1, titleSelectionIndex + delta));
    if (next === titleSelectionIndex) return;
    titleSelectionIndex = next;
    items[titleSelectionIndex].click();
    if (items[titleSelectionIndex].scrollIntoView) {
      items[titleSelectionIndex].scrollIntoView({ block: 'nearest' });
    }
  }
  function activateTitleSelection() {
    var items = titleItems();
    if (items[titleSelectionIndex]) items[titleSelectionIndex].click();
  }

  function currentAccountRecord() {
    var accounts = (accountStore && accountStore.accounts) || [];
    for (var i = 0; i < accounts.length; i++) {
      if (accounts[i].nick === user.name) return accounts[i];
    }
    return null;
  }

  function openAccountPanel() {
    var account = currentAccountRecord();
    if (accountLoginError) accountLoginError.textContent = '';
    if (accountLoginPass) accountLoginPass.value = '';
    if (accountLoginUser) accountLoginUser.value = account && account.user ? account.user : (user.isAdmin ? 'admin' : '');
    showSidebarPanel('accounts');
  }

  document.getElementById('navAccountSwitch').addEventListener('click', openAccountPanel);
  document.getElementById('navTitleSwitch').addEventListener('click', openTitlePanel);
  document.getElementById('navSettings').addEventListener('click', function () { openSettingsPanel('interface'); });
  var githubRepositoryBtn = document.getElementById('navGithubRepository');
  if (githubRepositoryBtn) {
    githubRepositoryBtn.addEventListener('click', function () {
      window.open('https://github.com/JianZhaNoSwine/FGEXPIG-Official-Website', '_blank', 'noopener,noreferrer');
    });
  }
  document.getElementById('navBack').addEventListener('click', closeSidebars);
  if (accountLogoutTop) accountLogoutTop.addEventListener('click', logoutInlineAccount);
  if (titleBackTop) titleBackTop.addEventListener('click', resetSidebarPanel);
  if (accountLoginForm) accountLoginForm.addEventListener('submit', doInlineAccountLogin);
  if (accountLoginClear) accountLoginClear.addEventListener('click', clearInlineAccountLogin);
  if (settingsBackBtn) settingsBackBtn.addEventListener('click', resetSidebarPanel);
  Array.prototype.forEach.call(settingsTabs, function (tab) {
    tab.addEventListener('click', function () {
      showSettingsTab(tab.getAttribute('data-settings-tab'));
    });
  });
  if (panelSettings && sponsorOverlay && sponsorImage) {
    panelSettings.addEventListener('click', function (event) {
      var option = event.target.closest ? event.target.closest('.sponsor-option') : null;
      if (!option) return;
      var src = option.getAttribute('data-sponsor-image');
      if (!src) return;
      sponsorImage.src = src;
      sponsorOverlay.hidden = false;
    });
    sponsorOverlay.addEventListener('click', function () {
      sponsorOverlay.hidden = true;
      sponsorImage.removeAttribute('src');
    });
  }

  function applyThemeFromControls(persist) {
    applyThemeSettings(
      wallpaperDimInput.value,
      cardBlurInput.value,
      fxLevelInput.value,
      imageQualityInput ? imageQualityInput.value : imageQualityLevel,
      persist
    );
  }

  var minigameModeActive = false;
  var minigameThemeSnapshot = null;
  var minigameMusicSnapshot = null;

  function enterMinigameMode() {
    if (minigameModeActive) return;
    minigameModeActive = true;
    minigameThemeSnapshot = {
      brightness: wallpaperDimInput.value,
      blur: cardBlurInput.value,
      level: fxLevelInput.value,
      quality: imageQualityLevel
    };
    applyThemeSettings(minigameThemeSnapshot.brightness, minigameThemeSnapshot.blur, 0, minigameThemeSnapshot.quality, false);

    minigameMusicSnapshot = {
      src: audio.dataset.src || audio.src || musicUrl(LOGOS[state.index]),
      time: audio.currentTime || 0,
      paused: audio.paused,
      musicPausedByUser: musicPausedByUser
    };
    interacted = true;
    musicPausedByUser = false;
    audio.dataset.src = 'music/minigames.mp3';
    audio.src = 'music/minigames.mp3';
    audio.currentTime = 0;
    audio.volume = audioSettings.minigameVolume;
    setRing(0);
    setTrackName('小游戏');
    var playPromise = audio.play();
    if (playPromise && playPromise.catch) playPromise.catch(function () {});
  }

  function exitMinigameMode() {
    if (!minigameModeActive) return;
    minigameModeActive = false;
    if (minigameThemeSnapshot) {
      applyThemeSettings(
        minigameThemeSnapshot.brightness,
        minigameThemeSnapshot.blur,
        minigameThemeSnapshot.level,
        minigameThemeSnapshot.quality,
        false
      );
      minigameThemeSnapshot = null;
    }

    var snapshot = minigameMusicSnapshot;
    minigameMusicSnapshot = null;
    if (!snapshot) return;
    var restoreSrc = snapshot.src || musicUrl(LOGOS[state.index]);
    audio.dataset.src = restoreSrc;
    audio.src = restoreSrc;
    musicPausedByUser = !!snapshot.musicPausedByUser;
    audio.volume = audioSettings.mainVolume;
    setRing(0);
    refreshPlayerMedia();

    function restorePlayback() {
      try {
        if (snapshot.time > 0 && isFinite(snapshot.time)) audio.currentTime = snapshot.time;
      } catch (err) {}
      if (snapshot.paused || snapshot.musicPausedByUser) {
        audio.pause();
      } else {
        var playPromise = audio.play();
        if (playPromise && playPromise.catch) playPromise.catch(function () {});
      }
    }
    audio.addEventListener('loadedmetadata', restorePlayback, { once: true });
  }

  document.addEventListener('fgexpig:minigame-open', enterMinigameMode);
  document.addEventListener('fgexpig:minigame-close', exitMinigameMode);
  wallpaperDimInput.addEventListener('input', function () { applyThemeFromControls(true); });
  cardBlurInput.addEventListener('input', function () { applyThemeFromControls(true); });
  fxLevelInput.addEventListener('input', function () { applyThemeFromControls(true); });
  performanceModeInput.addEventListener('change', function () { applyThemeFromControls(true); });
  if (performanceModeCard) {
    performanceModeCard.addEventListener('click', function (event) {
      if (event.target === performanceModeInput) return;
      performanceModeInput.checked = !performanceModeInput.checked;
      applyThemeFromControls(true);
    });
    performanceModeCard.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      performanceModeInput.checked = !performanceModeInput.checked;
      applyThemeFromControls(true);
    });
  }
  if (imageQualityInput) imageQualityInput.addEventListener('change', function () { applyThemeFromControls(true); });
  if (imageQualityPrev) imageQualityPrev.addEventListener('click', function () {
    setImageQuality(Number(imageQualityInput.value) - 1, true);
  });
  if (imageQualityNext) imageQualityNext.addEventListener('click', function () {
    setImageQuality(Number(imageQualityInput.value) + 1, true);
  });
  if (mainVolumeInput) mainVolumeInput.addEventListener('input', function () {
    audioSettings.mainVolume = normalizeAudioVolume(mainVolumeInput.value);
    applyAudioSettings(true);
  });
  if (minigameVolumeInput) minigameVolumeInput.addEventListener('input', function () {
    audioSettings.minigameVolume = normalizeAudioVolume(minigameVolumeInput.value);
    applyAudioSettings(true);
  });

  userMenuBtn.addEventListener('click', function () {
    if (document.documentElement.classList.contains('outer-screen-layout')) return;
    openSidebar('left');
  });

  // 顶栏文字快捷入口：用户名 → 切换账号；称号 → 切换称号；音乐名 → 设置页的音频
  // 记下来源为首页，这些二级页按“返回”时直接回首页
  function openTopbarShortcutPanel(openPanel) {
    openSidebar('left');
    sidebarPanelOrigin = 'home';
    openPanel();
  }
  if (userPillNameEl) userPillNameEl.addEventListener('click', function () {
    openTopbarShortcutPanel(openAccountPanel);
  });
  if (userTitleEl) userTitleEl.addEventListener('click', function () {
    openTopbarShortcutPanel(openTitlePanel);
  });
  if (playerName) playerName.addEventListener('click', function () {
    openTopbarShortcutPanel(function () { openSettingsPanel('audio'); });
  });
  editBtn.addEventListener('click', function () {
    dmActiveCat = 'all';
    renderDmCats();
    renderDmContent();
    openSidebar('right');
  });
  if (consoleBtn) consoleBtn.addEventListener('click', function () {
    openSidebar('console');
  });
  if (consoleIgnoredBtn) consoleIgnoredBtn.addEventListener('click', showHotspotConsoleIgnoredPage);
  if (consoleIgnoredBack) consoleIgnoredBack.addEventListener('click', showHotspotConsoleMainPage);
  sidebarMask.addEventListener('click', closeSidebars);

  function focusInputEnd(input) {
    if (!input) return;
    input.focus();
    var end = input.value.length;
    if (input.setSelectionRange) input.setSelectionRange(end, end);
  }

  function handleAccountLoginKeydown(event) {
    if (!pauseMenu || !pauseMenu.classList.contains('open') || !panelAccounts || panelAccounts.hidden) return false;
    var target = event.target;
    if (target === accountLoginUser) {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        focusInputEnd(accountLoginPass);
        return true;
      }
      return false;
    }
    if (target === accountLoginPass) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        focusInputEnd(accountLoginUser);
        return true;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        doInlineAccountLogin(event);
        return true;
      }
      return false;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      doInlineAccountLogin(event);
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      resetSidebarPanel();
      return true;
    }
    return false;
  }

  document.addEventListener('keydown', function (event) {
    setInputMode('keyboard');
    if (!startupEntryComplete || (startupOverlay && !startupOverlay.hidden)) return;
    if (keyCaptureActionId) {
      if (isModifierKey(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      var captureId = keyCaptureActionId;
      var captureAction = null;
      for (var captureIndex = 0; captureIndex < KEYBIND_ACTIONS.length; captureIndex++) {
        if (KEYBIND_ACTIONS[captureIndex].id === captureId) {
          captureAction = KEYBIND_ACTIONS[captureIndex];
          break;
        }
      }
      keyCaptureActionId = null;
      assignKeybinding(captureId, normalizeKeyName(event.key) === 'escape' && captureAction ? captureAction.defaultKey : event.key);
      renderKeybindList();
      return;
    }
    if (handleAccountLoginKeydown(event)) return;
    if (pauseMenu && pauseMenu.classList.contains('is-settings-open')) {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        moveSettingsSelection(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        adjustSettingsSelection(event.key === 'ArrowRight' ? 1 : -1);
        return;
      }
    } else if (pauseMenu && pauseMenu.classList.contains('open') && panelMenu && !panelMenu.hidden) {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        movePauseMenuSelection(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
    }
    if (document.querySelector('.minigame-overlay:not([hidden])')) return;
    if (loginOverlay && loginOverlay.classList.contains('show')) return;
    var pressed = normalizeKeyName(event.key);
    var action = pressed === 'escape' ? { id: 'pauseBack' } : null;
    if (!action) {
      for (var keyIndex = 0; keyIndex < KEYBIND_ACTIONS.length; keyIndex++) {
        if (keybindings[KEYBIND_ACTIONS[keyIndex].id] === pressed) {
          action = KEYBIND_ACTIONS[keyIndex];
          break;
        }
      }
    }
    if (!action) return;
    if (event.repeat && (action.id === 'toggleMusic' || action.id === 'toggleUi' || action.id === 'openSettings' || action.id === 'pauseBack')) return;
    if (isTypingTarget(event.target) && action.id !== 'toggleUi' && action.id !== 'pauseBack') return;
    if (document.documentElement.classList.contains('ui-hidden') && action.id !== 'toggleUi') return;
    event.preventDefault();
    event.stopPropagation();
    performKeyAction(action.id);
  }, true);

  var inputMode = 'keyboard';
  var gamepadPressedState = {};
  var gamepadPollFrame = 0;
  var gamepadLastFrameTime = 0;
  var gamepadNavLastTime = 0;
  var cursorStickHoldStart = 0;
  var scrollStickHoldStart = 0;
  var scrollStickDirection = 0;
  var gamepadScrollTarget = null;
  var viewerTriggerHoldStart = {};
  var viewerTriggerLastStep = {};
  var viewerPanState = { x: { start: 0, direction: 0 }, y: { start: 0, direction: 0 } };
  var triggerHoldStart = {};
  var triggerLongTriggered = {};
  var settingsStickDirection = 0;
  var settingsStickHoldStart = 0;
  var settingsStickLastAdjust = 0;
  var pauseMenuSelectionIndex = 0;
  var settingsSelectionIndex = 0;
  var titleSelectionIndex = 0;
  var titleStickDirection = 0;
  var titleStickHoldStart = 0;
  var titleStickLastMove = 0;

  function setInputMode(mode) {
    if (mode !== 'gamepad') mode = 'keyboard';
    if (inputMode === mode) return;
    inputMode = mode;
    var root = document.documentElement;
    root.classList.toggle('input-mode-gamepad', mode === 'gamepad');
    root.classList.toggle('input-mode-keyboard', mode === 'keyboard');
    syncImmersiveCursorState();
    if (mode === 'gamepad' && (cursorX < 0 || cursorY < 0)) {
      cursorX = Math.round(window.innerWidth / 2);
      cursorY = Math.round(window.innerHeight / 2);
      updateCursorGlowPosition();
    }
    updatePauseMenuSelection();
    updateSettingsSelection();
    if (mode === 'gamepad' && cursorGlowEl && pauseMenu && !pauseMenu.classList.contains('open') &&
        !root.classList.contains('ui-hidden')) {
      cursorGlowEl.classList.add('is-visible');
    }
    if (mode === 'keyboard' && !root.classList.contains('fx-cursor') && cursorGlowEl) {
      cursorGlowEl.classList.remove('is-visible');
    }
  }

  function pauseMenuItems() {
    return panelMenu ? Array.prototype.slice.call(panelMenu.querySelectorAll('.sidebar-item')) : [];
  }
  function updatePauseMenuSelection() {
    var items = pauseMenuItems();
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('is-selected', !!(inputMode === 'gamepad' && panelMenu && !panelMenu.hidden && i === pauseMenuSelectionIndex));
    }
  }
  function movePauseMenuSelection(delta) {
    var items = pauseMenuItems();
    if (!items.length) return;
    pauseMenuSelectionIndex = Math.max(0, Math.min(items.length - 1, pauseMenuSelectionIndex + delta));
    updatePauseMenuSelection();
  }
  function moveSettingsTab(delta) {
    var tabs = Array.prototype.slice.call(settingsTabs || []);
    if (!tabs.length) return;
    var currentIndex = 0;
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute('data-settings-tab') === currentSettingsTab) {
        currentIndex = i;
        break;
      }
    }
    var target = Math.max(0, Math.min(tabs.length - 1, currentIndex + delta));
    if (target === currentIndex) return;
    showSettingsTab(tabs[target].getAttribute('data-settings-tab'));
  }
  function settingsPageItems() {
    if (!panelSettings) return [];
    var activeSection = panelSettings.querySelector('.settings-section:not([hidden])');
    if (!activeSection) return [];
    return Array.prototype.slice.call(activeSection.querySelectorAll('.theme-control,.font-item')).filter(function (el) {
      return el.offsetParent !== null;
    });
  }
  function updateSettingsSelection() {
    var items = settingsPageItems();
    if (settingsSelectionIndex >= items.length) settingsSelectionIndex = Math.max(0, items.length - 1);
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('is-gamepad-selected', inputMode === 'gamepad' && i === settingsSelectionIndex);
    }
  }
  function moveSettingsSelection(delta) {
    var items = settingsPageItems();
    if (!items.length) return;
    settingsSelectionIndex = Math.max(0, Math.min(items.length - 1, settingsSelectionIndex + delta));
    updateSettingsSelection();
    if (items[settingsSelectionIndex] && items[settingsSelectionIndex].scrollIntoView) {
      items[settingsSelectionIndex].scrollIntoView({ block: 'nearest' });
    }
  }
  function activateSettingsSelection() {
    var items = settingsPageItems();
    var item = items[settingsSelectionIndex];
    if (!item) return;
    var range = item.querySelector('.theme-range');
    var stepButton = item.querySelector('.settings-step-btn');
    if (range) range.focus();
    else if (item.click && (item.classList.contains('toggle-option') || item.classList.contains('sponsor-option') || item.classList.contains('font-item'))) item.click();
    else if (stepButton) stepButton.click();
    else item.focus();
  }
  function adjustSettingsSelection(direction) {
    var items = settingsPageItems();
    var item = items[settingsSelectionIndex];
    if (!item) return;
    var range = item.querySelector('.theme-range');
    if (range && !range.disabled) {
      var step = Number(range.step) || 1;
      var min = Number(range.min) || 0;
      var max = Number(range.max) || 100;
      range.value = String(Math.max(min, Math.min(max, Number(range.value) + direction * step)));
      range.dispatchEvent(new Event('input', { bubbles: true }));
      range.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    var stepperButtons = item.querySelectorAll('.settings-step-btn');
    if (stepperButtons.length >= 2) {
      stepperButtons[direction > 0 ? 1 : 0].click();
      return;
    }
    var checkbox = item.querySelector('.theme-toggle');
    if (checkbox && !checkbox.disabled) {
      var next = direction > 0;
      if (checkbox.checked !== next) checkbox.click();
    }
  }
  function resetSettingsStickAcceleration() {
    settingsStickDirection = 0;
    settingsStickHoldStart = 0;
    settingsStickLastAdjust = 0;
  }
  function adjustSettingsWithStick(value, now) {
    var magnitude = Math.abs(Number(value) || 0);
    if (magnitude <= 0.25) {
      resetSettingsStickAcceleration();
      return;
    }
    var direction = value > 0 ? 1 : -1;
    if (direction !== settingsStickDirection) {
      settingsStickDirection = direction;
      settingsStickHoldStart = now;
      settingsStickLastAdjust = 0;
    }
    var normalized = Math.min(1, (magnitude - 0.25) / 0.75);
    var holdRatio = Math.min(1, Math.max(0, now - settingsStickHoldStart) / 1400);
    var magnitudeCurve = Math.pow(normalized, 1.6);
    var holdCurve = Math.pow(holdRatio, 2.4);
    var interval = Math.max(70, 260 - magnitudeCurve * 120 - holdCurve * 130);
    if (settingsStickLastAdjust && now - settingsStickLastAdjust < interval) return;
    settingsStickLastAdjust = now;
    var stepCount = Math.min(4, 1 + Math.floor(magnitudeCurve * 1.5 + holdCurve * 2));
    for (var i = 0; i < stepCount; i++) adjustSettingsSelection(direction);
  }
  function returnActivePageDetailsToRoot() {
    var page = pages[state.index];
    if (!page) return false;
    var backs = page.querySelectorAll('.page-section .achv-title-back');
    var clicked = false;
    for (var i = 0; i < backs.length; i++) {
      if (backs[i].hidden || !backs[i].offsetWidth || !backs[i].offsetHeight) continue;
      backs[i].click();
      clicked = true;
    }
    return clicked;
  }
  function isTitlePanelOpen() {
    return !!(pauseMenu && pauseMenu.classList.contains('open') && panelTitles && !panelTitles.hidden);
  }
  function resetTitleStickNavigation() {
    titleStickDirection = 0;
    titleStickHoldStart = 0;
    titleStickLastMove = 0;
  }
  function moveTitleSelectionWithStick(value, now) {
    var magnitude = Math.abs(Number(value) || 0);
    if (magnitude <= 0.25) {
      resetTitleStickNavigation();
      return;
    }
    var direction = value > 0 ? 1 : -1;
    if (direction !== titleStickDirection) {
      titleStickDirection = direction;
      titleStickHoldStart = now;
      titleStickLastMove = 0;
    }
    var normalized = Math.min(1, (magnitude - 0.25) / 0.75);
    var holdRatio = Math.min(1, Math.max(0, now - titleStickHoldStart) / 1200);
    var interval = Math.max(100, 300 - Math.pow(normalized, 1.5) * 130 - Math.pow(holdRatio, 2) * 110);
    if (titleStickLastMove && now - titleStickLastMove < interval) return;
    titleStickLastMove = now;
    moveTitleSelection(direction);
  }
  function gamepadBackAction() {
    if (sponsorOverlay && !sponsorOverlay.hidden) {
      performKeyAction('pauseBack');
      return;
    }
    if (pauseMenu && pauseMenu.classList.contains('open')) {
      if (currentSidebarPanel !== 'menu') resetSidebarPanel();
      else performKeyAction('pauseBack');
      return;
    }
    returnActivePageDetailsToRoot();
  }
  function resetCursorStickAcceleration() {
    cursorStickHoldStart = 0;
  }
  function gamepadCursorAxisSpeed(value, now) {
    var magnitude = Math.abs(Number(value) || 0);
    if (magnitude <= 0.18) return 0;
    if (!cursorStickHoldStart) cursorStickHoldStart = now;
    var normalized = Math.min(1, (magnitude - 0.18) / 0.82);
    var holdRatio = Math.min(1, Math.max(0, now - cursorStickHoldStart) / 1400);
    var magnitudeCurve = Math.pow(normalized, 1.8);
    var holdCurve = Math.pow(holdRatio, 2.2);
    var speed = 3.5 + magnitudeCurve * 8 + holdCurve * 6;
    return (value < 0 ? -1 : 1) * Math.min(15, speed);
  }
  function resetTriggerAcceleration(buttonIndex) {
    if (triggerHoldStart[buttonIndex] && !triggerLongTriggered[buttonIndex] && gamepadActivityTriggerAllowed()) {
      moveActivityBy(buttonIndex === 6 ? -1 : 1);
    }
    triggerHoldStart[buttonIndex] = 0;
    triggerLongTriggered[buttonIndex] = false;
  }
  function gamepadActivityTriggerAllowed() {
    if (pauseMenu && pauseMenu.classList.contains('open')) return false;
    if (document.querySelector('.minigame-overlay:not([hidden])')) return false;
    if (loginOverlay && loginOverlay.classList.contains('show')) return false;
    if (document.documentElement.classList.contains('ui-hidden')) return false;
    return true;
  }
  function handleGamepadActivityTrigger(buttonIndex, button, now, wasPressed) {
    if (!gamepadActivityTriggerAllowed()) return;
    var direction = buttonIndex === 6 ? -1 : 1;
    if (!wasPressed) {
      triggerHoldStart[buttonIndex] = now;
      triggerLongTriggered[buttonIndex] = false;
      return;
    }
    var holdStart = triggerHoldStart[buttonIndex] || now;
    triggerHoldStart[buttonIndex] = holdStart;
    if (!triggerLongTriggered[buttonIndex] && now - holdStart >= 450) {
      triggerLongTriggered[buttonIndex] = true;
      moveActivityBatch(direction * 7);
    }
  }
  function moveCursorWithGamepad(dx, dy) {
    if (!cursorGlowEl || !startupEntryComplete || (startupOverlay && !startupOverlay.hidden)) return;
    if (pauseMenu && pauseMenu.classList.contains('open')) return;
    if (document.documentElement.classList.contains('ui-hidden')) return;
    dx = Math.max(-18, Math.min(18, dx));
    dy = Math.max(-18, Math.min(18, dy));
    cursorX = Math.max(10, Math.min(window.innerWidth - 10, cursorX + dx));
    cursorY = Math.max(10, Math.min(window.innerHeight - 10, cursorY + dy));
    cursorGlowEl.classList.add('is-visible');
    updateCursorGlowPosition();
    if (document.documentElement.classList.contains('fx-cursor')) scheduleCursorGlowUpdate(0);
  }
  function findScrollableAt(x, y) {
    var el = document.elementFromPoint(x, y);
    while (el && el !== document.body) {
      var style = window.getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight && /(auto|scroll|overlay)/.test(style.overflowY)) return el;
      el = el.parentElement;
    }
    return null;
  }
  function scrollWithGamepad(dy) {
    if (document.documentElement.classList.contains('ui-hidden')) return;
    dy = Math.max(-22, Math.min(22, dy));
    function moveScrollTop(el) {
      if (!el) return;
      if (typeof el._stopManualScrollAnimation === 'function') el._stopManualScrollAnimation();
      var max = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + dy));
    }
    if (pauseMenu && pauseMenu.classList.contains('is-settings-open')) {
      var settingsScroller = panelSettings ? panelSettings.querySelector('.settings-left') : null;
      moveScrollTop(settingsScroller);
      return;
    }
    if (pauseMenu && pauseMenu.classList.contains('open')) return;
    if (!gamepadScrollTarget || !gamepadScrollTarget.isConnected) {
      gamepadScrollTarget = findScrollableAt(cursorX, cursorY) || document.scrollingElement || document.documentElement;
    }
    moveScrollTop(gamepadScrollTarget);
  }
  function gamepadPrimaryAction() {
    if (keyCaptureActionId) return;
    if (!startupEntryComplete || (startupOverlay && !startupOverlay.hidden)) return;
    if (document.querySelector('.minigame-overlay:not([hidden])')) return;
    if (loginOverlay && loginOverlay.classList.contains('show')) return;
    if (document.documentElement.classList.contains('ui-hidden')) return;
    if (pauseMenu && pauseMenu.classList.contains('is-settings-open')) {
      activateSettingsSelection();
      return;
    }
    if (isTitlePanelOpen()) {
      activateTitleSelection();
      return;
    }
    if (pauseMenu && pauseMenu.classList.contains('open') && panelAccounts && !panelAccounts.hidden) return;
    if (pauseMenu && pauseMenu.classList.contains('open') && panelMenu && !panelMenu.hidden) {
      var items = pauseMenuItems();
      if (items[pauseMenuSelectionIndex]) {
        items[pauseMenuSelectionIndex].click();
        return;
      }
    }
    var hit = document.elementFromPoint(cursorX, cursorY);
    if (!hit) return;
    var navButton = hit.closest && hit.closest('#topnav .topnav-item');
    if (navButton) {
      selectNav(navButton.dataset.key, true);
      return;
    }
    var target = hit.closest && hit.closest('button,a,input,select,textarea,[role="button"],.hotspot-post-item,.font-item,.title-item,[tabindex]');
    if (!target) target = hit;
    if (target && target.click) target.click();
  }
  function runGamepadDirection(direction) {
    if (document.documentElement.classList.contains('ui-hidden')) return;
    if (pauseMenu && pauseMenu.classList.contains('is-settings-open')) {
      moveSettingsSelection(direction);
    } else if (isTitlePanelOpen()) {
      moveTitleSelection(direction);
    } else if (pauseMenu && pauseMenu.classList.contains('open') && panelMenu && !panelMenu.hidden) {
      movePauseMenuSelection(direction);
    }
  }
  function gamepadButtonPressed(button) {
    return !!(button && (button.pressed || Number(button.value) > 0.5));
  }
  function isSwitchGamepad(pad) {
    var id = String(pad && pad.id || '').toLowerCase();
    return /nintendo|switch|joy-con|pro controller/.test(id);
  }
  function gamepadStickSpeed(value, maxSpeed) {
    var magnitude = Math.abs(Number(value) || 0);
    if (magnitude <= 0.18) return 0;
    var normalized = Math.min(1, (magnitude - 0.18) / 0.82);
    return (value < 0 ? -1 : 1) * Math.pow(normalized, 1.65) * maxSpeed;
  }
  function gamepadScrollStickSpeed(value, now) {
    var magnitude = Math.abs(Number(value) || 0);
    if (magnitude <= 0.12) {
      scrollStickHoldStart = 0;
      scrollStickDirection = 0;
      return 0;
    }
    var direction = value > 0 ? 1 : -1;
    if (scrollStickDirection && direction !== scrollStickDirection && magnitude < 0.65) return 0;
    if (direction !== scrollStickDirection) {
      scrollStickDirection = direction;
      scrollStickHoldStart = now;
    }
    if (!scrollStickHoldStart) scrollStickHoldStart = now;
    var normalized = Math.min(1, (magnitude - 0.18) / 0.82);
    var holdRatio = Math.min(1, Math.max(0, now - scrollStickHoldStart) / 1400);
    var magnitudeCurve = Math.pow(normalized, 1.8);
    var holdCurve = Math.pow(holdRatio, 2.2);
    var speed = 1.5 + magnitudeCurve * 9 + holdCurve * 7;
    return direction * Math.min(17, speed);
  }
  function activeResourceViewerAtCursor() {
    var viewers = document.querySelectorAll('.resource-viewer:not(.is-leaving)');
    for (var i = 0; i < viewers.length; i++) {
      var rect = viewers[i].getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || window.getComputedStyle(viewers[i]).visibility === 'hidden') continue;
      if (cursorX < rect.left || cursorX > rect.right || cursorY < rect.top || cursorY > rect.bottom) continue;
      if (viewers[i]._resourceZoom && viewers[i].isConnected) return viewers[i];
    }
    return null;
  }
  function resetViewerTrigger(buttonIndex) {
    viewerTriggerHoldStart[buttonIndex] = 0;
    viewerTriggerLastStep[buttonIndex] = 0;
  }
  function resetViewerPanState() {
    viewerPanState.x.start = 0;
    viewerPanState.x.direction = 0;
    viewerPanState.y.start = 0;
    viewerPanState.y.direction = 0;
  }
  function viewerPanAxisSpeed(value, now, axisKey) {
    var state = viewerPanState[axisKey];
    var magnitude = Math.abs(Number(value) || 0);
    if (magnitude <= 0.12) {
      state.start = 0;
      state.direction = 0;
      return 0;
    }
    var direction = value > 0 ? 1 : -1;
    if (state.direction && direction !== state.direction && magnitude < 0.65) return 0;
    if (direction !== state.direction) {
      state.direction = direction;
      state.start = now;
    }
    if (!state.start) state.start = now;
    var normalized = Math.min(1, (magnitude - 0.18) / 0.82);
    var holdRatio = Math.min(1, Math.max(0, now - state.start) / 1200);
    var speed = 1 + Math.pow(normalized, 1.8) * 5 + Math.pow(holdRatio, 2.2) * 3.5;
    return direction * Math.min(9, speed);
  }
  function handleViewerZoomTrigger(buttonIndex, viewer, now, wasPressed, frameScale) {
    if (!viewer || !viewer._resourceZoom) return;
    var direction = buttonIndex === 7 ? 1 : -1;
    if (!wasPressed) {
      viewerTriggerHoldStart[buttonIndex] = now;
      viewerTriggerLastStep[buttonIndex] = now;
      viewer._resourceZoom.zoomBy(direction, 0.014 * frameScale);
      return;
    }
    var holdStart = viewerTriggerHoldStart[buttonIndex] || now;
    viewerTriggerHoldStart[buttonIndex] = holdStart;
    var holdRatio = Math.min(1, Math.max(0, now - holdStart) / 1300);
    var amount = Math.min(0.032, 0.012 + holdRatio * 0.018) * frameScale;
    viewer._resourceZoom.zoomBy(direction, amount);
  }
  function gamepadStartupInput() {
    if (!startupOverlay || startupOverlay.hidden || startupClosing) return false;
    if (startupAudioPending) {
      attemptStartupVideoPlay();
      return true;
    }
    if (startupLandingShown && !startupLeaving) {
      leaveStartupLanding();
      return true;
    }
    return false;
  }
  function runGamepadAction(actionId) {
    if (keyCaptureActionId) return;
    if (!startupEntryComplete || (startupOverlay && !startupOverlay.hidden)) return;
    if (document.querySelector('.minigame-overlay:not([hidden])')) return;
    if (loginOverlay && loginOverlay.classList.contains('show')) return;
    if (pauseMenu && pauseMenu.classList.contains('is-settings-open') &&
        (actionId === 'prevNav' || actionId === 'nextNav')) {
      moveSettingsTab(actionId === 'prevNav' ? -1 : 1);
      return;
    }
    performKeyAction(actionId);
  }
  function pollGamepads() {
    var now = performance.now();
    var frameScale = gamepadLastFrameTime
      ? Math.max(0.5, Math.min(2.5, (now - gamepadLastFrameTime) / 16.67))
      : 1;
    gamepadLastFrameTime = now;
    var nextPressed = {};
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var hadInput = false;
    for (var p = 0; p < pads.length; p++) {
      var pad = pads[p];
      if (!pad) continue;
      var axisX = pad.axes && pad.axes.length ? Number(pad.axes[0]) || 0 : 0;
      var axisY = pad.axes && pad.axes.length > 1 ? Number(pad.axes[1]) || 0 : 0;
      var axisRX = pad.axes && pad.axes.length > 2 ? Number(pad.axes[2]) || 0 : 0;
      var axisRY = pad.axes && pad.axes.length > 3 ? Number(pad.axes[3]) || 0 : 0;
      var stickActive = Math.abs(axisX) > 0.18 || Math.abs(axisY) > 0.18;
      var titlePanelOpen = isTitlePanelOpen();
      if (stickActive) {
        hadInput = true;
        if (pauseMenu && pauseMenu.classList.contains('is-settings-open') && Math.abs(axisX) > 0.25) {
          adjustSettingsWithStick(axisX, now);
        } else if (pauseMenu && pauseMenu.classList.contains('is-settings-open')) {
          resetSettingsStickAcceleration();
        } else if (titlePanelOpen && Math.abs(axisY) > 0.25) {
          moveTitleSelectionWithStick(axisY, now);
        } else if (titlePanelOpen) {
          resetTitleStickNavigation();
        } else if (pauseMenu && pauseMenu.classList.contains('open') && panelMenu && !panelMenu.hidden && Math.abs(axisY) > 0.55) {
          if (now - gamepadNavLastTime > 160) {
            gamepadNavLastTime = now;
            movePauseMenuSelection(axisY > 0 ? 1 : -1);
          }
        } else {
          moveCursorWithGamepad(
            gamepadCursorAxisSpeed(axisX, now) * frameScale,
            gamepadCursorAxisSpeed(axisY, now) * frameScale
          );
        }
      } else {
        resetCursorStickAcceleration();
        resetTitleStickNavigation();
      }
      if (!titlePanelOpen) resetTitleStickNavigation();
      var activeViewer = activeResourceViewerAtCursor();
      if (!activeViewer) {
        resetViewerPanState();
      }
      if (Math.abs(axisRX) > 0.18 || Math.abs(axisRY) > 0.18) {
        hadInput = true;
        if (activeViewer) {
          var panX = Math.abs(axisRX) > 0.12 ? -axisRX * 12 * frameScale : 0;
          var panY = Math.abs(axisRY) > 0.12 ? -axisRY * 12 * frameScale : 0;
          activeViewer._resourceZoom.panBy(
            Math.max(-18, Math.min(18, panX)),
            Math.max(-18, Math.min(18, panY))
          );
          gamepadScrollTarget = null;
        } else {
          scrollWithGamepad(gamepadScrollStickSpeed(axisRY, now) * frameScale);
        }
      } else {
        gamepadScrollTarget = null;
      }
      if (!pad.buttons) continue;
      for (var b = 0; b < pad.buttons.length; b++) {
        var padButton = pad.buttons[b];
        if (!gamepadButtonPressed(padButton)) {
          if (b === 6 || b === 7) {
            resetTriggerAcceleration(b);
            resetViewerTrigger(b);
          }
          continue;
        }
        hadInput = true;
        var stateKey = p + ':' + b;
        nextPressed[stateKey] = true;
        var wasPressed = !!gamepadPressedState[stateKey];
        if (b === 6 || b === 7) {
          if (!startupEntryComplete || (startupOverlay && !startupOverlay.hidden)) {
            setInputMode('gamepad');
            gamepadStartupInput();
          } else if (activeViewer) {
            handleViewerZoomTrigger(b, activeViewer, now, wasPressed, frameScale);
          } else {
            handleGamepadActivityTrigger(b, padButton, now, wasPressed);
          }
          continue;
        }
        if (wasPressed) continue;
        var actionId = GAMEPAD_ACTION_BY_BUTTON[b];
        if (!startupEntryComplete || (startupOverlay && !startupOverlay.hidden)) {
          setInputMode('gamepad');
          gamepadStartupInput();
        }
        else if (b === 0) gamepadPrimaryAction();
        else if (b === 1) gamepadBackAction();
        else if (b === 8 || (b === 17 && !isSwitchGamepad(pad))) runGamepadAction('pauseBack');
        else if (isSwitchGamepad(pad) && b === 16) runGamepadAction('pauseBack');
        else if (b === 9) runGamepadAction('openSettings');
        else if (b === 12) runGamepadDirection(-1);
        else if (b === 13) runGamepadDirection(1);
        else if ((b === 14 || b === 15) && pauseMenu && pauseMenu.classList.contains('is-settings-open')) {
          adjustSettingsSelection(b === 15 ? 1 : -1);
        }
        else if (actionId) runGamepadAction(actionId);
      }
    }
    if (hadInput) setInputMode('gamepad');
    gamepadPressedState = nextPressed;
    gamepadPollFrame = requestAnimationFrame(pollGamepads);
  }
  function initGamepadControls() {
    if (gamepadPollFrame || !navigator.getGamepads) return;
    gamepadPollFrame = requestAnimationFrame(pollGamepads);
  }

  // 登录弹窗
  function openLogin() {
    loginError.textContent = '';
    loginOverlay.classList.add('show');
    setTimeout(function () { loginUser.focus(); }, 100);
  }
  function closeLogin() {
    loginOverlay.classList.remove('show');
    loginPass.value = '';
  }


  loginCancel.addEventListener('click', closeLogin);
  loginLogout.addEventListener('click', function () {
    user.name = GUEST_NAME;
    user.isAdmin = false;
    user.media = '';
    clearSession();
    updateUserUI();
    closeLogin();
    closeSidebars();
  });
  loginOverlay.addEventListener('click', function (e) {
    if (e.target === loginOverlay) closeLogin();
  });

  function performLogin(username, password, errorEl) {
    var u = String(username || '').trim();
    var p = String(password || '');
    // 优先匹配 account.txt 账号数据：用户名 + 密码一致则切换为对应昵称
    var acc = (accountStore.accounts || []).filter(function (a) {
      return a.user === u && a.pass === p;
    })[0];
    if (acc) {
      user.name = acc.nick;
      user.isAdmin = false;
      user.media = acc.media || '';
      saveSession();
      updateUserUI();
      return true;
    }
    if (u === 'admin' && p === 'root') {
      user.name = 'admin';
      user.isAdmin = true;
      user.media = '';
      saveSession();
      updateUserUI();
      return true;
    }
    if (errorEl) errorEl.textContent = '账号或密码错误';
    return false;
  }

  function doLogin() {
    if (!performLogin(loginUser.value, loginPass.value, loginError)) return;
    closeLogin();
    closeSidebars();
  }
  loginSubmit.addEventListener('click', doLogin);
  loginPass.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doLogin();
  });

  function doInlineAccountLogin(event) {
    event.preventDefault();
    if (!accountLoginUser || !accountLoginPass) return;
    if (!performLogin(accountLoginUser.value, accountLoginPass.value, accountLoginError)) return;
    accountLoginPass.value = '';
    closeSidebars();
  }

  function clearInlineAccountLogin() {
    if (accountLoginUser) accountLoginUser.value = '';
    if (accountLoginPass) accountLoginPass.value = '';
    if (accountLoginError) accountLoginError.textContent = '';
    resetSidebarPanel();
  }

  function logoutInlineAccount() {
    user.name = GUEST_NAME;
    user.isAdmin = false;
    user.media = '';
    clearSession();
    updateUserUI();
    if (accountLoginUser) accountLoginUser.value = '';
    if (accountLoginPass) accountLoginPass.value = '';
    if (accountLoginError) accountLoginError.textContent = '';
    closeSidebars();
  }

  // 刷新后恢复登录态（localStorage 中的凭证），再渲染用户信息
  restoreSession();
  updateUserUI();

  /* ---------- 首页活动信息：已并入活动核心数据 ---------- */
  var LEGACY_INFO_KEY = 'fgexpig_info_v1';
  var LEGACY_INFO_MAGIC = 'FGEXPIG-INFO-BACKUP';

  function legacyInfoTags(value) {
    if (Array.isArray(value)) {
      return value.map(function (s) { return String(s || '').trim(); }).filter(Boolean);
    }
    return String(value || '').split(/[，,、]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // 将旧版首页信息合并到活动核心数据；只补空字段，不覆盖新 core.txt 数据
  function mergeLegacyInfoRows(infos) {
    if (typeof dataStore === 'undefined' || !dataStore) return false;
    if (!Array.isArray(dataStore.core)) dataStore.core = [];
    var core = dataStore.core;
    var changed = false;
    infos = infos || {};
    Object.keys(infos).forEach(function (id) {
      var info = infos[id] || {};
      var target = null;
      for (var i = 0; i < core.length; i++) {
        if (core[i] && core[i].id === id) { target = core[i]; break; }
      }
      if (!target) {
        target = { id: id, name: '', music: '', held: true, developer: '', publisher: '', releaseDate: '', tags: [] };
        core.push(target);
        changed = true;
      }
      if (!target.developer && info.developer) { target.developer = String(info.developer); changed = true; }
      if (!target.publisher && info.publisher) { target.publisher = String(info.publisher); changed = true; }
      if (!target.releaseDate && info.releaseDate) { target.releaseDate = String(info.releaseDate); changed = true; }
      var tags = legacyInfoTags(info.tags);
      if ((!target.tags || !target.tags.length) && tags.length) { target.tags = tags; changed = true; }
    });
    return changed;
  }

  function mergeLegacyInfoFromStorage() {
    var raw = '';
    try { raw = null || ''; } catch (e) {}
    if (!raw) return false;
    try {
      var parsed = JSON.parse(raw);
      var infos = (parsed && parsed.infos) || parsed || {};
      var changed = mergeLegacyInfoRows(infos);
      try { localStorage.removeItem(LEGACY_INFO_KEY); } catch (e) {}
      return changed;
    } catch (e) {}
    return false;
  }

  function importLegacyInfoBackup(text) {
    var m = String(text).match(/window\.FGEXPIG_INFO_BACKUP\s*=\s*(\{[\s\S]*\});/);
    if (!m) throw new Error('format');
    var payload = JSON.parse(m[1]);
    if (!payload || payload.magic !== LEGACY_INFO_MAGIC) throw new Error('magic');
    if (payload.checksum !== checksum(JSON.stringify(payload.data))) throw new Error('checksum');
    var infos = (payload.data && payload.data.infos) || {};
    mergeLegacyInfoRows(infos);
    return Object.keys(infos).length;
  }

  function releaseDateIsFuture(value) {
    var text = String(value || '').trim();
    if (!text) return false;
    var match = text.match(/(\d{4})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*日?/);
    if (!match) return false;
    var year = Number(match[1]);
    var month = Number(match[2]) - 1;
    var day = Number(match[3]);
    var release = new Date(year, month, day);
    if (isNaN(release.getTime()) ||
        release.getFullYear() !== year ||
        release.getMonth() !== month ||
        release.getDate() !== day) return false;
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return release.getTime() > today.getTime();
  }

  function infoOf(id) {
    var core = (typeof dataStore !== 'undefined' && dataStore && dataStore.core) || [];
    for (var i = 0; i < core.length; i++) {
      if (!core[i] || core[i].id !== id) continue;
      var info = core[i];
      var tags = legacyInfoTags(info.tags);
      if (!info.name && !info.developer && !info.publisher && !info.releaseDate && !tags.length) return null;
      return {
        id: info.id,
        name: info.name || '',
        developer: info.developer || '',
        publisher: info.publisher || '',
        releaseDate: info.releaseDate || '',
        tags: tags
      };
    }
    return null;
  }

  function activityTitle(id) {
    var info = infoOf(id);
    return info ? (info.name ? info.name : id) : id;
  }

  // 网页标题固定为站点名
  function pageTitle() {
    return SITE_NAME;
  }

  // 网页描述：活动数据已知时带上活动名，便于搜索引擎生成摘要
  function pageDescription(id) {
    var info = infoOf(id);
    var name = info && info.name ? info.name : '';
    return name ? (name + '（' + SITE_NAME + '）：活动预告、说明、成就、日程、测评与实绩资料。') : SITE_DESCRIPTION;
  }

  // 同步 <title> 与 description / og:title / og:description
  function applyPageMeta(id) {
    var title = pageTitle();
    var desc = pageDescription(id);
    document.title = title;
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', desc);
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);
    var ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', desc);
  }

  /* ---------- 测评数据：resources/<id>/review.txt（机构名：分数，测评文本） ---------- */
  var REVIEW_KEY = 'fgexpig_reviews_v1';
  var REVIEW_MAGIC = 'FGEXPIG-REVIEW-BACKUP';
  var reviewStore = { reviews: {} };
  var reviewFetchPromises = {};

  // 测评正文里的少量转义：\n 换行、\t 制表符、\\ 反斜杠（与热点内容的写法一致）
  // 想保留字面量就写 \\n，这样不会变成换行
  function decodeReviewEscapes(value) {
    var text = String(value == null ? '' : value);
    if (text.indexOf('\\') < 0) return text;
    var result = '';
    for (var i = 0; i < text.length; i += 1) {
      var ch = text.charAt(i);
      if (ch !== '\\') { result += ch; continue; }
      var next = text.charAt(i + 1);
      if (next === 'n') { result += '\n'; i += 1; continue; }
      if (next === 't') { result += '\t'; i += 1; continue; }
      if (next === '\\') { result += '\\'; i += 1; continue; }
      result += ch;
    }
    return result;
  }

  // 每行「机构名：分数，测评文本」或「机构名，分数，测评文本」
  // 正文里写 \n 就是换行（TXT 一行一条，所以多行正文只能这样写）
  // 每行一条测评：评测人：分数，评测文本；也支持英文冒号/逗号。
  // 多分类时以独占一行的 --- 分隔，每段第一行是分类名。
  function parseReviewRows(lines) {
    var rows = [];
    (lines || []).forEach(function (line) {
      line = String(line).trim();
      if (!line) return;
      var sep = line.search(/[：:,，]/);
      if (sep < 0) return;
      var org = line.slice(0, sep).trim();
      var rest = line.slice(sep + 1).trim();
      var sep2 = rest.search(/[：:,，]/);
      var score, reviewText;
      if (sep2 >= 0) {
        score = rest.slice(0, sep2).trim();
        reviewText = decodeReviewEscapes(rest.slice(sep2 + 1)).trim();
      } else {
        score = rest;
        reviewText = '';
      }
      if (org) rows.push({ org: org, score: score, text: reviewText });
    });
    return rows;
  }

  function parseReviewTxt(text) {
    var content = String(text).replace(/^\uFEFF/, '');
    var lines = content.split(/\r?\n/);
    var hasCategories = lines.some(function (line) {
      return /^\\?---\s*$/.test(line.trim());
    });
    if (!hasCategories) return parseReviewRows(lines);

    var groups = [];
    var blockLines = [];
    function appendGroup() {
      var currentLines = blockLines.slice();
      blockLines = [];
      while (currentLines.length && !String(currentLines[0]).trim()) currentLines.shift();
      if (!currentLines.length) return;
      var categoryName = String(currentLines.shift()).trim();
      var rows = parseReviewRows(currentLines);
      if (categoryName && rows.length) groups.push({ name: categoryName, reviews: rows });
    }
    lines.forEach(function (line) {
      if (/^\\?---\s*$/.test(line.trim())) {
        appendGroup();
        return;
      }
      blockLines.push(line);
    });
    appendGroup();
    return groups.length ? groups : parseReviewRows(lines);
  }

  function saveReviews() { try { void 0 && localStorage.setItem(REVIEW_KEY, JSON.stringify(reviewStore)); } catch (e) {} }
  function loadReviews() {
    try { var raw = null; if (raw) { reviewStore = JSON.parse(raw); return true; } } catch (e) {}
    return false;
  }
  function applyReviewData(id) {
    var meta = document.getElementById('reviewMeta');
    if (!meta) return;
    if (id) {
      // 指定活动：显示该活动的测评条数
      var n = reviewCountOf(id);
      meta.textContent = n ? ('已加载 ' + n + ' 条测评') : '未加载';
    } else {
      // 全部：显示有测评数据的活动数
      var total = Object.keys(reviewStore.reviews || {}).length;
      meta.textContent = total ? ('已加载 ' + total + ' 个活动测评') : '未加载';
    }
  }
  function reviewsOf(id) { return (reviewStore.reviews || {})[id] || []; }
  function reviewGroupsOf(id) {
    var rows = reviewsOf(id);
    var hasGroups = rows.some(function (row) {
      return !!(row && typeof row === 'object' && !Array.isArray(row) && Array.isArray(row.reviews));
    });
    if (!hasGroups) return [{ name: '', reviews: rows }];
    return rows.map(function (row) {
      if (!row || typeof row !== 'object' || !Array.isArray(row.reviews)) return null;
      return { name: String(row.name || row.category || '').trim(), reviews: row.reviews };
    }).filter(Boolean);
  }

  function reviewCountOf(id) {
    return reviewGroupsOf(id).reduce(function (total, group) {
      return total + ((group && group.reviews) || []).length;
    }, 0);
  }

  function reviewScoreValue(score) {
    var raw = String(score === undefined || score === null ? '' : score).trim();
    if (!raw) return null;
    var value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
  }

  function reviewScoreBand(score) {
    var value = reviewScoreValue(score);
    if (value === null) return 'none';
    if (value >= 90) return 'positive';
    if (value >= 80) return 'mixed';
    return 'negative';
  }

  function reviewScoreLabel(score) {
    var value = reviewScoreValue(score);
    if (value === null) return '暂无评分';
    if (value >= 95) return '普遍赞誉';
    if (value >= 90) return '总体好评';
    if (value >= 80) return '褒贬不一';
    if (value >= 70) return '总体差评';
    return '极度厌恶';
  }

  function reviewScoreClass(score) {
    var band = reviewScoreBand(score);
    return band === 'none' ? 'review-score-none' : 'review-score-' + band;
  }

  function reviewProgressValue(score) {
    var value = reviewScoreValue(score);
    if (value === null || value <= 60) return 0;
    if (value >= 100) return 100;
    return ((value - 60) / 40) * 100;
  }

  function reviewTextOf(review) {
    var text = String(review && review.text !== undefined && review.text !== null ? review.text : '').trim();
    return text === '无' ? '' : text;
  }

  // 段落字数（按汉字计）：1 个汉字/全角字符 = 1，字母、数字等半角字符 = 0.5
  // 也就是题目里的「1 汉字 = 2 字母」
  function reviewParagraphWeight(text) {
    var units = graphemesOf(String(text == null ? '' : text));
    var total = 0;
    for (var i = 0; i < units.length; i += 1) {
      var unit = units[i];
      if (/^\s+$/u.test(unit)) continue;
      total += LARGE_TEXT_GRAPHEME_RE.test(unit) ? 1 : 0.5;
    }
    return total;
  }

  function reviewStats(reviews) {
    var stats = { count: 0, average: null, positive: 0, mixed: 0, negative: 0 };
    var sum = 0;
    (reviews || []).forEach(function (review) {
      var value = reviewScoreValue(review && review.score);
      if (value === null) return;
      stats.count += 1;
      sum += value;
      stats[reviewScoreBand(value)] += 1;
    });
    if (stats.count >= 4) stats.average = Math.round(sum / stats.count);
    return stats;
  }

  function compareReviewsByScore(a, b) {
    var aHasText = reviewTextOf(a) ? 1 : 0;
    var bHasText = reviewTextOf(b) ? 1 : 0;
    if (aHasText !== bHasText) return bHasText - aHasText;
    var aScore = reviewScoreValue(a && a.score);
    var bScore = reviewScoreValue(b && b.score);
    if (aScore !== bScore) return (bScore === null ? -1 : bScore) - (aScore === null ? -1 : aScore);
    var aOrg = String((a && a.org) || '').trim();
    var bOrg = String((b && b.org) || '').trim();
    var initialOrder = aOrg.charAt(0).localeCompare(bOrg.charAt(0), 'zh-CN', { sensitivity: 'base' });
    if (initialOrder) return initialOrder;
    return aOrg.localeCompare(bOrg, 'zh-CN', { sensitivity: 'base' });
  }

  function personalReviewFor(id) {
    var media = String((typeof user !== 'undefined' && user && user.media) || '').trim().toLowerCase();
    if (!media) return null;
    var groups = reviewGroupsOf(id);
    for (var g = 0; g < groups.length; g++) {
      var reviews = (groups[g] && groups[g].reviews) || [];
      for (var i = 0; i < reviews.length; i++) {
        var review = reviews[i] || {};
        if (String(review.org || '').trim().toLowerCase() !== media) continue;
        if (reviewScoreValue(review.score) === null) return null;
        return review;
      }
    }
    return null;
  }
  function refreshReviewPersonalScore() {
    var card = document.querySelector('.page.active .page-section.active .home-review-card');
    if (!card) return;
    var valueEl = card.querySelector('.review-personal-value');
    var ringEl = card.querySelector('.review-personal-ring');
    var labelEl = card.querySelector('.review-personal-label');
    if (!valueEl || !ringEl || !labelEl) return;
    var review = personalReviewFor(card.dataset.activityId);
    var value = review ? reviewScoreValue(review.score) : null;
    valueEl.textContent = value === null ? '' : String(value);
    labelEl.textContent = value === null ? '暂无评分' : reviewScoreLabel(value);
    var band = reviewScoreBand(value);
    labelEl.className = 'review-score-tier review-personal-label' + (band === 'none' ? '' : ' review-score-text-' + band);
    ringEl.className = 'review-personal-ring ' + reviewScoreClass(value);
  }

  function exportReview(id) {
    var data = {}; data[id] = reviewsOf(id);
    var payload = { magic: REVIEW_MAGIC, version: DATA_VERSION, exportedAt: new Date().toISOString(), data: data };
    payload.checksum = checksum(JSON.stringify(data));
    var content = '/* FGEXPIG 测评数据备份(' + id + ')（自动生成）\n * 导出时间: ' + payload.exportedAt + '\n */\nwindow.FGEXPIG_REVIEW_BACKUP = ' + JSON.stringify(payload, null, 2) + ';\n';
    var blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fgexpig_review_' + id + '.js';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }
  function importReviewFile(id, file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      try {
        if (/\.js$/i.test(file.name) && text.indexOf(REVIEW_MAGIC) >= 0) {
          var m = text.match(/window\.FGEXPIG_REVIEW_BACKUP\s*=\s*(\{[\s\S]*\});/);
          if (!m) throw new Error('format');
          var payload = JSON.parse(m[1]);
          if (!payload || payload.magic !== REVIEW_MAGIC) throw new Error('magic');
          if (payload.checksum !== checksum(JSON.stringify(payload.data))) throw new Error('checksum');
          Object.assign(reviewStore.reviews, payload.data);
        } else {
          var rows = parseReviewTxt(text);
          if (!rows.length) throw new Error('empty');
          if (!reviewStore.reviews) reviewStore.reviews = {};
          reviewStore.reviews[id] = rows;
        }
        saveReviews(); applyReviewData(id);
        alert('导入成功：' + id + ' 共 ' + reviewCountOf(id) + ' 条测评');
      } catch (err) {
        alert('导入失败：' + (err.message === 'checksum' ? '校验未通过' : err.message === 'empty' ? '未解析到有效数据' : '文件格式错误'));
      }
    };
    reader.readAsText(file);
  }
  // 从 resources/<id>/review.txt 加载（仅当缓存无数据时）
  function fetchReview(id) {
    return loadDataFragment('review', id);
  }

  var SHOP_KEY = 'fgexpig_shops_v2';
  var SHOP_MAGIC = 'FGEXPIG-SHOP-BACKUP';
  var SHOP_VERSION = 2;
  var shopStore = { shops: {} };
  var shopFilePromise = null;

  function shopText(value) {
    return value === undefined || value === null ? '' : String(value).replace(/\r?\n/g, ' ').trim();
  }

  function fallbackCopyText(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, area.value.length);
    var copied = false;
    try { copied = document.execCommand('copy'); } catch (e) {}
    area.remove();
    return copied;
  }

  function copyPlainText(text) {
    text = String(text || '');
    if (!text) return Promise.resolve(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text)
        .then(function () { return true; })
        .catch(function () { return fallbackCopyText(text); });
    }
    return Promise.resolve(fallbackCopyText(text));
  }

  function shopContentList(value) {
    if (Array.isArray(value)) return value.map(shopText).filter(Boolean);
    return String(value || '').split(/[，,]/).map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function normalizeShopCodes(codes) {
    var normalized = {};
    if (!codes || typeof codes !== 'object' || Array.isArray(codes)) return normalized;
    Object.keys(codes).forEach(function (name) {
      var key = shopText(name);
      if (key) normalized[key] = shopText(codes[name]);
    });
    return normalized;
  }

  function normalizeShopItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(function (item) {
      item = item || {};
      return {
        name: shopText(item.name),
        price: shopText(item.price).replace(/^￥\s*/, ''),
        contents: shopContentList(item.contents)
      };
    }).filter(function (item) { return item.name; });
  }

  function normalizeShopRecord(row) {
    row = row || {};
    return {
      versions: normalizeShopItems(row.versions),
      dlcs: normalizeShopItems(row.dlcs || row.dlc),
      codes: normalizeShopCodes(row.codes)
    };
  }

  function shopRowsFromTxt(text) {
    var content = String(text).replace(/^\uFEFF/, '').trim();
    if (!content) return [];
    return content.split(/\n\s*\n/).map(function (block) {
      var lines = block.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
      if (!lines.length) return null;
      var id = lines.shift();
      if (!id) return null;
      var versions = [];
      var dlcs = [];
      var codes = {};
      lines.forEach(function (line) {
        var purchaseMatch = line.match(/^(.+?)\s*￥\s*([^：:]*)\s*[：:]\s*(.*)$/);
        if (purchaseMatch) {
          var item = {
            name: purchaseMatch[1].trim(),
            price: purchaseMatch[2].trim().replace(/^￥\s*/, ''),
            contents: shopContentList(purchaseMatch[3])
          };
          if (/版$/.test(item.name)) versions.push(item);
          else dlcs.push(item);
          return;
        }
        var sep = line.search(/[：:]/);
        if (sep < 0) return;
        var name = line.slice(0, sep).trim();
        if (name) codes[name] = line.slice(sep + 1).trim();
      });
      var record = normalizeShopRecord({ versions: versions, dlcs: dlcs, codes: codes });
      return { id: id, versions: record.versions, dlcs: record.dlcs, codes: record.codes };
    }).filter(Boolean);
  }

  function saveShops() { try { void 0 && localStorage.setItem(SHOP_KEY, JSON.stringify(shopStore)); } catch (e) {} }
  function loadShops() {
    try {
      var raw = null;
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.shops) return false;
      Object.keys(parsed.shops).forEach(function (id) {
        parsed.shops[id] = normalizeShopRecord(parsed.shops[id]);
      });
      shopStore = parsed;
      return true;
    } catch (e) {}
    return false;
  }

  function shopOf(id) { return (shopStore.shops || {})[id] || null; }
  function hasShop(id) { return !!(shopStore.shops && Object.prototype.hasOwnProperty.call(shopStore.shops, id)); }

  function applyShopData(id) {
    var meta = document.getElementById('shopMeta');
    if (!meta) return;
    if (id) {
      var shop = shopOf(id);
      var versionCount = shop && shop.versions ? shop.versions.length : 0;
      var dlcCount = shop && shop.dlcs ? shop.dlcs.length : 0;
      var codeCount = shop && shop.codes ? Object.keys(shop.codes).length : 0;
      meta.textContent = hasShop(id)
        ? ('已加载 ' + versionCount + ' 个版本 · ' + dlcCount + ' 个 DLC · ' + codeCount + ' 个内容代码')
        : '未加载';
    } else {
      var total = Object.keys(shopStore.shops || {}).length;
      meta.textContent = total ? ('已加载 ' + total + ' 个活动商店') : '未加载';
    }
    schedulePauseLeaderboardRender();
    refreshUserExperience();
  }

  function exportShopData() {
    var data = {};
    Object.keys(shopStore.shops || {}).forEach(function (id) {
      data[id] = normalizeShopRecord(shopStore.shops[id]);
    });
    var payload = {
      magic: SHOP_MAGIC,
      version: SHOP_VERSION,
      exportedAt: new Date().toISOString(),
      data: data
    };
    payload.checksum = checksum(JSON.stringify(data));
    var content = '/* FGEXPIG 活动商店数据备份（自动生成）\n * 导出时间: ' + payload.exportedAt + '\n */\nwindow.FGEXPIG_SHOP_BACKUP = ' + JSON.stringify(payload, null, 2) + ';\n';
    var blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fgexpig_shop.js';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }

  function importShopDataFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      try {
        var nextShops = {};
        if (/\.js$/i.test(file.name) && text.indexOf(SHOP_MAGIC) >= 0) {
          var m = text.match(/window\.FGEXPIG_SHOP_BACKUP\s*=\s*(\{[\s\S]*\});/);
          if (!m) throw new Error('format');
          var payload = JSON.parse(m[1]);
          if (!payload || payload.magic !== SHOP_MAGIC) throw new Error('magic');
          if (payload.checksum !== checksum(JSON.stringify(payload.data))) throw new Error('checksum');
          Object.keys(payload.data || {}).forEach(function (id) {
            nextShops[id] = normalizeShopRecord(payload.data[id]);
          });
        } else {
          var rows = shopRowsFromTxt(text);
          if (!rows.length) throw new Error('empty');
          rows.forEach(function (row) {
            nextShops[row.id] = normalizeShopRecord(row);
          });
        }
        shopStore = { shops: nextShops };
        saveShops();
        applyShopData();
        alert('导入成功：共 ' + Object.keys(shopStore.shops).length + ' 个活动商店');
      } catch (err) {
        alert('导入失败：' + (err.message === 'checksum' ? '校验未通过' : err.message === 'empty' ? '未解析到有效商店数据' : '文件格式错误'));
      }
    };
    reader.readAsText(file);
  }

  // 首次需要商店数据时读取全局 resources/shop.txt；空数据块也会记录，避免重复请求
  function fetchShop(id) {
    return loadDataFragment('shop', '');
  }

  var LIBRARY_KEY = 'fgexpig_library_v2';
  var LIBRARY_MAGIC = 'FGEXPIG-LIBRARY-BACKUP';
  var LIBRARY_VERSION = 1;
  var libraryStore = { libraries: {} };
  var libraryFilePromise = null;

  function libraryText(value) {
    return value === undefined || value === null ? '' : String(value).replace(/\r?\n/g, ' ').trim();
  }

  function libraryKey(name) { return libraryText(name).toLowerCase(); }

  function normalizeLibraryRecord(row) {
    row = row || {};
    var source = Array.isArray(row) ? row : (row.entries || []);
    return {
      name: libraryText(row.name),
      entries: source.map(function (entry) {
        entry = entry || {};
        return { id: libraryText(entry.id), version: libraryText(entry.version) };
      }).filter(function (entry) { return entry.id && entry.version; })
    };
  }

  function libraryRowsFromTxt(text) {
    return String(text).replace(/^\uFEFF/, '').split(/\r?\n/).map(function (line) {
      line = line.trim();
      if (!line) return null;
      var parts = line.split(/[，,]/).map(function (part) { return part.trim(); });
      var name = parts.shift();
      if (!name) return null;
      var entries = [];
      parts.forEach(function (part) {
        if (!part) return;
        var match = part.match(/^([A-Za-z]+\d+)(.+)$/);
        if (match) entries.push({ id: match[1], version: match[2] });
      });
      return { name: name, entries: entries };
    }).filter(Boolean);
  }

  function saveLibrary() { try { void 0 && localStorage.setItem(LIBRARY_KEY, JSON.stringify(libraryStore)); } catch (e) {} }
  function loadLibrary() {
    try {
      var raw = null;
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.libraries) return false;
      var normalized = {};
      Object.keys(parsed.libraries).forEach(function (key) {
        var record = normalizeLibraryRecord(parsed.libraries[key]);
        var normalizedKey = libraryKey(record.name || key);
        if (normalizedKey) normalized[normalizedKey] = record;
      });
      libraryStore = { libraries: normalized };
      return true;
    } catch (e) {}
    return false;
  }

  function libraryRecordFor(name) {
    return ((libraryStore && libraryStore.libraries) || {})[libraryKey(name)] || null;
  }

  function libraryVersionsOf(id) {
    var record = libraryRecordFor(user && user.name);
    if (!record) return [];
    var seen = {};
    return (record.entries || []).filter(function (entry) {
      if (entry.id !== id || !entry.version || seen[entry.version]) return false;
      seen[entry.version] = true;
      return true;
    }).map(function (entry) { return entry.version; });
  }

  function libraryHasItem(id, name) {
    var target = libraryText(name).toLowerCase();
    if (!target) return false;
    return libraryVersionsOf(id).some(function (item) {
      return libraryText(item).toLowerCase() === target;
    });
  }

  function libraryOwnersOf(id, versionName) {
    var target = libraryText(versionName).toLowerCase();
    if (!id || !target) return [];
    var owners = [];
    var libraries = (libraryStore && libraryStore.libraries) || {};
    Object.keys(libraries).forEach(function (key) {
      var record = normalizeLibraryRecord(libraries[key]);
      var ownsVersion = (record.entries || []).some(function (entry) {
        return entry.id === id && libraryText(entry.version).toLowerCase() === target;
      });
      if (ownsVersion) owners.push(record.name || key);
    });
    return owners;
  }

  function libraryRecordOwnsShopItem(record, id, item, shop) {
    if (!record || !item) return false;
    var targetName = libraryText(item.name).toLowerCase();
    var ownedNames = (record.entries || []).filter(function (entry) {
      return entry.id === id;
    }).map(function (entry) {
      return libraryText(entry.version).toLowerCase();
    });
    if (!ownedNames.length) return false;
    if (targetName && ownedNames.indexOf(targetName) >= 0) return true;

    var required = (item.contents || []).map(function (value) {
      return libraryText(value).toLowerCase();
    }).filter(Boolean);
    if (!required.length) return false;

    var ownedContent = {};
    var allItems = ((shop && shop.versions) || []).concat((shop && shop.dlcs) || []);
    allItems.forEach(function (candidate) {
      if (ownedNames.indexOf(libraryText(candidate.name).toLowerCase()) < 0) return;
      (candidate.contents || []).forEach(function (content) {
        ownedContent[libraryText(content).toLowerCase()] = true;
      });
    });
    return required.every(function (content) { return ownedContent[content]; });
  }

  function libraryOwnsShopItem(id, item, shop) {
    if (!item) return true;
    return libraryRecordOwnsShopItem(libraryRecordFor(user && user.name), id, item, shop);
  }

  function libraryOwnersOfItem(id, item, shop) {
    var owners = [];
    var libraries = (libraryStore && libraryStore.libraries) || {};
    Object.keys(libraries).forEach(function (key) {
      var record = normalizeLibraryRecord(libraries[key]);
      if (libraryRecordOwnsShopItem(record, id, item, shop)) owners.push(record.name || key);
    });
    return owners;
  }

  function makeLibraryBar(id) {
    // 顶部库存条只展示本体版本，DLC 的持有状态显示在对应购买卡片上
    var versions = libraryVersionsOf(id).filter(function (name) { return /版$/.test(name); });
    var owned = versions.length > 0;
    var ownedBar = document.createElement('button');
    ownedBar.type = 'button';
    ownedBar.className = 'shop-owned-bar ' + (owned ? 'is-owned' : 'is-unowned');
    var ownedText = document.createElement('span');
    ownedText.className = 'shop-owned-text';
    ownedText.textContent = owned
      ? '您已拥有' + versions.join('、')
      : '您尚未拥有此项目';
    ownedBar.appendChild(ownedText);
    return ownedBar;
  }

  function refreshHomeLibraryBar() {
    var card = document.querySelector('.page.active .page-section.active .home-detail-card');
    if (!card) return;
    var infoCard = card.querySelector('.home-info-card');
    if (!infoCard) return;
    var existing = infoCard.querySelector('.shop-owned-bar');
    if (existing) existing.remove();
    var next = makeLibraryBar(card.dataset.activityId);
    if (next) infoCard.appendChild(next);
    invalidateCursorTargetCache();
  }

  function applyLibraryData() {
    var meta = document.getElementById('libraryMeta');
    var libraries = Object.keys((libraryStore && libraryStore.libraries) || {}).length;
    var entries = 0;
    Object.keys((libraryStore && libraryStore.libraries) || {}).forEach(function (key) {
      entries += ((libraryStore.libraries[key] && libraryStore.libraries[key].entries) || []).length;
    });
    if (meta) meta.textContent = libraries ? ('已加载 ' + libraries + ' 个成员库存 · ' + entries + ' 个商品') : '未加载';
    refreshHomeLibraryBar();
    refreshUserExperience();
  }

  function exportLibraryData() {
    var data = {};
    Object.keys(libraryStore.libraries || {}).forEach(function (key) {
      data[key] = normalizeLibraryRecord(libraryStore.libraries[key]);
    });
    var payload = {
      magic: LIBRARY_MAGIC,
      version: LIBRARY_VERSION,
      exportedAt: new Date().toISOString(),
      data: data
    };
    payload.checksum = checksum(JSON.stringify(data));
    var content = '/* FGEXPIG 活动库存数据备份（自动生成）\n * 导出时间: ' + payload.exportedAt + '\n */\nwindow.FGEXPIG_LIBRARY_BACKUP = ' + JSON.stringify(payload, null, 2) + ';\n';
    var blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fgexpig_library.js';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }

  function importLibraryDataFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      try {
        var nextLibraries = {};
        if (/\.js$/i.test(file.name) && text.indexOf(LIBRARY_MAGIC) >= 0) {
          var m = text.match(/window\.FGEXPIG_LIBRARY_BACKUP\s*=\s*(\{[\s\S]*\});/);
          if (!m) throw new Error('format');
          var payload = JSON.parse(m[1]);
          if (!payload || payload.magic !== LIBRARY_MAGIC) throw new Error('magic');
          if (payload.checksum !== checksum(JSON.stringify(payload.data))) throw new Error('checksum');
          Object.keys(payload.data || {}).forEach(function (key) {
            var record = normalizeLibraryRecord(payload.data[key]);
            var normalizedKey = libraryKey(record.name || key);
            if (normalizedKey) nextLibraries[normalizedKey] = record;
          });
        } else {
          var rows = libraryRowsFromTxt(text);
          if (!rows.length) throw new Error('empty');
          rows.forEach(function (row) {
            var key = libraryKey(row.name);
            if (key) nextLibraries[key] = normalizeLibraryRecord(row);
          });
        }
        libraryStore = { libraries: nextLibraries };
        saveLibrary();
        applyLibraryData();
        alert('导入成功：共 ' + Object.keys(libraryStore.libraries).length + ' 个成员库存');
      } catch (err) {
        alert('导入失败：' + (err.message === 'checksum' ? '校验未通过' : err.message === 'empty' ? '未解析到有效库存数据' : '文件格式错误'));
      }
    };
    reader.readAsText(file);
  }

  function fetchLibrary() {
    return loadDataFragment('library', '');
  }

  var ACHV_KEY = 'fgexpig_achv_v1';
  var ACHV_MAGIC = 'FGEXPIG-ACHV-BACKUP';
  var ACHV_VERSION = 2;
  var achvStore = { achievements: {} };
  var achvFetchPromises = {};
  var ACHV_RANK_ORDER = ['幻彩', '紫金', '铂金', '黄金', '白银', '青铜'];
  var ACHV_RANK_ALIASES = {
    '彩': '幻彩', '彩虹': '幻彩', '幻彩': '幻彩', '白金': '幻彩',
    '黑': '紫金', '黑金': '紫金', '紫金': '紫金', '铂': '铂金', '铂金': '铂金', '金': '黄金', '黄金': '黄金',
    '银': '白银', '白银': '白银', '铜': '青铜', '青铜': '青铜'
  };
  function normalizeAchvRarity(r) {
    var key = String(r || '').trim();
    return ACHV_RANK_ALIASES[key] || key || '青铜';
  }

  function normalizeAchvRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(function (a) {
      a = a || {};
      return {
        rarity: normalizeAchvRarity(a.rarity),
        name: String(a.name || '').trim(),
        desc: String(a.desc || '').trim(),
        group: String(a.group || '').trim(),
        earned: a.earned !== false
      };
    }).filter(function (a) { return a.name; });
  }

  function parseAchvTxt(text) {
    var rows = [];
    var currentGroup = '';
    String(text).split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var groupMatch = line.match(/^《([^》]+)》\s*(.*)$/);
      if (groupMatch) {
        currentGroup = groupMatch[1].trim();
        line = groupMatch[2].trim();
        if (!line) return;
      }
      var rarity = '', name = line, desc = '';
      var m = line.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (m) { rarity = m[1].trim(); name = m[2]; }
      var sep = name.search(/[：:]/);
      if (sep >= 0) {
        desc = name.slice(sep + 1).trim();
        name = name.slice(0, sep).trim();
      }
      if (name) rows.push({
        rarity: normalizeAchvRarity(rarity),
        name: name,
        desc: desc,
        group: currentGroup,
        earned: true
      });
    });
    return rows;
  }

  function saveAchv() { try { void 0 && localStorage.setItem(ACHV_KEY, JSON.stringify(achvStore)); } catch (e) {} }
  function loadAchv() {
    try {
      var raw = null;
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.achievements) throw new Error('format');
      Object.keys(parsed.achievements).forEach(function (id) {
        parsed.achievements[id] = normalizeAchvRows(parsed.achievements[id]);
      });
      achvStore = parsed;
      return true;
    } catch (e) {}
    return false;
  }

  function achvsOf(id) { return normalizeAchvRows((achvStore.achievements || {})[id] || []); }

  function achvGroupsOf(rows) {
    rows = normalizeAchvRows(rows);
    var hasNamed = rows.some(function (a) { return !!a.group; });
    if (!hasNamed) return [{ name: '', named: false, achievements: rows }];
    var groups = [];
    var byName = Object.create(null);
    function bucket(name, named) {
      var key = named ? name : '\u0000ungrouped';
      if (!byName[key]) {
        byName[key] = { name: name || '其他奖杯', named: !!named, achievements: [] };
        groups.push(byName[key]);
      }
      return byName[key];
    }
    rows.forEach(function (a) {
      bucket(a.group, !!a.group).achievements.push(a);
    });
    groups.sort(function (a, b) {
      if (!a.named && b.named) return 1;
      if (a.named && !b.named) return -1;
      return 0;
    });
    return groups;
  }

  function achvGroupCount(rows) {
    return achvGroupsOf(rows).filter(function (g) { return g.named; }).length;
  }

  function achvSummaryKey(rarity) {
    var rank = normalizeAchvRarity(rarity);
    if (rank === '幻彩') return 'platinum';
    if (rank === '紫金' || rank === '铂金' || rank === '黄金') return 'gold';
    if (rank === '白银') return 'silver';
    return 'bronze';
  }

  function achvSummaryOf(rows) {
    var stats = { total: rows.length, earned: 0, percent: 0, counts: { platinum: 0, gold: 0, silver: 0, bronze: 0 } };
    rows.forEach(function (a) {
      if (a.earned !== false) stats.earned++;
      stats.counts[achvSummaryKey(a.rarity)]++;
    });
    stats.percent = stats.total ? Math.round(stats.earned * 100 / stats.total) : 0;
    return stats;
  }

  function applyAchvData(id) {
    var meta = document.getElementById('achvMeta');
    if (!meta) return;
    if (id) {
      var rows = achvsOf(id);
      var groupCount = achvGroupCount(rows);
      meta.textContent = rows.length
        ? ('已加载 ' + rows.length + ' 个成就' + (groupCount ? ' · ' + groupCount + ' 个奖杯组' : ''))
        : '未加载';
    } else {
      var total = Object.keys(achvStore.achievements || {}).length;
      meta.textContent = total ? ('已加载 ' + total + ' 个活动成就') : '未加载';
    }
  }

  function achvIconOriginalUrl(id, name) {
    return 'resources/' + id + '/icons/' + encodeURIComponent(name) + '.png';
  }

  function exportAchv(id) {
    var rows = achvsOf(id);
    var data = {};
    data[id] = rows;
    var groupMeta = achvGroupsOf(rows).filter(function (g) { return g.named; }).map(function (g) {
      return { name: g.name, count: g.achievements.length };
    });
    var payload = {
      magic: ACHV_MAGIC,
      version: ACHV_VERSION,
      exportedAt: new Date().toISOString(),
      groupFormat: '《奖杯组》',
      groups: groupMeta,
      data: data
    };
    payload.checksum = checksum(JSON.stringify(data));
    var content = '/* FGEXPIG 成就数据备份(' + id + '，含奖杯组)（自动生成）\n * 导出时间: ' + payload.exportedAt + '\n * 奖杯组格式: 《奖杯组》\n */\nwindow.FGEXPIG_ACHV_BACKUP = ' + JSON.stringify(payload, null, 2) + ';\n';
    var blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fgexpig_achv_' + id + '.js';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }

  function importAchvFile(id, file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      try {
        if (/\.js$/i.test(file.name) && text.indexOf(ACHV_MAGIC) >= 0) {
          var m = text.match(/window\.FGEXPIG_ACHV_BACKUP\s*=\s*(\{[\s\S]*\});/);
          if (!m) throw new Error('format');
          var payload = JSON.parse(m[1]);
          if (!payload || payload.magic !== ACHV_MAGIC) throw new Error('magic');
          if (payload.checksum !== checksum(JSON.stringify(payload.data))) throw new Error('checksum');
          if (!achvStore.achievements) achvStore.achievements = {};
          Object.keys(payload.data || {}).forEach(function (key) {
            achvStore.achievements[key] = normalizeAchvRows(payload.data[key]);
          });
        } else {
          var rows = parseAchvTxt(text);
          if (!rows.length) throw new Error('empty');
          if (!achvStore.achievements) achvStore.achievements = {};
          achvStore.achievements[id] = rows;
        }
        saveAchv();
        applyAchvData(id);
        var count = achvsOf(id).length;
        var groupCount = achvGroupCount(achvsOf(id));
        alert('导入成功：' + id + ' 共 ' + count + ' 条成就' + (groupCount ? '，' + groupCount + ' 个奖杯组' : ''));
      } catch (err) {
        alert('导入失败：' + (err.message === 'checksum' ? '校验未通过' : err.message === 'empty' ? '未解析到有效数据' : '文件格式错误'));
      }
    };
    reader.readAsText(file);
  }

  // 从 resources/<id>/achievements.txt 加载（仅当缓存无数据时）
  function fetchAchv(id) {
    return loadDataFragment('achievements', id);
  }

  /* ---------- 数据系统：活动核心数据（core.txt 数据源 + txt/js 导入导出） ---------- */
  var DATA_KEY = 'fgexpig_data_v1';
  var DATA_MAGIC = 'FGEXPIG-BACKUP';
  var DATA_VERSION = 2;
  var dataStore = { core: [] };

  function coreText(value) {
    return value === undefined || value === null ? '' : String(value).replace(/\r?\n/g, ' ').trim();
  }

  function coreTags(value) {
    if (Array.isArray(value)) {
      return value.map(coreText).filter(Boolean);
    }
    return String(value || '').split(/[，,、]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function coreHeld(value) {
    return coreDisplay(value) !== 0;
  }

  function coreDisplay(value) {
    if (value === undefined || value === null || value === '') return 1;
    if (value === false) return 0;
    if (value === true) return 1;
    var normalized = String(value).trim().toLowerCase();
    if (normalized === '11') return 11;
    if (normalized === '0' || normalized === 'false' || normalized === '否') return 0;
    return 1;
  }

  function normalizeCoreRow(row) {
    row = row || {};
    var id = coreText(row.id);
    if (!id) return null;
    var display = coreDisplay(
      row.display !== undefined ? row.display : (row.defaultSelected === true ? 11 : row.held)
    );
    return {
      id: id,
      name: coreText(row.name || row.title),
      englishName: coreText(row.englishName || row.nameEn || row.enName),
      music: coreText(row.music),
      held: display !== 0,
      display: display,
      defaultSelected: display === 11,
      developer: coreText(row.developer),
      publisher: coreText(row.publisher),
      releaseDate: coreText(row.releaseDate),
      tags: coreTags(row.tags)
    };
  }

  function normalizeCoreRows(rows) {
    if (!Array.isArray(rows)) rows = rows ? [rows] : [];
    return rows.map(normalizeCoreRow).filter(Boolean);
  }

  function coreRowFromLegacyLine(line) {
    var parts = String(line).split(/[，,]/).map(function (s) { return s.trim(); });
    if (parts.length < 3 || !parts[0]) return null;
    var display = 1;
    var musicParts = parts.slice(2);
    var last = parts[parts.length - 1];
    if (last === '0' || last === '1' || last === '11') {
      display = Number(last);
      musicParts = parts.slice(2, parts.length - 1);
    }
    return normalizeCoreRow({
      id: parts[0],
      name: parts[1],
      music: musicParts.join('，'),
      display: display
    });
  }

  function coreRowFromBlock(block) {
    var lines = String(block).split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    if (!lines.length) return null;
    var id = lines.shift().replace(/^活动ID\s*[：:]\s*/, '').trim();
    if (!id) return null;
    var row = { id: id, name: '', englishName: '', music: '', held: true, display: 1, developer: '', publisher: '', releaseDate: '', tags: [] };
    lines.forEach(function (line) {
      var m = line.match(/^(中文名|英文名|音乐|显示|开发商|发行商|发行日期|标签)\s*[：:]\s*(.*)$/);
      if (!m) return;
      var key = m[1], value = m[2].trim();
      if (key === '中文名') row.name = value;
      else if (key === '英文名') row.englishName = value;
      else if (key === '音乐') row.music = value;
      else if (key === '显示') row.display = coreDisplay(value);
      else if (key === '开发商') row.developer = value;
      else if (key === '发行商') row.publisher = value;
      else if (key === '发行日期') row.releaseDate = value;
      else if (key === '标签') row.tags = coreTags(value);
    });
    return normalizeCoreRow(row);
  }

  function coreRowsFromTxt(text) {
    var content = String(text).replace(/^\uFEFF/, '').trim();
    if (!content) return [];
    var blocks = content.split(/\n\s*\n/);
    var hasBlockFormat = blocks.some(function (block) {
      return block.split(/\r?\n/).some(function (line) {
        return /^(中文名|英文名|音乐|显示|开发商|发行商|发行日期|标签)\s*[：:]/.test(line.trim());
      });
    });
    var rows = [];
    if (hasBlockFormat) {
      blocks.forEach(function (block) {
        var row = coreRowFromBlock(block);
        if (row) rows.push(row);
      });
    } else {
      content.split(/\r?\n/).forEach(function (line) {
        line = line.trim();
        if (!line) return;
        var row = coreRowFromLegacyLine(line);
        if (row) rows.push(row);
      });
    }
    return normalizeCoreRows(rows);
  }

  // 校验和：djb2 哈希，输出 36 进制（用于 js 备份完整性校验）
  function checksum(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = (((h << 5) + h) + str.charCodeAt(i)) >>> 0;
    }
    return 'c' + h.toString(36);
  }

  function saveData() {
    try { void 0 && localStorage.setItem(DATA_KEY, JSON.stringify(dataStore)); } catch (e) {}
  }
  function loadData() {
    try {
      var raw = null;
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      var rows = parsed && Array.isArray(parsed.core) ? parsed.core : parsed;
      dataStore = { core: normalizeCoreRows(rows) };
      return true;
    } catch (e) {}
    return false;
  }

  // 数据应用到界面（播放器曲名/封面、卡片统计），并同步底栏活动列表
  function applyCoreData() {
    var meta = document.getElementById('coreMeta');
    var core = (dataStore && dataStore.core) || [];
    var infoCount = core.filter(function (row) {
      return !!(row && (row.developer || row.publisher || row.releaseDate || (row.tags && row.tags.length)));
    }).length;
    if (meta) {
      meta.textContent = core.length
        ? ('已加载 ' + core.length + ' 个活动 · ' + infoCount + ' 条首页信息')
        : '未加载';
    }
    syncDockWithData();
    // 核心数据到位后刷新页面描述（列表未变化时 syncDockWithData 会提前返回）
    applyPageMeta(LOGOS[state.index]);
    refreshPlayerMedia();
  }

  // 导出：自包含 js 备份文件。
  // 格式：window.FGEXPIG_BACKUP = { magic, version, exportedAt, data, checksum }
  // 后续只需 <script src="备份.js"> 后读取 window.FGEXPIG_BACKUP.data 即可还原全部数据
  function exportData() {
    var payload = {
      magic: DATA_MAGIC,
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      data: { core: normalizeCoreRows(dataStore.core || []) }
    };
    payload.checksum = checksum(JSON.stringify(payload.data));
    var content =
      '/* FGEXPIG 活动核心数据备份（自动生成，请勿手动编辑）\n' +
      ' * 导出时间: ' + payload.exportedAt + '\n' +
      ' * 还原方式: <script src="本文件.js"></script> 后读取 window.FGEXPIG_BACKUP.data\n' +
      ' * 校验规则: magic 必须为 "' + DATA_MAGIC + '"，checksum 为 data 序列化后的 djb2 哈希（36进制）\n' +
      ' */\n' +
      'window.FGEXPIG_BACKUP = ' + JSON.stringify(payload, null, 2) + ';\n';
    var blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var d = new Date();
    var stamp = '' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    a.download = 'fgexpig_core_' + stamp + '.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }

  // 导入：core.txt 区块格式、旧版 CSV、活动核心 JS 备份，以及旧版首页信息 JS 备份
  function importDataFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      try {
        if (/\.js$/i.test(file.name) && text.indexOf(LEGACY_INFO_MAGIC) >= 0) {
          var legacyCount = importLegacyInfoBackup(text);
          saveData();
          applyCoreData();
          alert('导入成功：合并 ' + legacyCount + ' 条首页活动信息');
          return;
        }
        if (/\.js$/i.test(file.name) && text.indexOf(DATA_MAGIC) >= 0) {
          var m = text.match(/window\.FGEXPIG_BACKUP\s*=\s*(\{[\s\S]*\});/);
          if (!m) throw new Error('format');
          var payload = JSON.parse(m[1]);
          if (!payload || payload.magic !== DATA_MAGIC) throw new Error('magic');
          if (payload.checksum !== checksum(JSON.stringify(payload.data))) throw new Error('checksum');
          var backupRows = payload.data && Array.isArray(payload.data.core) ? payload.data.core : payload.data;
          dataStore = { core: normalizeCoreRows(backupRows) };
        } else {
          var rows = coreRowsFromTxt(text);
          if (!rows.length) throw new Error('empty');
          dataStore = { core: rows };
        }
        saveData();
        applyCoreData();
        alert('导入成功：共 ' + ((dataStore.core || []).length) + ' 个活动');
      } catch (err) {
        var msg = '文件格式错误';
        if (err.message === 'checksum') msg = '备份校验未通过，数据可能已损坏';
        else if (err.message === 'magic') msg = '不是有效的 FGEXPIG 备份文件';
        else if (err.message === 'empty') msg = '未解析到有效数据（需为 core.txt 区块格式或旧版 CSV）';
        alert('导入失败：' + msg);
      }
    };
    reader.readAsText(file);
  }

  /* ---------- 右侧边栏数据管理：动态渲染分类 + 数据卡片 ---------- */
  var dmCatsEl = document.getElementById('dmCats');
  var dmContentEl = document.getElementById('dmContent');
  var dmActiveCat = 'all'; // 'all' 或活动ID
  var reviewFileInput = document.getElementById('reviewFileInput');
  var achvFileInput = document.getElementById('achvFileInput');
  var scheduleFileInput = document.getElementById('scheduleFileInput');
  var resourceListFileInput = document.getElementById('resourceListFileInput');
  var shopFileInput = document.getElementById('shopFileInput');
  var libraryFileInput = document.getElementById('libraryFileInput');
  var hotspotFileInput = document.getElementById('hotspotFileInput');
  var hotspotPointsFileInput = document.getElementById('hotspotPointsFileInput');

  function dmSeasonList() {
    var core = (dataStore && dataStore.core) || [];
    return core.filter(function (r) { return r.held !== false; }).map(function (r) {
      return { id: r.id, name: r.name };
    });
  }

  function renderDmCats() {
    if (!dmCatsEl) return;
    dmCatsEl.innerHTML = '';
    // 全部
    var catAll = document.createElement('button');
    catAll.className = 'dm-cat' + (dmActiveCat === 'all' ? ' active' : '');
    catAll.textContent = '全部';
    catAll.onclick = function () { dmActiveCat = 'all'; renderDmCats(); renderDmContent(); };
    dmCatsEl.appendChild(catAll);
    // 各赛季
    dmSeasonList().forEach(function (s) {
      var btn = document.createElement('button');
      btn.className = 'dm-cat' + (dmActiveCat === s.id ? ' active' : '');
      btn.textContent = s.name;
      btn.onclick = function () { dmActiveCat = s.id; renderDmCats(); renderDmContent(); };
      dmCatsEl.appendChild(btn);
    });
  }

  function makeDataCard(title, desc, metaId, importFn, exportFn) {
    var card = document.createElement('div');
    card.className = 'data-card';
    var h = document.createElement('div'); h.className = 'data-card-title'; h.textContent = title;
    var d = document.createElement('div'); d.className = 'data-card-desc'; d.textContent = desc;
    var m = document.createElement('div'); m.className = 'data-card-meta'; m.id = metaId; m.textContent = '未加载';
    var a = document.createElement('div'); a.className = 'data-card-actions';
    var bi = document.createElement('button'); bi.className = 'data-btn'; bi.type = 'button'; bi.textContent = '导入 TXT';
    bi.onclick = importFn;
    var be = document.createElement('button'); be.className = 'data-btn data-btn-export'; be.type = 'button'; be.textContent = '导出 JS';
    be.onclick = exportFn;
    a.appendChild(bi); a.appendChild(be);
    card.appendChild(h); card.appendChild(d); card.appendChild(m); card.appendChild(a);
    return card;
  }


  var dataFileLoadPromises = {};

  function dataFileRegistryObject() {
    if (!window.FGEXPIG_DATA_FILES || typeof window.FGEXPIG_DATA_FILES !== 'object') {
      window.FGEXPIG_DATA_FILES = {};
    }
    return window.FGEXPIG_DATA_FILES;
  }

  function dataFragmentFromText(relativePath, text) {
    var source = String(text || '');
    if (!source) return null;
    var sandbox = { FGEXPIG_DATA_FILES: Object.create(null) };
    try {
      (new Function('window', source + '\n//# sourceURL=' + relativePath))(sandbox);
    } catch (err) {
      return null;
    }
    return sandbox.FGEXPIG_DATA_FILES &&
      Object.prototype.hasOwnProperty.call(sandbox.FGEXPIG_DATA_FILES, relativePath)
      ? sandbox.FGEXPIG_DATA_FILES[relativePath]
      : null;
  }

  function loadDataFile(relativePath) {
    if (dataFileLoadPromises[relativePath]) return dataFileLoadPromises[relativePath];
    var request;
    if (location.protocol === 'file:') {
      var registry = dataFileRegistryObject();
      request = new Promise(function (resolve) {
        var script = document.createElement('script');
        script.async = true;
        script.src = relativePath;
        script.onload = function () {
          resolve(Object.prototype.hasOwnProperty.call(registry, relativePath) ? registry[relativePath] : null);
        };
        script.onerror = function () {
          resolve(null);
        };
        document.head.appendChild(script);
      });
    } else {
      request = fetch(relativePath, { cache: 'no-store', credentials: 'same-origin' })
        .then(function (response) {
          return response.ok ? response.text() : null;
        })
        .then(function (text) {
          return text ? dataFragmentFromText(relativePath, text) : null;
        })
        .catch(function () {
          return null;
        });
    }
    dataFileLoadPromises[relativePath] = request;
    request.then(function () {
      if (dataFileLoadPromises[relativePath] === request) delete dataFileLoadPromises[relativePath];
    }, function () {
      if (dataFileLoadPromises[relativePath] === request) delete dataFileLoadPromises[relativePath];
    });
    return request;
  }

  function dataFileMapCount(value) {
    return value && typeof value === 'object' ? Object.keys(value).length : 0;
  }

  function normalizeDataShopMap(map) {
    var normalized = {};
    Object.keys(map || {}).forEach(function (id) {
      var record = normalizeShopRecord(map[id]);
      if (record) normalized[id] = record;
    });
    return normalized;
  }

  function normalizeDataLibraryMap(map) {
    var normalized = {};
    Object.keys(map || {}).forEach(function (key) {
      var record = normalizeLibraryRecord(map[key]);
      var normalizedKey = libraryKey(record.name || key);
      if (normalizedKey) normalized[normalizedKey] = record;
    });
    return normalized;
  }

  function dataFileDescriptor(type, id) {
    var activityId = String(id || '').trim();
    function activityPath(filename) {
      return 'resources/' + activityId + '/' + filename;
    }
    function activityFragment(key, rows, normalize) {
      var fragment = {};
      fragment[key] = {};
      fragment[key][activityId] = normalize ? normalize(rows) : rows;
      return fragment;
    }
    function activityRows(fragment, key) {
      var map = fragment && fragment[key];
      return Array.isArray(map && map[activityId]) ? map[activityId] : [];
    }

    if (type === 'core') {
      return {
        path: 'resources/core.js',
        parse: function (text) { return { core: normalizeCoreRows(coreRowsFromTxt(text)) }; },
        current: function () { return { core: normalizeCoreRows((dataStore && dataStore.core) || []) }; },
        hasData: function (fragment) { return !!(fragment && Array.isArray(fragment.core) && fragment.core.length); },
        merge: function (fragment) {
          dataStore = { core: normalizeCoreRows(fragment.core) };
          applyCoreData();
        }
      };
    }
    if (type === 'shop') {
      return {
        path: 'resources/shop.js',
        parse: function (text) {
          var shops = {};
          shopRowsFromTxt(text).forEach(function (row) {
            var record = normalizeShopRecord(row);
            if (row && row.id && record) shops[row.id] = record;
          });
          return { shops: shops };
        },
        current: function () { return { shops: normalizeDataShopMap((shopStore && shopStore.shops) || {}) }; },
        hasData: function (fragment) { return !!(fragment && dataFileMapCount(fragment.shops)); },
        merge: function (fragment) {
          shopStore = { shops: normalizeDataShopMap(fragment.shops || {}) };
          applyShopData();
        }
      };
    }
    if (type === 'library') {
      return {
        path: 'resources/library.js',
        parse: function (text) {
          var libraries = {};
          libraryRowsFromTxt(text).forEach(function (record) {
            var normalized = normalizeLibraryRecord(record);
            var key = libraryKey(normalized.name);
            if (key) libraries[key] = normalized;
          });
          return { libraries: libraries };
        },
        current: function () { return { libraries: normalizeDataLibraryMap((libraryStore && libraryStore.libraries) || {}) }; },
        hasData: function (fragment) { return !!(fragment && dataFileMapCount(fragment.libraries)); },
        merge: function (fragment) {
          libraryStore = { libraries: normalizeDataLibraryMap(fragment.libraries || {}) };
          applyLibraryData();
        }
      };
    }
    if (type === 'account') {
      return {
        path: 'resources/account.js',
        parse: function (text) { return { accounts: normalizeAccountRows(accountRowsFromTxt(text)) }; },
        current: function () { return { accounts: normalizeAccountRows((accountStore && accountStore.accounts) || []) }; },
        hasData: function (fragment) { return !!(fragment && Array.isArray(fragment.accounts) && fragment.accounts.length); },
        merge: function (fragment) {
          accountStore = { accounts: normalizeAccountRows(fragment.accounts) };
          applyAccountData();
          syncUserMediaFromAccounts();
        }
      };
    }
    if (type === 'title') {
      return {
        path: 'resources/title.js',
        parse: function (text) { return { titles: titleMapFromTxt(text) }; },
        current: function () { return { titles: (titleStore && titleStore.titles) || {} }; },
        hasData: function (fragment) { return !!(fragment && dataFileMapCount(fragment.titles)); },
        merge: function (fragment) {
          titleStore = { titles: fragment.titles || {} };
          applyTitleData();
        }
      };
    }
    if (type === 'review') {
      return {
        path: activityPath('review.js'),
        parse: function (text) { return activityFragment('reviews', parseReviewTxt(text)); },
        current: function () { return activityFragment('reviews', (reviewStore.reviews && reviewStore.reviews[activityId]) || []); },
        hasData: function (fragment) { return activityRows(fragment, 'reviews').length > 0; },
        merge: function (fragment) {
          if (!reviewStore.reviews) reviewStore.reviews = {};
          reviewStore.reviews[activityId] = activityRows(fragment, 'reviews');
          applyReviewData(activityId);
        }
      };
    }
    if (type === 'achievements') {
      return {
        path: activityPath('achievements.js'),
        parse: function (text) { return activityFragment('achievements', parseAchvTxt(text)); },
        current: function () { return activityFragment('achievements', (achvStore.achievements && achvStore.achievements[activityId]) || []); },
        hasData: function (fragment) { return activityRows(fragment, 'achievements').length > 0; },
        merge: function (fragment) {
          if (!achvStore.achievements) achvStore.achievements = {};
          achvStore.achievements[activityId] = normalizeAchvRows(activityRows(fragment, 'achievements'));
          applyAchvData(activityId);
        }
      };
    }
    if (type === 'schedule') {
      return {
        path: activityPath('date.js'),
        parse: function (text) { return activityFragment('schedules', parseResourceDateTxt(text)); },
        current: function () { return activityFragment('schedules', (scheduleStore.schedules && scheduleStore.schedules[activityId]) || []); },
        hasData: function (fragment) { return activityRows(fragment, 'schedules').length > 0; },
        merge: function (fragment) {
          if (!scheduleStore.schedules) scheduleStore.schedules = {};
          scheduleStore.schedules[activityId] = normalizeScheduleRows(activityRows(fragment, 'schedules'));
          applyScheduleData(activityId);
        }
      };
    }
    if (type === 'list') {
      return {
        path: activityPath('list.js'),
        parse: function (text) { return activityFragment('lists', parseResourceListTxt(text)); },
        current: function () { return activityFragment('lists', (resourceListStore.lists && resourceListStore.lists[activityId]) || []); },
        hasData: function (fragment) { return activityRows(fragment, 'lists').length > 0; },
        merge: function (fragment) {
          if (!resourceListStore.lists) resourceListStore.lists = {};
          resourceListStore.lists[activityId] = normalizeResourceListRows(activityRows(fragment, 'lists'));
          applyResourceListData(activityId);
        }
      };
    }
    if (type === 'news') {
      return {
        path: activityPath('news.js'),
        parse: function (text) { return activityFragment('hotspots', parseNewsTxt(text)); },
        current: function () { return activityFragment('hotspots', (hotspotStore.hotspots && hotspotStore.hotspots[activityId]) || []); },
        hasData: function (fragment) { return activityRows(fragment, 'hotspots').length > 0; },
        merge: function (fragment) {
          if (!hotspotStore.hotspots) hotspotStore.hotspots = {};
          hotspotStore.hotspots[activityId] = normalizeHotspotPosts(activityRows(fragment, 'hotspots'));
          applyHotspotData(activityId);
        }
      };
    }
    if (type === 'points') {
      return {
        path: activityPath('points.js'),
        parse: function (text) { return activityFragment('points', parseHotspotPoints(text)); },
        current: function () { return activityFragment('points', (hotspotStore.points && hotspotStore.points[activityId]) || []); },
        hasData: function (fragment) { return activityRows(fragment, 'points').length > 0; },
        merge: function (fragment) {
          if (!hotspotStore.points) hotspotStore.points = {};
          hotspotStore.points[activityId] = normalizeHotspotPoints(activityRows(fragment, 'points'));
          applyHotspotPoints(activityId);
        }
      };
    }
    return null;
  }

  function loadDataFragment(type, id) {
    var descriptor = dataFileDescriptor(type, id);
    if (!descriptor) return Promise.resolve(false);
    if (descriptor.hasData(descriptor.current())) return Promise.resolve(true);
    var activityId = String(id || '');
    var releaseVersion = activityId ? (activityReleaseVersions[activityId] || 0) : 0;
    return loadDataFile(descriptor.path).then(function (fragment) {
      if (!fragment || !descriptor.hasData(fragment)) return false;
      if (activityId && releaseVersion !== (activityReleaseVersions[activityId] || 0)) return false;
      try {
        descriptor.merge(fragment);
        return true;
      } catch (err) {
        return false;
      }
    });
  }

  function loadDataFragmentRaw(type, id) {
    var descriptor = dataFileDescriptor(type, id);
    if (!descriptor) return Promise.resolve(null);
    return loadDataFile(descriptor.path).then(function (fragment) {
      return fragment && descriptor.hasData(fragment) ? fragment : null;
    });
  }

  function dataFileJson(fragment) {
    return JSON.stringify(fragment, null, 2)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  function downloadDataFileFragment(relativePath, fragment) {
    var content = '(window.FGEXPIG_DATA_FILES = window.FGEXPIG_DATA_FILES || {})[' +
      JSON.stringify(relativePath) + '] = ' + dataFileJson(fragment) + ';\n';
    var blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = relativePath.split('/').pop();
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 3000);
    alert('已生成数据 JS 文件：\n' + relativePath + '\n请将该文件放入此路径，然后刷新网页。');
  }

  function exportDataFile(type, id) {
    var descriptor = dataFileDescriptor(type, id);
    if (!descriptor) return;
    var fragment = descriptor.current();
    if (!descriptor.hasData(fragment)) {
      alert('暂无数据可导出');
      return;
    }
    downloadDataFileFragment(descriptor.path, fragment);
  }

  function generateDataFileFromTxt(type, id, file) {
    if (!file || !/\.txt$/i.test(file.name || '')) {
      alert('请选择 TXT 文件');
      return;
    }
    var descriptor = dataFileDescriptor(type, id);
    if (!descriptor) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var fragment = descriptor.parse(String(reader.result || ''));
        if (!descriptor.hasData(fragment)) throw new Error('empty');
        downloadDataFileFragment(descriptor.path, fragment);
      } catch (err) {
        alert('生成失败：' + (err && err.message === 'empty' ? '未解析到有效数据' : 'TXT 文件格式错误'));
      }
    };
    reader.readAsText(file);
  }

  function renderDmContent() {
    if (!dmContentEl) return;
    dmContentEl.innerHTML = '';
    if (dmActiveCat === 'all') {
      // 全部：5张全局数据卡片
      dmContentEl.appendChild(makeDataCard('活动核心数据', '活动ID · 中文名 · 英文名 · 音乐 · 显示（0隐藏 / 1显示 / 11默认） · 开发商 · 发行商 · 发行日期 · 标签', 'coreMeta',
        function () { dataFileInput.click(); }, function () { exportDataFile('core'); }));
      dmContentEl.appendChild(makeDataCard('活动商店数据', '活动标识 · 版本/DLC￥价格 · 包含内容 · 地图代码', 'shopMeta',
        function () { shopFileInput.click(); }, function () { exportDataFile('shop'); }));
      dmContentEl.appendChild(makeDataCard('活动库存数据', '人名 · 活动标识商品名（可无内容）', 'libraryMeta',
        function () { libraryFileInput.click(); }, function () { exportDataFile('library'); }));
      dmContentEl.appendChild(makeDataCard('账号数据', '昵称 · 用户名 · 密码 · 媒体机构（可省略）', 'accountMeta',
        function () { accountFileInput.click(); }, function () { exportDataFile('account'); }));
      dmContentEl.appendChild(makeDataCard('称号数据', '昵称 · [等级]称号', 'titleMeta',
        function () { titleFileInput.click(); }, function () { exportDataFile('title'); }));
      // 刷新各 meta
      applyCoreData(); applyShopData(); applyLibraryData(); applyAccountData(); applyTitleData();
    } else {
      // 各赛季：测评、成就与热点
      var id = dmActiveCat;
      dmContentEl.appendChild(makeDataCard('测评数据', '机构 · 分数 · 评测文本；多分类用 --- 分开，每类第一行写分类名', 'reviewMeta',
        function () { reviewFileInput.click(); }, function () { exportDataFile('review', id); }));
      dmContentEl.appendChild(makeDataCard('成就数据', '《奖杯组》· [奖杯等级，黑=紫金] · 成就名 · 说明', 'achvMeta',
        function () { achvFileInput.click(); }, function () { exportDataFile('achievements', id); }));
      dmContentEl.appendChild(makeDataCard('日程数据', '日期 · 日程（date.txt 格式）', 'scheduleMeta',
        function () { scheduleFileInput.click(); }, function () { exportDataFile('schedule', id); }));
      dmContentEl.appendChild(makeDataCard('资源列表数据', '文件名 · 标题 · 分类（list.txt 格式）', 'resourceListMeta',
        function () { resourceListFileInput.click(); }, function () { exportDataFile('list', id); }));
      dmContentEl.appendChild(makeDataCard('热点数据', '日期时间 · 标题 · 内容 · 缩进评论', 'hotspotMeta',
        function () { hotspotFileInput.click(); }, function () { exportDataFile('news', id); }));
      dmContentEl.appendChild(makeDataCard('关键词数据', '关键词 · 支持换行、逗号或顿号分隔', 'keywordMeta',
        function () { hotspotPointsFileInput.click(); }, function () { exportDataFile('points', id); }));
      applyReviewData(id); applyAchvData(id); applyScheduleData(id); applyResourceListData(id); applyHotspotData(id); applyHotspotPoints(id);
      Promise.all([fetchReview(id), fetchAchv(id), fetchShop(id), fetchSchedule(id), fetchResourceList(id)]).then(function () {
        if (dmActiveCat !== id) return;
        applyReviewData(id);
        applyAchvData(id);
        applyScheduleData(id);
        applyResourceListData(id);
      });
    }
  }

  // 文件选择器事件
  var dataFileInput = document.getElementById('dataFileInput');
  dataFileInput.addEventListener('change', function () {
    if (dataFileInput.files && dataFileInput.files[0]) generateDataFileFromTxt('core', '', dataFileInput.files[0]);
    dataFileInput.value = '';
  });
  var accountFileInput = document.getElementById('accountFileInput');
  accountFileInput.addEventListener('change', function () {
    if (accountFileInput.files && accountFileInput.files[0]) generateDataFileFromTxt('account', '', accountFileInput.files[0]);
    accountFileInput.value = '';
  });
  var titleFileInput = document.getElementById('titleFileInput');
  titleFileInput.addEventListener('change', function () {
    if (titleFileInput.files && titleFileInput.files[0]) generateDataFileFromTxt('title', '', titleFileInput.files[0]);
    titleFileInput.value = '';
  });
  reviewFileInput.addEventListener('change', function () {
    if (reviewFileInput.files && reviewFileInput.files[0] && dmActiveCat !== 'all')
      generateDataFileFromTxt('review', dmActiveCat, reviewFileInput.files[0]);
    reviewFileInput.value = '';
  });
  achvFileInput.addEventListener('change', function () {
    if (achvFileInput.files && achvFileInput.files[0] && dmActiveCat !== 'all')
      generateDataFileFromTxt('achievements', dmActiveCat, achvFileInput.files[0]);
    achvFileInput.value = '';
  });
  scheduleFileInput.addEventListener('change', function () {
    if (scheduleFileInput.files && scheduleFileInput.files[0] && dmActiveCat !== 'all')
      generateDataFileFromTxt('schedule', dmActiveCat, scheduleFileInput.files[0]);
    scheduleFileInput.value = '';
  });
  resourceListFileInput.addEventListener('change', function () {
    if (resourceListFileInput.files && resourceListFileInput.files[0] && dmActiveCat !== 'all')
      generateDataFileFromTxt('list', dmActiveCat, resourceListFileInput.files[0]);
    resourceListFileInput.value = '';
  });
  shopFileInput.addEventListener('change', function () {
    if (shopFileInput.files && shopFileInput.files[0])
      generateDataFileFromTxt('shop', '', shopFileInput.files[0]);
    shopFileInput.value = '';
  });
  libraryFileInput.addEventListener('change', function () {
    if (libraryFileInput.files && libraryFileInput.files[0])
      generateDataFileFromTxt('library', '', libraryFileInput.files[0]);
    libraryFileInput.value = '';
  });
  hotspotFileInput.addEventListener('change', function () {
    if (hotspotFileInput.files && hotspotFileInput.files[0] && dmActiveCat !== 'all')
      generateDataFileFromTxt('news', dmActiveCat, hotspotFileInput.files[0]);
    hotspotFileInput.value = '';
  });
  hotspotPointsFileInput.addEventListener('change', function () {
    if (hotspotPointsFileInput.files && hotspotPointsFileInput.files[0] && dmActiveCat !== 'all')
      generateDataFileFromTxt('points', dmActiveCat, hotspotPointsFileInput.files[0]);
    hotspotPointsFileInput.value = '';
  });

  /* ---------- 账号数据 ---------- */
  var ACCOUNT_KEY = 'fgexpig_accounts_v1';
  var ACCOUNT_MAGIC = 'FGEXPIG-ACCOUNT-BACKUP';
  var accountStore = { accounts: [] };
  // 旧版 localStorage 账号缺少 media 字段时，用当前 account.txt 的绑定补全

  function accountText(value) {
    return value === undefined || value === null ? '' : String(value).trim();
  }

  function normalizeAccountRow(row) {
    row = row || {};
    var user = accountText(row.user);
    if (!user) return null;
    var media = accountText(row.media || row.mediaOrg || row.org);
    return {
      nick: accountText(row.nick),
      user: user,
      pass: accountText(row.pass),
      media: media
    };
  }

  function normalizeAccountRows(rows) {
    if (!Array.isArray(rows)) rows = rows ? [rows] : [];
    return rows.map(normalizeAccountRow).filter(Boolean);
  }

  // 每行「昵称，用户名，密码，媒体机构」；第四列可省略，密码固定为第三列
  function accountRowsFromTxt(text) {
    var rows = [];
    String(text).split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var parts = line.split(/[，,]/).map(function (s) { return s.trim(); });
      if (parts.length >= 3 && parts[1]) {
        rows.push(normalizeAccountRow({
          nick: parts[0],
          user: parts[1],
          pass: parts[2],
          media: parts.length > 3 ? parts.slice(3).join('，') : ''
        }));
      }
    });
    return normalizeAccountRows(rows);
  }

  function saveAccounts() {
    try { void 0 && localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accountStore)); } catch (e) {}
  }
  function loadAccounts() {
    try {
      var raw = null;
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      var rows = parsed && Array.isArray(parsed.accounts) ? parsed.accounts : parsed;
      accountStore = { accounts: normalizeAccountRows(rows) };
      return true;
    } catch (e) {}
    return false;
  }

  function syncUserMediaFromAccounts() {
    if (typeof user === 'undefined' || !user || user.isAdmin) return;
    var accounts = (accountStore && accountStore.accounts) || [];
    for (var i = 0; i < accounts.length; i++) {
      if (accounts[i].nick !== user.name) continue;
      var media = accountText(accounts[i].media);
      if (user.media !== media) {
        user.media = media;
        saveSession();
        refreshReviewPersonalScore();
      }
      return;
    }
  }

  function applyAccountData() {
    var meta = document.getElementById('accountMeta');
    var accounts = (accountStore && accountStore.accounts) || [];
    var mediaCount = accounts.filter(function (a) { return !!a.media; }).length;
    if (meta) {
      meta.textContent = accounts.length
        ? ('已加载 ' + accounts.length + ' 个账号' + (mediaCount ? ' · ' + mediaCount + ' 个媒体机构' : ''))
        : '未加载';
    }
    schedulePauseLeaderboardRender();
  }

  function exportAccounts() {
    var data = { accounts: normalizeAccountRows(accountStore.accounts || []) };
    var payload = {
      magic: ACCOUNT_MAGIC,
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      data: data
    };
    payload.checksum = checksum(JSON.stringify(data));
    var content =
      '/* FGEXPIG 账号数据备份（自动生成，请勿手动编辑）\n' +
      ' * 导出时间: ' + payload.exportedAt + '\n' +
      ' * 还原方式: <script src="本文件.js"></script> 后读取 window.FGEXPIG_ACCOUNT_BACKUP.data\n' +
      ' */\n' +
      'window.FGEXPIG_ACCOUNT_BACKUP = ' + JSON.stringify(payload, null, 2) + ';\n';
    var blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var d = new Date();
    var stamp = '' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    a.download = 'fgexpig_accounts_' + stamp + '.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }

  function importAccountFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      try {
        if (/\.js$/i.test(file.name) && text.indexOf(ACCOUNT_MAGIC) >= 0) {
          var m = text.match(/window\.FGEXPIG_ACCOUNT_BACKUP\s*=\s*(\{[\s\S]*\});/);
          if (!m) throw new Error('format');
          var payload = JSON.parse(m[1]);
          if (!payload || payload.magic !== ACCOUNT_MAGIC) throw new Error('magic');
          if (payload.checksum !== checksum(JSON.stringify(payload.data))) throw new Error('checksum');
          var backupRows = payload.data && Array.isArray(payload.data.accounts) ? payload.data.accounts : payload.data;
          accountStore = { accounts: normalizeAccountRows(backupRows) };
        } else {
          var rows = accountRowsFromTxt(text);
          if (!rows.length) throw new Error('empty');
          accountStore = { accounts: rows };
        }
        saveAccounts();
        applyAccountData();
        alert('导入成功：共 ' + ((accountStore.accounts || []).length) + ' 个账号');
      } catch (err) {
        var msg = '文件格式错误';
        if (err.message === 'checksum') msg = '备份校验未通过，数据可能已损坏';
        else if (err.message === 'magic') msg = '不是有效的 FGEXPIG 账号备份文件';
        else if (err.message === 'empty') msg = '未解析到有效数据（每行格式：昵称，用户名，密码，媒体机构；媒体机构可省略）';
        alert('导入失败：' + msg);
      }
    };
    reader.readAsText(file);
  }

  /* ---------- 暂停菜单广告位：三类横向柱形排行榜 ---------- */
  var pauseAdSlots = Array.prototype.slice.call(document.querySelectorAll('.pause-ad-slot[data-leaderboard]'));
  var pauseLeaderboardRenderFrame = 0;
  var pauseLeaderboardViewportFrame = 0;
  var pauseLeaderboardShopRequested = false;

  function leaderboardsVisible() {
    if (pauseMenu && pauseMenu.classList.contains('open')) return true;
    var outerRank = document.querySelector('.settings-section.outer-settings-view-rank');
    return !!(outerRank && outerRank.getClientRects().length);
  }

  function schedulePauseLeaderboardRender() {
    if (pauseLeaderboardRenderFrame) return;
    pauseLeaderboardRenderFrame = requestAnimationFrame(function () {
      pauseLeaderboardRenderFrame = 0;
      if (!leaderboardsVisible()) return;
      renderPauseLeaderboards();
    });
  }

  function pauseLeaderboardAvailableHeight(chart) {
    var slot = chart && chart.closest ? chart.closest('.pause-ad-slot') : null;
    if (!slot) return 0;
    var slotStyle = window.getComputedStyle(slot);
    var available = slot.clientHeight -
      (parseFloat(slotStyle.paddingTop) || 0) -
      (parseFloat(slotStyle.paddingBottom) || 0);
    var title = slot.querySelector('.pause-ad-title');
    if (title) {
      var titleStyle = window.getComputedStyle(title);
      available -= title.offsetHeight + (parseFloat(titleStyle.marginTop) || 0);
    }
    return Math.max(0, available);
  }

  function allPauseLeaderboardSlots() {
    return Array.prototype.slice.call(document.querySelectorAll('.pause-ad-slot[data-leaderboard]'));
  }

  function updatePauseLeaderboardViewports() {
    allPauseLeaderboardSlots().forEach(function (slot) {
      var chart = slot.querySelector('.pause-leaderboard');
      if (!chart || !chart._pauseLeaderboardRows || !chart._pauseLeaderboardRows.length) return;
      drawPauseLeaderboardChart(chart, chart._pauseLeaderboardRows, chart._pauseLeaderboardValueFormatter, chart._pauseLeaderboardBarValueFormatter);
    });
  }

  function schedulePauseLeaderboardViewportUpdate() {
    if (pauseLeaderboardViewportFrame) return;
    pauseLeaderboardViewportFrame = requestAnimationFrame(function () {
      pauseLeaderboardViewportFrame = 0;
      if (!leaderboardsVisible()) return;
      updatePauseLeaderboardViewports();
    });
  }
  function pauseLeaderboardUsers() {
    var users = [];
    var seen = {};
    function add(rawName) {
      var name = String(rawName == null ? '' : rawName).trim();
      if (!name || name === GUEST_NAME || name === '匿名') return;
      var key = experienceNameKey(name);
      if (!key || seen[key]) return;
      seen[key] = true;
      users.push(name);
    }

    ((accountStore && accountStore.accounts) || []).forEach(function (account) {
      add(account && account.nick);
    });
    return users;
  }

  function shopPriceNumber(value) {
    var text = shopText(value);
    if (!text || text === '免费') return 0;
    var match = text.match(/\d+(?:\.\d+)?/);
    var number = match ? Number(match[0]) : 0;
    return isFinite(number) && number > 0 ? number : 0;
  }

  function accountValueForUser(name) {
    var record = libraryRecordFor(name);
    if (!record) return 0;
    var byActivity = {};
    (record.entries || []).forEach(function (entry) {
      if (!entry || !entry.id || !entry.version) return;
      if (!byActivity[entry.id]) byActivity[entry.id] = [];
      byActivity[entry.id].push(libraryText(entry.version).toLowerCase());
    });

    var total = 0;
    Object.keys(byActivity).forEach(function (id) {
      var shop = shopOf(id);
      if (!shop) return;
      var owned = {};
      byActivity[id].forEach(function (itemName) {
        if (itemName) owned[itemName] = true;
      });
      var includedContents = {};

      (shop.versions || []).forEach(function (version) {
        if (!owned[libraryText(version.name).toLowerCase()]) return;
        total += shopPriceNumber(version.price);
        (version.contents || []).forEach(function (content) {
          var key = libraryText(content).toLowerCase();
          if (key) includedContents[key] = true;
        });
      });

      (shop.dlcs || []).forEach(function (dlc) {
        var itemName = libraryText(dlc.name).toLowerCase();
        if (!owned[itemName]) return;
        var contents = (dlc.contents || []).map(function (content) {
          return libraryText(content).toLowerCase();
        }).filter(Boolean);
        var included = !!includedContents[itemName] || (contents.length > 0 && contents.every(function (content) {
          return !!includedContents[content];
        }));
        if (included) return;
        total += shopPriceNumber(dlc.price);
        contents.forEach(function (content) { includedContents[content] = true; });
      });
    });
    return Math.round(total * 100) / 100;
  }

  function hotspotCommentCharacterScore(value) {
    var source = String(value == null ? '' : value);
    if (hotspotStandaloneEmoji(source)) return 5;
    var normalized = '';
    for (var i = 0; i < source.length;) {
      if (source.charAt(i) === '\\') {
        var colorMatch = source.slice(i).match(/^\\{1,2}#[0-9a-fA-F]{6}/);
        if (colorMatch) {
          i += colorMatch[0].length;
          continue;
        }
        var next = source.charAt(i + 1);
        if (next === '\\' || next === 'n' || next === 't' || next === 'c' || next === 'r' || next === 'b' || next === 'i' || next === 'm' || next === 'e') {
          i += (next === 'b' && source.charAt(i + 2) === 'i') ? 3 : 2;
          continue;
        }
      }
      normalized += source.charAt(i);
      i += 1;
    }

    var units = graphemesOf(normalized);
    var total = 0;
    for (var k = 0; k < units.length; k += 1) {
      var unit = units[k];
      if (unit === EMOJI_STICKER_SENTINEL) total += 5;
      else if (/^\s+$/u.test(unit)) continue;
      else total += LARGE_TEXT_GRAPHEME_RE.test(unit) ? 2 : 1;
    }
    return total;
  }

  function hotspotCharacterCountForUser(name) {
    var target = experienceNameKey(name);
    if (!target) return 0;
    if (hotspotLeaderboardStatsReady || Object.keys(hotspotActivityStats).length) {
      var cached = hotspotAggregatedStats[target];
      return cached ? (Number(cached.characters) || 0) : 0;
    }
    var total = 0;
    function walk(comments) {
      (comments || []).forEach(function (comment) {
        if (!comment) return;
        if (experienceNameKey(comment.name) === target) {
          total += hotspotCommentCharacterScore(comment.text || '');
        }
        walk(comment.replies);
      });
    }
    Object.keys((hotspotStore && hotspotStore.hotspots) || {}).forEach(function (id) {
      var posts = hotspotStore.hotspots[id];
      if (!Array.isArray(posts)) posts = normalizeHotspotPosts(posts);
      posts.forEach(function (post) { walk(post && post.comments); });
    });
    return total;
  }

  function buildPauseRanking(names, valueGetter) {
    return names.map(function (name) {
      return { name: name, value: valueGetter(name) };
    }).filter(function (row) {
      return Number(row.value) > 0;
    }).sort(function (a, b) {
      return b.value - a.value || a.name.localeCompare(b.name, 'zh-CN');
    });
  }

  function pauseLeaderboardChartNumber(value) {
    var number = Number(value) || 0;
    var absolute = Math.abs(number);
    if (absolute >= 100000000) return (number / 100000000).toFixed(absolute >= 1000000000 ? 1 : 2).replace(/\.0+$|\.(\d*[1-9])0+$/, '$1') + '亿';
    if (absolute >= 10000) return (number / 10000).toFixed(absolute >= 100000 ? 1 : 2).replace(/\.0+$|\.(\d*[1-9])0+$/, '$1') + '万';
    if (Math.abs(number - Math.round(number)) < 0.000001) {
      return Math.round(number).toLocaleString('en-US');
    }
    return number.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function pauseLeaderboardNiceMax(value) {
    var maximum = Math.max(0.000001, Number(value) || 0);
    var power = Math.pow(10, Math.floor(Math.log(maximum) / Math.LN10));
    var steps = [1, 1.1, 1.2, 1.25, 1.3, 1.4, 1.5, 1.6, 1.75, 2, 2.5, 3, 4, 5, 6, 8, 10];
    var maximumAllowed = maximum / 0.75;
    for (var i = 0; i < steps.length; i++) {
      var candidate = steps[i] * power;
      if (candidate >= maximum && candidate <= maximumAllowed + 0.000001) return candidate;
    }
    return maximum / 0.8;
  }

  function pauseLeaderboardAxisNumber(value) {
    var number = Number(value) || 0;
    if (Math.abs(number) >= 1000000) return (number / 1000000).toFixed(1) + '\u2009M';
    if (Math.abs(number) >= 1000) return (number / 1000).toFixed(1) + '\u2009K';
    return Math.round(number).toLocaleString('en-US');
  }

  function pauseLeaderboardFullNumber(value) {
    var number = Number(value) || 0;
    if (Math.abs(number - Math.round(number)) < 0.000001) {
      return Math.round(number).toLocaleString('en-US');
    }
    return number.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function pauseLeaderboardEstimatedTextWidth(value) {
    var chars = Array.from(String(value == null ? '' : value));
    var width = 0;
    chars.forEach(function (character) {
      if (/^[\x00-\xff]$/.test(character)) {
        if (/[0-9]/.test(character)) width += 8;
        else if (/[A-Z]/.test(character)) width += 9;
        else width += 6;
      } else {
        width += 14;
      }
    });
    return width;
  }

  function createPauseLeaderboardSvgElement(tag, attributes) {
    var element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attributes || {}).forEach(function (key) {
      element.setAttribute(key, attributes[key]);
    });
    return element;
  }

  function drawPauseLeaderboardChart(chart, rows, valueFormatter, barValueFormatter) {
    if (!chart || !rows || !rows.length) return;
    var previousSvg = chart.querySelector('.pause-leaderboard-svg');
    if (previousSvg) previousSvg.remove();
    var isSettingsRankSlot = false;
    if (chart.closest) {
      if (chart.closest('.settings-rank-slot')) isSettingsRankSlot = true;
    }
    var previousScrollTop = chart.scrollTop || 0;

    var measuredHeight = chart.clientHeight || pauseLeaderboardAvailableHeight(chart) || 140;
    var visibleHeight = Math.max(96, Math.floor(measuredHeight));
    var width = Math.max(180, Math.floor(chart.clientWidth || 0));
    var requiredSvgWidth = width;
    var margin = { left: 34, right: 16, top: 12, bottom: 38 };
    var rowStep = 28;
    var barHeight = 18;
    if (isSettingsRankSlot) {
      margin.top = 8;
      margin.bottom = 20;
      rowStep = 24;
      barHeight = 15;
    }
    var plotWidth = Math.max(1, width - margin.left - margin.right);
    var axisY = margin.top + rows.length * rowStep;
    var contentHeight = axisY + margin.bottom;
    var svgHeight = Math.max(visibleHeight, contentHeight);
    if (isSettingsRankSlot) svgHeight = contentHeight;
    var maximumValue = Math.max.apply(null, rows.map(function (row) {
      return Math.max(0, Number(row.value) || 0);
    })) || 0;
    var chartMaximum = pauseLeaderboardNiceMax(maximumValue);

    var svg = createPauseLeaderboardSvgElement('svg', {
      'class': 'pause-leaderboard-svg',
      viewBox: '0 0 ' + width + ' ' + svgHeight,
      width: width,
      height: svgHeight,
      role: 'img',
      'aria-label': '排行榜横向条形图'
    });
    svg.style.width = width + 'px';
    svg.style.height = svgHeight + 'px';

    var tickCount = 4;
    for (var tick = 0; tick <= tickCount; tick++) {
      var tickX = margin.left + plotWidth * tick / tickCount;
      if (tick > 0) {
        svg.appendChild(createPauseLeaderboardSvgElement('line', {
          'class': 'pause-leaderboard-grid-line',
          x1: tickX,
          y1: margin.top,
          x2: tickX,
          y2: axisY
        }));
      }
      var tickLabel = createPauseLeaderboardSvgElement('text', {
        'class': 'pause-leaderboard-axis-value',
        x: tickX,
        y: axisY + 16,
        'text-anchor': tick === 0 ? 'start' : (tick === tickCount ? 'end' : 'middle')
      });
      tickLabel.textContent = pauseLeaderboardAxisNumber(chartMaximum * tick / tickCount);
      svg.appendChild(tickLabel);
    }

    var previousValue = null;
    var currentRank = 0;
    rows.forEach(function (row, index) {
      var value = Math.max(0, Number(row.value) || 0);
      if (index === 0 || Math.abs(value - previousValue) > 1e-9) {
        currentRank = index + 1;
        previousValue = value;
      }
      var isTop = currentRank === 1;
      var barWidth = Math.max(0, plotWidth * value / chartMaximum);
      var barY = margin.top + index * rowStep + (rowStep - barHeight) / 2;
      var rankLabel = createPauseLeaderboardSvgElement('text', {
        'class': 'pause-leaderboard-axis-rank' + (isTop ? ' is-top' : ''),
        x: margin.left - 8,
        y: barY + barHeight / 2 + 3.5,
        'text-anchor': 'end'
      });
      rankLabel.textContent = String(currentRank);
      svg.appendChild(rankLabel);

      var bar = createPauseLeaderboardSvgElement('rect', {
        'class': 'pause-leaderboard-bar' + (isTop ? ' is-top' : ''),
        x: margin.left,
        y: barY,
        width: barWidth,
        height: barHeight
      });
      var barTitle = createPauseLeaderboardSvgElement('title');
      barTitle.textContent = row.name + '：' + (valueFormatter ? valueFormatter(value) : pauseLeaderboardChartNumber(value));
      bar.appendChild(barTitle);
      svg.appendChild(bar);

      var formattedValue = barValueFormatter ? barValueFormatter(value) : pauseLeaderboardFullNumber(value);
      var valueTexts = Array.isArray(formattedValue)
        ? formattedValue.map(function (item) { return String(item); })
        : [String(formattedValue)];
      var valueWidth = Math.max.apply(null, valueTexts.map(function (item) {
        return pauseLeaderboardEstimatedTextWidth(item);
      }));
      var nameText = String(row.name == null ? '' : row.name);
      var nameWidth = pauseLeaderboardEstimatedTextWidth(nameText);
      var nameInside = barWidth >= nameWidth + 14;
      var valueInside = nameInside && barWidth >= 14 + nameWidth + 8 + valueWidth;
      var barEndX = margin.left + barWidth;
      var nameOutsideText = '(' + nameText + ')';
      var nameOutsideWidth = pauseLeaderboardEstimatedTextWidth(nameOutsideText);
      var nameOutsideX = barEndX + 6;
      var valueX = valueInside
        ? barEndX - 7
        : (nameInside ? barEndX + 6 : nameOutsideX + nameOutsideWidth + 8);

      if (nameInside) {
        var nameLabel = createPauseLeaderboardSvgElement('text', {
          'class': 'pause-leaderboard-bar-label' + (isTop ? ' is-top' : ''),
          x: margin.left + 7,
          y: barY + barHeight / 2 + 3.5,
          'text-anchor': 'start'
        });
        nameLabel.textContent = nameText;
        var nameTitle = createPauseLeaderboardSvgElement('title');
        nameTitle.textContent = nameText;
        nameLabel.appendChild(nameTitle);
        svg.appendChild(nameLabel);
      } else {
        var outsideNameLabel = createPauseLeaderboardSvgElement('text', {
          'class': 'pause-leaderboard-bar-label is-outside' + (isTop ? ' is-top' : ''),
          x: nameOutsideX,
          y: barY + barHeight / 2 + 3.5,
          'text-anchor': 'start'
        });
        outsideNameLabel.textContent = nameOutsideText;
        var outsideNameTitle = createPauseLeaderboardSvgElement('title');
        outsideNameTitle.textContent = nameText;
        outsideNameLabel.appendChild(outsideNameTitle);
        svg.appendChild(outsideNameLabel);
        requiredSvgWidth = Math.max(requiredSvgWidth, nameOutsideX + nameOutsideWidth + 6);
      }

      valueTexts.forEach(function (valueText, valueIndex) {
        var cycleClass = valueTexts.length > 1
          ? (valueIndex === 0 ? ' is-cycle-a' : ' is-cycle-b')
          : '';
        var valueLabel = createPauseLeaderboardSvgElement('text', {
          'class': 'pause-leaderboard-bar-value' +
            (isTop ? ' is-top' : '') +
            (valueInside ? '' : ' is-outside') +
            cycleClass,
          x: valueX,
          y: barY + barHeight / 2 + 3.5,
          'text-anchor': valueInside ? 'end' : 'start'
        });
        valueLabel.textContent = valueText;
        svg.appendChild(valueLabel);
      });
      if (!valueInside) requiredSvgWidth = Math.max(requiredSvgWidth, valueX + valueWidth + 6);
    });

    if (requiredSvgWidth > width) {
      width = Math.ceil(requiredSvgWidth);
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + svgHeight);
      svg.setAttribute('width', width);
      svg.style.width = width + 'px';
    }

    svg.appendChild(createPauseLeaderboardSvgElement('line', {
      'class': 'pause-leaderboard-axis',
      x1: margin.left,
      y1: margin.top,
      x2: margin.left,
      y2: axisY
    }));
    svg.appendChild(createPauseLeaderboardSvgElement('line', {
      'class': 'pause-leaderboard-axis',
      x1: margin.left,
      y1: axisY,
      x2: margin.left + plotWidth,
      y2: axisY
    }));

    chart.appendChild(svg);
    chart.scrollTop = previousScrollTop;
  }

  function renderPauseLeaderboardSlot(slot, title, rows, valueFormatter, barValueFormatter) {
    slot.innerHTML = '';
    var heading = document.createElement('div');
    heading.className = 'pause-ad-title';
    heading.textContent = title;
    slot.appendChild(heading);

    var chart = document.createElement('div');
    chart.className = 'pause-leaderboard';
    if (!rows.length) {
      var empty = document.createElement('div');
      empty.className = 'pause-leaderboard-empty';
      empty.textContent = '暂无数据';
      chart.appendChild(empty);
      slot.appendChild(chart);
      return;
    }

    chart._pauseLeaderboardRows = rows;
    chart._pauseLeaderboardValueFormatter = valueFormatter;
    chart._pauseLeaderboardBarValueFormatter = barValueFormatter;
    slot.appendChild(chart);
    requestAnimationFrame(function () {
      if (chart.isConnected) drawPauseLeaderboardChart(chart, rows, valueFormatter, barValueFormatter);
    });
  }

  var allHotspotLeaderboardLoadPromise = null;

  function releaseHotspotDataExcept(keepId) {
    var currentId = String(keepId || '');
    var hotspots = (hotspotStore && hotspotStore.hotspots) || {};
    Object.keys(hotspots).forEach(function (id) {
      if (id !== currentId) delete hotspots[id];
    });
    var points = (hotspotStore && hotspotStore.points) || {};
    Object.keys(points).forEach(function (id) {
      if (id !== currentId) delete points[id];
    });
    Object.keys(hotspotMemory).forEach(function (id) {
      if (id !== currentId) delete hotspotMemory[id];
    });
    Object.keys(hotspotUi).forEach(function (id) {
      if (id !== currentId) delete hotspotUi[id];
    });
    var currentPage = pages[LOGOS.indexOf(currentId)];
    var clearedPages = [];
    for (var i = 0; i < pages.length; i++) {
      var id = LOGOS[i];
      var page = pages[i];
      if (id === currentId || page === currentPage || clearedPages.indexOf(page) >= 0) continue;
      clearedPages.push(page);
      var section = page.querySelector('.page-section[data-section="news"]');
      if (section && section._hotspotBuilt) {
        disposeSectionCardResources(section);
        section.innerHTML = '';
        section._hotspotBuilt = false;
        section._hotspot = null;
      }
    }
  }

  function hotspotRowsFromFragment(fragment, id) {
    var map = fragment && fragment.hotspots;
    var rows = map && Array.isArray(map[id]) ? map[id] : [];
    return normalizeHotspotPosts(rows);
  }

  function loadAllHotspotDataForLeaderboards() {
    if (allHotspotLeaderboardLoadPromise) return allHotspotLeaderboardLoadPromise;
    var ids = ((dataStore && dataStore.core) || []).map(function (row) {
      return row && row.id ? String(row.id) : '';
    }).filter(Boolean);
    allHotspotLeaderboardLoadPromise = Promise.all(ids.map(function (id) {
      var state = hotspotMemory[id];
      var rowsPromise;
      if (state && state.postsLoaded) rowsPromise = Promise.resolve(hotspotPostsOf(id));
      else if (state && state.postsPromise) rowsPromise = state.postsPromise.then(function () { return hotspotPostsOf(id); });
      else rowsPromise = loadDataFragmentRaw('news', id).then(function (fragment) {
        return hotspotRowsFromFragment(fragment, id);
      });
      return rowsPromise.then(function (rows) {
        setHotspotActivityStats(id, rows);
      });
    })).then(function () {
      hotspotLeaderboardStatsReady = true;
      rebuildHotspotAggregatedStats();
      releaseHotspotDataExcept(LOGOS[state.index]);
      // 汇总热点经验后同步底部经验条与个人页，避免只更新榜单卡片。
      refreshUserExperience();
      schedulePauseLeaderboardRender();
      return true;
    });
    return allHotspotLeaderboardLoadPromise;
  }

  function renderPauseLeaderboards() {
    var leaderboardSlots = allPauseLeaderboardSlots();
    if (!leaderboardSlots.length) return;
    if (!allHotspotLeaderboardLoadPromise) {
      loadAllHotspotDataForLeaderboards();
      return;
    }
    if (!pauseLeaderboardShopRequested && (!shopStore.shops || !Object.keys(shopStore.shops).length)) {
      pauseLeaderboardShopRequested = true;
      fetchShop().then(function () { schedulePauseLeaderboardRender(); });
    }

    var names = pauseLeaderboardUsers();
    var experienceRows = buildPauseRanking(names, totalExperienceForUser);
    var valueRows = buildPauseRanking(names, accountValueForUser);
    var commentRows = buildPauseRanking(names, hotspotCharacterCountForUser);

    leaderboardSlots.forEach(function (slot) {
      var type = slot.getAttribute('data-leaderboard');
      if (type === 'experience') {
        renderPauseLeaderboardSlot(slot, '老登等级榜', experienceRows, function (value) {
          var metrics = userLevelMetrics(value);
          return metrics.label + ' 级 ' + formatExperienceNumber(value) + ' 经验';
        }, function (value) {
          return ['Lv' + userLevelMetrics(value).label, pauseLeaderboardFullNumber(value)];
        });
      } else if (type === 'value') {
        renderPauseLeaderboardSlot(slot, '全勤价值榜', valueRows, function (value) {
          return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' 猪元';
        });
      } else if (type === 'comments') {
        renderPauseLeaderboardSlot(slot, '水军发言榜', commentRows, function (value) {
          return formatExperienceNumber(value) + ' 字符';
        });
      }
    });
    schedulePauseLeaderboardViewportUpdate();
  }
  if (window.ResizeObserver) {
    var pauseLeaderboardResizeObserver = new ResizeObserver(schedulePauseLeaderboardViewportUpdate);
    pauseAdSlots.forEach(function (slot) { pauseLeaderboardResizeObserver.observe(slot); });
  }
  window.addEventListener('resize', schedulePauseLeaderboardViewportUpdate);
  window.addEventListener('orientationchange', schedulePauseLeaderboardViewportUpdate);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', schedulePauseLeaderboardViewportUpdate);
  }
  /* ---------- 首页内容：渲染到 page-section[data-section=home]，随底栏活动切换 ---------- */
  function achvRankClass(r) {
    var rank = normalizeAchvRarity(r);
    if (rank === '幻彩') return 'r-iridescent';
    if (rank === '紫金') return 'r-purplegold';
    if (rank === '铂金') return 'r-platinum';
    if (rank === '黄金') return 'r-gold';
    if (rank === '白银') return 'r-silver';
    return 'r-bronze';
  }

  var LINE_MARQUEE_SELECTOR = [
    '.home-info-grid dd',
    '.home-achv-name',
    '.home-achv-desc',
    '.achv-group-name',
    '.achv-group-desc',
    '.review-activity-name',
    '.review-item-org',
    '.review-detail-org',
    '.shop-owned-text',
    '.shop-version-name',
    '.shop-dlc-heading'
  ].join(',');

  var lineMarqueeReducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var LINE_MARQUEE_INITIAL_PAUSE_MS = 1000;
  var LINE_MARQUEE_PAUSE_MS = 3000;

  function stopLineMarquee(el) {
    if (!el) return;
    el.classList.remove('is-scrolling');
    var scroll = el.querySelector('.line-marquee__scroll');
    if (!scroll || !scroll._lineMarqueeAnimation) return;
    scroll._lineMarqueeAnimation.cancel();
    scroll._lineMarqueeAnimation = null;
  }

  function makeLineMarqueeAnimation(el, pauseMs, iterations) {
    var scroll = el && el.querySelector('.line-marquee__scroll');
    var content = el && el.querySelector('.line-marquee__content');
    if (!scroll || !content || !scroll.animate) return null;
    var textWidth = content.getBoundingClientRect().width;
    var moveDuration = Math.max(6, Math.min(28, textWidth / 42));
    var totalDuration = pauseMs + moveDuration * 1000;
    var pauseOffset = pauseMs / totalDuration;
    return scroll.animate([
      { transform: 'translate3d(0, 0, 0)', offset: 0 },
      { transform: 'translate3d(0, 0, 0)', offset: pauseOffset },
      { transform: 'translate3d(-50%, 0, 0)', offset: 1 }
    ], {
      duration: totalDuration,
      iterations: iterations,
      easing: 'linear'
    });
  }

  function startLineMarquee(el) {
    if (!el || !el.classList.contains('is-overflowing')) return;
    if (lineMarqueeReducedMotion && lineMarqueeReducedMotion.matches) return;
    if (el.classList.contains('is-scrolling')) return;
    var scroll = el.querySelector('.line-marquee__scroll');
    if (!scroll) return;
    el.classList.add('is-scrolling');
    var firstAnimation = makeLineMarqueeAnimation(el, LINE_MARQUEE_INITIAL_PAUSE_MS, 1);
    if (!firstAnimation) {
      el.classList.remove('is-scrolling');
      return;
    }
    scroll._lineMarqueeAnimation = firstAnimation;
    firstAnimation.onfinish = function () {
      if (!el.classList.contains('is-scrolling') || !el.classList.contains('is-overflowing')) return;
      firstAnimation.onfinish = null;
      firstAnimation.cancel();
      var loopAnimation = makeLineMarqueeAnimation(el, LINE_MARQUEE_PAUSE_MS, Infinity);
      if (loopAnimation) scroll._lineMarqueeAnimation = loopAnimation;
    };
  }

  var lineMarqueeResizeObserver = window.ResizeObserver ? new ResizeObserver(function (entries) {
    entries.forEach(function (entry) { refreshLineMarquee(entry.target); });
  }) : null;

  var outerAutoMarqueeObserver = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var el = entry.target;
      el.dataset.outerAutoMarqueeInView = entry.isIntersecting ? '1' : '0';
      if (!document.documentElement.classList.contains('outer-screen-layout')) {
        stopLineMarquee(el);
        return;
      }
      if (entry.isIntersecting) {
        refreshLineMarquee(el);
        startLineMarquee(el);
      } else {
        stopLineMarquee(el);
      }
    });
  }, { threshold: 0.01 }) : null;

  function refreshLineMarquee(el) {
    if (!el || !el.classList || !el.classList.contains('line-marquee')) return;
    var content = el.querySelector('.line-marquee__content');
    if (!content) return;
    var availableWidth = el.clientWidth;
    var textWidth = content.getBoundingClientRect().width;
    var overflowing = availableWidth > 0 && textWidth > availableWidth + 1;
    el.classList.toggle('is-overflowing', overflowing);
    if (!overflowing) {
      stopLineMarquee(el);
    } else if (
      el.matches(':hover') ||
      (document.documentElement.classList.contains('outer-screen-layout') && el.dataset.outerAutoMarqueeInView === '1')
    ) {
      startLineMarquee(el);
    }
  }

  function initLineMarquee(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.dataset.lineMarqueeReady === '1') {
      refreshLineMarquee(el);
      return;
    }
    var text = el.textContent || '';
    if (!text.trim()) return;
    el.dataset.lineMarqueeReady = '1';
    el.classList.add('line-marquee');

    var staticText = document.createElement('span');
    staticText.className = 'line-marquee__static';
    staticText.textContent = text;

    var scroll = document.createElement('span');
    scroll.className = 'line-marquee__scroll';
    for (var i = 0; i < 2; i++) {
      var chunk = document.createElement('span');
      chunk.className = 'line-marquee__chunk';
      var content = document.createElement('span');
      content.className = 'line-marquee__content';
      content.textContent = text;
      chunk.appendChild(content);
      scroll.appendChild(chunk);
    }

    el.replaceChildren(staticText, scroll);
    el.addEventListener('mouseenter', function () { startLineMarquee(el); });
    el.addEventListener('mouseleave', function () { stopLineMarquee(el); });
    if (lineMarqueeResizeObserver) lineMarqueeResizeObserver.observe(el);
    if (outerAutoMarqueeObserver && el.classList.contains('outer-auto-marquee')) outerAutoMarqueeObserver.observe(el);
    requestAnimationFrame(function () { refreshLineMarquee(el); });
  }

  function disposeLineMarqueeResources(root) {
    if (!root || !root.querySelectorAll) return;
    var nodes = Array.prototype.slice.call(root.querySelectorAll(LINE_MARQUEE_SELECTOR));
    if (root.matches && root.matches(LINE_MARQUEE_SELECTOR)) nodes.push(root);
    nodes.forEach(function (el) {
      stopLineMarquee(el);
      if (lineMarqueeResizeObserver) lineMarqueeResizeObserver.unobserve(el);
      if (outerAutoMarqueeObserver) outerAutoMarqueeObserver.unobserve(el);
    });
  }

  function initLineMarquees(root) {
    var scope = root && root.nodeType === 1 ? root : document;
    var nodes = [];
    if (scope.matches && scope.matches(LINE_MARQUEE_SELECTOR)) nodes.push(scope);
    if (scope.querySelectorAll) {
      nodes = nodes.concat(Array.prototype.slice.call(scope.querySelectorAll(LINE_MARQUEE_SELECTOR)));
    }
    nodes.forEach(initLineMarquee);
  }

  window.addEventListener('resize', function () {
    requestAnimationFrame(function () { initLineMarquees(document); });
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { initLineMarquees(document); });
  }

  var ACHV_TROPHY_PATH = 'M7 3h10v2h3v2c0 3.2-2.1 5.7-5 6.4V17h3v3H6v-3h3v-3.6C6.1 12.7 4 10.2 4 7V5h3V3zm2 2v2c0 2.7 1.4 4.8 3 4.8s3-2.1 3-4.8V5H9zM6 7H5c0 1.7.7 3.1 2 4V8.4C6.3 8.1 6 7.6 6 7zm12 0c0 .6-.3 1.1-1 1.4V11c1.3-.9 2-2.3 2-4h-1z';
  var ACHV_TROPHY_MARKUP =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="' + ACHV_TROPHY_PATH + '"/></svg>';
  function makeAchvTrophyIcon() {
    var icon = document.createElement('span');
    icon.innerHTML = ACHV_TROPHY_MARKUP;
    return icon.firstChild;
  }


  function makeAchvMetric(value, label) {
    var metric = document.createElement('div');
    metric.className = 'achv-metric';
    var v = document.createElement('div');
    v.className = 'achv-metric-value';
    v.textContent = value;
    var l = document.createElement('div');
    l.className = 'achv-metric-label';
    l.textContent = label;
    metric.appendChild(v); metric.appendChild(l);
    return metric;
  }

  function makeAchvSummary(rows) {
    var stats = achvSummaryOf(rows);
    var summary = document.createElement('div');
    summary.className = 'achv-summary';
    var main = document.createElement('div');
    main.className = 'achv-summary-main';
    [
      { value: stats.total, label: '全部' },
      { value: stats.counts.platinum, label: '幻彩' },
      { value: stats.counts.gold, label: '黄金' },
      { value: stats.counts.silver, label: '白银' },
      { value: stats.counts.bronze, label: '青铜' }
    ].forEach(function (metric) {
      main.appendChild(makeAchvMetric(String(metric.value || 0), metric.label));
    });
    summary.appendChild(main);
    return summary;
  }

  function setAchvGroupIcon(icon, id, group, index) {
    bindResponsiveAsset(icon, 'wallpaper/' + id + '.png', 'achievements');
    if (index === 0) return;
    var namedOriginal = achvIconOriginalUrl(id, group.name);
    var namedUrl = responsiveImageUrl(namedOriginal);
    imgExists(namedUrl).then(function (exists) {
      if (exists) bindResponsiveAsset(icon, namedOriginal);
    });
  }

  function makeAchvGroupRow(id, group, index, category, onOpen) {
    var row = document.createElement('button');
    row.className = 'achv-group-row';
    row.type = 'button';
    row.setAttribute('aria-label', '打开' + category + '奖杯组 ' + group.name);

    var icon = document.createElement('span');
    icon.className = 'achv-group-icon';
    setAchvGroupIcon(icon, id, group, index);

    var info = document.createElement('span');
    info.className = 'achv-group-info';
    var name = document.createElement('span');
    name.className = 'achv-group-name';
    name.textContent = group.name;
    var desc = document.createElement('span');
    desc.className = 'achv-group-desc';
    desc.textContent = category;
    info.appendChild(name); info.appendChild(desc);

    row.appendChild(icon); row.appendChild(info);
    row.onclick = onOpen;
    return row;
  }

  function makeAchvItem(id, item) {
    var row = document.createElement('div');
    row.className = 'home-achv ' + achvRankClass(item.rarity);
    var icon = document.createElement('div');
    icon.className = 'home-achv-icon';
    bindResponsiveAsset(icon, achvIconOriginalUrl(id, item.name));
    row.appendChild(icon);

    var info = document.createElement('div');
    info.className = 'home-achv-info';
    var name = document.createElement('div');
    name.className = 'home-achv-name';
    name.textContent = item.name;
    info.appendChild(name);
    if (item.desc) {
      var desc = document.createElement('div');
      desc.className = 'home-achv-desc';
      desc.textContent = item.desc;
      info.appendChild(desc);
    }
    row.appendChild(info);

    var rank = document.createElement('span');
    rank.className = 'home-achv-rank';
    rank.appendChild(makeAchvTrophyIcon());
    row.appendChild(rank);
    return row;
  }

  function makeAchvOverview(id, groups, onOpenGroup) {
    var view = document.createElement('div');
    view.className = 'achv-view';
    var allRows = [];
    groups.forEach(function (group) { allRows = allRows.concat(group.achievements); });
    view.appendChild(makeAchvSummary(allRows));

    var list = document.createElement('div');
    list.className = 'achv-group-list';
    groups.forEach(function (group, index) {
      var category = index === 0 ? '完整版游戏' : '追加内容';
      list.appendChild(makeAchvGroupRow(id, group, index, category, function () {
        onOpenGroup(index);
      }));
    });
    view.appendChild(list);
    return view;
  }

  function makeAchvDetail(id, group) {
    var view = document.createElement('div');
    view.className = 'achv-view';
    var rows = group.achievements;
    view.appendChild(makeAchvSummary(rows));
    var list = document.createElement('div');
    list.className = 'home-achv-list';
    rows.forEach(function (item) { list.appendChild(makeAchvItem(id, item)); });
    view.appendChild(list);
    return view;
  }

  // 为指定活动填充首页板块内容（延迟加载测评/成就数据后渲染）
  function fillHomeSection(logo) {
    var page = pages[LOGOS.indexOf(logo)];
    if (!page) return;
    var homeSection = page.querySelector('.page-section[data-section="home"]');
    if (homeSection) {
      ['.home-achv-card', '.home-review-card', '.home-detail-card'].forEach(function (selector) {
        var card = homeSection.querySelector(selector);
        var body = card && card.querySelector(':scope > .section-card-body');
        if (body) body.replaceChildren();
      });
    }
    var renderToken = page._homeRenderToken || 0;
    // 先确保测评和成就数据已加载；渲染时重新取 DOM，避免 buildDock 重建后 sec 失效
    Promise.all([fetchReview(logo), fetchAchv(logo), fetchShop(logo)]).then(function () {
      if (!page.isConnected || renderToken !== (page._homeRenderToken || 0)) return;
      applyReviewData(logo);
      applyAchvData(logo);
      applyShopData(logo);
      var sec = page.querySelector('.page-section[data-section="home"]');
      if (!sec) return;
      renderHomeInto(sec, logo);
      layoutTopbarIdentity();
    });
  }

  function renderHomeInto(container, id) {
    container._outerHomeView = 'home';
    container.classList.remove('outer-home-view-detail', 'outer-home-view-achv', 'outer-home-view-review');
    container.classList.add('outer-home-view-home');

    var rightColumn = null;
    var rightColumnBody = null;
    var mergedDetailOnly = false;
    var mergedReviewOnly = false;
    var mergedOverviewScrollTop = 0;
    var mergedOverviewPositionCaptured = false;
    var mergedRestoreTimer = 0;

    function rememberMergedOverviewPosition() {
      if (!rightColumnBody) return;
      mergedOverviewScrollTop = rightColumnBody.scrollTop;
      mergedOverviewPositionCaptured = true;
    }

    function syncMergedSecondaryView(detailOnly, reviewOnly) {
      var secondary = !!(detailOnly || reviewOnly);
      var wasSecondary = !!(mergedDetailOnly || mergedReviewOnly);
      if (rightColumnBody && secondary && !wasSecondary && !mergedOverviewPositionCaptured) {
        mergedOverviewScrollTop = rightColumnBody.scrollTop;
      }
      if (secondary) mergedOverviewPositionCaptured = true;
      mergedDetailOnly = !!detailOnly;
      mergedReviewOnly = !!reviewOnly;
      if (rightColumn) {
        rightColumn.classList.toggle('portrait-detail-secondary', mergedDetailOnly);
        rightColumn.classList.toggle('portrait-review-secondary', mergedReviewOnly);
      }
      if (rightColumnBody) {
        if (secondary) {
          if (mergedRestoreTimer) clearTimeout(mergedRestoreTimer);
          mergedRestoreTimer = 0;
          rightColumnBody.scrollTop = 0;
        } else if (wasSecondary) {
          var restoreTop = mergedOverviewScrollTop;
          mergedOverviewPositionCaptured = false;
          function restoreOverviewPosition() {
            if (!mergedDetailOnly && !mergedReviewOnly) rightColumnBody.scrollTop = restoreTop;
          }
          void rightColumnBody.scrollHeight;
          restoreOverviewPosition();
          requestAnimationFrame(restoreOverviewPosition);
          if (mergedRestoreTimer) clearTimeout(mergedRestoreTimer);
          mergedRestoreTimer = window.setTimeout(function () {
            mergedRestoreTimer = 0;
            restoreOverviewPosition();
          }, 650);
        }
      }
    }

    // 辅助：创建一个卡片（body 内部可滚动）
    function card(title, bodyEl, reusableKey, extraClass) {
      if (reusableKey) {
        var reusableShell = makeReusableCardShell(reusableKey, extraClass || '', title, true);
        reusableShell.body.appendChild(bodyEl);
        return reusableShell.card;
      }
      var c = document.createElement('div');
      c.className = 'section-card';
      var t = document.createElement('div');
      t.className = 'section-card-title';
      t.textContent = title;
      c.appendChild(t);
      var b = document.createElement('div');
      b.className = 'section-card-body';
      b.appendChild(bodyEl);
      c.appendChild(b);
      attachManualScroll(b);
      return c;
    }

    // 第 1 列（25%）：成就。存在《奖杯组》时先显示总览，再进入组详情；旧数据直接显示详情。
    var achvs = achvsOf(id);
    var groups = achvGroupsOf(achvs);
    var hasGroups = groups.some(function (g) { return g.named; });
    var achvBody = document.createElement('div');
    achvBody.className = 'home-achv-list';
    var achvCard = card('实绩', achvBody, 'home-achv', 'home-achv-card');
    var achvScroll = achvCard.querySelector('.section-card-body');
    var achvTitleEl = achvCard.querySelector('.section-card-title');
    var achvBackBtn = document.createElement('button');
    achvBackBtn.className = 'achv-detail-back achv-title-back';
    achvBackBtn.type = 'button';
    achvBackBtn.setAttribute('aria-label', '返回奖杯组');
    achvBackBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M20 12H4M12 4l-8 8 8 8"/></svg>';
    achvBackBtn.hidden = true;
    achvBackBtn.onclick = showAchvOverview;
    achvTitleEl.appendChild(achvBackBtn);

    function setAchvView(node, showBack) {
      achvBody.innerHTML = '';
      achvBody.appendChild(node);
      achvBackBtn.hidden = !showBack;
      container._outerAchvSecondary = !!showBack;
      container._outerAchvBack = showAchvOverview;
      if (showBack) enterOuterSecondary(container, true);
      else if (container._outerSecondaryActive === true) leaveOuterSecondary(container);
      else resetOuterPageScroll(container);
      if (achvScroll) achvScroll.scrollTop = 0;
      animateCardBody(achvBody, 0);
      initLineMarquees(achvBody);
      invalidateCursorTargetCache();
      configureTopActions();
    }

    function showAchvOverview() {
      setAchvView(makeAchvOverview(id, groups, showAchvGroup), false);
    }

    function showAchvGroup(index) {
      var group = groups[index];
      if (!group) return;
      setAchvView(makeAchvDetail(id, group), true);
    }

    if (achvCard.parentNode !== container) container.appendChild(achvCard);
    if (hasGroups) {
      showAchvOverview();
    } else {
      setAchvView(makeAchvDetail(id, groups[0] || { name: '', achievements: [] }), false);
    }

    // 第 2 列（50%）：测评总览与二级详情
    function createReviewCard(id) {
      var reviewGroups = reviewGroupsOf(id);
      var reviews = (reviewGroups[0] && reviewGroups[0].reviews) || [];
      var hasReviews = reviewGroups.some(function (group) {
        return group && group.reviews && group.reviews.length > 0;
      });
      var activityName = id;
      var core = (dataStore && dataStore.core) || [];
      for (var ci = 0; ci < core.length; ci++) {
        if (core[ci] && core[ci].id === id) { activityName = core[ci].englishName || core[ci].name || id; break; }
      }

      var reviewShell = makeReusableCenterCard('home', 'home-review-card', '测评');
      var reviewCard = reviewShell.card;
      var reviewScroll = reviewShell.body;
      var reviewTitleEl = reviewShell.title;
      var reviewBody = document.createElement('div');
      reviewBody.className = 'review-view';
      reviewScroll.appendChild(reviewBody);
      reviewCard.classList.toggle('is-empty-reviews', !hasReviews);
      reviewCard.dataset.activityId = id;
      var reviewBackBtn = document.createElement('button');
      reviewBackBtn.className = 'achv-detail-back achv-title-back';
      reviewBackBtn.type = 'button';
      reviewBackBtn.setAttribute('aria-label', '返回测评总览');
      reviewBackBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M20 12H4M12 4l-8 8 8 8"/></svg>';
      reviewBackBtn.hidden = true;
      reviewBackBtn.onclick = showPreviousReviewView;
      reviewTitleEl.appendChild(reviewBackBtn);

      var reviewNextBtn = document.createElement('button');
      reviewNextBtn.className = 'achv-detail-back achv-title-next';
      reviewNextBtn.type = 'button';
      reviewNextBtn.setAttribute('aria-label', '下一类测评');
      reviewNextBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M20 12H4M12 4l-8 8 8 8"/></svg>';
      reviewNextBtn.hidden = true;
      reviewNextBtn.onclick = showNextReviewCategory;
      reviewTitleEl.appendChild(reviewNextBtn);

      var overviewScrollTop = 0;
      var overviewOuterScrollTop = 0;
      var reviewPageIndex = 0;
      var reviewShowingDetail = false;

      function makeScoreBadge(value) {
        var badge = document.createElement('div');
        badge.className = 'review-item-score ' + reviewScoreClass(value);
        badge.textContent = String(reviewScoreValue(value));
        return badge;
      }

      function makeBarSegment(band, count, total) {
        var segment = document.createElement('i');
        segment.className = 'review-score-segment review-score-segment-' + band;
        segment.style.width = total ? ((count / total) * 100).toFixed(4) + '%' : '0%';
        return segment;
      }

      function makeReviewItem(review, flat) {
        var item = document.createElement('div');
        item.className = 'review-item';
        var head = document.createElement('div');
        head.className = 'review-item-head';
        head.appendChild(makeScoreBadge(review.score));
        var org = document.createElement('div');
        org.className = 'review-item-org' + (document.documentElement.classList.contains('outer-screen-layout') ? ' outer-auto-marquee' : '');
        org.textContent = review.org || '';
        head.appendChild(org);
        var label = document.createElement('div');
        label.className = 'review-item-label review-score-text-' + reviewScoreBand(review.score);
        label.textContent = reviewScoreLabel(review.score);
        head.appendChild(label);
        item.appendChild(head);

        var text = reviewTextOf(review);
        var excerpt = document.createElement('div');
        excerpt.className = 'review-item-text' + (text ? '' : ' is-empty');
        excerpt.textContent = text || '暂无评测内容';
        item.appendChild(excerpt);

        function enableReviewDetail() {
          if (item.classList.contains('is-clickable')) return;
          item.classList.add('is-clickable');
          item.tabIndex = 0;
          item.setAttribute('role', 'button');
          item.setAttribute('aria-label', '查看' + (review.org || '媒体') + '的完整测评');
          item.onclick = function () {
            rememberMergedOverviewPosition();
            showReviewDetail(review);
          };
          item.onkeydown = function (event) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            showReviewDetail(review);
          };
        }
        if (text && !flat) {
          enableReviewDetail();
        } else if (text && flat) {
          requestAnimationFrame(function () {
            var probe = excerpt.cloneNode(true);
            var rect = excerpt.getBoundingClientRect();
            probe.style.position = 'fixed';
            probe.style.left = '-10000px';
            probe.style.top = '0';
            probe.style.width = Math.max(1, rect.width) + 'px';
            probe.style.setProperty('height', 'auto', 'important');
            probe.style.setProperty('max-height', 'none', 'important');
            probe.style.setProperty('min-height', '0', 'important');
            probe.style.setProperty('overflow', 'visible', 'important');
            probe.style.setProperty('display', 'block', 'important');
            probe.style.setProperty('-webkit-line-clamp', 'unset', 'important');
            probe.style.setProperty('-webkit-box-orient', 'initial', 'important');
            document.body.appendChild(probe);
            var overflowing = probe.scrollHeight > excerpt.clientHeight + 1;
            probe.remove();
            if (overflowing) enableReviewDetail();
          });
        }
        return item;
      }

      function renderReviewList(list) {
        list.innerHTML = '';
        reviews.filter(function (review) {
          return reviewScoreBand(review.score) !== 'none';
        }).sort(compareReviewsByScore).forEach(function (review) {
          list.appendChild(makeReviewItem(review));
        });
        animateCardBody(list, 0);
      }

      function makeReviewOverviewHead(sourceReviews, displayName, autoMarquee) {
        var stats = reviewStats(sourceReviews);
        var overviewHead = document.createElement('div');
        overviewHead.className = 'review-overview-head';
        var overviewMain = document.createElement('div');
        overviewMain.className = 'review-overview-main';
        var name = document.createElement('div');
        name.className = 'review-activity-name' + (autoMarquee ? ' outer-auto-marquee' : '');
        name.textContent = displayName || activityName;
        var bar = document.createElement('div');
        bar.className = 'review-score-bar review-overview-bar' + (stats.count ? '' : ' is-empty');
        if (stats.count) {
          bar.appendChild(makeBarSegment('positive', stats.positive, stats.count));
          bar.appendChild(makeBarSegment('mixed', stats.mixed, stats.count));
          bar.appendChild(makeBarSegment('negative', stats.negative, stats.count));
        }
        overviewMain.appendChild(name);
        overviewMain.appendChild(bar);
        overviewHead.appendChild(overviewMain);
        if (stats.count >= 4 && stats.average !== null && stats.average >= 96) {
          var mustPlay = document.createElement('img');
          mustPlay.className = 'review-must-play';
          bindResponsiveAsset(mustPlay, 'logo/must-play.png');
          mustPlay.alt = 'Must Play';
          mustPlay.loading = 'lazy';
          overviewHead.appendChild(mustPlay);
        }
        if (stats.average !== null) {
          var mediaScore = document.createElement('div');
          mediaScore.className = 'review-item-score review-overview-score ' + reviewScoreClass(stats.average);
          mediaScore.textContent = String(stats.average);
          overviewHead.appendChild(mediaScore);
        }
        return { head: overviewHead, stats: stats };
      }

      function makeReviewOverview() {
        var outerMode = document.documentElement.classList.contains('outer-screen-layout');
        var view = document.createElement('div');
        view.className = 'review-overview' + (outerMode ? ' review-flat-summary' : '');
        var overview = makeReviewOverviewHead(reviews, (reviewGroups[reviewPageIndex] && reviewGroups[reviewPageIndex].name) || activityName, outerMode);
        view.appendChild(overview.head);

        var list = document.createElement('div');
        list.className = 'review-list';
        view.appendChild(list);
        renderReviewList(list);
        return view;
      }

      function makeReviewDetail(review) {
        var view = document.createElement('div');
        view.className = 'review-detail';
        var head = document.createElement('div');
        head.className = 'review-detail-head';
        head.appendChild(makeScoreBadge(review.score));
        var org = document.createElement('div');
        org.className = 'review-detail-org';
        org.textContent = review.org || '';
        head.appendChild(org);
        var label = document.createElement('div');
        label.className = 'review-item-label review-score-text-' + reviewScoreBand(review.score);
        label.textContent = reviewScoreLabel(review.score);
        head.appendChild(label);
        view.appendChild(head);
        var text = document.createElement('div');
        text.className = 'review-detail-text';
        var body = reviewTextOf(review) || '暂无评测内容';
        // 首行缩进条件：段落数 ≥ 2，且至少有一段 ≥ 120 个汉字（1 汉字 = 2 字母）
        // 不满足时按原样显示（换行仍然保留，只是不缩进）
        var paragraphs = body.split('\n').map(function (line) { return String(line).replace(/\r$/, ''); });
        var filledParagraphs = paragraphs.filter(function (line) { return line.trim() !== ''; });
        var hasLongParagraph = filledParagraphs.some(function (line) { return reviewParagraphWeight(line) >= 120; });
        if (filledParagraphs.length >= 2 && hasLongParagraph) {
          text.classList.add('is-paragraphs');
          paragraphs.forEach(function (line) {
            var p = document.createElement('div');
            p.className = 'review-detail-paragraph' + (line.trim() === '' ? ' is-blank' : '');
            p.textContent = line;
            text.appendChild(p);
          });
        } else {
          text.textContent = body;
        }
        view.appendChild(text);
        return view;
      }

      function updateReviewNavigation() {
        var hasPagination = reviewGroups.length > 1;
        reviewCard.classList.toggle('has-review-pagination', hasPagination);
        if (reviewShowingDetail) {
          reviewBackBtn.hidden = false;
          reviewNextBtn.hidden = true;
          reviewBackBtn.setAttribute('aria-label', '返回测评总览');
          return;
        }
        reviewBackBtn.hidden = !hasPagination || reviewPageIndex <= 0;
        reviewNextBtn.hidden = !hasPagination || reviewPageIndex >= reviewGroups.length - 1;
        reviewBackBtn.setAttribute('aria-label', '上一类测评');
      }

      function setReviewView(node, showBack) {
        reviewShowingDetail = !!showBack;
        container._outerReviewDetail = reviewShowingDetail;
        container._outerReviewBack = showReviewOverview;
        reviewBody.innerHTML = '';
        reviewBody.appendChild(node);
        updateReviewNavigation();
        if (reviewScroll) reviewScroll.scrollTop = 0;
        syncMergedSecondaryView(mergedDetailOnly, reviewShowingDetail);
        if (showBack) enterOuterSecondary(container, true);
        else if (container._outerSecondaryActive === true) leaveOuterSecondary(container);
        else resetOuterPageScroll(container);
        animateCardBody(reviewBody, 0);
        initLineMarquees(reviewBody);
        invalidateCursorTargetCache();
        configureTopActions();
      }

      function showReviewCategory(index) {
        var group = reviewGroups[index];
        if (!group) return;
        reviewPageIndex = index;
        reviews = group.reviews || [];
        overviewScrollTop = 0;
        showReviewOverview();
      }

      function showPreviousReviewView() {
        if (reviewShowingDetail) {
          showReviewOverview();
          return;
        }
        if (reviewPageIndex > 0) showReviewCategory(reviewPageIndex - 1);
      }

      function showNextReviewCategory() {
        if (reviewShowingDetail) return;
        showReviewCategory(reviewPageIndex + 1);
      }

      function showReviewOverview() {
        var outerMode = document.documentElement.classList.contains('outer-screen-layout');
        setReviewView(outerMode ? makeReviewFlatList() : makeReviewOverview(), false);
        if (outerMode) {
          setOuterPageScroll(container, overviewOuterScrollTop);
          requestAnimationFrame(function () { setOuterPageScroll(container, overviewOuterScrollTop); });
        } else if (reviewScroll) {
          reviewScroll.scrollTop = overviewScrollTop;
        }
      }

      function showReviewDetail(review) {
        if (document.documentElement.classList.contains('outer-screen-layout')) {
          overviewOuterScrollTop = container.scrollTop;
        } else if (reviewScroll) {
          overviewScrollTop = reviewScroll.scrollTop;
        }
        setReviewView(makeReviewDetail(review), true);
      }

      function makeReviewFlatList() {
        var flatList = document.createElement('div');
        flatList.className = 'review-list review-flat-list';
        reviewGroups.forEach(function (group, groupIndex) {
          var groupReviews = (group.reviews || []).filter(function (review) {
            return reviewScoreBand(review.score) !== 'none';
          }).sort(compareReviewsByScore);
          if (!groupReviews.length) return;
          var groupName = group.name || activityName || ('测评 ' + (groupIndex + 1));
          var flatSummary = document.createElement('div');
          flatSummary.className = 'review-overview review-flat-summary';
          flatSummary.appendChild(makeReviewOverviewHead(groupReviews, groupName, true).head);
          flatList.appendChild(flatSummary);
          groupReviews.forEach(function (review) {
            flatList.appendChild(makeReviewItem(review, true));
          });
        });
        return flatList;
      }

      if (document.documentElement.classList.contains('outer-screen-layout')) {
        reviewCard.classList.add('review-flat');
        reviewTitleEl.hidden = true;
        reviewBody.innerHTML = '';
        reviewBody.appendChild(makeReviewFlatList());
        initLineMarquees(reviewBody);
        animateCardBody(reviewBody, 0);
        return reviewCard;
      }
      showReviewOverview();
      return reviewCard;
    }
    var reviewCard = createReviewCard(id);

    // 第 3 列（25%）：详情与商店版本二级页
    var info = infoOf(id);
    var shop = shopOf(id);
    var activityName = (info && info.name) || id;
    var detailBody = document.createElement('div');
    detailBody.className = 'home-detail';
    var detailCard = card('详情', detailBody, 'home-detail', 'home-detail-card');
    detailCard.dataset.activityId = id;
    var detailScroll = detailCard.querySelector('.section-card-body');
    var detailTitleEl = detailCard.querySelector('.section-card-title');
    var detailBackBtn = document.createElement('button');
    detailBackBtn.className = 'achv-detail-back achv-title-back';
    detailBackBtn.type = 'button';
    detailBackBtn.setAttribute('aria-label', '返回活动详情');
    detailBackBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M20 12H4M12 4l-8 8 8 8"/></svg>';
    detailBackBtn.hidden = true;
    detailBackBtn.onclick = showDetailOverview;
    detailTitleEl.appendChild(detailBackBtn);
    var detailOverviewScrollTop = 0;

    function makeLibraryOwners() {
      var view = document.createElement('div');
      view.className = 'shop-detail shop-library-owners';
      var list = document.createElement('div');
      list.className = 'shop-detail-list';
      var ownerItems = ((shop && shop.versions) || []).slice().reverse().map(function (version) {
        var name = libraryText(version.name);
        return name ? { name: name, label: '拥有《' + activityName + '》' + name, kind: 'version' } : null;
      }).filter(Boolean);
      var dlcItems = ((shop && shop.dlcs) || []).map(function (dlc) {
        var name = libraryText(dlc.name);
        return name ? { name: name, label: '持有 ' + name, kind: 'dlc', item: dlc } : null;
      }).filter(Boolean);
      if (!ownerItems.length && !dlcItems.length) {
        var fallbackNames = [];
        var seenVersions = {};
        var record = libraryRecordFor(user && user.name);
        ((record && record.entries) || []).forEach(function (entry) {
          if (entry.id !== id || seenVersions[entry.version]) return;
          seenVersions[entry.version] = true;
          fallbackNames.push(entry.version);
        });
        ownerItems = fallbackNames.reverse().map(function (name) {
          return { name: name, label: '拥有《' + activityName + '》' + name, kind: 'version' };
        });
      }
      ownerItems = ownerItems.concat(dlcItems);

      ownerItems.forEach(function (entry) {
        var owners = entry.kind === 'dlc'
          ? libraryOwnersOfItem(id, entry.item, shop)
          : libraryOwnersOf(id, entry.name);
        if (!owners.length) return;
        var item = document.createElement('div');
        item.className = 'shop-library-owner-group';
        var heading = document.createElement('div');
        heading.className = 'shop-content-name';
        heading.textContent = entry.label;
        item.appendChild(heading);
        var owner = document.createElement('div');
        owner.className = 'shop-content-code';
        owner.textContent = owners.join('、');
        item.appendChild(owner);
        list.appendChild(item);
      });
      view.appendChild(list);
      return view;
    }

    function showLibraryOwners() {
      var view = makeLibraryOwners();
      if (!view.querySelector('.shop-library-owner-group')) return;
      if (detailScroll) detailOverviewScrollTop = detailScroll.scrollTop;
      setDetailView(view, true, 0);
    }

    detailCard.onclick = function (event) {
      var bar = event.target.closest ? event.target.closest('.shop-owned-bar') : null;
      if (!bar || !detailCard.contains(bar)) return;
      rememberMergedOverviewPosition();
      showLibraryOwners();
    };

    function makeShopOverview() {
      var section = document.createElement('section');
      section.className = 'shop-overview';

      var versions = (shop && shop.versions) || [];
      var dlcs = (shop && shop.dlcs) || [];
      var futureRelease = releaseDateIsFuture(info && info.releaseDate);
      var visibleDlcs = futureRelease ? [] : dlcs;
      var purchaseLabel = futureRelease ? '预购' : '购买';

      function shopPriceText(price) {
        var value = shopText(price).replace(/^￥\s*/, '');
        if (!value) return '￥--';
        var number = Number(value);
        if (isFinite(number) && number === 0) return '免费';
        return '￥' + value;
      }

      function appendPurchaseList(items, ownedCheck, compactName) {
        var list = document.createElement('div');
        list.className = 'shop-version-list';
        items.forEach(function (item) {
          var row = document.createElement('div');
          row.className = 'shop-version-card';

          var head = document.createElement('div');
          head.className = 'shop-purchase-head';
          var name = document.createElement('div');
          name.className = 'shop-version-name';
          var fullName = compactName
            ? purchaseLabel + ' ' + item.name
            : purchaseLabel + '《' + activityName + '》' + item.name;
          name.textContent = fullName;
          name.title = fullName;
          head.appendChild(name);
          row.appendChild(head);
          var isOwned = ownedCheck && libraryOwnsShopItem(id, item, shop);
          var isIncluded = !compactName && isOwned && !libraryHasItem(id, item.name);
          var statusKey = compactName
            ? (isOwned ? 'owned' : 'unowned')
            : (isIncluded ? 'included' : (isOwned ? 'owned' : 'unowned'));
          var statusText = compactName
            ? (isOwned ? '已持有' : '未持有')
            : (isIncluded ? '已包含' : (isOwned ? '已拥有' : '未拥有'));

          var actions = document.createElement('div');
          actions.className = 'shop-version-actions';
          var priceTag = document.createElement('span');
          priceTag.className = 'shop-price-tag';
          priceTag.textContent = shopPriceText(item.price);
          var statusButton = document.createElement('button');
          statusButton.className = 'shop-status-button is-' + statusKey;
          statusButton.type = 'button';
          statusButton.textContent = statusText;
          statusButton.setAttribute('aria-label', '查看' + item.name + '详情，当前' + statusText);
          statusButton.onclick = function () {
            rememberMergedOverviewPosition();
            showShopVersion(item);
          };
          actions.appendChild(priceTag);
          actions.appendChild(statusButton);
          row.appendChild(actions);
          list.appendChild(row);
        });
        return list;
      }

      if (!versions.length && !visibleDlcs.length) {
        var empty = document.createElement('div');
        empty.className = 'shop-empty';
        empty.textContent = '暂无购买信息';
        section.appendChild(empty);
        return section;
      }

      if (versions.length) section.appendChild(appendPurchaseList(versions, true, false));

      if (visibleDlcs.length) {
        section.appendChild(appendPurchaseList(visibleDlcs, true, true));
      }
      return section;
    }

    function makeShopDetail(version) {
      var view = document.createElement('div');
      view.className = 'shop-detail';

      var list = document.createElement('div');
      list.className = 'shop-detail-list';
      var contents = version.contents || [];
      if (!contents.length) {
        var empty = document.createElement('div');
        empty.className = 'shop-empty';
        empty.textContent = '暂无包含内容';
        list.appendChild(empty);
      } else {
        contents.forEach(function (content) {
          var item = document.createElement('div');
          item.className = 'shop-content-item';
          var contentName = document.createElement('div');
          contentName.className = 'shop-content-name';
          contentName.textContent = content;
          var code = document.createElement('div');
          code.className = 'shop-content-code';
          var codeValue = shopText(shop && shop.codes && shop.codes[content]);
          var hasCode = !!codeValue && codeValue !== '无代码' && !/^-+$/.test(codeValue);
          var codeText = hasCode ? codeValue : '无代码';
          code.textContent = codeText;
          if (hasCode) {
            code.classList.add('is-copyable');
            code.tabIndex = 0;
            code.setAttribute('role', 'button');
            code.setAttribute('aria-label', '复制代码 ' + codeValue);
            code.title = '点击复制代码';
            var resetTimer = 0;
            var copyCode = function () {
              copyPlainText(codeValue).then(function (copied) {
                clearTimeout(resetTimer);
                code.textContent = copied ? '已复制' : '复制失败';
                code.classList.toggle('is-copied', copied);
                resetTimer = setTimeout(function () {
                  code.textContent = codeText;
                  code.classList.remove('is-copied');
                }, 1000);
              });
            };
            code.addEventListener('click', copyCode);
            code.addEventListener('keydown', function (event) {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              copyCode();
            });
          }
          item.appendChild(contentName);
          item.appendChild(code);
          list.appendChild(item);
        });
      }
      view.appendChild(list);
      return view;
    }

    function makeDetailOverview() {
      var view = document.createElement('div');
      view.className = 'home-detail';

      var logoCard = document.createElement('div');
      logoCard.className = 'home-detail-logo-card';
      var activityLogo = document.createElement('img');
      activityLogo.className = 'home-detail-logo';
      bindResponsiveAsset(activityLogo, 'logo/' + id + '.png');
      activityLogo.alt = activityName;
      activityLogo.decoding = 'async';
      activityLogo.loading = 'lazy';
      activityLogo.onerror = function () { activityLogo.hidden = true; };
      logoCard.appendChild(activityLogo);
      logoCard.setAttribute('role', 'button');
      logoCard.setAttribute('aria-label', '切换活动：' + activityName);
      logoCard.tabIndex = 0;
      logoCard.addEventListener('click', function () {
        if (document.documentElement.classList.contains('outer-screen-layout')) openInnerActivityPicker();
      });
      logoCard.addEventListener('keydown', function (event) {
        if ((event.key === 'Enter' || event.key === ' ') && document.documentElement.classList.contains('outer-screen-layout')) {
          event.preventDefault();
          openInnerActivityPicker();
        }
      });
      view.appendChild(logoCard);

      var infoCard = document.createElement('div');
      infoCard.className = 'home-info-card';
      if (info) {
        var grid = document.createElement('dl');
        grid.className = 'home-info-grid';
        if (info.name) { var dtName = document.createElement('dt'); dtName.dataset.field = 'name'; dtName.textContent = '中文名'; var ddName = document.createElement('dd'); ddName.dataset.field = 'name'; ddName.textContent = info.name; grid.appendChild(dtName); grid.appendChild(ddName); }
        if (info.developer) { var dt = document.createElement('dt'); dt.dataset.field = 'developer'; dt.textContent = '开发商'; var dd = document.createElement('dd'); dd.dataset.field = 'developer'; dd.textContent = info.developer; grid.appendChild(dt); grid.appendChild(dd); }
        if (info.publisher) { var dt2 = document.createElement('dt'); dt2.dataset.field = 'publisher'; dt2.textContent = '发行商'; var dd2 = document.createElement('dd'); dd2.dataset.field = 'publisher'; dd2.textContent = info.publisher; grid.appendChild(dt2); grid.appendChild(dd2); }
        if (info.releaseDate) { var dt3 = document.createElement('dt'); dt3.dataset.field = 'release'; dt3.textContent = '发行日'; var dd3 = document.createElement('dd'); dd3.dataset.field = 'release'; dd3.textContent = info.releaseDate; grid.appendChild(dt3); grid.appendChild(dd3); }
        if (info.tags && info.tags.length) {
          var dtTags = document.createElement('dt');
          dtTags.dataset.field = 'tags';
          dtTags.textContent = '标签类';
          var ddTags = document.createElement('dd');
          ddTags.dataset.field = 'tags';
          ddTags.textContent = info.tags.join('；');
          grid.appendChild(dtTags);
          grid.appendChild(ddTags);
        }
        var versionCount = shop && shop.versions ? shop.versions.length : 0;
        var dtVersions = document.createElement('dt');
        dtVersions.dataset.field = 'versions';
        dtVersions.textContent = '版本数';
        var ddVersions = document.createElement('dd');
        ddVersions.dataset.field = 'versions';
        ddVersions.textContent = String(versionCount);
        grid.appendChild(dtVersions);
        grid.appendChild(ddVersions);
        infoCard.appendChild(grid);
      } else {
        infoCard.appendChild(document.createTextNode('暂无活动详情'));
      }
      var ownedBar = makeLibraryBar(id);
      if (ownedBar) infoCard.appendChild(ownedBar);
      view.appendChild(infoCard);

      if (shop || libraryVersionsOf(id).length) view.appendChild(makeShopOverview());
      return view;
    }

    function setDetailView(node, showBack, scrollTop) {
      detailBody.innerHTML = '';
      detailBody.appendChild(node);
      detailBackBtn.hidden = !showBack;
      if (detailScroll) detailScroll.scrollTop = scrollTop || 0;
      syncMergedSecondaryView(!!showBack, mergedReviewOnly);
      if (showBack) enterOuterSecondary(container, true);
      else if (container._outerSecondaryActive === true) leaveOuterSecondary(container);
      else resetOuterPageScroll(container);
      configureTopActions();
      animateCardBody(detailBody, 0);
      initLineMarquees(detailBody);
      invalidateCursorTargetCache();
    }

    function showDetailOverview() {
      setDetailView(makeDetailOverview(), false, detailOverviewScrollTop);
    }

    container._homeDetailBack = showDetailOverview;

    function showShopVersion(version) {
      if (detailScroll) detailOverviewScrollTop = detailScroll.scrollTop;
      setDetailView(makeShopDetail(version), true, 0);
    }

    showDetailOverview();
    var rightColumnShell = makeReusableColumnShell('home-right', 'home-right-column', 'home-right-column-body');
    rightColumn = rightColumnShell.card;
    rightColumnBody = rightColumnShell.body;
    if (detailCard.parentNode !== rightColumnBody) rightColumnBody.appendChild(detailCard);
    if (reviewCard.parentNode !== rightColumnBody) rightColumnBody.appendChild(reviewCard);
    syncMergedSecondaryView(mergedDetailOnly, mergedReviewOnly);
    if (rightColumn.parentNode !== container) container.appendChild(rightColumn);
    scheduleSectionCardSnap(container);
    configureTopActions();
    invalidateCursorTargetCache();
    var page = container.closest('.page');
    if (page && page.classList.contains('active') && container.classList.contains('active')) {
      if (pagesWrap.classList.contains('entering')) {
        animateSectionCardContents(container);
      } else {
        playInterfaceAnimation(false);
      }
    }
  }

  // 启动时：localStorage 已导入数据优先；否则尝试读取 resources/core.txt、resources/account.txt、resources/title.txt（file:// 下 fetch 被禁，静默跳过）
  function initData() {
    return Promise.all([
      loadDataFragment('core', ''),
      loadDataFragment('account', ''),
      loadDataFragment('title', ''),
      loadDataFragment('shop', ''),
      loadDataFragment('library', '')
    ]).then(function () {
      applyCoreData();
      applyAccountData();
      applyTitleData();
      applyShopData();
      applyLibraryData();
      applyReviewData();
      applyAchvData();
      applyScheduleData();
      applyResourceListData();
      applyHotspotData();
      applyHotspotPoints();
    });
  }

  var interfaceAnimationTimer = 0;
  var CARD_CONTENT_UNIT_SELECTOR = [
    '.achv-summary',
    '.achv-group-row',
    '.home-achv',
    '.home-info-grid',
    '.home-tags',
    '.shop-owned-bar',
    '.shop-dlc-heading',
    '.shop-version-card',
    '.shop-content-item',
    '.shop-library-owner-group',
    '.review-item',
    '.hotspot-search-wrap',
    '.hotspot-post-item',
    '.hotspot-rich-line',
    '.hotspot-comment',
    '.settings-personal-action',
    '.settings-outer-title-card',
    '.settings-outer-setting-card',
    '.settings-rank-slot'
  ].join(',');

  function cardContentUnits(body) {
    var units = Array.prototype.slice.call(body.querySelectorAll(CARD_CONTENT_UNIT_SELECTOR));
    if (units.length) return units;
    units = Array.prototype.slice.call(body.children);
    if (!units.length && body.textContent && body.textContent.trim()) units = [body];
    return units;
  }

  var cardContentTimingCache = null;
  function cardContentTiming() {
    if (cardContentTimingCache) return cardContentTimingCache;
    var rootStyle = getComputedStyle(document.documentElement);
    cardContentTimingCache = {
      stagger: parseFloat(rootStyle.getPropertyValue('--card-content-stagger')) || 24,
      maxDelay: parseFloat(rootStyle.getPropertyValue('--card-content-max-delay')) || 620,
      duration: parseFloat(rootStyle.getPropertyValue('--card-content-duration')) || 460,
      cleanupBuffer: parseFloat(rootStyle.getPropertyValue('--card-content-cleanup-buffer')) || 60
    };
    return cardContentTimingCache;
  }

  // 同一卡片内逐项上浮；不同卡片通过 baseDelay 形成轻微错峰。
  function animateCardBody(body, baseDelay) {
    if (!body || document.documentElement.classList.contains('performance-mode')) return;
    var offset = Number(baseDelay) || 0;
    if (body._contentRiseTimer) {
      clearTimeout(body._contentRiseTimer);
      body._contentRiseTimer = 0;
    }

    var oldUnits = Array.prototype.slice.call(body.querySelectorAll('.card-content-enter'));
    if (body.classList.contains('card-content-enter')) oldUnits.push(body);
    var hadActiveUnits = oldUnits.length > 0;
    oldUnits.forEach(function (unit) {
      unit.classList.remove('card-content-enter');
      unit.style.removeProperty('--content-rise-delay');
    });

    var units = cardContentUnits(body);
    if (!units.length) return;
    if (hadActiveUnits) void body.offsetWidth;

    var timing = cardContentTiming();
    var maxDelay = timing.maxDelay;
    units.forEach(function (unit, index) {
      var delay = offset + Math.min(index * timing.stagger, maxDelay);
      unit.style.setProperty('--content-rise-delay', delay + 'ms');
      unit.classList.add('card-content-enter');
    });

    var lastDelay = offset + Math.min((units.length - 1) * timing.stagger, maxDelay);
    body._contentRiseTimer = setTimeout(function () {
      units.forEach(function (unit) {
        unit.classList.remove('card-content-enter');
        unit.style.removeProperty('--content-rise-delay');
      });
      body._contentRiseTimer = 0;
    }, lastDelay + timing.duration + timing.cleanupBuffer);
  }

  function animateSectionCardContents(section) {
    if (!section) return;
    var cards = section.querySelectorAll('.section-card');
    for (var i = 0; i < cards.length; i++) {
      animateCardBody(cards[i].querySelector('.section-card-body'), Math.min(i * 45, 180));
    }
  }

  function playInterfaceAnimation(includeTopbar) {
    clearScrollIndicators(pagesWrap);
    syncNonOuterCardBlurLayers();
    var dockWrap = dock && dock.closest ? dock.closest('.dock-wrap') : null;
    if (document.documentElement.classList.contains('performance-mode')) {
      if (interfaceAnimationTimer) clearTimeout(interfaceAnimationTimer);
      interfaceAnimationTimer = 0;
      pagesWrap.classList.remove('entering');
      topbar.classList.remove('entering');
      if (dockWrap) dockWrap.classList.remove('entering');
      syncLiquidGlassRenderer(true);
      return;
    }
    if (interfaceAnimationTimer) clearTimeout(interfaceAnimationTimer);
    pagesWrap.classList.remove('entering');
    topbar.classList.remove('entering');
    if (dockWrap) dockWrap.classList.remove('entering');
    void pagesWrap.offsetWidth;
    pagesWrap.classList.add('entering');
    animateSectionCardContents(pagesWrap.querySelector('.page.active .page-section.active'));
    if (includeTopbar !== false) topbar.classList.add('entering');
    if (dockWrap && includeTopbar !== false) {
      void dockWrap.offsetWidth;
      dockWrap.classList.add('entering');
    }
    interfaceAnimationTimer = setTimeout(function () {
      pagesWrap.classList.remove('entering');
      topbar.classList.remove('entering');
      if (dockWrap) dockWrap.classList.remove('entering');
      syncLiquidGlassRenderer(true);
      interfaceAnimationTimer = 0;
    }, 800);
  }

  function init() {
    initStartupOverlay();
    initFontSetting();
    initThemeSettings();
    initAudioSettings();
    initCursorGlow();
    initGamepadControls();
    readSlotSize();

    // 先用已缓存的核心数据构建；没有缓存时回退到内置列表，后续同步数据时再重建。
    buildDock(activityIds());
    initInnerActivityPicker();

    // 显示值为 11 的活动优先；没有默认值时再用 hash，最后用最后一个活动。
    var initialId = initialActivityId();
    var initial = initialId ? LOGOS.indexOf(initialId) : LOGOS.length - 1;
    if (initial < 0) initial = LOGOS.length - 1;
    initialSelectionSettled = !!((dataStore && dataStore.core && dataStore.core.length) || 0);

    state.index = initial;
    setRuntimeCacheActivity(LOGOS[initial]);
    audio.dataset.src = musicUrl(LOGOS[initial]);
    audio.src = musicUrl(LOGOS[initial]);
    updateStartupLogo(LOGOS[initial]);

    render();
    for (var k = 0; k < pages.length; k++) {
      pages[k].classList.toggle('active', pages[k] === pages[initial]);
    }
    applyPageMeta(LOGOS[initial]);
    try { history.replaceState(null, '', '#' + LOGOS[initial]); } catch (err) {}

    buildNav(LOGOS[initial]);
    initRuntimeAssetCache();
    playInterfaceAnimation(true);
    initData();
    fillHomeSection(LOGOS[initial]);
    syncNonOuterCardBlurLayers();
    setTimeout(syncNonOuterCardBlurLayers, 0);
    if (pagesWrap && window.MutationObserver && !pagesWrap._cardBlurLayerObserver) {
      pagesWrap._cardBlurLayerObserver = new MutationObserver(function () { syncNonOuterCardBlurLayers(); });
      pagesWrap._cardBlurLayerObserver.observe(pagesWrap, { childList: true, subtree: true });
    }

    applyWallpaper(LOGOS[state.index]);
  }

  var viewportResizeFrame = 0;
  function syncViewportMetrics() {
    // 视口变化后重新绑定当前 DPR，防止漏掉后续跨屏切换事件。
    watchDevicePixelRatio();
    if (viewportResizeFrame) return;
    viewportResizeFrame = requestAnimationFrame(function () {
      viewportResizeFrame = 0;
      render();
      // 窗口变化后项位置可能改变，选中短指示条重新对位
      if (curNavLogo && navCache[curNavLogo]) {
        moveThumb(navCache[curNavLogo].active, false);
      }
      layoutTopbarIdentity();
      var activeSection = pagesWrap ? pagesWrap.querySelector('.page.active .page-section.active') : null;
      scheduleSectionCardSnap(activeSection || document);
    });
  }

  var dprMediaQuery = null;
  var dprSettleTimers = [];

  function onDevicePixelRatioChange() {
    // Chromium 跨不同缩放比例的显示器时，DPR、视口宽度和布局可能分阶段更新。
    // 立即同步一次，并在布局稳定后再校准，避免跨屏后卡片尺寸停留在旧视口。
    syncViewportMetrics();
    dprSettleTimers.forEach(function (timer) { window.clearTimeout(timer); });
    dprSettleTimers = [80, 320, 800].map(function (delay) {
      return window.setTimeout(function () {
        watchDevicePixelRatio();
        syncViewportMetrics();
      }, delay);
    });
  }

  function watchDevicePixelRatio() {
    if (!window.matchMedia) return;
    if (dprMediaQuery) {
      if (dprMediaQuery.removeEventListener) {
        dprMediaQuery.removeEventListener('change', onDevicePixelRatioChange);
      } else if (dprMediaQuery.removeListener) {
        dprMediaQuery.removeListener(onDevicePixelRatioChange);
      }
    }
    dprMediaQuery = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    if (dprMediaQuery.addEventListener) {
      dprMediaQuery.addEventListener('change', onDevicePixelRatioChange);
    } else if (dprMediaQuery.addListener) {
      dprMediaQuery.addListener(onDevicePixelRatioChange);
    }
  }

  window.addEventListener('resize', syncViewportMetrics, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewportMetrics, { passive: true });
  }
  watchDevicePixelRatio();


  // hash 直链 / 浏览器前进后退：切换活动并同步网页标题（搜索引擎按 #活动ID 收录时也生效）
  window.addEventListener('hashchange', function () {
    var id = hashActivityId();
    var idx = LOGOS.indexOf(id);
    if (idx < 0) return;
    if (idx !== state.index || state.offset !== 0) select(idx);
    else applyPageMeta(id);
  });

  init();
  window.__outerSettingsBridge = {
    renderTitleList: renderTitleList,
    titleListEl: titleListEl,
    animateCardBody: animateCardBody,
    applyThemeSettings: applyThemeSettings,
    applyFont: applyFont,
    getImageQualityLevel: function () { return imageQualityLevel; },
    setImageQuality: setImageQuality,
    qualityLabel: qualityLabel,
    getPerformanceChecked: function () { return performanceModeInput ? performanceModeInput.checked : false; },
    setPerformanceChecked: function (checked) {
      if (performanceModeInput) {
        performanceModeInput.checked = checked;
        applyThemeFromControls(true);
      }
    },
    showSponsor: function (src) {
      if (sponsorOverlay) {
        if (sponsorImage) sponsorImage.src = src;
        sponsorOverlay.hidden = false;
      }
    },
    enterSecondary: enterOuterSecondary,
    leaveSecondary: leaveOuterSecondary,
    refreshTopActions: configureTopActions,
    performLogin: performLogin,
    logoutInlineAccount: logoutInlineAccount,
    currentAccountRecord: currentAccountRecord,
    getUser: function () { return user; }
  };

})();
