/* FGEXPIG i18n 运行时
   - 语言数据由 tools/build-i18n-pack.js 在开发阶段生成：
       i18n/index.js         语言表 + key↔中文原文索引 + 复数模板（静态加载）
       i18n/lang/<id>.js     每种语言的 key→文案（按需加载）
   - 网页不读取 CSV，也不做任何 CSV 解析；file:// 与联网走同一条路径。
   - 简体中文用 index.js 里的中文原文，不需要语言包。 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'fgexpig.lang';
  var LANG_DIR = 'i18n/lang/';
  var DOC = (global && global.document) || (typeof document !== 'undefined' ? document : null);

  var INDEX = global.FGEXPIG_I18N_INDEX || null;
  var LANGUAGES = (INDEX && INDEX.languages) || [];
  var DEFAULT_ID = (INDEX && INDEX.defaultId) || 'en';
  var SOURCE_ID = (INDEX && INDEX.sourceId) || 'zh-Hans';
  // RTL 布局完成前暂时隐藏阿拉伯语；语言包仍保留，后续移除该隐藏表即可恢复。
  var HIDDEN_LANGUAGE_IDS = { ar: true };

  var byId = {};
  LANGUAGES.forEach(function (l) { byId[l.id] = l; });

  var state = {
    id: SOURCE_ID,
    cells: null,
    loading: null,
    loadingId: '',
    listeners: []
  };
  var sourceLanguageLocked = false;

  function langOf(id) {
    return byId[id] || byId[DEFAULT_ID] || { id: DEFAULT_ID, htmlLang: DEFAULT_ID, native: DEFAULT_ID };
  }

  function warn() {
    try { global.console.warn.apply(global.console, ['[i18n]'].concat(Array.prototype.slice.call(arguments))); } catch (err) {}
  }

  function indexZh(key) { return (INDEX && INDEX.zh && INDEX.zh[key]) || ''; }
  function indexKeyOf(zhText) { return (INDEX && INDEX.byZh && INDEX.byZh[zhText]) || ''; }

  var compiledPatterns = null;
  function patterns() {
    if (!compiledPatterns) {
      compiledPatterns = ((INDEX && INDEX.patterns) || []).map(function (p) {
        var re = null;
        try { re = new RegExp(p.src); } catch (err) { re = null; }
        return { key: p.key, names: p.names || [], re: re };
      }).filter(function (p) { return !!p.re; });
    }
    return compiledPatterns;
  }

  /* ---------- 语言包按需加载 ---------- */
  function packStore() {
    if (!global.FGEXPIG_I18N_LANG_PACKS) global.FGEXPIG_I18N_LANG_PACKS = {};
    return global.FGEXPIG_I18N_LANG_PACKS;
  }

  function loadPack(id) {
    var packs = packStore();
    if (packs[id]) return Promise.resolve(packs[id]);
    if (state.loading && state.loadingId === id) return state.loading;
    var promise = new Promise(function (resolve, reject) {
      if (!DOC || !DOC.createElement) {
        reject(new Error('document unavailable'));
        return;
      }
      var script = DOC.createElement('script');
      script.src = LANG_DIR + id + '.js?v=' + encodeURIComponent((INDEX && INDEX.version) || '');
      script.async = false;
      script.onload = function () {
        if (packs[id]) resolve(packs[id]);
        else reject(new Error('language pack empty: ' + id));
      };
      script.onerror = function () { reject(new Error('language pack load failed: ' + id)); };
      (DOC.head || DOC.documentElement).appendChild(script);
    });
    state.loadingId = id;
    state.loading = promise.then(function (pack) {
      if (state.loadingId === id) { state.loading = null; state.loadingId = ''; }
      return pack;
    }, function (err) {
      if (state.loadingId === id) { state.loading = null; state.loadingId = ''; }
      throw err;
    });
    return state.loading;
  }

  /* ---------- 复数 ---------- */
  function pluralCategory(langId, value) {
    var n = Math.abs(Number(value));
    if (!isFinite(n)) return 'other';
    if (langId === 'ar') {
      if (n === 0) return 'zero';
      if (n === 1) return 'one';
      if (n === 2) return 'two';
      if (n % 100 >= 3 && n % 100 <= 10) return 'few';
      if (n % 100 >= 11 && n % 100 <= 99) return 'many';
      return 'other';
    }
    if (langId === 'ru') {
      var r10 = n % 10, r100 = n % 100;
      if (r10 === 1 && r100 !== 11) return 'one';
      if (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14)) return 'few';
      return 'many';
    }
    if (langId === 'pl') {
      var p10 = n % 10, p100 = n % 100;
      if (n === 1) return 'one';
      if (p10 >= 2 && p10 <= 4 && (p100 < 12 || p100 > 14)) return 'few';
      return 'many';
    }
    return n === 1 ? 'one' : 'other';
  }

  function captureValue(raw) {
    var text = String(raw == null ? '' : raw).trim();
    var compact = text.replace(/[\s,]/g, '');
    if (/^-?\d+(\.\d+)?$/.test(compact)) return Number(compact);
    return text;
  }

  function fillParams(text, params) {
    if (!text) return '';
    return text.replace(/\{([A-Za-z_]+)\}/g, function (m, name) {
      if (params && Object.prototype.hasOwnProperty.call(params, name)) {
        var v = params[name];
        return v == null ? '' : String(v);
      }
      return m;
    });
  }

  // 全角数字只用于日文活动名：整条活动名恰好一个数字时转全角；
  // 其他日文文案、日期、排行榜数字等全部保持半角。
  function normalizeJapaneseQuoteSpacing(value) {
    var text = value == null ? '' : String(value);
    if (state.id !== 'ja') return text;
    return text.replace(/「\s+/g, '「').replace(/\s+」/g, '」');
  }

  function localizeActivityNameText(value) {
    var text = value == null ? '' : String(value);
    if (state.id !== 'ja') return text;
    var digits = text.match(/[0-9]/g);
    if (!digits || digits.length !== 1) return text;
    return text.replace(/[0-9]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) + 0xFEE0);
    });
  }

  function firstNumberParam(params) {
    if (!params) return null;
    var keys = Object.keys(params);
    for (var i = 0; i < keys.length; i++) {
      var v = params[keys[i]];
      if (typeof v === 'number' && isFinite(v)) return v;
    }
    return null;
  }

  function resolveCell(cell, langId, params) {
    if (!cell) return '';
    var lines = String(cell).split('\n');
    var base = null, fragments = {}, variants = {};
    var hasFragment = false, hasVariant = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var mBase = /^base\|([\s\S]*)$/.exec(line);
      if (mBase) { base = mBase[1]; continue; }
      var mFrag = /^([A-Za-z_][A-Za-z0-9_]*)\.(zero|one|two|few|many|other)\|([\s\S]*)$/.exec(line);
      if (mFrag) {
        if (!fragments[mFrag[1]]) fragments[mFrag[1]] = {};
        fragments[mFrag[1]][mFrag[2]] = mFrag[3];
        hasFragment = true;
        continue;
      }
      var mVar = /^(zero|one|two|few|many|other)\|([\s\S]*)$/.exec(line);
      if (mVar) { variants[mVar[1]] = mVar[2]; hasVariant = true; continue; }
      if (base === null) base = line;
    }
    if (base === null) base = lines.length ? lines[0] : '';
    if (hasFragment) {
      var text = base;
      Object.keys(fragments).forEach(function (ph) {
        var val = params ? params[ph] : undefined;
        if (typeof val !== 'number' || !isFinite(val)) return;
        var cat = pluralCategory(langId, val);
        var frag = fragments[ph][cat] || fragments[ph].other || fragments[ph].many || fragments[ph].one || '';
        text = text.split('{' + ph + '}').join(frag);
      });
      return fillParams(text, params);
    }
    if (hasVariant) {
      var num = firstNumberParam(params);
      var chosen = null;
      if (num != null) chosen = variants[pluralCategory(langId, num)];
      if (!chosen) chosen = variants.other || variants.many || variants.one;
      if (!chosen) {
        var keys = Object.keys(variants);
        chosen = keys.length ? variants[keys[0]] : '';
      }
      return fillParams(chosen, params);
    }
    return fillParams(base, params);
  }

  // 外部可注册“数据值翻译器”（例如活动中文名 → 英文名），
  // 用于把模板里捕获到的中文数据片段也一起本地化
  var valueTranslator = null;

  function setValueTranslator(fn) {
    valueTranslator = (typeof fn === 'function') ? fn : null;
  }

  function translateValue(value) {
    var out = value;
    if (valueTranslator) {
      try {
        var mapped = valueTranslator(out);
        if (mapped) out = mapped;
      } catch (err) {}
    }
    return out;
  }

  function extractParams(pat, match, depth) {
    var params = {};
    for (var j = 0; j < pat.names.length; j++) {
      var val = captureValue(match[j + 1]);
      if (typeof val === 'string' && val) {
        val = translateValue(val);
        val = tr(val, null, (depth || 0) + 1);
      }
      params[pat.names[j]] = val;
    }
    return params;
  }

  /* ---------- 取词 ---------- */
  function cellFor(key) {
    if (state.cells) {
      var v = state.cells[key];
      if (v && v.length) return v;
    }
    return indexZh(key);
  }

  function t(key, fallback, params) {
    var raw = cellFor(key);
    if (!raw) return fillParams(fallback || '', params);
    var out = resolveCell(raw, state.id, params);
    out = out || fillParams(fallback || '', params);
    out = normalizeJapaneseQuoteSpacing(out);
    return /^shop\.activity\./.test(key) ? localizeActivityNameText(out) : out;
  }

  function tr(zhText, params, depth) {
    if (zhText == null) return zhText;
    var source = String(zhText);
    depth = depth || 0;
    if (state.id === SOURCE_ID || !INDEX || depth > 3) return fillParams(source, params);
    var key = indexKeyOf(source);
    var useParams = params;
    if (!key) {
      var list = patterns();
      for (var i = 0; i < list.length; i++) {
        var m = list[i].re.exec(source);
        if (!m) continue;
        key = list[i].key;
        useParams = extractParams(list[i], m, depth);
        break;
      }
    }
    if (!key) return source;
    var raw = cellFor(key);
    if (!raw) return fillParams(source, params);
    var out = resolveCell(raw, state.id, useParams) || source;
    out = normalizeJapaneseQuoteSpacing(out);
    return /^shop\.activity\./.test(key) ? localizeActivityNameText(out) : out;
  }

  /* ---------- 数字 / 日期本地化 ---------- */
  function currentLocale() {
    var l = byId[state.id];
    return (l && l.htmlLang) || 'zh-Hans';
  }

  function fixedTrim(n, digits) {
    return Number(n).toFixed(digits).replace(/\.0+$|\.(\d*[1-9])0+$/, '$1');
  }

  function plainNumber(number) {
    if (Math.abs(number - Math.round(number)) < 0.000001) return Math.round(number).toLocaleString('en-US');
    return number.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function formatNumber(value) {
    var number = Number(value) || 0;
    var absolute = Math.abs(number);
    var cjk = state.id === 'zh-Hans' || state.id === 'zh-Hant' || state.id === 'ja' || state.id === 'ko';
    if (cjk) {
      if (absolute >= 100000000) return fixedTrim(number / 100000000, absolute >= 1000000000 ? 1 : 2) + t('format.number.yi', '亿');
      if (absolute >= 10000) return fixedTrim(number / 10000, absolute >= 100000 ? 1 : 2) + t('format.number.wan', '万');
      return plainNumber(number);
    }
    if (absolute >= 100000000) return fixedTrim(number / 1000000, absolute >= 1000000000 ? 1 : 2) + t('format.number.yi', 'M');
    if (absolute >= 10000) return fixedTrim(number / 1000, absolute >= 100000 ? 1 : 2) + t('format.number.wan', 'K');
    return plainNumber(number);
  }

  function localizeDate(value) {
    var raw = (value == null) ? '' : String(value);
    if (!raw) return raw;
    var m = /(\d{4})\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})/.exec(raw);
    if (!m) return raw;
    var date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(date.getTime())) return raw;
    try {
      return new Intl.DateTimeFormat(currentLocale(), { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
    } catch (err) {
      return raw;
    }
  }

  /* ---------- DOM 替换 ---------- */
  var ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1, NOSCRIPT: 1 };
  var textRecords = new WeakMap();
  var attrRecords = new WeakMap();
  var observer = null;
  var pendingFrame = 0;
  var pendingNodes = [];

  function lookupSource(source) {
    if (/^$/.test(source)) return null;
    if (/\{[A-Za-z_]+\}/.test(source)) return null;
    var key = indexKeyOf(source);
    if (key) return { key: key, params: null };
    var list = patterns();
    for (var i = 0; i < list.length; i++) {
      var m = list[i].re.exec(source);
      if (!m) continue;
      return { key: list[i].key, params: extractParams(list[i], m, 0) };
    }
    return null;
  }

  function shouldSkip(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    while (el) {
      if (SKIP_TAGS[el.tagName]) return true;
      if (el.hasAttribute && el.hasAttribute('data-i18n-skip')) return true;
      el = el.parentElement;
    }
    return false;
  }

  function translateByKey(key, zhSource, params) {
    if (state.id === SOURCE_ID) return fillParams(zhSource, params);
    var raw = cellFor(key);
    var out = raw ? (resolveCell(raw, state.id, params) || fillParams(zhSource, params)) : fillParams(zhSource, params);
    out = normalizeJapaneseQuoteSpacing(out);
    return /^shop\.activity\./.test(key) ? localizeActivityNameText(out) : out;
  }

  function applyText(node) {
    if (shouldSkip(node)) return;
    var raw = node.nodeValue;
    if (!raw) return;
    var trimmed = raw.trim();
    if (!trimmed) return;
    var rec = textRecords.get(node);
    if (rec && rec.applied !== trimmed) rec = null;
    if (!rec) {
      var hit = lookupSource(trimmed);
      if (!hit) { textRecords.delete(node); return; }
      rec = { key: hit.key, zh: trimmed, params: hit.params, applied: trimmed };
      textRecords.set(node, rec);
    }
    var next = translateByKey(rec.key, rec.zh, rec.params);
    if (!next || next === rec.applied) return;
    var base = rec.applied;
    var out = raw === base ? next : raw.replace(base, next);
    if (out === raw) return;
    node.nodeValue = out;
    rec.applied = next;
  }

  function applyAttr(el, attr) {
    if (shouldSkip(el)) return;
    var raw = el.getAttribute(attr);
    if (!raw) return;
    var trimmed = raw.trim();
    if (!trimmed) return;
    var store = attrRecords.get(el);
    if (!store) { store = {}; attrRecords.set(el, store); }
    var rec = store[attr];
    if (rec && rec.applied !== trimmed) rec = null;
    if (!rec) {
      var hit = lookupSource(trimmed);
      if (!hit) { delete store[attr]; return; }
      rec = { key: hit.key, zh: trimmed, params: hit.params, applied: trimmed };
      store[attr] = rec;
    }
    var next = translateByKey(rec.key, rec.zh, rec.params);
    if (!next || next === rec.applied) return;
    var base = rec.applied;
    var out = raw === base ? next : raw.replace(base, next);
    if (out === raw) return;
    el.setAttribute(attr, out);
    rec.applied = next;
  }

  function applyElement(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.hasAttribute('data-i18n-skip')) return;
    ATTRS.forEach(function (a) { if (el.hasAttribute(a)) applyAttr(el, a); });
  }

  function applyTree(root) {
    if (!root) return;
    if (root.nodeType === 3) { applyText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) {
      if (SKIP_TAGS[root.tagName]) return;
      applyElement(root);
    }
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (node) {
        if (node.nodeType === 1) {
          if (SKIP_TAGS[node.tagName]) return NodeFilter.FILTER_REJECT;
          if (node.hasAttribute && node.hasAttribute('data-i18n-skip')) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) applyText(node);
      else applyElement(node);
    }
  }

  function scheduleApplyNodes(nodes) {
    for (var i = 0; i < nodes.length; i++) pendingNodes.push(nodes[i]);
    if (pendingFrame) return;
    var run = function () {
      pendingFrame = 0;
      var list = pendingNodes;
      pendingNodes = [];
      for (var j = 0; j < list.length; j++) {
        try { applyTree(list[j]); } catch (err) {}
      }
    };
    pendingFrame = global.requestAnimationFrame ? global.requestAnimationFrame(run) : global.setTimeout(run, 16);
  }

  function setObserverEnabled(enabled) {
    if (!global.MutationObserver) return;
    if (enabled) {
      if (observer || !document.body) return;
      observer = new MutationObserver(function (mutations) {
        var targets = [];
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.type === 'characterData') { targets.push(m.target); continue; }
          if (m.type === 'attributes') { targets.push(m.target); continue; }
          if (m.addedNodes) {
            for (var j = 0; j < m.addedNodes.length; j++) targets.push(m.addedNodes[j]);
          }
        }
        if (targets.length) scheduleApplyNodes(targets);
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    } else if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  /* ---------- alert / confirm ---------- */
  function wrapDialogs() {
    if (global.__fgexpigI18nDialogs) return;
    global.__fgexpigI18nDialogs = true;
    var nativeAlert = global.alert, nativeConfirm = global.confirm;
    global.alert = function (msg) { return nativeAlert.call(global, tr(msg)); };
    global.confirm = function (msg) { return nativeConfirm.call(global, tr(msg)); };
  }

  /* ---------- 语言选择 ---------- */
  function detect() {
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < list.length; i++) {
      var tag = String(list[i] || '').toLowerCase();
      if (!tag) continue;
      if (/^zh/.test(tag)) return /(tw|hk|mo|hant)/.test(tag) ? 'zh-Hant' : 'zh-Hans';
      if (/^pt/.test(tag)) return 'pt-BR';
      if (/^es/.test(tag)) return 'es-ES';
      var base = tag.split('-')[0];
      for (var j = 0; j < LANGUAGES.length; j++) {
        if (HIDDEN_LANGUAGE_IDS[LANGUAGES[j].id]) continue;
        if (LANGUAGES[j].id.toLowerCase() === tag || LANGUAGES[j].id.split('-')[0].toLowerCase() === base) return LANGUAGES[j].id;
      }
    }
    return DEFAULT_ID;
  }

  function savedLanguage() {
    try { return global.localStorage.getItem(STORAGE_KEY); } catch (err) { return null; }
  }

  function saveLanguage(id) {
    try { global.localStorage.setItem(STORAGE_KEY, id); } catch (err) {}
  }

  function notify() {
    state.listeners.forEach(function (fn) { try { fn(state.id); } catch (err) {} });
  }

  function useSourceLanguage() {
    state.id = SOURCE_ID;
    state.cells = null;
    document.documentElement.setAttribute('lang', langOf(SOURCE_ID).htmlLang);
    applyTree(document.body);
    setObserverEnabled(false);
    notify();
  }

  function setLanguage(id) {
    if (sourceLanguageLocked) {
      useSourceLanguage();
      return Promise.resolve(SOURCE_ID);
    }
    var target = byId[id] && !HIDDEN_LANGUAGE_IDS[id] ? id : DEFAULT_ID;
    if (target === SOURCE_ID) {
      useSourceLanguage();
      return Promise.resolve(target);
    }
    return loadPack(target).then(function (pack) {
      if (sourceLanguageLocked) {
        useSourceLanguage();
        return SOURCE_ID;
      }
      state.id = target;
      state.cells = (pack && pack.cells) || {};
      document.documentElement.setAttribute('lang', langOf(target).htmlLang);
      setObserverEnabled(true);
      applyTree(document.body);
      notify();
      return target;
    }).catch(function (err) {
      warn('语言包加载失败，回退简体中文：', err, '（检查 i18n/lang/' + target + '.js 是否存在，或运行 tools/update-i18n-pack.bat 重新生成）');
      useSourceLanguage();
      return SOURCE_ID;
    });
  }

  function lockSourceLanguage() {
    sourceLanguageLocked = true;
    if (state.id === SOURCE_ID && !state.cells) return Promise.resolve(SOURCE_ID);
    useSourceLanguage();
    return Promise.resolve(SOURCE_ID);
  }

  function unlockSourceLanguage() {
    sourceLanguageLocked = false;
    var id = savedLanguage();
    if (!id || !byId[id] || HIDDEN_LANGUAGE_IDS[id]) id = DEFAULT_ID;
    return setLanguage(id);
  }

  function init() {
    wrapDialogs();
    var id = savedLanguage();
    // 默认语言为英语；不再按浏览器语言自动选择
    if (!id || !byId[id] || HIDDEN_LANGUAGE_IDS[id]) id = DEFAULT_ID;
    document.documentElement.setAttribute('lang', langOf(id).htmlLang);
    function start() {
      if (id === SOURCE_ID) { useSourceLanguage(); return; }
      setLanguage(id);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  global.FgexpigI18n = {
    languages: LANGUAGES,
    defaultId: DEFAULT_ID,
    sourceId: SOURCE_ID,
    version: (INDEX && INDEX.version) || '',
    t: t,
    tr: tr,
    setLanguage: setLanguage,
    lockSourceLanguage: lockSourceLanguage,
    unlockSourceLanguage: unlockSourceLanguage,
    saveLanguage: saveLanguage,
    getSavedLanguage: savedLanguage,
    getLanguage: function () { return state.id; },
    onChange: function (fn) { if (typeof fn === 'function') state.listeners.push(fn); },
    applyDom: function (root) { applyTree(root || document.body); },
    formatNumber: formatNumber,
    localizeDate: localizeDate,
    localizeActivityNameText: localizeActivityNameText,
    currentLocale: currentLocale,
    pluralCategory: pluralCategory,
    setValueTranslator: setValueTranslator,
    detect: detect
  };

  init();
})(window);
