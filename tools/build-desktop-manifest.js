'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'desktop-manifest.json');
const ROOT_FILES = ['index.html', 'sw.js', 'favicon.ico', 'robots.txt', 'sitemap.xml'];
const DIRS = ['button', 'css', 'emoji', 'fonts', 'i18n', 'js', 'logo', 'music', 'profile', 'resources', 'wallpaper'];
const TEXT_RE = /\.(?:html?|css|js|json|txt|xml|csv|md)$/i;
const CURRENT_QUALITY = 5;

function urlPath(relativePath) {
  return relativePath.split(path.sep).map(encodeURIComponent).join('/');
}

function include(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  const baseName = path.basename(normalized).toLowerCase();
  if (baseName === 'desktop.ini' || baseName === 'thumbs.db' || baseName === '.ds_store') return false;
  const quality = qualityLevel(normalized);
  if (quality && quality !== 5) return false;
  if (normalized.indexOf('i18n/') === 0 && /\.csv$/i.test(normalized)) return false;
  return true;
}

async function walk(dir, out) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(ROOT, full);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile() && include(relative)) out.push(relative);
  }
}

function hashFile(filePath) {
  return new Promise(function (resolve, reject) {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', function (chunk) { hash.update(chunk); });
    stream.on('error', reject);
    stream.on('end', function () { resolve(hash.digest('hex')); });
  });
}

async function mapLimit(items, limit, worker) {
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      await worker(items[index], index);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(run());
  await Promise.all(workers);
}

function loadDataFile(relativePath, expression) {
  const file = path.join(ROOT, relativePath);
  if (!fs.existsSync(file)) return null;
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: relativePath });
  return sandbox.window.FGEXPIG_DATA_FILES[relativePath];
}

function getDefaultActivityId(core) {
  const rows = (core || []).filter(function (row) {
    return row && row.held !== false && (Number(row.display) === 11 || row.defaultSelected === true);
  });
  rows.sort(function (a, b) {
    const at = Date.parse(String(a.releaseDate || '').replace(/[年月日]/g, '/')) || 0;
    const bt = Date.parse(String(b.releaseDate || '').replace(/[年月日]/g, '/')) || 0;
    return bt - at;
  });
  return rows[0] && rows[0].id ? rows[0].id : '';
}

function collectEmojiNames(value, names, result) {
  if (value == null) return;
  if (typeof value === 'string') {
    for (let i = 0; i < value.length; i++) {
      if (value.charAt(i) !== '\\') continue;
      const tail = value.slice(i + 1);
      let matched = '';
      for (const name of names) {
        if (tail.slice(0, name.length).toLowerCase() === name.toLowerCase() && name.length > matched.length) matched = name;
      }
      if (matched) {
        result[matched] = true;
        i += matched.length;
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(function (item) { collectEmojiNames(item, names, result); });
    return;
  }
  if (typeof value === 'object') {
    Object.keys(value).forEach(function (key) { collectEmojiNames(value[key], names, result); });
  }
}

function getActivityEmojiNames(activityId, allEmojiNames) {
  const result = {};
  if (!activityId) return result;
  const relative = 'resources/' + activityId + '/news.js';
  const fragment = loadDataFile(relative, 'window.FGEXPIG_DATA_FILES');
  const rows = fragment && fragment.hotspots && fragment.hotspots[activityId];
  collectEmojiNames(rows, allEmojiNames, result);
  return result;
}

function qualityLevel(relativePath) {
  const match = /\/([1-5])\/[^/]+$/.exec(relativePath.replace(/\\/g, '/'));
  return match ? Number(match[1]) : 0;
}

function isText(relativePath) {
  return TEXT_RE.test(relativePath);
}

function levelOf(relativePath, activityId, defaultEmojiNames) {
  if (isText(relativePath)) return 1;
  const normalized = relativePath.replace(/\\/g, '/');

  const resourceMatch = /^resources\/([^/]+)\//.exec(normalized);
  if (resourceMatch) return resourceMatch[1] === activityId ? 1 : 2;

  const emojiMatch = /^emoji\/[1-5]\/([^/]+)$/.exec(normalized);
  if (emojiMatch) {
    let name = emojiMatch[1].replace(/\.[^.]+$/, '');
    try { name = decodeURIComponent(name); } catch (err) {}
    return defaultEmojiNames[name] ? 1 : 2;
  }

  return 1;
}

(async function () {
  const coreData = loadDataFile('resources/core.js', 'window.FGEXPIG_DATA_FILES');
  const core = coreData && coreData.core ? coreData.core : [];
  const emojiSandbox = { window: {}, console };
  vm.createContext(emojiSandbox);
  const emojiFile = path.join(ROOT, 'js', 'emoji-manifest.js');
  if (fs.existsSync(emojiFile)) vm.runInContext(fs.readFileSync(emojiFile, 'utf8'), emojiSandbox, { filename: 'js/emoji-manifest.js' });
  const emojiNames = Array.isArray(emojiSandbox.window.FGEXPIG_EMOJI_MANIFEST) ? emojiSandbox.window.FGEXPIG_EMOJI_MANIFEST : [];
  const activityId = getDefaultActivityId(core);
  const defaultEmojiNames = getActivityEmojiNames(activityId, emojiNames);

  const paths = [];
  for (const file of ROOT_FILES) {
    const full = path.join(ROOT, file);
    if (fs.existsSync(full)) paths.push(path.relative(ROOT, full));
  }
  for (const dir of DIRS) {
    const full = path.join(ROOT, dir);
    if (fs.existsSync(full)) await walk(full, paths);
  }
  paths.sort();
  const files = [];
  await mapLimit(paths, 6, async function (relative) {
    const full = path.join(ROOT, relative);
    const stat = await fsp.stat(full);
    files.push({ path: urlPath(relative), hash: await hashFile(full), size: stat.size, level: levelOf(relative, activityId, defaultEmojiNames), quality: qualityLevel(relative) });
  });
  files.sort(function (a, b) { return a.path.localeCompare(b.path); });
  const counts = { 1: 0, 2: 0, 3: 0 };
  files.forEach(function (file) { counts[file.level] += 1; });
  const version = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16);
  const manifest = { version: version, generatedAt: new Date().toISOString(), counts: counts, files: files };
  await fsp.writeFile(OUTPUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('desktop manifest:', files.length, 'files, levels', JSON.stringify(counts), 'version', version);
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});