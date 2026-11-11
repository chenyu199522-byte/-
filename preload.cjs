const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('goldenFleece', {
  aiRead: () => ipcRenderer.invoke('ai:read'),
  aiConnect: value => ipcRenderer.invoke('ai:connect', value),
  aiModels: id => ipcRenderer.invoke('ai:models', id),
  aiSave: value => ipcRenderer.invoke('ai:save', value),
  aiRemove: id => ipcRenderer.invoke('ai:remove', id),
  aiRun: value => ipcRenderer.invoke('ai:run', value),
  aiCancel: () => ipcRenderer.invoke('ai:cancel'),
  selectImages: () => ipcRenderer.invoke('images:select'),
  discardImages: ids => ipcRenderer.invoke('images:discard', ids),
  imagePreview: (id, full) => ipcRenderer.invoke('images:preview', id, full),
  imageExport: (id, name) => ipcRenderer.invoke('images:export', id, name),
  previewName: name => ipcRenderer.invoke('layout:name', name),
    previewScale: (enabled, scale) => ipcRenderer.invoke('layout:scale', enabled, scale),
  readLayout: () => ipcRenderer.invoke('layout:read'),
  saveLayout: layout => ipcRenderer.invoke('layout:save', layout),
  read: () => ipcRenderer.invoke('records:read'),
  save: (state, revision) => ipcRenderer.invoke('records:save', state, revision),
});
contextBridge.exposeInMainWorld('katanos', {
  exportBankRewardsCsv: (text, name) => ipcRenderer.invoke('records:csv', text, name),
});
