'use strict';
/*
 * 地图数据接口测试（临时探针，非网站代码）
 *
 * 用途：在“不受浏览器 CORS 限制”的情况下，确认这台机器的网络能不能读到地图数据，
 *       并把接口真实返回的字段打印出来，用来判断功能能否实现。
 *
 * 运行（需要 Node 18+，自带 fetch）：
 *   node tools/map-lookup-probe.js
 *   node tools/map-lookup-probe.js 0622-6707-7933 4150-7311-8813
 *
 * 说明：探针默认从 fallguys-cms-master/dlc_levels.json 里取几个真实分享码来测。
 */

const fs = require('fs');
const path = require('path');

const API = 'https://api2.fallguysdb.info/api/creative/';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://fallguys-db.pages.dev',
  'Referer': 'https://fallguys-db.pages.dev/'
};

function sampleCodes(count) {
  const file = path.join(__dirname, '..', 'fallguys-cms-master', 'dlc_levels.json');
  if (!fs.existsSync(file)) return [];
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = [];
  for (let i = 0; i < rows.length && out.length < count; i += Math.max(1, Math.floor(rows.length / count))) {
    if (rows[i] && rows[i].sharecode) out.push(rows[i].sharecode);
  }
  return out;
}

async function probe(code) {
  const t0 = Date.now();
  const url = API + encodeURIComponent(code) + '.json';
  try {
    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
    const ms = Date.now() - t0;
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (err) {}
    console.log('--- ' + code + ' -> HTTP ' + res.status + ' (' + ms + 'ms, ' + text.length + ' bytes)');
    if (!res.ok) {
      console.log('    ' + text.replace(/\s+/g, ' ').slice(0, 220));
      if (!res.headers.get('access-control-allow-origin')) {
        console.log('    （这个响应里没有 Access-Control-Allow-Origin；被 Cloudflare 拦时通常都是这样）');
      }
      return null;
    }
    if (!json) { console.log('    返回不是 JSON：' + text.slice(0, 200)); return null; }
    return json;
  } catch (err) {
    console.log('--- ' + code + ' -> 请求失败：' + err.message);
    return null;
  }
}

function describe(json) {
  const level = (json && json.data && json.data.level) || {};
  const snap = (json && json.data && json.data.snapshot) || {};
  const stats = snap.stats || {};
  console.log('');
  console.log('=== 关键字段（做“地图数据”需要的） ===');
  console.log('  ok                :', json.ok);
  console.log('  level.title       :', level.title);
  console.log('  level.share_code  :', level.share_code);
  console.log('  level.play_count  :', level.play_count, '   <-- 游玩数');
  console.log('  snapshot.stats.likes   :', stats.likes, '   <-- 点赞数');
  console.log('  snapshot.stats.dislikes:', stats.dislikes, '   <-- 点踩数');
  console.log('  level.max_players :', level.max_players);
  console.log('  level.creator_tags:', JSON.stringify(level.creator_tags));
  console.log('  meta.status       :', (snap.version_metadata || {}).status);
  console.log('  meta.theme/mode   :', (snap.version_metadata || {}).level_theme_id, '/', (snap.version_metadata || {}).game_mode_id);
  console.log('  meta.last_modified:', (snap.version_metadata || {}).last_modified_date);
  console.log('  images.PreviewImage:', (((snap.images || {}).PreviewImage) || []).length, '张');
  console.log('  author            :', JSON.stringify(level.player_badge || snap.author || null));
  console.log('');
  console.log('=== snapshot 顶层字段 ===');
  console.log('  ' + Object.keys(snap).join(', '));
  console.log('=== level 顶层字段 ===');
  console.log('  ' + Object.keys(level).join(', '));
}

(async () => {
  const argv = process.argv.slice(2).filter(Boolean);
  const codes = argv.length ? argv : sampleCodes(4);
  if (!codes.length) {
    console.log('没有可测试的分享码。');
    return;
  }
  console.log('接口：' + API + '{分享码}.json');
  console.log('测试分享码：' + codes.join(', '));
  console.log('');
  for (const code of codes) {
    const json = await probe(code);
    if (json) { describe(json); break; }
  }
})();