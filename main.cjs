const {app, BrowserWindow, dialog, ipcMain, session, shell} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {createHash, randomUUID} = require('node:crypto');
const {pathToFileURL} = require('node:url');

const page = path.join(__dirname, 'dist', 'index.html');
const pageUrl = pathToFileURL(page).href;
const appId = 'com.katanos.goldenfleece';
app.setAppUserModelId(appId);
if (!app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', path.join(app.getPath('appData'), 'GoldenFleeceRecords'));
}
let win;
const file = () => path.join(app.getPath('userData'), 'records.json');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function readBytes() {
  try { return fs.readFileSync(file()); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function handle(channel, action) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame ||
        event.senderFrame.url !== pageUrl) throw new Error('请求来源无效。');
    return action(...args);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !app.commandLine.hasSwitch('headless')) { win.restore(); win.show(); win.focus(); }
  });
  app.whenReady().then(() => {
    handle('records:read', () => {
      const bytes = readBytes();
      if (bytes === null) return {state: null, revision: null};
      const state = JSON.parse(bytes.toString('utf8'));
      if (!state || state.version !== 1) throw new Error('数据文件格式无效。');
      return {state, revision: digest(bytes)};
    });
    handle('records:save', (state, revision) => {
      const previous = readBytes();
      if ((previous === null ? null : digest(previous)) !== revision)
        throw new Error('记录文件已被更改，请重新打开金羊毛后再保存。');
      if (state?.version !== 1 || state.userId !== 'local' || !Array.isArray(state.offers))
        throw new Error('记录格式无效。');
      const bytes = Buffer.from(JSON.stringify(state), 'utf8');
      const temp = file() + '.' + randomUUID() + '.tmp';
      try {
        fs.writeFileSync(temp, bytes, {flag: 'wx', flush: true});
        fs.renameSync(temp, file());
      } finally { fs.rmSync(temp, {force: true}); }
      return digest(bytes);
    });
    handle('records:csv', async (text, name) => {
      if (typeof text !== 'string' || !/^金羊毛-\d{4}-\d{2}-\d{2}\.csv$/.test(name)) throw new Error('CSV 文件无效。');
      const result = await dialog.showSaveDialog(win, {defaultPath: name, filters: [{name: 'CSV', extensions: ['csv']}]});
      if (!result.canceled) await fs.promises.writeFile(result.filePath, text, 'utf8');
      return {canceled: result.canceled};
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    win = new BrowserWindow({title: '金羊毛', width: 1420, height: 900, minWidth: 800, minHeight: 600,
      backgroundColor: '#101424', show: !app.commandLine.hasSwitch('headless'),
      webPreferences: {preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false}});
    win.removeMenu();
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.setWindowOpenHandler(({url}) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
      return {action: 'deny'};
    });
    win.loadFile(page);
  });
  app.on('window-all-closed', () => app.quit());
}
