'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { Readable, Transform } = require('stream');

const MANIFEST_NAME = 'desktop-manifest.json';
const LOCAL_MANIFEST_NAME = '.desktop-manifest.json';

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
  if (!localEntry || localEntry.hash !== entry.hash || Number(localEntry.size) !== Number(entry.size)) return false;
  const file = safeLocalPath(root, entry.path);
  if (!file) return false;
  try {
    const stat = await fsp.stat(file);
    return stat.isFile() && stat.size === Number(entry.size);
  } catch (err) {
    return false;
  }
}

async function downloadEntry(baseUrl, root, entry) {
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
    if (actual !== entry.hash) throw new Error('hash mismatch: ' + entry.path);
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
  const files = manifest.files.filter(function (entry) {
    const entryQuality = Number(entry.quality) || 0;
    const qualityMatches = maxLevel >= 3 || !entryQuality || entryQuality === selectedQuality;
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
    await downloadEntry(baseUrl, root, entry);
    current += 1;
    if (onProgress) onProgress({ current: current, target: files.length, phase: 'download', level: maxLevel });
  });
  const completedLevel = Math.max(Number(local && local.completedLevel) || 0, maxLevel);
  await fsp.writeFile(localManifestPath, JSON.stringify({ version: manifest.version, completedLevel: completedLevel, quality: selectedQuality, files: manifest.files }, null, 2), 'utf8');
  return { version: manifest.version, count: files.length, level: maxLevel, quality: selectedQuality, completedLevel: completedLevel };
}

function hasLocalSite(root) {
  return fs.existsSync(path.join(root, 'index.html'));
}

module.exports = { syncSite, hasLocalSite, MANIFEST_NAME };