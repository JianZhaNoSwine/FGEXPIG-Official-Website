'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'desktop-manifest.json');
const ROOT_FILES = ['index.html', 'sw.js', 'favicon.ico', 'robots.txt', 'sitemap.xml'];
const DIRS = ['button', 'css', 'emoji', 'fonts', 'i18n', 'js', 'logo', 'music', 'profile', 'resources', 'wallpaper'];

function urlPath(relativePath) {
  return relativePath.split(path.sep).map(encodeURIComponent).join('/');
}

function include(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
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

(async function () {
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
    files.push({ path: urlPath(relative), hash: await hashFile(full), size: stat.size });
  });
  files.sort(function (a, b) { return a.path.localeCompare(b.path); });
  const version = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16);
  const manifest = { version: version, generatedAt: new Date().toISOString(), files: files };
  await fsp.writeFile(OUTPUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('desktop manifest:', files.length, 'files, version', version, '-> desktop-manifest.json');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});