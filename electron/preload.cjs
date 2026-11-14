const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pokekeDesktop', {
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke('app:info'),
  discoverRooms: () => ipcRenderer.invoke('lan:discover'),
  createRoom: (config) => ipcRenderer.invoke('room:create', config),
  closeRoom: () => ipcRenderer.invoke('room:close'),
  getLobby: () => ipcRenderer.invoke('room:lobby'),
});
