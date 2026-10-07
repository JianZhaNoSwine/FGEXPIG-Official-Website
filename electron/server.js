'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

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

function createStaticServer(rootDir, port) {
  const root = path.resolve(rootDir);
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
    fs.stat(filePath, function (err, stat) {
      if (err || !stat.isFile()) {
        res.writeHead(404);
        res.end('Not found');
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