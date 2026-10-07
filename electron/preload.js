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
  }
});