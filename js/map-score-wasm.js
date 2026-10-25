/* 地图跑分（C+V3）的 WASM 版加载器
   与 build/rust/fgexpig-wasm 同源；加载失败时调用方回退到 js/main.js 里的 JS 实现。
   用法：window.FgexpigMapScore.score(plays, likes, dislikes) */
(function () {
  'use strict';

  var module = null;
  var pending = null;

  function load() {
    if (pending) return pending;
    if (typeof fetch !== 'function' || typeof WebAssembly !== 'object') {
      pending = Promise.resolve(null);
      return pending;
    }
    pending = fetch('js/map-score.wasm?v=cv3', { cache: 'force-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('wasm HTTP ' + response.status);
        return response.arrayBuffer();
      })
      .then(function (buffer) {
        return WebAssembly.instantiate(buffer, {});
      })
      .then(function (result) {
        module = result.instance.exports;
        return module;
      })
      .catch(function (err) {
        console.warn('[map-score] wasm unavailable, fallback to JS:', err && err.message);
        module = null;
        return null;
      });
    return pending;
  }

  window.FgexpigMapScore = {
    load: load,
    isReady: function () {
      return !!module;
    },
    /** 返回 null 表示未就绪（调用方应回退到 JS 实现） */
    score: function (plays, likes, dislikes) {
      if (!module || typeof module.map_score !== 'function') return null;
      return module.map_score(plays, likes, dislikes);
    }
  };

  load();
})();
