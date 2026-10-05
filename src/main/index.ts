import { app, BrowserWindow, ipcMain, protocol, nativeTheme, Menu, dialog, screen } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SERVICES, isServiceId } from './policy';
import { SHELL_LAYOUT } from '../shared/layout';
import { STARTUP_SERVICE } from '../shared/contracts';
import { isZoomPercent } from '../shared/zoom';
import { assetPath } from './assets';
import { readPreferences, savePreferences } from './preferences';
import { ServiceViewManager } from './service-view-manager';
import { CursorTracker } from './cursor-tracker';
import { autoUpdater } from 'electron-updater';
import { UpdateController, type UpdateBackend } from './update-controller';
import { UpdateNoticeWindow, UPDATE_NOTICE_URL } from './update-notice';
import { EventEmitter } from 'node:events';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const testing = !app.isPackaged && process.env.AMA_E2E === '1';
if (testing && process.env.AMA_TEST_USER_DATA) app.setPath('userData', process.env.AMA_TEST_USER_DATA);

async function createWindow() {
  const preferencesFile = path.join(app.getPath('userData'), 'preferences.json');
  const preferences = await readPreferences(preferencesFile);
  nativeTheme.themeSource = preferences.theme;
  let services = SERVICES.map(service => ({ ...service }));
  if (testing && process.env.AMA_TEST_CONFIG) {
    const config = JSON.parse(await readFile(process.env.AMA_TEST_CONFIG, 'utf8')) as Record<string, string>;
    services = services.map(service => {
      const url = new URL(config[service.id]);
      if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:') throw new Error('Test configuration must use loopback');
      return { ...service, url: url.href };
    });
  }
  const window = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    show: false, title: 'AMATIME · Portal Operacional', backgroundColor: '#020617',
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#0b1222', symbolColor: '#94a3b8', height: SHELL_LAYOUT.headerHeight - 1 },
    webPreferences: { preload: path.join(__dirname, '../preload/index.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, zoomFactor: 1 },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('zoom-changed', () => window.webContents.setZoomFactor(1));
  let updates: UpdateController;
  const notice = new UpdateNoticeWindow(window, () => updates.snooze());
  const snapshot = () => ({ ...manager.snapshot(), updates: updates.snapshot });
  const publish = () => {
    if (!window.isDestroyed()) {
      const state = snapshot();
      window.webContents.send('portal:changed', state);
      notice.update(state);
    }
  };
  const cursor = new CursorTracker({
    cursor: () => screen.getCursorScreenPoint(),
    bounds: () => window.getContentBounds(),
    visible: () => !window.isDestroyed() && window.isVisible() && !window.isMinimized(),
    send: point => window.webContents.send('portal:cursor', point),
  });
  const manager = new ServiceViewManager(window, services, preferences, () => {
    publish();
  });
  // Only unpackaged, explicitly opted-in tests can use this offline updater.
  const testUpdates = testing && process.env.AMA_TEST_UPDATES === '1';
  const backend: UpdateBackend = testUpdates ? Object.assign(new EventEmitter(), {
    autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: false, allowDowngrade: false,
    checkForUpdates: async () => null, downloadUpdate: async () => [], quitAndInstall: () => { throw new Error('Test must not restart'); },
  }) : autoUpdater;
  const testUpdate = (_event: unknown, ...args: unknown[]) => { if (typeof _event === 'string') backend.emit(_event, ...args); };
  if (testUpdates) (app as EventEmitter).on('ama:test-update', testUpdate);
  updates = new UpdateController(backend, testUpdates || (app.isPackaged && process.platform === 'win32'), app.getVersion(), publish);
  const initialCheck = setTimeout(() => { if (app.isPackaged && process.platform === 'win32') void updates.check(); }, 10_000);
  const periodicCheck = setInterval(() => { if (app.isPackaged && process.platform === 'win32') void updates.check(); }, 6 * 60 * 60 * 1000);
  let queue = Promise.resolve<unknown>(undefined);
  ipcMain.handle('portal:command', (event, command: unknown, ...args: unknown[]) => {
    const shellSender = event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === 'app://bundle/index.html';
    const noticeSender = notice.window && !notice.window.isDestroyed() && event.sender === notice.window.webContents && event.senderFrame === notice.window.webContents.mainFrame && event.senderFrame.url === UPDATE_NOTICE_URL;
    if (!shellSender && !(noticeSender && ['snapshot', 'download-update', 'install-update', 'snooze-update'].includes(command as string))) throw new Error('Remitente no autorizado');
    const run = async () => {
      const id = () => { if (!isServiceId(args[0])) throw new Error('Servicio inválido'); return args[0]; };
      const tabId = () => { if (typeof args[0] !== 'string') throw new Error('Pestaña inválida'); return args[0]; };
      switch (command) {
        case 'snapshot': return snapshot();
        case 'activate': manager.activate(id()); break;
        case 'new-tab': manager.openTab(); break;
        case 'select-tab': manager.selectTab(tabId()); break;
        case 'close-tab': manager.closeTab(tabId()); break;
        case 'reload': manager.reload(); break;
        case 'check-updates': await updates.check(); break;
        case 'download-update':
          if (updates.snapshot.status !== 'available') throw new Error('No hay actualización para descargar');
          // Do not hold the command queue during a network transfer: Later must remain usable.
          void updates.download();
          break;
        case 'snooze-update': updates.snooze(); break;
        case 'install-update': {
          if (updates.snapshot.status !== 'downloaded') throw new Error('No hay actualización descargada');
          const result = await dialog.showMessageBox(window, {
            type: 'question', buttons: ['Cancelar', 'Instalar y reiniciar'], defaultId: 0, cancelId: 0,
            title: 'Actualizar AMATIME Tools',
            message: 'La aplicación se cerrará para instalar la actualización.',
            detail: 'Guarda los cambios pendientes en tus aplicaciones antes de continuar.',
          });
          if (result.response === 1 && !window.isDestroyed()) updates.install();
          break;
        }
        case 'zoom': {
          if (!isZoomPercent(args[0])) throw new Error('Zoom inválido');
          manager.zoom(args[0]);
          break;
        }
        case 'panel': {
          if (!['service', 'settings', 'help'].includes(args[0] as string)) throw new Error('Panel inválido');
          if (args[0] === 'service') manager.activate(manager.active);
          else manager.showPanel(args[0] as 'settings' | 'help');
          break;
        }
        case 'theme': {
          if (args[0] !== 'dark' && args[0] !== 'light') throw new Error('Tema inválido');
          preferences.theme = args[0];
          nativeTheme.themeSource = args[0];
          window.setTitleBarOverlay({ color: args[0] === 'dark' ? '#0b1222' : '#ffffff', symbolColor: args[0] === 'dark' ? '#94a3b8' : '#475569' });
          await savePreferences(preferencesFile, preferences);
          break;
        }
        case 'remember': {
          const serviceId = id();
          if (typeof args[1] !== 'boolean') throw new Error('Preferencia inválida');
          await manager.clearSession(serviceId);
          preferences.remember[serviceId] = args[1];
          await savePreferences(preferencesFile, preferences);
          break;
        }
        case 'clear-session': await manager.clearSession(id()); break;
        default: throw new Error('Comando desconocido');
      }
      publish();
    };
    const result = queue.then(run);
    queue = result.catch(() => undefined);
    return result;
  });
  window.on('close', () => { cursor.dispose(); clearTimeout(initialCheck); clearInterval(periodicCheck); if (testUpdates) (app as EventEmitter).removeListener('ama:test-update', testUpdate); notice.dispose(); updates.dispose(); manager.dispose(); });
  window.on('closed', () => ipcMain.removeHandler('portal:command'));
  window.once('ready-to-show', () => window.show());
  await window.loadURL('app://bundle/index.html');
  manager.activate(STARTUP_SERVICE);
}

void app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const root = path.join(__dirname, '../renderer');
  const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  protocol.handle('app', async request => {
    const file = assetPath(request.url, root);
    if (!file) return new Response('Forbidden', { status: 403 });
    try {
      const content = await readFile(file);
      return new Response(content, { headers: { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'" } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
}).catch(error => { console.error('No se pudo iniciar AMATIME Tools:', error); app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
