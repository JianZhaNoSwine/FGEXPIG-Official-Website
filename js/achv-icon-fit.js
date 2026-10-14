/* ============================================================
 * 成就图标 1:1 拉满
 * - 成就图标位固定为正方形，这里把画面拉伸到撑满整个方形（不裁切、不补边）。
 * - 素材本身已填满方形时不做任何改动（绝大多数活动）。
 * - 素材留有透明边时（例：JFES190 的六边形徽章，可见画面约 0.9 宽），
 *   按可见边界放大到 1:1，避免同一列表里有的图标窄、有的图标满。
 * - 原图片文件不会被修改，只调整元素上的 background-size / background-position。
 * ============================================================ */
(function () {
  'use strict';

  var SCAN_MAX = 256;          // 采样用画布长边上限：只要边界够准，不必按原图分辨率扫描
  var ALPHA_MIN = 8;           // 低于该 Alpha 视为透明
  var FULL_EPSILON = 0.999;    // 可见比例达到该值即视为已铺满

  var boundsCache = Object.create(null);
  var jobs = [];
  var running = false;

  function positionPercent(start, size) {
    if (!(size < FULL_EPSILON)) return 50;
    var percent = start / (1 - size) * 100;
    if (!isFinite(percent)) return 50;
    if (percent < 0) return 0;
    if (percent > 100) return 100;
    return percent;
  }

  function apply(el, bounds) {
    if (!el || !bounds) return;
    var left = bounds[0];
    var top = bounds[1];
    var width = bounds[2];
    var height = bounds[3];
    if (!(width > 0) || !(height > 0)) return;
    // 已经铺满方形：清掉之前可能写过的内联值，回到 CSS 默认（cover）
    if (width >= FULL_EPSILON && height >= FULL_EPSILON && left <= 0.001 && top <= 0.001) {
      el.style.removeProperty('background-size');
      el.style.removeProperty('background-position');
      return;
    }
    el.style.backgroundSize = (100 / width).toFixed(3) + '% ' + (100 / height).toFixed(3) + '%';
    el.style.backgroundPosition =
      positionPercent(left, width).toFixed(3) + '% ' +
      positionPercent(top, height).toFixed(3) + '%';
  }

  function measure(image) {
    var sourceWidth = image && image.naturalWidth;
    var sourceHeight = image && image.naturalHeight;
    if (!sourceWidth || !sourceHeight) return null;
    var scale = Math.min(1, SCAN_MAX / Math.max(sourceWidth, sourceHeight));
    var width = Math.max(1, Math.round(sourceWidth * scale));
    var height = Math.max(1, Math.round(sourceHeight * scale));
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext && canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    try {
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      var data = context.getImageData(0, 0, width, height).data;
      var minX = width;
      var minY = height;
      var maxX = -1;
      var maxY = -1;
      for (var y = 0; y < height; y += 1) {
        var row = y * width * 4;
        for (var x = 0; x < width; x += 1) {
          if (data[row + x * 4 + 3] <= ALPHA_MIN) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < minX || maxY < minY) return null;
      return [
        minX / width,
        minY / height,
        (maxX - minX + 1) / width,
        (maxY - minY + 1) / height
      ];
    } catch (err) {
      // file:// 或被跨域策略拦截时读不到像素：保持原样，不做处理
      return null;
    }
  }

  function loadAndMeasure(url) {
    return new Promise(function (resolve) {
      var image = new Image();
      image.decoding = 'async';
      image.onload = function () {
        image.onload = null;
        image.onerror = null;
        resolve(measure(image));
      };
      image.onerror = function () {
        image.onload = null;
        image.onerror = null;
        resolve(null);
      };
      image.src = url;
    });
  }

  // 一次只处理一张，避免同屏几十个图标同时解码造成卡顿
  function runNext() {
    if (running) return;
    var job = jobs.shift();
    if (!job) return;
    running = true;
    loadAndMeasure(job.url).then(function (bounds) {
      boundsCache[job.url] = bounds;
      for (var i = 0; i < job.targets.length; i += 1) apply(job.targets[i], bounds);
      running = false;
      runNext();
    });
  }

  function enhance(el, url) {
    if (!el || !url || typeof document === 'undefined') return;
    if (Object.prototype.hasOwnProperty.call(boundsCache, url)) {
      apply(el, boundsCache[url]);
      return;
    }
    for (var i = 0; i < jobs.length; i += 1) {
      if (jobs[i].url === url) {
        jobs[i].targets.push(el);
        return;
      }
    }
    jobs.push({ url: url, targets: [el] });
    runNext();
  }

  window.FgexpigAchvIconFit = { enhance: enhance, apply: apply };
})();