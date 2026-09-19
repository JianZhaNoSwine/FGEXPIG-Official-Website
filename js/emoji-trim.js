/* ============================================================
 * 表情包透明边缘裁切
 * - 静态清单记录动图所有帧的 Alpha 可见边界，避免裁掉后续帧。
 * - 新表情包没有清单时，浏览器端读取首几帧 Alpha 后自动计算。
 * - 原图片文件不会被修改，只在显示容器中隐藏外围透明留白。
 * ============================================================ */
(function () {
  'use strict';

  // [左侧透明比例, 顶部透明比例, 可见宽度比例, 可见高度比例, 原图宽高比]
  var EMOJI_TRIM = {
    'm豆拜': [0, 0, 1, 0.875676, 1.291892],
    '仙女笑': [0.003333, 0.005882, 0.993333, 0.988235, 1.764706],
    '冤枉啊清汤大老爷': [0, 0, 1, 1, 0.99878],
    '双熊拍手': [0.116216, 0.106667, 0.762162, 0.813333, 1.233333],
    '叽叽喳喳新年特辑元宵节': [0.0375, 0.079167, 0.9625, 0.9125, 1],
    '吉伊加油': [0, 0, 1, 1, 1],
    '吉伊憋笑': [0, 0, 1, 1, 1],
    '哈奇热身': [0, 0, 1, 1, 0.912109],
    '喵': [0.006667, 0.036585, 0.983333, 0.95122, 1.829268],
    '多栋沉思': [0, 0, 1, 1, 1],
    '多栋难过': [0, 0, 1, 1, 1.011547],
    '家猫们谁懂啊': [0, 0.059574, 1, 0.940426, 1.021277],
    '小熊不好意思': [0.158333, 0.1125, 0.675, 0.770833, 1],
    '小猫打滚': [0.192857, 0.114286, 0.692857, 0.8, 1],
    '小鸡震惊': [0, 0, 0.991189, 1, 1.533784],
    '我等着呢': [0, 0, 1, 1, 1],
    '暹罗厘普第三弹赞': [0.133333, 0.220833, 0.758333, 0.6, 1],
    '桀桀桀': [0, 0, 1, 1, 1],
    '牛微笑': [0, 0, 1, 1, 1.02521],
    '猪的天': [0, 0, 1, 1, 1.010101],
    '猫竖大拇指': [0, 0, 1, 1, 1],
    '白熊笑笑笑': [0, 0, 1, 1, 1.021368],
    '真漂亮': [0, 0.179348, 0.996667, 0.652174, 1.630435],
    '窝瓜糖豆大笑': [0, 0, 1, 1, 1.060773],
    '粉红兔子8好耶': [0.075, 0.116667, 0.866667, 0.833333, 1],
    '粉红兔子期待': [0.133333, 0.041667, 0.795833, 0.958333, 1],
    '糖豆人盆栽好耶': [0, 0, 1, 1, 1],
    '绿豆难过': [0.067797, 0.23, 0.864407, 0.456667, 0.983333],
    '美叽和大鼠迷你版开车': [0.095833, 0.095833, 0.816667, 0.8125, 1],
    '蛋仔凝视': [0, 0, 1, 1, 1.048035],
    '赔笑': [0, 0, 1, 1, 1],
    '逗乐我了': [0, 0.003922, 0.998437, 0.996078, 2.509804],
    '香蕉猫拒绝': [0.008333, 0, 0.829167, 0.976415, 1.132075],
    '鲤鱼惊讶': [0.003333, 0.005814, 0.993333, 0.988372, 1.744186],
    '鹈鹕小河好': [0.1, 0.108333, 0.8875, 0.808333, 1],
    '黄球呆滞': [0, 0, 1, 1, 1],
    '黄豆爱心': [0.005, 0.003906, 0.9925, 0.992188, 1.5625]
  };

  if (window.FGEXPIG_EMOJI_TRIM_DATA) {
    Object.keys(window.FGEXPIG_EMOJI_TRIM_DATA).forEach(function (name) {
      var bounds = window.FGEXPIG_EMOJI_TRIM_DATA[name];
      if (Array.isArray(bounds) && bounds.length >= 4) EMOJI_TRIM[name] = bounds;
    });
  }

  var detectCache = {};
  var detectPending = {};

  function validBounds(bounds) {
    return !!bounds && bounds.length >= 4 && bounds.every(function (value) {
      return isFinite(value);
    }) && bounds[2] > 0 && bounds[3] > 0;
  }

  function isFullCanvas(bounds) {
    return bounds[0] === 0 && bounds[1] === 0 && bounds[2] === 1 && bounds[3] === 1;
  }

  function apply(area, bounds) {
    if (!area || !validBounds(bounds)) return false;
    if (isFullCanvas(bounds)) {
      area.classList.remove('is-alpha-trimmed');
      area.style.removeProperty('--emoji-aspect');
      area.style.removeProperty('--emoji-image-width');
      area.style.removeProperty('--emoji-image-height');
      area.style.removeProperty('--emoji-image-left');
      area.style.removeProperty('--emoji-image-top');
      return false;
    }

    var x = bounds[0];
    var y = bounds[1];
    var width = bounds[2];
    var height = bounds[3];
    var sourceAspect = bounds.length > 4 ? bounds[4] : 1;
    area.classList.add('is-alpha-trimmed');
    area.style.setProperty('--emoji-aspect', (width / height * sourceAspect).toFixed(6));
    area.style.setProperty('--emoji-image-width', (100 / width).toFixed(4) + '%');
    area.style.setProperty('--emoji-image-height', (100 / height).toFixed(4) + '%');
    area.style.setProperty('--emoji-image-left', (-x / width * 100).toFixed(4) + '%');
    area.style.setProperty('--emoji-image-top', (-y / height * 100).toFixed(4) + '%');
    return true;
  }

  function mergeBounds(current, next) {
    if (!current) return next;
    if (!next) return current;
    var left = Math.min(current[0], next[0]);
    var top = Math.min(current[1], next[1]);
    var right = Math.max(current[0] + current[2], next[0] + next[2]);
    var bottom = Math.max(current[1] + current[3], next[1] + next[3]);
    return [left, top, right - left, bottom - top, current[4] || next[4] || 1];
  }

  function sampleAlpha(image) {
    if (!image || !image.naturalWidth || !image.naturalHeight) return Promise.resolve(null);

    var sourceWidth = image.naturalWidth;
    var sourceHeight = image.naturalHeight;
    var scale = Math.min(1, 512 / Math.max(sourceWidth, sourceHeight));
    var width = Math.max(1, Math.round(sourceWidth * scale));
    var height = Math.max(1, Math.round(sourceHeight * scale));
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext && canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return Promise.resolve(null);

    function scan() {
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
            if (data[row + x * 4 + 3] <= 8) continue;
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
          (maxY - minY + 1) / height,
          sourceWidth / sourceHeight
        ];
      } catch (err) {
        // file:// 页面在部分浏览器中会禁止 Canvas 读取本地图片像素。
        return null;
      }
    }

    var first = scan();
    if (!first) return Promise.resolve(null);

    return new Promise(function (resolve) {
      var samples = [first];
      var attempts = 0;

      function nextSample() {
        attempts += 1;
        if (attempts >= 12) {
          resolve(samples.reduce(mergeBounds, null));
          return;
        }
        window.setTimeout(function () {
          var bounds = scan();
          if (bounds) samples.push(bounds);
          nextSample();
        }, 120);
      }

      nextSample();
    });
  }

  function detect(area, image, name) {
    if (!area || !image) return;
    if (Object.prototype.hasOwnProperty.call(detectCache, name)) {
      apply(area, detectCache[name]);
      return;
    }
    if (!detectPending[name]) {
      detectPending[name] = sampleAlpha(image).then(function (bounds) {
        detectCache[name] = bounds;
        delete detectPending[name];
        return bounds;
      }, function () {
        detectCache[name] = null;
        delete detectPending[name];
        return null;
      });
    }
    detectPending[name].then(function (bounds) { apply(area, bounds); });
  }

  function enhance(area, image, name) {
    if (!area || !image) return;
    if (Object.prototype.hasOwnProperty.call(EMOJI_TRIM, name)) {
      apply(area, EMOJI_TRIM[name]);
      return;
    }

    function run() {
      detect(area, image, name);
    }

    if (image.complete && image.naturalWidth) run();
    else image.addEventListener('load', run, { once: true });
  }

  window.FGEXPIG_EMOJI_TRIM = {
    get: function (name) { return EMOJI_TRIM[name] || null; },
    apply: apply,
    enhance: enhance
  };
})();
