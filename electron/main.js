'use strict';

const { app, BrowserWindow, shell, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { createStaticServer } = require('./server');
const { syncSite, hasLocalSite } = require('./updater');

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

const SPLASH_MIN_VISIBLE_MS = 1000;

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


function sendSplashProgress(progress) {
  if (!mainWindow || !mainWindow.webContents) return;
  const script = 'window.updateDesktopSplashProgress && window.updateDesktopSplashProgress(' + JSON.stringify(progress) + ');';
  mainWindow.webContents.executeJavaScript(script).catch(function () {});
}

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

async function waitForSplashImages(window) {
  if (!window || !window.webContents) return;
  try {
    await window.webContents.executeJavaScript(`
      new Promise(function (resolve) {
        var images = Array.prototype.slice.call(document.images);
        var pending = images.filter(function (img) { return !img.complete; });
        if (!pending.length) {
          requestAnimationFrame(function () { requestAnimationFrame(resolve); });
          return;
        }
        var left = pending.length;
        var done = function () {
          left -= 1;
          if (left <= 0) requestAnimationFrame(function () { requestAnimationFrame(resolve); });
        };
        pending.forEach(function (img) {
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        });
      })
    `);
  } catch (err) {
    console.warn('[desktop] splash image wait failed:', err);
  }
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

  await mainWindow.loadFile(path.join(__dirname, 'splash.html'));
  await waitForSplashImages(mainWindow);
  mainWindow.show();
  const splashStartedAt = Date.now();

  const desktopQuality = 5;
  try {
    await syncSite(UPDATE_BASE_URL, SITE_ROOT, sendSplashProgress, 1, desktopQuality);
  } catch (err) {
    console.error('[desktop] site update failed:', err);
    if (!hasLocalSite(SITE_ROOT)) {
      dialog.showErrorBox('启动失败', '资源更新失败，且本机没有可用缓存。');
      mainWindow.destroy();
      return;
    }
    console.warn('[desktop] using existing local site cache');
  }

  sendSplashProgress({ current: 1, target: 1, phase: 'complete', level: 1 });
  const splashRemaining = SPLASH_MIN_VISIBLE_MS - (Date.now() - splashStartedAt);
  if (splashRemaining > 0) await delay(splashRemaining);
  try {
    await mainWindow.webContents.executeJavaScript("document.querySelector('.splash') && document.querySelector('.splash').classList.add('is-leaving');");
  } catch (err) {}
  await delay(220);

  const url = await startStaticServer();
  mainWindow.webContents.on('will-navigate', function (event, targetUrl) {
    let targetOrigin = '';
    let localOrigin = '';
    try {
      targetOrigin = new URL(targetUrl).origin;
      localOrigin = new URL(url).origin;
    } catch (e) {}
    if (targetOrigin && targetOrigin === localOrigin) return;
    event.preventDefault();
    if (/^https?:/i.test(targetUrl)) shell.openExternal(targetUrl);
  });

  await mainWindow.loadURL(url);
  if (process.env.FGEXPIG_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  (async function () {
    for (const level of [2, 3]) {
      try {
        await syncSite(UPDATE_BASE_URL, SITE_ROOT, function () {}, level, desktopQuality);
      } catch (err) {
        console.warn('[desktop] background cache level ' + level + ' failed:', err);
        return;
      }
    }
  })();
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