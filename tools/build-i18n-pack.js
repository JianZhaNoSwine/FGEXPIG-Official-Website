/* FGEXPIG 语言包生成器（开发工具，不参与网页运行）
   用法：node tools/build-i18n-pack.js     或双击 tools/update-i18n-pack.bat
   输入：i18n/ui-strings.csv（界面）、i18n/shop-strings.csv（商店内容）、i18n/resources-strings.csv（资源页内容）、i18n/hotspot-strings.csv（热点页内容）、i18n/title-strings.csv（称号）
   输出：i18n/index.js（语言表 + key↔中文原文索引 + 复数模板）
         i18n/lang/<id>.js（每种语言一份 key→文案，网页按需加载） */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CSV_PATHS = [
  path.join(ROOT, 'i18n', 'ui-strings.csv'),
  path.join(ROOT, 'i18n', 'shop-strings.csv'),
  path.join(ROOT, 'i18n', 'resources-strings.csv'),
  path.join(ROOT, 'i18n', 'hotspot-strings.csv'),
  path.join(ROOT, 'i18n', 'title-strings.csv')
];
const INDEX_PATH = path.join(ROOT, 'i18n', 'index.js');
const LANG_DIR = path.join(ROOT, 'i18n', 'lang');

const LANGUAGES = [
  { id: 'zh-Hans', native: '简体中文', column: '简体中文', htmlLang: 'zh-Hans', source: true },
  { id: 'ja', native: '日本語', column: '日语', htmlLang: 'ja' },
  { id: 'en', native: 'English', column: '英语', htmlLang: 'en' },
  { id: 'fr', native: 'Français', column: '法语', htmlLang: 'fr' },
  { id: 'it', native: 'Italiano', column: '意大利语', htmlLang: 'it' },
  { id: 'de', native: 'Deutsch', column: '德语', htmlLang: 'de' },
  { id: 'es-ES', native: 'Español (España)', column: '西班牙语（西班牙）', htmlLang: 'es-ES' },
  { id: 'ar', native: 'العربية', column: '阿拉伯语', htmlLang: 'ar' },
  { id: 'ko', native: '한국어', column: '韩语', htmlLang: 'ko' },
  { id: 'pt-BR', native: 'Português (Brasil)', column: '葡萄牙语（巴西）', htmlLang: 'pt-BR' },
  { id: 'ru', native: 'Русский', column: '俄语', htmlLang: 'ru' },
  { id: 'zh-Hant', native: '繁體中文', column: '繁体中文', htmlLang: 'zh-Hant' },
  { id: 'pl', native: 'Polski', column: '波兰语', htmlLang: 'pl' }
];
const DEFAULT_ID = 'en';
const SOURCE_ID = 'zh-Hans';

/* ---------- CSV 解析（只在这里用） ---------- */
function parseCsv(text) {
  if (!text) return [];
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQuotes = false, i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  row.push(field);
  rows.push(row);
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

/* ---------- 复数模板 → 正则（生成时算好） ---------- */
function patternOf(zh) {
  const parts = String(zh).split(/(\{[A-Za-z_]+\})/);
  const names = [];
  let src = '^';
  parts.forEach(part => {
    const m = /^\{([A-Za-z_]+)\}$/.exec(part);
    if (m) { names.push(m[1]); src += '(.+?)'; return; }
    src += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  src += '$';
  return { names, src };
}

const sourceTexts = CSV_PATHS.map(file => fs.readFileSync(file, 'utf8'));
const csvText = sourceTexts.join('\n\n/* FGEXPIG-SOURCE-SPLIT */\n\n');

const zh = {};
const byZh = {};
const resourceByZh = {};
const hotspotByZh = {};
const titleByZh = {};
const patterns = [];
const cellsByLang = {};
LANGUAGES.forEach(l => { cellsByLang[l.id] = {}; });

sourceTexts.forEach((sourceText) => {
  const rows = parseCsv(sourceText);
  const header = rows[0] || [];
  const colOf = {};
  header.forEach((h, i) => { colOf[h] = i; });

  for (let r = 1; r < rows.length; r++) {
    const raw = rows[r];
    if (!raw || !raw.length) continue;
    const key = String(raw[0] || '').trim();
    if (!key) continue;
    const zhText = String(raw[colOf['简体中文']] == null ? '' : raw[colOf['简体中文']]);
    zh[key] = zhText;
    if (zhText && !byZh[zhText]) byZh[zhText] = key;
    if (zhText && /^resource\./.test(key) && !resourceByZh[zhText]) resourceByZh[zhText] = key;
    if (zhText && /^hotspot\./.test(key) && !hotspotByZh[zhText]) hotspotByZh[zhText] = key;
    if (zhText && /^title\./.test(key) && !titleByZh[zhText]) titleByZh[zhText] = key;
    if (zhText && /\{[A-Za-z_]+\}/.test(zhText)) {
      const p = patternOf(zhText);
      patterns.push({ key: key, names: p.names, src: p.src });
    }
    LANGUAGES.forEach(l => {
      if (l.source) return;
      const idx = colOf[l.column];
      const val = idx == null ? '' : String(raw[idx] == null ? '' : raw[idx]);
      if (val) cellsByLang[l.id][key] = val;
    });
  }
});
// 先具体后通用：字面量越长的模板越优先
patterns.sort((a, b) => {
  const litA = a.src.replace(/\((\.\+\?\))/g, '').length;
  const litB = b.src.replace(/\((\.\+\?\))/g, '').length;
  if (litB !== litA) return litB - litA;
  return b.names.length - a.names.length;
});

const version = crypto.createHash('sha1').update(csvText).digest('hex').slice(0, 12);

const banner = '/* 自动生成，请勿手改；源文件：i18n/ui-strings.csv、i18n/shop-strings.csv、i18n/resources-strings.csv、i18n/hotspot-strings.csv、i18n/title-strings.csv（改动后运行 tools/update-i18n-pack.bat） */\n';
const indexBody = banner +
  'window.FGEXPIG_I18N_INDEX = ' + JSON.stringify({
    version: version,
    generatedAt: new Date().toISOString(),
    defaultId: DEFAULT_ID,
    sourceId: SOURCE_ID,
    languages: LANGUAGES.map(l => ({ id: l.id, native: l.native, htmlLang: l.htmlLang, source: !!l.source })),
    zh: zh,
    byZh: byZh,
    resourceByZh: resourceByZh,
    hotspotByZh: hotspotByZh,
    titleByZh: titleByZh,
    patterns: patterns
  }, null, 0) + ';\n';
fs.writeFileSync(INDEX_PATH, indexBody, 'utf8');

if (!fs.existsSync(LANG_DIR)) fs.mkdirSync(LANG_DIR, { recursive: true });
const written = [];
LANGUAGES.forEach(l => {
  if (l.source) return;
  const body = banner +
    'window.FGEXPIG_I18N_LANG_PACKS = window.FGEXPIG_I18N_LANG_PACKS || {};\n' +
    'window.FGEXPIG_I18N_LANG_PACKS[' + JSON.stringify(l.id) + '] = ' +
    JSON.stringify({ id: l.id, cells: cellsByLang[l.id] }) + ';\n';
  const file = path.join(LANG_DIR, l.id + '.js');
  fs.writeFileSync(file, body, 'utf8');
  written.push(l.id + '.js (' + body.length + ')');
});

console.log('CSV   : ' + CSV_PATHS.map(file => path.basename(file)).join(' + ') + '  (' + csvText.length + ' chars, version ' + version + ')');
console.log('INDEX : i18n/index.js (' + indexBody.length + ' chars, ' + Object.keys(zh).length + ' keys, ' + patterns.length + ' patterns)');
console.log('LANG  : ' + written.length + ' files -> ' + written.join(', '));
