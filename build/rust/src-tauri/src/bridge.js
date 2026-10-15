/* 注入到网页的桌面桥（与 Electron preload 的 FGEXPIG_DESKTOP 同 API）
   - 分辨率相关同步返回（Electron 用 sendSync，网页按同步消费）
   - localStorage 镜像到 %APPDATA%\fgexpig-desktop\state.json（换端口/重装不丢登录态与设置）
   占位符由壳在启动时替换：__BOOT__ / __MAXW__ / __MAXH__ / __SCALE__ / __STATE__ */
(function () {
  var boot = __BOOT__;
  var maxW = __MAXW__, maxH = __MAXH__, scale = __SCALE__;
  var stateJson = __STATE__;
  var mapStatsJson = __MAPSTATS__;
  var core = window.__TAURI__ && window.__TAURI__.core;
  function call(name, payload) {
    if (!core || !core.invoke) return Promise.resolve(null);
    return core.invoke(name, payload || {});
  }

  /* ---------- localStorage：真实存储同步读写 + 文件镜像（跨端口/重装不丢） ---------- */
  try {
    var realStorage = window.localStorage;
    var fileState = {};
    try { fileState = JSON.parse(stateJson || '{}') || {}; } catch (e) { fileState = {}; }

    // 启动：把文件里的键补进同源 localStorage（文件里没有的键保持原值，不覆盖）
    var added = 0;
    var localKeys = [];
    try {
      for (var i = 0; i < realStorage.length; i++) localKeys.push(realStorage.key(i));
    } catch (e) {}
    Object.keys(fileState).forEach(function (k) {
      if (typeof fileState[k] !== 'string') return;
      if (realStorage.getItem(k) === null) {
        try { realStorage.setItem(k, fileState[k]); added += 1; } catch (e) {}
      }
    });

    // 文件为空（首次运行）：把现有 localStorage 全量写进文件，完成迁移
    var migrated = Object.keys(fileState).length === 0 && localKeys.length > 0;
    var savePending = 0;
    var dirty = false;
    function snapshot() {
      var out = {};
      try {
        for (var j = 0; j < realStorage.length; j++) {
          var key = realStorage.key(j);
          out[key] = realStorage.getItem(key);
        }
      } catch (e) {}
      return out;
    }
    function writeNow() {
      if (savePending) { clearTimeout(savePending); savePending = 0; }
      dirty = false;
      call('state_save', { json: JSON.stringify(snapshot()) });
    }
    function saveFile() {
      dirty = true;
      if (savePending) return;
      savePending = setTimeout(function () {
        savePending = 0;
        dirty = false;
        call('state_save', { json: JSON.stringify(snapshot()) });
      }, 120);
    }
    /* ---------- 地图数据：把 mapstats.json 的并集并进 localStorage ----------
       站点只累加、从不删条目；数据变少只可能是因为换了 origin（新端口/新架构）后从零开始。
       所以这里按「并集」合并：每个地图码保留 at 更新的一条，days 取更新的日期。 */
    var MAPSTATS_KEY = 'fgexpig.mapstats.v1';
    var mapstatCodes = 0;
    function dayNum(text) {
      var m = /^(\d+)-(\d+)-(\d+)$/.exec(String(text == null ? '' : text));
      return m ? (Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3])) : 0;
    }
    function mergeMapStats(oldText, newText) {
      function parse(text) {
        try {
          var value = JSON.parse(text);
          if (value && typeof value === 'object') return value;
        } catch (e) {}
        return null;
      }
      var a = parse(oldText);
      var b = parse(newText);
      if (!a) return b;
      if (!b) return a;
      var codes = {};
      var aCodes = a.codes && typeof a.codes === 'object' ? a.codes : {};
      var bCodes = b.codes && typeof b.codes === 'object' ? b.codes : {};
      Object.keys(aCodes).forEach(function (k) { codes[k] = aCodes[k]; });
      Object.keys(bCodes).forEach(function (k) {
        var cur = codes[k];
        var next = bCodes[k];
        if (!cur) { codes[k] = next; return; }
        var curAt = Number(cur && cur.at) || 0;
        var nextAt = Number(next && next.at) || 0;
        if (nextAt >= curAt) codes[k] = next;
      });
      var days = {};
      var aDays = a.days && typeof a.days === 'object' ? a.days : {};
      var bDays = b.days && typeof b.days === 'object' ? b.days : {};
      Object.keys(aDays).forEach(function (k) { days[k] = aDays[k]; });
      Object.keys(bDays).forEach(function (k) {
        if (!(k in days) || dayNum(bDays[k]) > dayNum(days[k])) days[k] = bDays[k];
      });
      return {
        codes: codes,
        days: days,
        resumeAt: Math.max(Number(a.resumeAt) || 0, Number(b.resumeAt) || 0)
      };
    }
    try {
      var localMapText = realStorage.getItem(MAPSTATS_KEY);
      var mergedMap = mergeMapStats(mapStatsJson, localMapText);
      if (mergedMap) {
        mapstatCodes = Object.keys(mergedMap.codes || {}).length;
        var mergedMapText = JSON.stringify(mergedMap);
        // 只在确有变化时写回，避免每次加载都产生多余的镜像写入
        if (mergedMapText !== localMapText) realStorage.setItem(MAPSTATS_KEY, mergedMapText);
      }
    } catch (err) {}

    // 关键：每次加载都无条件把「文件镜像 ∪ 本 origin 的 localStorage」整体回写一次。
    // 旧版只在有变化时写，导致"只存在于某个端口的 localStorage、还没被写过"的 key
    // （登录态、主题、字体、按键……）永远进不了镜像，换端口/重装就表现为丢失。
    writeNow();
    // 多路兜底：正常关闭 / 切后台 / 硬杀之前，都尽量把最新状态落盘
    window.addEventListener('beforeunload', writeNow);
    window.addEventListener('pagehide', writeNow);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') writeNow();
    });
    setInterval(function () { if (dirty) writeNow(); }, 30000);

    // 包装：读写都走真实 localStorage（同步、立刻持久），写操作另外排队落文件
    window.localStorage = new Proxy(realStorage, {
      get: function (target, prop) {
        if (prop === 'setItem' || prop === 'removeItem' || prop === 'clear') {
          return function () {
            var result = target[prop].apply(target, arguments);
            saveFile();
            return result;
          };
        }
        var value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set: function (target, prop, value) {
        try { target.setItem(String(prop), String(value)); } catch (e) {}
        saveFile();
        return true;
      },
      deleteProperty: function (target, prop) {
        try { target.removeItem(String(prop)); } catch (e) {}
        saveFile();
        return true;
      }
    });
  } catch (err) {}

  /* ---------- 分辨率：同步返回（与 electron/main.js 同一套算法） ---------- */
  var ITEM_H = 58, GAP = 10, CHROME_H = 255, RATIO = 0.076, CARD_MIN = 46, CARD_MAX = 66;
  function bodyTarget(cards) { return cards * ITEM_H + (cards - 1) * GAP; }
  function bodyHeightFor(vh) {
    var ch = Math.min(CARD_MAX, Math.max(CARD_MIN, vh * RATIO));
    return vh - ch - CHROME_H;
  }
  function cssHeightForCards(cards) {
    var target = bodyTarget(cards);
    var vh = (target + CHROME_H) / (1 - RATIO);
    var lo = CARD_MIN / RATIO, hi = CARD_MAX / RATIO;
    if (vh < lo) vh = target + CHROME_H + CARD_MIN;
    else if (vh > hi) vh = target + CHROME_H + CARD_MAX;
    var base = Math.round(vh), best = base, bestDiff = Infinity;
    for (var c = base - 3; c <= base + 3; c += 1) {
      var diff = Math.round(bodyHeightFor(c)) - target;
      if (diff >= 0 && diff < bestDiff) { best = c; bestDiff = diff; }
    }
    return best;
  }
  function optionsFor(aspectId) {
    var ratio = aspectId === '16:10' ? 16 / 10 : 16 / 9;
    var list = [];
    for (var cards = 10; cards >= 6; cards -= 1) {
      var ph = Math.round(cssHeightForCards(cards) * scale);
      var pw = Math.round(ph * ratio);
      list.push({ width: pw, height: ph, aspect: aspectId, cards: cards });
    }
    return list;
  }
  function allowed(aspectId) {
    var all = optionsFor(aspectId);
    var list = all.filter(function (o) { return o.width <= maxW && o.height <= maxH; });
    return list.length ? list : [all[all.length - 1]];
  }
  function defaultFor(list) {
    for (var i = 0; i < list.length; i++) if (list[i].cards === 8) return list[i];
    return list[0];
  }
  var resState = {
    aspects: boot.aspects,
    aspect: boot.aspect,
    options: allowed(boot.aspect),
    current: boot.current,
    max: boot.max
  };

  window.FGEXPIG_DESKTOP = {
    isDesktop: true,
    runtime: 'exe',
    setWindowBorderColor: function (color) { setWindowBorderColor(color); },
    quality: 5,
    resolution: resState.current,
    resolutions: resState.options,
    aspect: resState.aspect,
    aspects: resState.aspects,
    displayMaxResolution: resState.max,
    getResolutionState: function () { return resState; },
    setQuality: function () {},
    setResolution: function (value) {
      var list = allowed(resState.aspect);
      var found = null;
      for (var i = 0; i < list.length; i++) {
        if (value && list[i].width === value.width && list[i].height === value.height) { found = list[i]; break; }
      }
      if (!found) found = defaultFor(list);
      resState = { aspects: resState.aspects, aspect: resState.aspect, options: list, current: found, max: resState.max };
      call('resolution_set', { value: found });
      return resState;
    },
    setAspect: function (value) {
      var aspect = value === '16:10' ? '16:10' : '16:9';
      var list = allowed(aspect);
      var found = null;
      for (var i = 0; i < list.length; i++) if (list[i].cards === resState.current.cards) { found = list[i]; break; }
      if (!found) found = defaultFor(list);
      resState = { aspects: resState.aspects, aspect: aspect, options: list, current: found, max: resState.max };
      call('aspect_set', { value: aspect });
      return resState;
    },
    backToMenu: function () { call('back_to_menu'); },
    fetchMapStats: function (code) { return call('mapstats_fetch', { code: String(code || '') }); },
    getMapStatsStore: function () {
      var value = null;
      try { value = window.localStorage.getItem('fgexpig.mapstats.v1'); } catch (e) {}
      return value || '';
    },
    setMapStatsStore: function (value) {
      try { window.localStorage.setItem('fgexpig.mapstats.v1', String(value || '')); } catch (e) {}
      call('mapstats_store_set', { value: String(value || '') });
    }
  };
  window.FGEXPIG_LAUNCHER = window.FGEXPIG_LAUNCHER || {};

  /* ---------- 窗口外框：2px 白色描边 + 圆角 ----------
     窗口本身是无边框的，圆角由 DWM 裁剪（DWMWA_WINDOW_CORNER_PREFERENCE=ROUND）。
     DWM 的边框线只有 1px 且粗细不可控，所以这里在页面最上层叠一个固定定位的描边层：
       pointer-events:none → 不吃点击，也不影响顶部拖动/双击/三击手势。
     要改粗细/颜色/圆角半径，只改下面三个常量。 */
  try {
    var WINDOW_BORDER_PX = 4;
    var WINDOW_BORDER_COLOR = '#fff';
    var WINDOW_BORDER_RADIUS_PX = 8; // 与 Win11 默认圆角（8 逻辑 px）对齐
    // 描边颜色由网页决定（跟账户最高/已选称号的等级色走，与沉浸光效光标同色）
    var setWindowBorderColor = function (color) {
      if (typeof color !== 'string' || !color) return;
      WINDOW_BORDER_COLOR = color;
      var element = document.getElementById('fgexpig-window-border');
      if (element) element.style.borderColor = color;
    };
    var mountWindowBorder = function () {
      if (!document.documentElement) return;
      if (document.getElementById('fgexpig-window-border')) return;
      var border = document.createElement('div');
      border.id = 'fgexpig-window-border';
      border.setAttribute('aria-hidden', 'true');
      border.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:2147483647',
        'pointer-events:none',
        'box-sizing:border-box',
        'border:' + WINDOW_BORDER_PX + 'px solid ' + WINDOW_BORDER_COLOR,
        'border-radius:' + WINDOW_BORDER_RADIUS_PX + 'px'
      ].join(';');
      (document.body || document.documentElement).appendChild(border);
      call('bridge_loaded', {
        href: 'BORDER-MOUNTED ' + String(location.pathname) + ' r=' + WINDOW_BORDER_PX + ' borderRadius=' + WINDOW_BORDER_RADIUS_PX
      });
    };
    // 先注册"延迟挂载"，再尝试立即挂载：立即挂载失败（document-start 阶段 DOM 可能还没就绪）
    // 时不能连带把延迟注册也跳过——这正是上一版没生效的原因。
    document.addEventListener('DOMContentLoaded', mountWindowBorder);
    window.addEventListener('load', mountWindowBorder);
    var borderRetries = 0;
    var borderTimer = setInterval(function () {
      borderRetries += 1;
      mountWindowBorder();
      if (document.getElementById('fgexpig-window-border') || borderRetries > 40) clearInterval(borderTimer);
    }, 1500);
    try { mountWindowBorder(); } catch (err) {}
  } catch (err) {}

  /* ---------- 无边框窗口：顶部空白区的窗口手势 ----------
     原生标题栏已去掉（decorations(false)），所以用页面顶部 DRAG_TOP_PX 像素作为操作区：
       顶部空白处  单击/按住 → 拖动窗口
     顶部空白处  左键双击   → 立即最小化
     顶部空白处  中键按下   → 立即关闭窗口（退出应用）
     落在按钮/链接/输入框等交互元素上的按下不参与手势，避免影响点击。
     只作用于顶部 DRAG_TOP_PX 区域；落在按钮/链接/输入框等交互元素上时不触发。 */
  try {
    var DRAG_TOP_PX = 32;
    var MULTI_CLICK_MS = 400;
    var DRAG_SKIP_SEL = 'a,button,input,select,textarea,label,[role="button"],[data-no-drag],[contenteditable="true"]';
    var DRAG_MOVE_PX = 4;
    var lastDownAt = 0;
    var downCount = 0;

    var pressActive = false;
    var dragStarted = false;
    var pressX = 0;
    var pressY = 0;

    function windowApi() {
      var api = window.__TAURI__ && window.__TAURI__.window;
      return api && api.getCurrentWindow ? api.getCurrentWindow() : null;
    }
    function windowAction(name) {
      try {
        var handle = windowApi();
        if (handle && typeof handle[name] === 'function') {
          call('bridge_loaded', { href: 'WIN-ACTION ' + name });
          var result = handle[name]();
          // 关键：Tauri 的窗口 API 返回 Promise，ACL 拒绝等错误不会进 try/catch，
          // 只有挂 .catch 才看得到；否则表现为"点了没反应"。
          if (result && typeof result.catch === 'function') {
            result.catch(function (err) {
              call('bridge_failed', { href: String(location.href), reason: name + ' 被拒绝：' + ((err && err.message) || err) });
            });
          }
        } else {
          call('bridge_failed', { href: String(location.href), reason: 'window.' + name + ' 不可用' });
        }
      } catch (err) {
        call('bridge_failed', { href: String(location.href), reason: name + ' 失败：' + ((err && err.message) || err) });
      }
    }
    function resetGesture() {
      downCount = 0;
      lastDownAt = 0;

    }

    document.addEventListener('mousedown', function (event) {
      if (event.clientY > DRAG_TOP_PX) return;
      var target = event.target;
      if (target && target.closest && target.closest(DRAG_SKIP_SEL)) return;

      // 中键：立即关闭窗口
      if (event.button === 1) {
        if (event.preventDefault) event.preventDefault();
        resetGesture();
        windowAction('close');
        return;
      }
      if (event.button !== 0) return;

      var now = Date.now();
      downCount = (now - lastDownAt) <= MULTI_CLICK_MS ? downCount + 1 : 1;
      lastDownAt = now;

      // 双击：立即最小化（不再等第三击）
      if (downCount >= 2) {
        resetGesture();
        windowAction('minimize');
        return;
      }

      // 第一次按下：先只记住位置，等真的移动了才调 startDragging。
      // 不能在按下时就拖：系统拖动循环会把后续的 mousedown/mouseup 吃掉，
      // 双击就永远收不到（纯点击不移动 → 不会进拖动循环）。
      pressActive = true;
      dragStarted = false;
      pressX = event.clientX;
      pressY = event.clientY;
    }, true);

    document.addEventListener('mousemove', function (event) {
      if (!pressActive || dragStarted) return;
      if (Math.abs(event.clientX - pressX) + Math.abs(event.clientY - pressY) < DRAG_MOVE_PX) return;
      dragStarted = true;
      windowAction('startDragging');
    }, true);

    document.addEventListener('mouseup', function () {
      pressActive = false;
      dragStarted = false;
    }, true);
  } catch (err) {}

  // 诊断：把「本次页面是哪个 origin、镜像里有几个 key、注入进去几个」写进壳的日志，
  // 这样"数据丢了"能一眼判断是镜像没内容，还是换了 origin 而没注入。
  try {
    var reportKeys = 0;
    try { reportKeys = realStorage.length; } catch (e) {}
    call('state_report', {
      origin: String(location.origin),
      href: String(location.href).slice(0, 120),
      keys: reportKeys,
      mirrored: Object.keys(fileState).length,
      injected: added,
      mapcodes: mapstatCodes
    });
  } catch (err) {}

  // 诊断：确认这个源（本地页面 / 本地服务）能否调用后端命令
  try {
    call('bridge_loaded', { href: String(location.href) }).catch(function (err) {
      call('bridge_failed', { href: String(location.href), reason: String((err && err.message) || err) });
    });
  } catch (err) {}
})();
