'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf'
};

// exe 内置字体：网站请求 /fonts/xxx 时直接用打包进 exe 的字体，不再依赖站点缓存
const BUNDLED_FONT_DIR = path.join(__dirname, 'assets', 'fonts');
const BUNDLED_FONTS = {
  '等距更纱黑体(默认).woff': 'default.woff',
  '等距更纱黑体(默认).ttf': 'default.woff',
  '楷体.woff': 'kaiti.woff',
  '楷体.ttf': 'kaiti.woff',
  '萌芽熊体.woff': 'mengya.woff',
  '萌芽熊体.ttf': 'mengya.woff',
  '山海仲夏夜物语.woff': 'shanhai.woff',
  '山海仲夏夜物语.ttf': 'shanhai.woff'
};

function bundledFontFile(pathname) {
  const match = /^\/fonts\/(.+)$/.exec(pathname);
  if (!match) return null;
  let name = match[1];
  try { name = decodeURIComponent(name); } catch (err) {}
  const file = BUNDLED_FONTS[name];
  return file ? path.join(BUNDLED_FONT_DIR, file) : null;
}

function mimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function isTextPath(filePath) {
  return /\.(?:html?|css|js|json|txt|xml|csv|md)$/i.test(filePath);
}

function safeFilePath(root, pathname) {
  let decoded = pathname;
  try { decoded = decodeURIComponent(pathname); } catch (err) {}
  const candidate = path.resolve(root, '.' + decoded.replace(/^\/+/, '/'));
  const relative = path.relative(root, candidate);
  if (relative.indexOf('..') === 0 || path.isAbsolute(relative)) return null;
  return candidate;
}

function sendRange(req, res, filePath, stat) {
  const rangeHeader = req.headers.range;
  const type = mimeType(filePath);
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': isTextPath(filePath) ? 'no-store' : 'public, max-age=3600'
  };
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (!match) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size });
      res.end();
      return;
    }
    let start = match[1] === '' ? stat.size - Number(match[2]) : Number(match[1]);
    let end = match[2] === '' ? stat.size - 1 : Math.min(Number(match[2]), stat.size - 1);
    if (!isFinite(start) || !isFinite(end) || start < 0 || start > end || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size });
      res.end();
      return;
    }
    headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
    headers['Content-Length'] = String(end - start + 1);
    res.writeHead(206, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath, { start: start, end: end }).pipe(res);
    return;
  }
  headers['Content-Length'] = String(stat.size);
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

// 站点清单里的路径集合：只有清单里存在的文件才值得回源到线上。
// 站点会为每个活动都尝试读取可选的 review/achievements/news 等文件，
// 其中绝大多数在服务端本来就不存在；若逐个回源，每个不存在的文本都要走一次
// 完整网络请求，这是 exe 首屏文字比网页还慢的主因。
function normalizeRemoteKey(pathname) {
  let value = String(pathname || '');
  try { value = decodeURIComponent(value); } catch (err) {}
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

function loadManifestPaths(root) {
  const names = ['.desktop-manifest.json', 'desktop-manifest.json'];
  for (const name of names) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
      if (!data || !Array.isArray(data.files)) continue;
      const set = new Set();
      data.files.forEach(function (entry) {
        if (!entry || !entry.path) return;
        set.add(normalizeRemoteKey(entry.path));
      });
      if (set.size) return set;
    } catch (err) {}
  }
  return null;
}

function createStaticServer(rootDir, port, options) {
  const root = path.resolve(rootDir);
  const fallbackBaseUrl = options && options.fallbackBaseUrl ? options.fallbackBaseUrl : '';
  const manifestPaths = loadManifestPaths(root);
  const remoteMisses = new Set();
  function proxyRemote(req, res, cacheKey) {
    if (!fallbackBaseUrl) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    let target;
    try { target = new URL(req.url, fallbackBaseUrl).toString(); } catch (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    fetch(target, { headers: headers, cache: 'no-store' }).then(function (response) {
      const responseHeaders = {};
      ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'].forEach(function (name) {
        const value = response.headers.get(name);
        if (value) responseHeaders[name] = value;
      });
      responseHeaders['Cache-Control'] = 'no-store';
      if (cacheKey && (response.status === 404 || response.status === 410)) remoteMisses.add(cacheKey);
      res.writeHead(response.status, responseHeaders);
      if (req.method === 'HEAD' || !response.body) return res.end();
      Readable.fromWeb(response.body).pipe(res);
    }).catch(function () {
      if (cacheKey) remoteMisses.add(cacheKey);
      res.writeHead(404);
      res.end('Not found');
    });
  }
  const server = http.createServer(function (req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    let pathname;
    try {
      pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    } catch (err) {
      res.writeHead(400);
      res.end();
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = safeFilePath(root, pathname);
    if (!filePath) {
      res.writeHead(403);
      res.end();
      return;
    }
    // 字体优先用 exe 内置字体
    const bundledFont = bundledFontFile(pathname);
    if (bundledFont) {
      fs.stat(bundledFont, function (fontErr, fontStat) {
        if (!fontErr && fontStat.isFile()) sendRange(req, res, bundledFont, fontStat);
        else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
      return;
    }
    fs.stat(filePath, function (err, stat) {
      if (err || !stat.isFile()) {
        const key = normalizeRemoteKey(pathname);
        // 清单里没有该文件：直接 404，不回源，避免无谓的网络往返拖慢首屏文字。
        if (manifestPaths && !manifestPaths.has(key)) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        // 之前回源已经确认取不到的文件，本次会话内不再重复回源。
        if (remoteMisses.has(key)) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        proxyRemote(req, res, key);
        return;
      }
      sendRange(req, res, filePath, stat);
    });
  });

  return new Promise(function (resolve, reject) {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', function () {
      var actualPort = server.address() && server.address().port ? server.address().port : port;
      resolve({ server: server, url: 'http://127.0.0.1:' + actualPort + '/' });
    });
  });
}

module.exports = { createStaticServer };