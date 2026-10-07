'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { createStaticServer } = require('./server');
const { syncSite, hasLocalSite } = require('./updater');

const DESKTOP_PORT = Number(process.env.FGEXPIG_DESKTOP_PORT || 37655);
const UPDATE_BASE_URL = String(process.env.FGEXPIG_UPDATE_BASE_URL || 'https://fgexpig.cc/').replace(/\/?$/, '/');
const SITE_ROOT = path.join(app.getPath('userData'), 'site');
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

function sendProgress(progress) {
  if (!mainWindow || !mainWindow.webContents) return;
  const script = 'window.updateDesktopProgress && window.updateDesktopProgress(' + JSON.stringify(progress) + ');';
  mainWindow.webContents.executeJavaScript(script).catch(function () {});
}

async function startStaticServer() {
  if (staticServer) {
    const address = staticServer.address();
    return 'http://127.0.0.1:' + (address && address.port ? address.port : DESKTOP_PORT) + '/';
  }
  const started = await createStaticServer(SITE_ROOT, DESKTOP_PORT);
  staticServer = started.server;
  return started.url;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#08080b',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', function () {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(function (details) {
    if (/^https?:/i.test(details.url)) shell.openExternal(details.url);
    return { action: 'deny' };
  });

  await mainWindow.loadFile(path.join(__dirname, 'bootstrap.html'));

  try {
    await syncSite(UPDATE_BASE_URL, SITE_ROOT, sendProgress);
  } catch (err) {
    console.error('[desktop] site update failed:', err);
    if (!hasLocalSite(SITE_ROOT)) {
      sendProgress({ current: 0, target: 0, phase: 'error' });
      return;
    }
    console.warn('[desktop] using existing local site cache');
  }

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