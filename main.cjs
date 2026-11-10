const {app, BrowserWindow, dialog, ipcMain, session, shell, screen} = require('electron');
const fs = require('node:fs');
const {windowScale} = require('./window-scale.cjs');
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
function atomicWrite(target, bytes) {
  const temp = target + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, bytes, {flag: 'wx', flush: true});
    fs.renameSync(temp, target);
  } finally { fs.rmSync(temp, {force: true}); }
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
    const settings = path.join(app.getPath('userData'), 'layout.json');
    handle('layout:read', () => {
      try { return JSON.parse(fs.readFileSync(settings,'utf8')); }
      catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
    });
    handle('layout:save', value => {
      const bytes = Buffer.from(JSON.stringify(value),'utf8');
      if (value?.version !== 1 || bytes.length > 16384) throw new Error('布局设置无效。');
      atomicWrite(settings, bytes);
    });
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
      atomicWrite(file(), bytes);
      return digest(bytes);
    });
    handle('records:csv', async (text, name) => {
      if (typeof text !== 'string' || !/^金羊毛-\d{4}-\d{2}-\d{2}\.csv$/.test(name)) throw new Error('CSV 文件无效。');
      const result = await dialog.showSaveDialog(win, {defaultPath: name, filters: [{name: 'CSV', extensions: ['csv']}]});
      if (!result.canceled) await fs.promises.writeFile(result.filePath, text, 'utf8');
      return {canceled: result.canceled};
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const width = Math.min(1420,area.width), height = Math.min(900,area.height);
    win = new BrowserWindow({title: '金羊毛', width, height,
      x:area.x + Math.floor((area.width-width)/2), y:area.y + Math.floor((area.height-height)/2),
      minWidth: Math.min(640,width), minHeight: Math.min(480,height),
      backgroundColor: '#101424', show: !app.commandLine.hasSwitch('headless'),
      webPreferences: {preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false}});
    let scaleWithWindow = true;
    function applyScale() {
      const [width,height] = win.getContentSize();
      const factor = windowScale(width,height,scaleWithWindow);
      if (Math.abs(win.webContents.getZoomFactor() - factor) > 0.001) win.webContents.setZoomFactor(factor);
    }
    win.on('resize', applyScale);
    win.webContents.on('did-finish-load', applyScale);
    handle('layout:scale', enabled => {
      scaleWithWindow = enabled !== false;
      applyScale();
    });
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
