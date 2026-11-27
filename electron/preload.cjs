const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pokekeDesktop', {
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke('app:info'),
  discoverRooms: () => ipcRenderer.invoke('lan:discover'),
  createRoom: (config) => ipcRenderer.invoke('room:create', config),
  closeRoom: () => ipcRenderer.invoke('room:close'),
  getLobby: () => ipcRenderer.invoke('room:lobby'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  onFullscreenChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('window:fullscreen', listener);
    return () => ipcRenderer.removeListener('window:fullscreen', listener);
  },
  getUpdateState: () => ipcRenderer.invoke('update:getState'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openRelease: () => ipcRenderer.invoke('update:openRelease'),
  onUpdateStatus: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
});
