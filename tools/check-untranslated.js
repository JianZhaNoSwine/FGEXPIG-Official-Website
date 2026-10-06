'use strict';

/*
 * 开发期翻译检查工具。
 *
 * 检查范围：
 * - i18n/*.csv 的 key 唯一、语言列非空
 * - 资源内容中的可翻译字段是否能在 CSV 中找到
 * - 已找到的字段是否存在空译文
 *
 * 不检查以下内容：
 * - 评测正文
 * - 热点帖子正文
 * - 评论 / 回复正文
 * - 更新日志正文
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const RESOURCES_DIR = path.join(ROOT, 'resources');
const CSV_DIR = path.join(ROOT, 'i18n');
const CSV_FILES = [
  'ui-strings.csv',
  'shop-strings.csv',
  'resources-strings.csv',
  'hotspot-strings.csv',
  'title-strings.csv'
];
const LANG_COLUMNS = [
  '日语', '英语', '法语', '意大利语', '德语', '西班牙语（西班牙）',
  '阿拉伯语', '韩语', '葡萄牙语（巴西）', '俄语', '繁体中文', '波兰语'
];
const BLACKLISTED_FILES = new Set(['review.js', 'update.js', 'account.js', 'library.js']);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function readCsv(file) {
  const rows = parseCsv(fs.readFileSync(path.join(CSV_DIR, file), 'utf8').replace(/^\uFEFF/, ''));
  return rows.filter(function (row) { return row.some(function (cell) { return String(cell || '').trim() !== ''; }); });
}

function hasCjk(value) {
  return /[\u3400-\u9fff]/.test(String(value || ''));
}

function shouldCheck(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text || !hasCjk(text)) return false;
  if (/^(?:https?:\/\/|www\.)/i.test(text)) return false;
  if (/^[\d\s.,，。:：;；+\-–—/\\()[\]{}<>《》「」『』【】…]+$/.test(text)) return false;
  if (/\.(?:png|jpe?g|gif|webp|svg|mp3|m4a|wav|mp4|webm)$/i.test(text)) return false;
  return true;
}

function loadDataFile(relativePath) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'), context, { timeout: 5000 });
  return context.window.FGEXPIG_DATA_FILES[relativePath.replace(/\\/g, '/')];
}

function walkResources(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkResources(full, out);
    else if (/\.js$/i.test(entry.name)) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
  });
}

function main() {
  const sourceMap = new Map();
  const csvByZh = new Map();
  const issues = [];
  const csvKeys = new Set();
  let csvRowCount = 0;

  function addSource(text, file, where) {
    if (!shouldCheck(text)) return;
    const key = String(text).trim();
    if (!sourceMap.has(key)) sourceMap.set(key, []);
    sourceMap.get(key).push(file + (where ? ' (' + where + ')' : ''));
  }

  function addArray(values, file, where) {
    (Array.isArray(values) ? values : []).forEach(function (value) { addSource(value, file, where); });
  }

  // 1. CSV 结构、key、空译文检查
  CSV_FILES.forEach(function (file) {
    const full = path.join(CSV_DIR, file);
    if (!fs.existsSync(full)) {
      issues.push({ type: 'CSV_FILE_MISSING', file: file });
      return;
    }
    const rows = readCsv(file);
    if (!rows.length) {
      issues.push({ type: 'CSV_EMPTY', file: file });
      return;
    }
    const header = rows[0].map(function (x) { return String(x || '').trim(); });
    const index = {};
    header.forEach(function (name, i) { index[name] = i; });
    if (index['key'] == null || index['简体中文'] == null) {
      issues.push({ type: 'CSV_HEADER', file: file, detail: header.join(',') });
      return;
    }
    LANG_COLUMNS.forEach(function (lang) {
      if (index[lang] == null) issues.push({ type: 'CSV_COLUMN_MISSING', file: file, detail: lang });
    });
    for (let r = 1; r < rows.length; r += 1) {
      const row = rows[r];
      const key = String(row[index['key']] || '').trim();
      const zh = String(row[index['简体中文']] || '').trim();
      if (!key) continue;
      csvRowCount += 1;
      if (csvKeys.has(key)) issues.push({ type: 'DUPLICATE_KEY', file: file, key: key });
      csvKeys.add(key);
      if (!zh) issues.push({ type: 'EMPTY_SOURCE', file: file, key: key });
      if (!csvByZh.has(zh)) csvByZh.set(zh, []);
      csvByZh.get(zh).push({ file: file, key: key, row: row, index: index });
      LANG_COLUMNS.forEach(function (lang) {
        if (index[lang] == null) return;
        if (!String(row[index[lang]] == null ? '' : row[index[lang]]).trim()) {
          issues.push({ type: 'MISSING_TRANSLATION', file: file, key: key, lang: lang });
        }
      });
    }
  });

  // 2. 采集需要翻译的资源内容
  const files = [];
  walkResources(RESOURCES_DIR, files);
  files.filter(function (file) { return !BLACKLISTED_FILES.has(path.basename(file)); }).forEach(function (file) {
    const name = path.basename(file);
    let data;
    try { data = loadDataFile(file); } catch (err) { return; }
    if (!data) return;
    if (name === 'core.js' && Array.isArray(data.core)) {
      data.core.forEach(function (row, i) { if (row) addArray(row.tags, file, 'core.tags#' + i); });
    } else if (name === 'shop.js' && data.shops) {
      Object.keys(data.shops).forEach(function (id) {
        const shop = data.shops[id] || {};
        (shop.versions || []).concat(shop.dlcs || []).forEach(function (item, i) {
          if (!item) return;
          addSource(item.name, file, id + '.item#' + i + '.name');
          addArray(item.contents, file, id + '.item#' + i + '.contents');
        });
      });
    } else if (name === 'title.js' && data.titles) {
      Object.keys(data.titles).forEach(function (nick) {
        (data.titles[nick] || []).forEach(function (row, i) { if (row) addSource(row.text, file, nick + '#title' + i); });
      });
    } else if (name === 'achievements.js' && data.achievements) {
      Object.keys(data.achievements).forEach(function (id) {
        (data.achievements[id] || []).forEach(function (row, i) {
          if (!row) return;
          addSource(row.name, file, id + '#achv' + i + '.name');
          addSource(row.desc, file, id + '#achv' + i + '.desc');
          addSource(row.group, file, id + '#achv' + i + '.group');
        });
      });
    } else if (name === 'list.js') {
      ['lists', 'featuredLists'].forEach(function (group) {
        const map = data[group] || {};
        Object.keys(map).forEach(function (id) {
          (map[id] || []).forEach(function (row, i) {
            if (!row) return;
            addSource(row.title, file, id + '.resource' + i + '.title');
            addSource(row.category, file, id + '.resource' + i + '.category');
          });
        });
      });
    } else if (name === 'date.js' && data.schedules) {
      Object.keys(data.schedules).forEach(function (id) {
        (data.schedules[id] || []).forEach(function (row, i) { if (row) addSource(row.text, file, id + '.schedule' + i); });
      });
    } else if (name === 'points.js' && data.points) {
      Object.keys(data.points).forEach(function (id) { addArray(data.points[id], file, id + '.keywords'); });
    } else if (name === 'news.js' && data.hotspots) {
      Object.keys(data.hotspots).forEach(function (id) {
        (data.hotspots[id] || []).forEach(function (post, i) {
          if (!post) return;
          addSource(post.title, file, id + '.post' + i + '.title');
          (function collectNames(comments, prefix) {
            (comments || []).forEach(function (comment, j) {
              if (!comment) return;
              addSource(comment.name, file, id + '.post' + i + '.commentName' + prefix + j);
              collectNames(comment.replies, prefix + '-' + j);
            });
          })(post.comments, '');
        });
      });
    }
  });

  // 3. 检查成就称号（定义在 js/main.js 中）
  try {
    const mainText = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
    const start = mainText.indexOf('var ACHIEVEMENT_TITLE_GROUPS = [');
    if (start >= 0) {
      const end = mainText.indexOf('\n  ];', start);
      const snippet = end > start ? mainText.slice(start, end) : '';
      let match;
      const re = /text:\s*'([^']+)'/g;
      while ((match = re.exec(snippet))) addSource(match[1], 'js/main.js', 'achievementTitle');
    }
  } catch (err) {}

  // 4. 检查采集到的文本是否缺少 CSV 或译文
  sourceMap.forEach(function (locations, text) {
    const rows = csvByZh.get(text) || [];
    if (!rows.length) {
      issues.push({ type: 'MISSING_SOURCE', text: text, locations: locations });
      return;
    }
    rows.forEach(function (entry) {
      LANG_COLUMNS.forEach(function (lang) {
        const idx = entry.index[lang];
        if (idx == null) return;
        if (!String(entry.row[idx] == null ? '' : entry.row[idx]).trim()) {
          issues.push({ type: 'MISSING_TRANSLATION', file: entry.file, key: entry.key, lang: lang, text: text });
        }
      });
    });
  });

  const counts = {};
  issues.forEach(function (issue) { counts[issue.type] = (counts[issue.type] || 0) + 1; });
  console.log('Translation check');
  console.log('  source text: ' + sourceMap.size);
  console.log('  CSV rows: ' + csvRowCount + ' / keys: ' + csvKeys.size);
  console.log('  issues: ' + issues.length);
  Object.keys(counts).sort().forEach(function (type) { console.log('  ' + type + ': ' + counts[type]); });
  if (issues.length) {
    console.log('');
    issues.slice(0, 300).forEach(function (issue) {
      if (issue.type === 'MISSING_SOURCE') {
        console.log('[MISSING SOURCE] ' + issue.text + '  <- ' + issue.locations.slice(0, 3).join(', '));
      } else if (issue.type === 'MISSING_TRANSLATION') {
        console.log('[MISSING TRANSLATION] ' + issue.file + ' | ' + issue.key + ' | ' + issue.lang + (issue.text ? ' | ' + issue.text : ''));
      } else {
        console.log('[' + issue.type + '] ' + JSON.stringify(issue));
      }
    });
    if (issues.length > 300) console.log('... ' + (issues.length - 300) + ' more issues');
  }
  process.exitCode = issues.length ? 1 : 0;
}

main();
