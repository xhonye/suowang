import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  screen,
  session,
  shell,
} from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../src/server/app-meta.mjs';
import { resolveDataDir } from '../src/server/config.mjs';
import { startAppServer } from '../src/server/app-server.mjs';
import { readBuildInfo } from './build-info.mjs';
import {
  contentTypeForAvatar,
  IPC_CHANNELS,
  isAllowedLocalNavigation,
  isAllowedRendererRequest,
  resolveExportKind,
  resolveGitHubTarget,
} from './desktop-policy.mjs';
import { createDesktopLogger } from './logging.mjs';
import { activateExistingWindow } from './single-instance.mjs';
import { loadWindowState, saveWindowState } from './window-state.mjs';

const PRODUCT_NAME = '所往 SUOWANG';
const APP_USER_MODEL_ID = 'com.xhonye.suowang';
const BUNDLE_ID = 'com.xhonye.suowang';
const DEFAULT_BACKGROUND = '#edf3f5';
const isSmokeTest = process.argv.includes('--smoke-test');
const sourceRoot = normalize(fileURLToPath(new URL('..', import.meta.url)));

let mainWindow = null;
let runningServer = null;
let logger = null;
let dataDir = null;
let resourceRoot = null;
let buildInfo = null;
let quitting = false;
let startupFailureVisible = false;

app.setName(PRODUCT_NAME);
app.setAppUserModelId(APP_USER_MODEL_ID);
app.enableSandbox();

const ownsApplicationInstance = app.requestSingleInstanceLock();
if (!ownsApplicationInstance) app.quit();

function safeError(code, error) {
  if (logger) logger.error(code, error);
  else process.stderr.write(`[SUOWANG:${code}] ${error?.name ?? 'Error'}\n`);
}

function installProcessFailureHandlers() {
  process.on('uncaughtException', (error) => {
    safeError('uncaught-exception', error);
    void showFatalError('所往遇到无法恢复的错误，需要安全退出。');
  });
  process.on('unhandledRejection', (error) => {
    safeError('unhandled-rejection', error);
    void showFatalError('所往遇到无法恢复的错误，需要安全退出。');
  });
  app.on('child-process-gone', (_event, details) => {
    safeError('child-process-gone', { name: details.type, code: details.reason });
  });
}

async function showFatalError(message) {
  if (startupFailureVisible || quitting) return;
  startupFailureVisible = true;
  const buttons = logger ? ['打开日志目录', '退出'] : ['退出'];
  const result = await dialog.showMessageBox({
    type: 'error',
    title: '所往启动失败',
    message,
    detail: '你的本地数据没有被删除。日志中不记录事项正文。',
    buttons,
    defaultId: buttons.length - 1,
    cancelId: buttons.length - 1,
    noLink: true,
  });
  if (logger && result.response === 0) await shell.openPath(logger.logsDir);
  app.exit(1);
}

function installApplicationMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: PRODUCT_NAME,
      submenu: [
        { role: 'about', label: `关于${PRODUCT_NAME}` },
        { type: 'separator' },
        { role: 'hide', label: '隐藏所往' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出所往' },
      ],
    },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] },
  ]));
}

function focusMainWindow() {
  activateExistingWindow(mainWindow);
}

function applyRendererBoundary(window, origin) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, target) => {
    if (!isAllowedLocalNavigation(target, origin)) event.preventDefault();
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    safeError('render-process-gone', { name: 'RenderProcessGone', code: details.reason });
    if (!quitting) void showFatalError('所往窗口意外停止，需要安全退出。');
  });
  window.webContents.on('did-fail-load', (_event, code, description, validatedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    safeError('did-fail-load', { name: description, code: String(code), urlKind: validatedUrl.startsWith(origin) ? 'local' : 'blocked' });
    if (!quitting) void showFatalError('所往页面没有正确加载。');
  });
  if (app.isPackaged) {
    window.webContents.on('before-input-event', (event, input) => {
      const devToolsShortcut = input.key === 'F12'
        || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i');
      if (devToolsShortcut) event.preventDefault();
    });
  }
}

function installSessionBoundary(origin) {
  const desktopSession = session.defaultSession;
  desktopSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  desktopSession.setPermissionCheckHandler(() => false);
  desktopSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    callback({ cancel: !isAllowedRendererRequest(details.url, origin) });
  });
}

function createMainWindow(origin) {
  const statePath = join(dataDir, 'desktop-window.json');
  const state = loadWindowState(statePath, screen.getAllDisplays());
  const iconPath = join(resourceRoot, 'assets', 'brand', 'suowang-app-icon-256.png');
  const window = new BrowserWindow({
    title: PRODUCT_NAME,
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 680,
    show: false,
    backgroundColor: DEFAULT_BACKGROUND,
    autoHideMenuBar: process.platform === 'win32',
    icon: existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: join(resourceRoot, 'desktop', 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
    },
  });
  if (state.maximized) window.maximize();
  applyRendererBoundary(window, origin);
  window.once('ready-to-show', () => {
    if (!isSmokeTest) window.show();
  });
  window.on('close', () => {
    if (window.isDestroyed()) return;
    const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
    saveWindowState(statePath, { ...bounds, maximized: window.isMaximized() });
  });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  void window.loadURL(`${origin}/`);
  return window;
}

async function fetchLocal(path, options = {}) {
  const response = await fetch(`${runningServer.origin}${path}`, options);
  if (!response.ok) {
    let message = `本地服务返回 ${response.status}`;
    try { message = (await response.json())?.error?.message ?? message; } catch {}
    throw new Error(message);
  }
  return response;
}

function installIpcHandlers() {
  const handle = (channel, handler) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, ...args) => {
      if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Untrusted desktop request.');
      try {
        return await handler(...args);
      } catch (error) {
        safeError('ipc-failure', error);
        throw new Error(error?.message || '所往没能完成这次桌面操作。');
      }
    });
  };

  handle(IPC_CHANNELS.getDesktopInfo, () => ({ desktop: true, platform: process.platform, localFirst: true }));
  handle(IPC_CHANNELS.getVersionInfo, () => ({
    productName: PRODUCT_NAME,
    version: APP_VERSION,
    buildCommit: buildInfo.shortCommit,
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    signingStatus: buildInfo.signingStatus,
  }));
  handle(IPC_CHANNELS.openGitHubTarget, async (target) => {
    await shell.openExternal(resolveGitHubTarget(target), { activate: true });
    return { status: 'opened' };
  });
  handle(IPC_CHANNELS.openDataDirectory, async () => {
    const error = await shell.openPath(dataDir);
    if (error) throw new Error('无法打开所往数据目录。');
    return { status: 'opened' };
  });
  handle(IPC_CHANNELS.saveExport, async (kind) => {
    const definition = resolveExportKind(kind);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: kind === 'json' ? '导出所往可读数据' : '备份所往数据库',
      defaultPath: join(app.getPath('downloads'), definition.fileName),
      filters: kind === 'json'
        ? [{ name: 'JSON', extensions: ['json'] }]
        : [{ name: 'SQLite database', extensions: ['db'] }],
    });
    if (result.canceled || !result.filePath) return { status: 'cancelled' };
    const response = await fetchLocal(definition.endpoint);
    writeFileSync(result.filePath, Buffer.from(await response.arrayBuffer()), { flag: 'w' });
    return { status: 'saved', fileName: basename(result.filePath) };
  });
  handle(IPC_CHANNELS.chooseAvatar, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择本地头像',
      properties: ['openFile'],
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (result.canceled || result.filePaths.length !== 1) return { status: 'cancelled' };
    const path = result.filePaths[0];
    const bytes = readFileSync(path);
    if (bytes.length > 5 * 1024 * 1024) throw new Error('头像文件不能超过 5 MB。');
    const response = await fetchLocal('/api/avatar', {
      method: 'POST',
      headers: { 'content-type': contentTypeForAvatar(path) },
      body: bytes,
    });
    return { status: 'saved', snapshot: await response.json() };
  });
  handle(IPC_CHANNELS.restoreDatabase, async () => {
    const selected = await dialog.showOpenDialog(mainWindow, {
      title: '选择所往数据库备份',
      properties: ['openFile'],
      filters: [{ name: 'SQLite database', extensions: ['db', 'sqlite', 'sqlite3'] }],
    });
    if (selected.canceled || selected.filePaths.length !== 1) return { status: 'cancelled' };
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '确认整库恢复',
      message: '恢复会用所选备份覆盖当前数据。',
      detail: '覆盖前会自动保存当前数据库；两份数据不会合并。',
      buttons: ['取消', '确认恢复'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (confirmation.response !== 1) return { status: 'cancelled' };
    const response = await fetchLocal('/api/import/sqlite', {
      method: 'POST',
      headers: { 'content-type': 'application/vnd.sqlite3' },
      body: readFileSync(selected.filePaths[0]),
    });
    return { status: 'restored', snapshot: await response.json() };
  });
}

async function runPackagedSmoke(window) {
  const reportPath = process.env.SUOWANG_SMOKE_REPORT;
  const report = {
    status: 'failed',
    version: APP_VERSION,
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    pid: process.pid,
  };
  try {
    await new Promise((resolve, reject) => {
      if (!window.webContents.isLoadingMainFrame()) return resolve();
      window.webContents.once('did-finish-load', resolve);
      window.webContents.once('did-fail-load', (_event, code, description) => reject(new Error(`${code}:${description}`)));
    });
    const health = await (await fetchLocal('/health')).json();
    const created = await (await fetchLocal('/api/todos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stateId: 'work', title: 'Packaged desktop smoke' }),
    })).json();
    const wroteTodo = created.states.some((state) => (
      state.stateTodos.some((todo) => todo.title === 'Packaged desktop smoke')
      || state.mainlines.some((mainline) => mainline.todos.some((todo) => todo.title === 'Packaged desktop smoke'))
    ));
    if (health.status !== 'ok' || !wroteTodo) throw new Error('Smoke health or write verification failed.');
    Object.assign(report, { status: 'passed', schemaVersion: health.schemaVersion, rendererLoaded: true, databaseWrite: true });
    if (reportPath) {
      mkdirSync(dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
    const active = runningServer;
    runningServer = null;
    quitting = true;
    window.destroy();
    await active.close();
    app.exit(0);
  } catch (error) {
    safeError('smoke-failure', error);
    report.error = error?.name ?? 'Error';
    report.errorMessage = String(error?.message ?? 'unknown').slice(0, 240);
    if (reportPath) {
      mkdirSync(dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
    const active = runningServer;
    runningServer = null;
    quitting = true;
    if (!window.isDestroyed()) window.destroy();
    if (active) await active.close().catch(() => {});
    app.exit(1);
  }
}

async function boot() {
  dataDir = resolveDataDir();
  resourceRoot = app.isPackaged ? app.getAppPath() : sourceRoot;
  buildInfo = readBuildInfo(resourceRoot, APP_VERSION);
  logger = createDesktopLogger(dataDir);
  logger.info('startup');
  installApplicationMenu();
  installProcessFailureHandlers();
  app.setAboutPanelOptions({ applicationName: PRODUCT_NAME, applicationVersion: APP_VERSION, version: buildInfo.shortCommit });
  try {
    runningServer = await startAppServer({
      dataDir,
      resourceRoot,
      port: 0,
      host: '127.0.0.1',
      allowedHosts: ['127.0.0.1', 'localhost'],
      accessMode: 'local',
      lockKind: 'electron-desktop',
      ensureBackup: !isSmokeTest,
    });
    installSessionBoundary(runningServer.origin);
    installIpcHandlers();
    mainWindow = createMainWindow(runningServer.origin);
    if (isSmokeTest) void runPackagedSmoke(mainWindow);
  } catch (error) {
    safeError('startup', error);
    await showFatalError(error?.code === 'SUOWANG_INSTANCE_CONFLICT'
      ? '另一处所往正在使用同一个本地数据库。请先关闭它，再重新打开。'
      : '所往没能启动本地驾驶舱。');
  }
}

if (ownsApplicationInstance) {
  app.on('second-instance', focusMainWindow);
  app.on('activate', () => {
    if (mainWindow) focusMainWindow();
    else if (runningServer) mainWindow = createMainWindow(runningServer.origin);
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('before-quit', (event) => {
    if (quitting || !runningServer) return;
    event.preventDefault();
    quitting = true;
    const active = runningServer;
    runningServer = null;
    void active.close().then(() => {
      logger?.info('shutdown');
      app.exit(0);
    }).catch((error) => {
      safeError('shutdown', error);
      app.exit(1);
    });
  });
  void app.whenReady().then(boot);
}

export { BUNDLE_ID };
