'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const resolution = ipcRenderer.sendSync('fgexpig:desktop-resolution:get');

contextBridge.exposeInMainWorld('FGEXPIG_DESKTOP', {
  isDesktop: true,
  runtime: 'exe',
  quality: 5,
  resolution: resolution.current,
  resolutions: resolution.options,
  aspect: resolution.aspect,
  aspects: resolution.aspects,
  displayMaxResolution: resolution.max,
  getResolutionState: function () {
    return ipcRenderer.sendSync('fgexpig:desktop-resolution:get');
  },
  setQuality: function () {},
  setResolution: function (value) {
    return ipcRenderer.sendSync('fgexpig:desktop-resolution:set', value);
  },
  setAspect: function (value) {
    return ipcRenderer.sendSync('fgexpig:desktop-aspect:set', value);
  },
  // exe：退回启动器主菜单
  backToMenu: function () { ipcRenderer.send('fgexpig:launcher:back-to-menu'); },
  // 地图数据接口走主进程代取：渲染进程直连会被 CORS 挡住，拿不到真实状态码
  fetchMapStats: function (code) {
    return ipcRenderer.invoke('fgexpig:mapstats:fetch', code);
  }
});

// 启动器（launcher.html）专用接口
contextBridge.exposeInMainWorld('FGEXPIG_LAUNCHER', {
  onMessage: function (callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('fgexpig:launcher:message', function (event, data) { callback(data); });
  },
  // 菜单音乐（打包在 exe 内）：返回字节，用于 Web Audio 无缝循环
  music: function () {
    return ipcRenderer.invoke('fgexpig:launcher:music');
  },
  // 开屏页结束（此之前主进程不开始下载任何缓存）
  splashDone: function () { ipcRenderer.send('fgexpig:launcher:splash-done'); },
  enter: function () { ipcRenderer.send('fgexpig:launcher:enter'); },
  openSite: function () { ipcRenderer.send('fgexpig:launcher:open-site'); },
  github: function () { ipcRenderer.send('fgexpig:launcher:github'); },
  quit: function () { ipcRenderer.send('fgexpig:launcher:quit'); }
});