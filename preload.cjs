const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('goldenFleece', {
  previewScale: enabled => ipcRenderer.invoke('layout:scale', enabled),
  readLayout: () => ipcRenderer.invoke('layout:read'),
  saveLayout: layout => ipcRenderer.invoke('layout:save', layout),
  read: () => ipcRenderer.invoke('records:read'),
  save: (state, revision) => ipcRenderer.invoke('records:save', state, revision),
});
contextBridge.exposeInMainWorld('katanos', {
  exportBankRewardsCsv: (text, name) => ipcRenderer.invoke('records:csv', text, name),
});
