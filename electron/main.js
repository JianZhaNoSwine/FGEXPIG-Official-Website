'use strict';

const { app, BrowserWindow, shell, ipcMain, screen, dialog, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { createStaticServer } = require('./server');
const {
  syncSite,
  hasLocalSite,
  fetchManifest,
  isPriorityEntry,
  isBundledAsset,
  collectWallpapers,
  syncEntries,
  verifyEntries,
  pruneStaleFiles,
  LOCAL_MANIFEST_NAME
} = require('./updater');

const DESKTOP_PORT = Number(process.env.FGEXPIG_DESKTOP_PORT || 37655);
const UPDATE_BASE_URL = String(process.env.FGEXPIG_UPDATE_BASE_URL || 'https://fgexpig.cc/').replace(/\/?$/, '/');
app.setName('FGEXPIG');
app.setPath('userData', path.join(app.getPath('appData'), 'fgexpig-desktop'));
const SITE_ROOT = path.join(app.getPath('userData'), 'site');
const DESKTOP_SETTINGS_FILE = path.join(app.getPath('userData'), 'desktop-settings.json');

const ACHV_ITEM_HEIGHT = 58;
const SUBCARD_GAP = 10;
const MIN_ACHV_CARDS = 6;
const MAX_ACHV_CARDS = 10;
const CARD_HEIGHT_MIN = 46;
const CARD_HEIGHT_MAX = 66;
const CARD_HEIGHT_VIEWPORT_RATIO = 0.076;
// 首页成就卡正文外固定占用：顶部76 + 底栏/提示67 + 页面内边距32 + 卡片内边距32 + 卡片边框2 + 标题区46 = 255
const ACHV_BODY_CHROME_HEIGHT = 255;


const ASPECT_OPTIONS = [
  { id: '16:9', ratio: 16 / 9 },
  { id: '16:10', ratio: 16 / 10 }
];

function sameResolution(a, b) {
  return !!a && !!b && Number(a.width) === Number(b.width) && Number(a.height) === Number(b.height);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function aspectOption(aspectId) {
  for (const item of ASPECT_OPTIONS) {
    if (item.id === aspectId) return item;
  }
  return ASPECT_OPTIONS[0];
}

function readDesktopSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(DESKTOP_SETTINGS_FILE, 'utf8'));
    return {
      quality: 5,
      aspect: saved && saved.aspect ? aspectOption(saved.aspect).id : ASPECT_OPTIONS[0].id,
      resolution: saved && saved.resolution ? saved.resolution : null
    };
  } catch (err) {
    return { quality: 5, aspect: ASPECT_OPTIONS[0].id, resolution: null };
  }
}

function writeDesktopSettings(settings) {
  try {
    fs.mkdirSync(path.dirname(DESKTOP_SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(DESKTOP_SETTINGS_FILE, JSON.stringify(settings), 'utf8');
  } catch (err) {
    console.warn('[desktop] failed to save settings:', err);
  }
}

function displayMaxResolution() {
  const display = screen.getPrimaryDisplay();
  const scale = Number(display.scaleFactor) || 1;
  return {
    width: Math.round(display.size.width * scale),
    height: Math.round(display.size.height * scale),
    scale: scale
  };
}

function achvBodyTarget(cards) {
  return cards * ACHV_ITEM_HEIGHT + (cards - 1) * SUBCARD_GAP;
}

function achvBodyHeightForViewportHeight(viewportHeight) {
  const cardHeight = clamp(
    viewportHeight * CARD_HEIGHT_VIEWPORT_RATIO,
    CARD_HEIGHT_MIN,
    CARD_HEIGHT_MAX
  );
  return viewportHeight - cardHeight - ACHV_BODY_CHROME_HEIGHT;
}

function cssViewportHeightForCards(cards) {
  const target = achvBodyTarget(cards);
  let viewportHeight = (target + ACHV_BODY_CHROME_HEIGHT) / (1 - CARD_HEIGHT_VIEWPORT_RATIO);
  const ratioMinHeight = CARD_HEIGHT_MIN / CARD_HEIGHT_VIEWPORT_RATIO;
  const ratioMaxHeight = CARD_HEIGHT_MAX / CARD_HEIGHT_VIEWPORT_RATIO;

  if (viewportHeight < ratioMinHeight) {
    viewportHeight = target + ACHV_BODY_CHROME_HEIGHT + CARD_HEIGHT_MIN;
  } else if (viewportHeight > ratioMaxHeight) {
    viewportHeight = target + ACHV_BODY_CHROME_HEIGHT + CARD_HEIGHT_MAX;
  }

  let best = Math.round(viewportHeight);
  let bestDiff = Infinity;
  for (let candidate = best - 3; candidate <= best + 3; candidate += 1) {
    const bodyHeight = Math.round(achvBodyHeightForViewportHeight(candidate));
    const diff = bodyHeight - target;
    if (diff >= 0 && diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return best;
}

function desktopResolutionOptions(aspectId) {
  const aspect = aspectOption(aspectId);
  const scale = displayMaxResolution().scale || 1;
  const options = [];
  for (let cards = MAX_ACHV_CARDS; cards >= MIN_ACHV_CARDS; cards -= 1) {
    const cssHeight = cssViewportHeightForCards(cards);
    const physicalHeight = Math.round(cssHeight * scale);
    const physicalWidth = Math.round(physicalHeight * aspect.ratio);
    options.push({
      width: physicalWidth,
      height: physicalHeight,
      aspect: aspect.id,
      cards: cards
    });
  }
  return options;
}

function allowedResolutions(aspectId) {
  const max = displayMaxResolution();
  const all = desktopResolutionOptions(aspectId);
  const list = all.filter(function (item) {
    return item.width <= max.width && item.height <= max.height;
  });
  return list.length ? list : [all[all.length - 1]];
}

function defaultResolutionForList(list) {
  for (const item of list) {
    if (Number(item.cards) === 8) return item;
  }
  return list[0];
}

function selectedResolution(settings, aspectId) {
  const aspect = aspectId || (settings && settings.aspect) || ASPECT_OPTIONS[0].id;
  const list = allowedResolutions(aspect);
  const saved = settings && settings.resolution;
  for (const item of list) {
    if (sameResolution(item, saved)) return item;
  }
  return defaultResolutionForList(list);
}

function desktopResolutionState(settings) {
  settings = settings || readDesktopSettings();
  const aspect = settings.aspect || ASPECT_OPTIONS[0].id;
  return {
    aspects: ASPECT_OPTIONS.map(function (item) {
      return { id: item.id, ratio: item.ratio };
    }),
    aspect: aspect,
    options: allowedResolutions(aspect),
    current: selectedResolution(settings, aspect),
    max: displayMaxResolution()
  };
}

function applyResolution(window, resolution) {
  if (!window || !resolution) return;
  const max = displayMaxResolution();
  const scale = max.scale || 1;
  try {
    window.setContentSize(
      Math.max(1, Math.round(resolution.width / scale)),
      Math.max(1, Math.round(resolution.height / scale)),
      false
    );
  } catch (err) {
    console.warn('[desktop] failed to apply resolution:', err);
  }
}

ipcMain.on('fgexpig:desktop-resolution:get', function (event) {
  event.returnValue = desktopResolutionState();
});

ipcMain.on('fgexpig:desktop-resolution:set', function (event, value) {
  const settings = readDesktopSettings();
  const list = allowedResolutions(settings.aspect);
  let next = null;
  for (const item of list) {
    if (sameResolution(item, value)) {
      next = item;
      break;
    }
  }
  if (!next) {
    event.returnValue = desktopResolutionState(settings);
    return;
  }
  settings.quality = 5;
  settings.resolution = { width: next.width, height: next.height };
  writeDesktopSettings(settings);
  applyResolution(mainWindow, next);
  event.returnValue = desktopResolutionState(settings);
});

ipcMain.on('fgexpig:desktop-aspect:set', function (event, value) {
  const settings = readDesktopSettings();
  const nextAspect = aspectOption(value).id;
  const currentList = allowedResolutions(settings.aspect);
  let previous = null;
  for (const item of currentList) {
    if (sameResolution(item, settings.resolution)) {
      previous = item;
      break;
    }
  }

  const nextList = allowedResolutions(nextAspect);
  let next = null;
  if (previous) {
    for (const item of nextList) {
      if (item.cards === previous.cards) {
        next = item;
        break;
      }
    }
  }
  if (!next) next = defaultResolutionForList(nextList);

  settings.aspect = nextAspect;
  settings.quality = 5;
  settings.resolution = { width: next.width, height: next.height };
  writeDesktopSettings(settings);
  applyResolution(mainWindow, next);
  event.returnValue = desktopResolutionState(settings);
});

let staticServer = null;
let mainWindow = null;

// 地图数据接口由主进程代取：渲染进程直连会被 CORS 挡住（接口的 429/风控响应不带
// Access-Control-Allow-Origin），既看不到真实状态码，也没法读取 Retry-After。
const MAP_STATS_API = 'https://api2.fallguysdb.info/api/creative/';
const MAP_STATS_CODE_RE = /^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/i;
const MAP_STATS_TIMEOUT_MS = 20000;
const MAP_STATS_MAX_BODY = 2 * 1024 * 1024;

function fetchMapStats(code) {
  return new Promise(function (resolve) {
    const value = String(code || '').trim();
    if (!MAP_STATS_CODE_RE.test(value)) {
      resolve({ status: 0, body: '', retryAfterMs: 0 });
      return;
    }
    let request;
    try {
      request = net.request({
        method: 'GET',
        url: MAP_STATS_API + encodeURIComponent(value) + '.json',
        useSessionCookies: true
      });
    } catch (err) {
      resolve({ status: 0, body: '', retryAfterMs: 0 });
      return;
    }
    request.setHeader('Accept', 'application/json, text/plain, */*');
    let status = 0;
    let retryAfterMs = 0;
    let settled = false;
    let size = 0;
    const chunks = [];
    const timer = setTimeout(function () {
      try { request.abort(); } catch (err) {}
      finish({ status: 0, body: '', retryAfterMs: 0 });
    }, MAP_STATS_TIMEOUT_MS);
    function finish(payload) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    }
    request.on('response', function (response) {
      status = Number(response.statusCode) || 0;
      let retryAfter = response.headers && response.headers['retry-after'];
      if (Array.isArray(retryAfter)) retryAfter = retryAfter[0];
      const seconds = Number(retryAfter);
      if (isFinite(seconds) && seconds > 0) {
        retryAfterMs = Math.min(seconds, 6 * 3600) * 1000;
      }
      response.on('data', function (chunk) {
        size += chunk.length;
        if (size > MAP_STATS_MAX_BODY) {
          try { request.abort(); } catch (err) {}
          finish({ status: status, body: '', retryAfterMs: retryAfterMs });
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', function () {
        finish({ status: status, body: Buffer.concat(chunks).toString('utf8'), retryAfterMs: retryAfterMs });
      });
      response.on('error', function () {
        finish({ status: status, body: '', retryAfterMs: retryAfterMs });
      });
    });
    request.on('error', function () {
      finish({ status: 0, body: '', retryAfterMs: 0 });
    });
    request.end();
  });
}

ipcMain.handle('fgexpig:mapstats:fetch', function (event, code) {
  return fetchMapStats(code);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', function () {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}


// 启动器（launcher.html）消息：进度 / 幻灯片列表 / 菜单就绪
function sendLauncherMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents) return;
  try { mainWindow.webContents.send('fgexpig:launcher:message', message); } catch (err) {}
}

function progressPercent(progress) {
  const target = Math.max(0, Number(progress && progress.target) || 0);
  if (!target) return 100;
  const current = Math.max(0, Math.min(Number(progress.current) || 0, target));
  // 不取整：下载进度保留两位小数由启动器格式化
  return (current / target) * 100;
}

// 读本地清单：离线时启动器仍可用（用上次同步的清单做校验与幻灯片）
function readLocalManifest() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(SITE_ROOT, LOCAL_MANIFEST_NAME), 'utf8'));
    if (data && Array.isArray(data.files)) return data;
  } catch (err) {}
  return null;
}

let launcherSplashResolve = null;
// 开屏页结束信号：之前不下载任何缓存
function waitForSplashDone() {
  return new Promise(function (resolve) { launcherSplashResolve = resolve; });
}

ipcMain.on('fgexpig:launcher:splash-done', function () {
  if (launcherSplashResolve) {
    const done = launcherSplashResolve;
    launcherSplashResolve = null;
    done();
  }
});

// 记住站点地址与清单：从网页退回启动器主菜单时要用
let launcherSiteBaseUrl = '';
let launcherManifest = null;

// exe 内点「退出至菜单」：重新加载启动器并直接显示主菜单（缓存已完整）
ipcMain.on('fgexpig:launcher:back-to-menu', async function () {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    await mainWindow.loadFile(path.join(__dirname, 'launcher.html'));
    if (launcherManifest && launcherSiteBaseUrl) {
      sendLauncherMessage({ type: 'slides', wallpapers: collectWallpapers(launcherSiteBaseUrl, launcherManifest) });
    }
    sendLauncherMessage({ type: 'ready' });
  } catch (err) {
    console.warn('[desktop] back to launcher failed:', err);
  }
});

let launcherEnterResolve = null;
function waitForLauncherEnter() {
  return new Promise(function (resolve) { launcherEnterResolve = resolve; });
}

ipcMain.on('fgexpig:launcher:enter', function () {
  if (launcherEnterResolve) {
    const done = launcherEnterResolve;
    launcherEnterResolve = null;
    done();
  }
});
ipcMain.on('fgexpig:launcher:open-site', function () {
  shell.openExternal(UPDATE_BASE_URL);
});
ipcMain.on('fgexpig:launcher:github', function () {
  shell.openExternal('https://github.com/JianZhaNoSwine/FGEXPIG-Official-Website');
});
ipcMain.on('fgexpig:launcher:quit', function () {
  app.quit();
});
ipcMain.handle('fgexpig:launcher:music', function () {
  try {
    return fs.readFileSync(path.join(__dirname, 'assets', 'menu.mp3'));
  } catch (err) {
    return null;
  }
});

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

async function startStaticServer() {
  if (staticServer) {
    const address = staticServer.address();
    return 'http://127.0.0.1:' + (address && address.port ? address.port : DESKTOP_PORT) + '/';
  }
  const started = await createStaticServer(SITE_ROOT, DESKTOP_PORT, { fallbackBaseUrl: UPDATE_BASE_URL });
  staticServer = started.server;
  return started.url;
}

async function createWindow() {
  const desktopSettings = readDesktopSettings();
  const initialResolution = selectedResolution(desktopSettings);
  const initialScale = displayMaxResolution().scale || 1;
  mainWindow = new BrowserWindow({
    width: Math.max(1, Math.round(initialResolution.width / initialScale)),
    height: Math.max(1, Math.round(initialResolution.height / initialScale)),
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'FGEXPIG',
    backgroundColor: '#2a2a2a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });


  mainWindow.webContents.setWindowOpenHandler(function (details) {
    if (/^https?:/i.test(details.url)) shell.openExternal(details.url);
    return { action: 'deny' };
  });

  mainWindow.on('page-title-updated', function (event) {
    event.preventDefault();
    mainWindow.setTitle('FGEXPIG');
  });

  const siteUrl = await startStaticServer();
  launcherSiteBaseUrl = siteUrl;
  await mainWindow.loadFile(path.join(__dirname, 'launcher.html'));
  mainWindow.show();

  // 1) 等开屏页播完（开屏期间不下载缓存）
  await waitForSplashDone();

  // 2) 资源清单（联网失败时用本地清单兜底）
  let manifest = null;
  try {
    manifest = await fetchManifest(UPDATE_BASE_URL);
  } catch (err) {
    console.warn('[desktop] manifest fetch failed, fall back to local manifest:', err);
  }
  if (!manifest) manifest = readLocalManifest();
  launcherManifest = manifest || null;
  if (!manifest || !Array.isArray(manifest.files)) {
    dialog.showErrorBox('启动失败', '资源清单获取失败，且本机没有可用缓存。');
    mainWindow.destroy();
    return;
  }

  const priorityEntries = manifest.files.filter(isPriorityEntry);
  // 字体已打包进 exe（server.js 直接内置返回），不参与下载与校验
  const otherEntries = manifest.files.filter(function (entry) { return !isPriorityEntry(entry) && !isBundledAsset(entry); });
  const verifyEntriesList = manifest.files.filter(function (entry) { return !isBundledAsset(entry); });

  // 2) 优先缓存（所有壁纸 + 启动视频）→ open.webp 上的进度条
  try {
    await syncEntries(UPDATE_BASE_URL, SITE_ROOT, manifest, priorityEntries, function (progress) {
      sendLauncherMessage({ type: 'priority', percent: progressPercent(progress) });
    });
  } catch (err) {
    console.warn('[desktop] priority cache failed:', err);
  }
  sendLauncherMessage({ type: 'priority', percent: 100 });
  sendLauncherMessage({ type: 'slides', wallpapers: collectWallpapers(siteUrl, manifest) });

  // 3) 其他缓存 → 幻灯片右下角下载进度；随后校验
  try {
    await syncEntries(UPDATE_BASE_URL, SITE_ROOT, manifest, otherEntries, function (progress) {
      sendLauncherMessage({ type: 'other', percent: progressPercent(progress) });
    });
    await pruneStaleFiles(SITE_ROOT, manifest);
  } catch (err) {
    console.warn('[desktop] other cache failed:', err);
  }
  sendLauncherMessage({ type: 'other', percent: 100 });

  // 4) 校验（哈希）；失败的文件补下一次再校验
  try {
    const verified = await verifyEntries(SITE_ROOT, verifyEntriesList, function (progress) {
      // 校验不显示百分比：显示「已校验 / 全部」的资源数
      sendLauncherMessage({ type: 'verify', current: progress.current, total: progress.target });
    });
    const failed = (verified && verified.failed) || [];
    if (failed.length) {
      console.warn('[desktop] verify failed for ' + failed.length + ' file(s), re-downloading');
      const retryEntries = manifest.files.filter(function (entry) { return failed.indexOf(entry.path) >= 0 && !isBundledAsset(entry); });
      try {
        await syncEntries(UPDATE_BASE_URL, SITE_ROOT, manifest, retryEntries, function () {});
        await verifyEntries(SITE_ROOT, retryEntries, function (progress) {
          sendLauncherMessage({ type: 'verify', current: progress.current, total: progress.target });
        });
      } catch (err) {
        console.warn('[desktop] verify repair failed:', err);
      }
    }
  } catch (err) {
    console.warn('[desktop] verify failed:', err);
  }
  sendLauncherMessage({ type: 'verify', current: verifyEntriesList.length, total: verifyEntriesList.length });

  // 5) 显示菜单（menu.png + 4 个按钮），等待用户点“进入应用”
  sendLauncherMessage({ type: 'ready' });
  await waitForLauncherEnter();

  // 6) 淡出后进入网页：站点启动流程会直接播放 start.mp4 再进首页
  mainWindow.webContents.on('will-navigate', function (event, targetUrl) {
    let targetOrigin = '';
    let localOrigin = '';
    try {
      targetOrigin = new URL(targetUrl).origin;
      localOrigin = new URL(siteUrl).origin;
    } catch (e) {}
    if (targetOrigin && targetOrigin === localOrigin) return;
    event.preventDefault();
    if (/^https?:/i.test(targetUrl)) shell.openExternal(targetUrl);
  });

  await mainWindow.loadURL(siteUrl);
  if (process.env.FGEXPIG_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(function () {
  createWindow().catch(function (err) {
    console.error('[desktop] failed to start:', err);
    app.quit();
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    if (staticServer) staticServer.close();
    app.quit();
  }
});