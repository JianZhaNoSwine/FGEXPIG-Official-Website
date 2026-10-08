'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { Readable, Transform } = require('stream');

const MANIFEST_NAME = 'desktop-manifest.json';
const LOCAL_MANIFEST_NAME = '.desktop-manifest.json';

// 文本类资源：CDN（例如 Cloudflare）可能对它们做换行归一化、注入统计脚本、
// 自动压缩等改写，导致下载到的字节与清单哈希对不上，因此这些文件放宽哈希校验。
const TEXT_RE = /\.(?:html?|css|js|mjs|json|txt|xml|csv|md|svg)$/i;

function isTextAsset(encodedPath) {
  let value = String(encodedPath || '');
  try { value = decodeURIComponent(value); } catch (err) {}
  return TEXT_RE.test(value);
}

function safeLocalPath(root, encodedPath) {
  let relative = String(encodedPath || '');
  try { relative = decodeURIComponent(relative); } catch (err) {}
  relative = relative.replace(/\\/g, '/').replace(/^\/+/, '');
  const candidate = path.resolve(root, relative);
  const rel = path.relative(root, candidate);
  if (!rel || rel.indexOf('..') === 0 || path.isAbsolute(rel)) return null;
  return candidate;
}

async function hashFile(filePath) {
  return new Promise(function (resolve, reject) {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', function (chunk) { hash.update(chunk); });
    stream.on('error', reject);
    stream.on('end', function () { resolve(hash.digest('hex')); });
  });
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch (err) {
    return null;
  }
}

async function fetchManifest(baseUrl) {
  const url = new URL(MANIFEST_NAME, baseUrl).toString();
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('manifest HTTP ' + response.status);
  const data = await response.json();
  if (!data || !Array.isArray(data.files)) throw new Error('invalid desktop manifest');
  return data;
}

async function fileState(root, entry, localEntry) {
  if (!localEntry || localEntry.hash !== entry.hash) return false;
  const file = safeLocalPath(root, entry.path);
  if (!file) return false;
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) return false;
    // 文本文件可能被 CDN 改写（注入脚本 / 换行归一化 / 压缩），
    // 只要本地记录与远端清单同版本且文件存在就视为最新；二进制仍严格校验大小。
    if (isTextAsset(entry.path)) return stat.size > 0;
    return Number(localEntry.size) === Number(entry.size) && stat.size === Number(entry.size);
  } catch (err) {
    return false;
  }
}

async function downloadEntry(baseUrl, root, entry, tolerateHashMismatch) {
  const file = safeLocalPath(root, entry.path);
  if (!file) throw new Error('unsafe path: ' + entry.path);
  const tempDir = path.join(root, '.downloads');
  await fsp.mkdir(tempDir, { recursive: true });
  const temp = path.join(tempDir, crypto.randomUUID() + '.part');
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const url = new URL(entry.path, baseUrl).toString();
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok || !response.body) throw new Error('download HTTP ' + response.status + ': ' + entry.path);
  const hash = crypto.createHash('sha256');
  const hasher = new Transform({
    transform: function (chunk, encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    }
  });
  try {
    await pipeline(Readable.fromWeb(response.body), hasher, fs.createWriteStream(temp));
    const actual = hash.digest('hex');
    if (actual !== entry.hash) {
      if (!tolerateHashMismatch) throw new Error('hash mismatch: ' + entry.path);
      console.warn('[desktop] accepted CDN-rewritten text asset: ' + entry.path + ' (manifest ' + entry.hash.slice(0, 12) + ', got ' + actual.slice(0, 12) + ')');
    }
    await fsp.rm(file, { force: true });
    await fsp.rename(temp, file);
  } catch (err) {
    await fsp.rm(temp, { force: true });
    throw err;
  }
}

async function mapLimit(items, limit, worker) {
  let next = 0;
  const workers = [];
  async function run() {
    while (next < items.length) {
      const index = next++;
      await worker(items[index], index);
    }
  }
  for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(run());
  await Promise.all(workers);
}

async function syncSite(baseUrl, root, onProgress, maxLevel, quality) {
  const manifest = await fetchManifest(baseUrl);
  const localManifestPath = path.join(root, LOCAL_MANIFEST_NAME);
  const local = await readJson(localManifestPath);
  const localMap = {};
  if (local && Array.isArray(local.files)) {
    local.files.forEach(function (entry) { localMap[entry.path] = entry; });
  }
  maxLevel = Math.max(1, Math.min(3, Number(maxLevel) || 3));
  await fsp.mkdir(root, { recursive: true });
  const selectedQuality = Number(quality) === 3 ? 3 : 5;
  // exe 只用当前画质（5 级），1~4 级资源永远用不到：
  // 不论同步到第几级，都必须按画质过滤，避免把用不上的画质写进缓存。
  const files = manifest.files.filter(function (entry) {
    const entryQuality = Number(entry.quality) || 0;
    const qualityMatches = !entryQuality || entryQuality === selectedQuality;
    return qualityMatches && Math.max(1, Math.min(3, Number(entry.level) || 3)) <= maxLevel;
  });
  let current = 0;
  if (onProgress) onProgress({ current: 0, target: files.length, phase: 'check', level: maxLevel });
  await mapLimit(files, 6, async function (entry) {
    if (await fileState(root, entry, localMap[entry.path])) {
      current += 1;
      if (onProgress) onProgress({ current: current, target: files.length, phase: 'download', level: maxLevel });
      return;
    }
    await downloadEntry(baseUrl, root, entry, isTextAsset(entry.path));
    current += 1;
    if (onProgress) onProgress({ current: current, target: files.length, phase: 'download', level: maxLevel });
  });
  const completedLevel = Math.max(Number(local && local.completedLevel) || 0, maxLevel);
  await fsp.writeFile(localManifestPath, JSON.stringify({ version: manifest.version, completedLevel: completedLevel, quality: selectedQuality, files: manifest.files }, null, 2), 'utf8');
  const pruned = await pruneStaleFiles(root, manifest);
  if (pruned) console.log('[desktop] pruned ' + pruned + ' stale cache file(s)');
  return { version: manifest.version, count: files.length, level: maxLevel, quality: selectedQuality, completedLevel: completedLevel, pruned: pruned };
}

// 清单里 URL 编码过的路径还原成文件系统相对路径
function decodeManifestPath(value) {
  return String(value || '').split('/').map(function (segment) {
    try { return decodeURIComponent(segment); } catch (err) { return segment; }
  }).join('/');
}

// 删除站点缓存里「清单中已不存在」的文件：
// 历史清单可能包含 1~4 级画质资源，exe 用不到，必须清掉释放空间。
async function pruneStaleFiles(root, manifest) {
  const keep = new Set();
  ((manifest && manifest.files) || []).forEach(function (entry) {
    if (entry && entry.path) keep.add(decodeManifestPath(entry.path));
  });
  if (!keep.size) return 0;
  let removed = 0;
  async function walk(dir) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (relative === '.downloads') continue;
        await walk(full);
        try { await fsp.rmdir(full); } catch (err) {}
        continue;
      }
      if (relative === LOCAL_MANIFEST_NAME) continue;
      if (!keep.has(relative)) {
        try {
          await fsp.rm(full, { force: true });
          removed += 1;
        } catch (err) {}
      }
    }
  }
  await walk(root);
  return removed;
}

function hasLocalSite(root) {
  return fs.existsSync(path.join(root, 'index.html'));
}

module.exports = { syncSite, hasLocalSite, MANIFEST_NAME };