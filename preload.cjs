const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('goldenFleece', {
  read: () => ipcRenderer.invoke('records:read'),
  save: (state, revision) => ipcRenderer.invoke('records:save', state, revision),
});
contextBridge.exposeInMainWorld('katanos', {
  exportBankRewardsCsv: (text, name) => ipcRenderer.invoke('records:csv', text, name),
});
