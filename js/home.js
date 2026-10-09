(function () {
  'use strict';

  var CACHE_NAME = 'fgexpig-assets';
  var ASSET_REVISION = '20260925perf3';
  var FALLBACK_WALLPAPERS = [
    'wallpaper/5/JFES110.webp',
    'wallpaper/5/JFES115.webp',
    'wallpaper/5/JFES120.webp',
    'wallpaper/5/JFES130.webp',
    'wallpaper/5/JFES140.webp',
    'wallpaper/5/JFES150.webp',
    'wallpaper/5/JFES160.webp',
    'wallpaper/5/JFES170.webp',
    'wallpaper/5/JFES175.webp',
    'wallpaper/5/JFES180.webp',
    'wallpaper/5/JFES190.webp',
    'wallpaper/5/JFES195.webp',
    'wallpaper/5/JFES200.webp',
    'wallpaper/5/JZP2000.webp'
  ];

  var slideEls = [document.getElementById('homeSlideA'), document.getElementById('homeSlideB')];
  var current = 0;
  var wallpapersPool = FALLBACK_WALLPAPERS.slice();
  var playlist = [];
  var playIndex = 0;
  var slidesRunning = false;
  var lastSrc = '';
  var lastDir = '';
  var wallpaperFetchState = {};

  var MOTION = {
    up: { from: 'translate(-50%, calc(-50% + 8%))', to: 'translate(-50%, calc(-50% - 8%))' },
    down: { from: 'translate(-50%, calc(-50% - 8%))', to: 'translate(-50%, calc(-50% + 8%))' },
    right: { from: 'translate(calc(-50% - 8%), -50%)', to: 'translate(calc(-50% + 8%), -50%)' },
    left: { from: 'translate(calc(-50% + 8%), -50%)', to: 'translate(calc(-50% - 8%), -50%)' }
  };
  var H_DIRS = ['left', 'right'];
  var V_DIRS = ['up', 'down'];
  var SLIDE_MOVE_MS = 6000;
  var SLIDE_TRAVEL_MS = 8000;

  function uniqueList(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (item) {
      var value = String(item || '');
      if (!value || seen[value]) return;
      seen[value] = true;
      out.push(value);
    });
    return out;
  }

  function shuffle(list) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function withRevision(path) {
    if (!ASSET_REVISION) return path;
    return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'imgv=' + encodeURIComponent(ASSET_REVISION);
  }

  function refillPlaylist() {
    playlist = shuffle(wallpapersPool.slice());
    if (playlist.length > 1 && playlist[0] === lastSrc) {
      var swap = 1 + Math.floor(Math.random() * (playlist.length - 1));
      var tmp = playlist[0];
      playlist[0] = playlist[swap];
      playlist[swap] = tmp;
    }
    playIndex = 0;
  }

  function takeWallpaper() {
    if (!playlist.length) return '';
    if (playIndex >= playlist.length) refillPlaylist();
    if (playlist.length > 1 && playlist[playIndex] === lastSrc) {
      var alt = (playIndex + 1) % playlist.length;
      var tmp = playlist[playIndex];
      playlist[playIndex] = playlist[alt];
      playlist[alt] = tmp;
    }
    return playlist[playIndex++];
  }

  function pickDirection() {
    var horizontalLast = lastDir === 'left' || lastDir === 'right';
    var pool = horizontalLast ? V_DIRS : H_DIRS;
    lastDir = pool[Math.floor(Math.random() * pool.length)];
    return lastDir;
  }

  function freezeSlide(img) {
    if (!img || !img.style.transform) return;
    try {
      var frozen = window.getComputedStyle(img).transform;
      img.style.transition = 'none';
      if (frozen && frozen !== 'none') img.style.transform = frozen;
    } catch (err) {}
  }

  function preloadNextSlide() {
    if (!playlist.length) return;
    var nextIndex = playIndex >= playlist.length ? 0 : playIndex;
    var src = playlist[nextIndex];
    if (!src) return;
    var img = new Image();
    img.decoding = 'async';
    img.src = withRevision(src);
  }

  function showNextSlide() {
    if (!playlist.length) return;
    var next = slideEls[1 - current];
    var img = next.firstElementChild;
    var motion = MOTION[pickDirection()];
    var src = takeWallpaper();
    if (!src) return;
    lastSrc = src;

    img.style.transition = 'none';
    img.style.transform = motion.from;
    img.src = withRevision(src);
    var reveal = function () {
      freezeSlide(slideEls[current].firstElementChild);
      requestAnimationFrame(function () {
        img.style.transition = 'transform ' + SLIDE_TRAVEL_MS + 'ms linear';
        img.style.transform = motion.to;
        next.style.opacity = '1';
        slideEls[current].style.opacity = '0';
        current = 1 - current;
      });
    };
    if (img.complete) reveal();
    else {
      img.addEventListener('load', reveal, { once: true });
      img.addEventListener('error', reveal, { once: true });
    }
    preloadNextSlide();
    window.setTimeout(showNextSlide, SLIDE_MOVE_MS);
  }

  function startSlides() {
    if (slidesRunning || !slideEls[0] || !slideEls[1]) return;
    slidesRunning = true;
    playlist = shuffle(wallpapersPool.slice());
    playIndex = 0;
    lastSrc = '';
    lastDir = Math.random() < 0.5 ? 'left' : 'up';
    showNextSlide();
  }

  function mergeWallpapers(list) {
    var merged = uniqueList(list);
    if (!merged.length) return;
    wallpapersPool = uniqueList(wallpapersPool.concat(merged));
  }

  function manifestWallpapers(manifest) {
    var out = [];
    var files = manifest && Array.isArray(manifest.files) ? manifest.files : [];
    files.forEach(function (entry) {
      var path = String((entry && entry.path) || '').replace(/\\/g, '/');
      if (!/^wallpaper\/5\/[^/]+\.(?:webp|jpe?g|png|gif|avif)$/i.test(path)) return;
      out.push(path);
    });
    return uniqueList(out);
  }

  function cacheWallpapers(list) {
    if (!('caches' in window) || location.protocol === 'file:') return;
    var queue = uniqueList(list).filter(function (path) {
      if (wallpaperFetchState[path]) return false;
      wallpaperFetchState[path] = true;
      return true;
    });
    if (!queue.length) return;

    caches.open(CACHE_NAME).then(function (cache) {
      var workers = [];
      var count = Math.min(4, queue.length);
      function run() {
        var next = queue.shift();
        if (!next) return Promise.resolve();
        var path = new URL(withRevision(next), location.href).toString();
        return cache.match(new Request(path)).then(function (hit) {
          if (hit) return;
          return fetch(path, { cache: 'no-store' }).then(function (response) {
            if (response && response.ok) return cache.put(new Request(path), response.clone());
          });
        }).catch(function () {}).then(run);
      }
      for (var i = 0; i < count; i++) {
        workers.push(run());
      }
      return Promise.all(workers);
    }).catch(function () {});
  }

  function loadManifestWallpapers() {
    fetch('desktop-manifest.json', { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('manifest unavailable');
      return response.json();
    }).then(function (manifest) {
      var list = manifestWallpapers(manifest);
      if (!list.length) return;
      mergeWallpapers(list);
      cacheWallpapers(list);
    }).catch(function () {});
  }

  cacheWallpapers(FALLBACK_WALLPAPERS);
  startSlides();
  loadManifestWallpapers();
})();
