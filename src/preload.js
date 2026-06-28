const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  fetchText: (url) => ipcRenderer.invoke('net:fetchText', url),
  fetchJson: (url) => ipcRenderer.invoke('net:fetchJson', url),
  storeGet: () => ipcRenderer.invoke('store:get'),
  storeSet: (obj) => ipcRenderer.invoke('store:set', obj),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
});

contextBridge.exposeInMainWorld('mpv', {
  available: () => ipcRenderer.invoke('mpv:available'),
  load: (url) => ipcRenderer.invoke('mpv:load', url),
  command: (args) => ipcRenderer.invoke('mpv:command', args),
  set: (prop, value) => ipcRenderer.invoke('mpv:set', prop, value),
  get: (prop) => ipcRenderer.invoke('mpv:get', prop),
  stop: () => ipcRenderer.invoke('mpv:stop'),
  addSub: (filePath) => ipcRenderer.invoke('mpv:addSub', filePath),
  pickSubtitle: () => ipcRenderer.invoke('dialog:subtitle'),
  onEvent: (cb) => ipcRenderer.on('mpv:event', (_e, ev) => cb(ev)),
});
