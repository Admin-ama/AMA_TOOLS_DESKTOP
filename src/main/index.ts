import { randomUUID } from 'node:crypto';
import { app, BrowserWindow, ipcMain, protocol, nativeTheme, Menu, dialog, screen, shell, net } from 'electron';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SERVICES, isAppId } from './policy';
import { SHELL_LAYOUT } from '../shared/layout';
import { STARTUP_SERVICE, DEFAULT_SPLIT_SERVICE, type SplashPhase } from '../shared/contracts';
import { checkCustomName, checkCustomUrl, isCustomId, MAX_CUSTOM_APPS } from '../shared/custom-apps';
import { fetchFavicon } from './favicon';
import { isZoomPercent } from '../shared/zoom';
import { assetPath } from './assets';
import { readPreferences, savePreferences } from './preferences';
import { ServiceViewManager } from './service-view-manager';
import { CursorTracker } from './cursor-tracker';
import { autoUpdater } from 'electron-updater';
import { UpdateController, type UpdateBackend } from './update-controller';
import { UpdateNoticeWindow, UPDATE_NOTICE_URL } from './update-notice';
import { EventEmitter } from 'node:events';
import { windowsAppDetails } from './windows-identity';
import { NetworkMonitor, probeTarget, tcpProbe } from './network-status';
import { FortiClientLauncher, forticlientCandidates } from './forticlient';
import { DesktopApps } from './desktop-apps';
import { InstalledApps, enumerateInstalled, systemScanDeps, START_APPS_SCRIPT, START_APPS_TIMEOUT_MS, type InstalledEntry } from './installed-apps';
import { commandAllowedWhileBlocked, BLOCKED_MESSAGE } from './network-gate';
import { SPLASH, splashReady } from './splash';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const taskbarDetails = windowsAppDetails(app.isPackaged, process.execPath, app.getAppPath(), process.resourcesPath, path.join(__dirname, '../assets/amatime.ico'));
if (process.platform === 'win32') app.setAppUserModelId(taskbarDetails.appId!);
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
    icon: path.join(__dirname, '../assets/amatime.ico'),
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    show: false, title: 'AMATIME · Portal Operacional', backgroundColor: '#020617',
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#0b1222', symbolColor: '#94a3b8', height: SHELL_LAYOUT.headerHeight - 1 },
    webPreferences: { preload: path.join(__dirname, '../preload/index.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, zoomFactor: 1 },
  });
  if (process.platform === 'win32') window.setAppDetails(taskbarDetails);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('zoom-changed', () => window.webContents.setZoomFactor(1));
  let updates: UpdateController;
  const notice = new UpdateNoticeWindow(window, () => updates.snooze());
  let network: NetworkMonitor;
  const forticlient = new FortiClientLauncher({ candidates: forticlientCandidates(), exists: existsSync, open: file => shell.openPath(file), log: (message, detail) => console.error(message, detail) });

  // Apps instaladas: menú Inicio + Tienda. En e2e (nunca empaquetado) un JSON puede sustituir la enumeración real.
  const readShortcut = (lnk: string) => { try { const { target, args } = shell.readShortcutLink(lnk); return { target, args }; } catch { return undefined; } };
  // stdin se cierra: PowerShell se queda esperando si hereda una tubería abierta.
  const runStartApps = () => new Promise<string>((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', START_APPS_SCRIPT], { timeout: START_APPS_TIMEOUT_MS, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout)).stdin?.end());
  const testInstalled = testing ? process.env.AMA_TEST_INSTALLED_APPS : undefined;
  const installed = new InstalledApps({
    enumerate: testInstalled ? async () => JSON.parse(await readFile(testInstalled, 'utf8')) as InstalledEntry[] : () => enumerateInstalled(systemScanDeps(readShortcut), runStartApps),
    icon: async file => (await app.getFileIcon(file, { size: 'normal' })).toDataURL(),
    now: () => Date.now(),
  });
  const desktopApps = new DesktopApps(preferences, {
    pickFile: async () => {
      const result = await dialog.showOpenDialog(window, { title: 'Vincular aplicación de escritorio', properties: ['openFile'], filters: [{ name: 'Aplicaciones y accesos directos', extensions: ['exe', 'lnk', 'url'] }] });
      return result.canceled ? undefined : result.filePaths[0];
    },
    open: file => shell.openPath(file),
    icon: async file => (await app.getFileIcon(file, { size: 'normal' })).toDataURL(),
    save: next => savePreferences(preferencesFile, next),
    id: () => randomUUID(),
    openAumid: async aumid => { await new Promise<void>(resolve => execFile('explorer.exe', ['shell:AppsFolder\\' + aumid], { windowsHide: true }, () => resolve())); },
    log: (message, detail) => console.error(message, detail),
  }, installed);
  // Pantalla de arranque: tapa la vista nativa vacía hasta que el servicio de inicio carga (o no hay red).
  const splashStart = Date.now();
  const splashLimits = testing ? { ...SPLASH, minMs: 400 } : SPLASH;
  let splash: SplashPhase = 'loading';
  const splashTimers: NodeJS.Timeout[] = [];
  const finishSplash = () => { if (splash === 'done') return; splash = 'done'; manager.endSplash(); };
  const evaluateSplash = () => {
    if (splash !== 'loading' || !network) return;
    if (!splashReady({ elapsedMs: Date.now() - splashStart, network: network.status, startup: manager.hasLoaded(STARTUP_SERVICE) ? 'ready' : 'loading' }, splashLimits)) return;
    splash = 'leaving';
    // Si el renderer no confirma su animación de salida, la app se muestra igual.
    splashTimers.push(setTimeout(() => { finishSplash(); publish(); }, SPLASH.exitGraceMs));
  };
  const snapshot = () => ({ ...manager.snapshot(), splash, updates: updates.snapshot, network: { status: network.status, forticlient: forticlient.available }, desktopApps: desktopApps.views() });
  const publish = () => {
    if (!window.isDestroyed()) {
      evaluateSplash();
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
  const target = probeTarget(services);
  // Sin red interna la app no funciona: la sonda decide si las vistas pueden mostrarse o crearse.
  let started = false;
  const applyNetwork = () => {
    manager.setBlocked(network.status !== 'connected');
    // El servicio de inicio solo se abre cuando ya hay red.
    if (network.status === 'connected' && !started) { started = true; manager.activate(STARTUP_SERVICE); }
    publish();
  };
  network = new NetworkMonitor({ probe: () => tcpProbe(target.host, target.port), onChange: applyNetwork });
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
  const periodicCheck = setInterval(() => { if (app.isPackaged && process.platform === 'win32') void updates.check(); }, 30 * 60 * 1000);
  let queue = Promise.resolve<unknown>(undefined);
  ipcMain.handle('portal:command', (event, command: unknown, ...args: unknown[]) => {
    const shellSender = event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === 'app://bundle/index.html';
    const noticeSender = notice.window && !notice.window.isDestroyed() && event.sender === notice.window.webContents && event.senderFrame === notice.window.webContents.mainFrame && event.senderFrame.url === UPDATE_NOTICE_URL;
    if (!shellSender && !(noticeSender && ['snapshot', 'download-update', 'install-update', 'snooze-update'].includes(command as string))) throw new Error('Remitente no autorizado');
    // Solo lectura y potencialmente lentos (PowerShell): fuera de la cola para no retener cerrar el selector u otros comandos.
    if (command === 'desktop-candidates') return desktopApps.candidates(args[0], ...args.slice(1));
    if (command === 'desktop-icons') return desktopApps.candidateIcons(args[0], ...args.slice(1));
    const run = async () => {
      if (network.status !== 'connected' && !commandAllowedWhileBlocked(command, args)) throw new Error(BLOCKED_MESSAGE);
      const id = () => { if (!isAppId(args[0], manager.services)) throw new Error('Servicio inválido'); return args[0]; };
      // Páginas del usuario: todo dato del renderer se valida aquí, con los mismos mensajes que el formulario.
      const customId = () => { if (!isCustomId(args[0]) || !preferences.customApps.some(item => item.id === args[0])) throw new Error('Página inválida'); return args[0]; };
      const customInput = (value: unknown, withPin: boolean) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Datos de página inválidos');
        const { name, url, pin } = value as Record<string, unknown>;
        const checkedName = checkCustomName(name);
        if (!('name' in checkedName)) throw new Error(checkedName.error);
        const checkedUrl = checkCustomUrl(url);
        if (!('url' in checkedUrl)) throw new Error(checkedUrl.error);
        if (withPin && typeof pin !== 'boolean') throw new Error('Datos de página inválidos');
        return { name: checkedName.name, url: checkedUrl.url, pin: pin === true };
      };
      const favicon = (url: string) => fetchFavicon(new URL(url).origin, (target, init) => net.fetch(target, init));
      const fallbackApp = (dropped: string) => preferences.pinned.find(item => item !== dropped) ?? STARTUP_SERVICE;
      const tabId = () => { if (typeof args[0] !== 'string') throw new Error('Pestaña inválida'); return args[0]; };
      switch (command) {
        case 'snapshot': return snapshot();
        case 'finish-splash': if (splash === 'leaving') finishSplash(); break;
        case 'activate': manager.activate(id()); break;
        case 'new-tab': manager.openTab(); break;
        case 'select-tab': manager.selectTab(tabId()); break;
        case 'close-tab': manager.closeTab(tabId()); break;
        case 'reload': {
          // Reintentar: sondear primero; recargar solo si ya había red (si no, la recuperación activa las vistas).
          const wasConnected = network.status === 'connected';
          await network.check();
          if (wasConnected && network.status === 'connected') manager.reload();
          break;
        }
        case 'open-forticlient': await forticlient.open(...args); break;
        case 'add-desktop-app': await desktopApps.add(...args); break;
        case 'desktop-link': await desktopApps.link(args[0], ...args.slice(1)); break;
        case 'open-desktop-app': await desktopApps.open(args[0], ...args.slice(1)); break;
        case 'remove-desktop-app': await desktopApps.remove(args[0], ...args.slice(1)); break;
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
          if (!['service', 'settings', 'help', 'launcher'].includes(args[0] as string)) throw new Error('Panel inválido');
          if (args[0] === 'service') { if (network.status === 'connected') manager.activate(manager.active); else manager.showPanel('service'); }
          else manager.showPanel(args[0] as 'settings' | 'help' | 'launcher');
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
        case 'pin': {
          const serviceId = id();
          if (typeof args[1] !== 'boolean') throw new Error('Preferencia inválida');
          preferences.pinned = args[1] ? (preferences.pinned.includes(serviceId) ? preferences.pinned : [...preferences.pinned, serviceId]) : preferences.pinned.filter(item => item !== serviceId);
          await savePreferences(preferencesFile, preferences);
          break;
        }
        case 'clear-session': await manager.clearSession(id()); break;
        case 'custom-add': {
          const input = customInput(args[0], true);
          if (preferences.customApps.length >= MAX_CUSTOM_APPS) throw new Error(`Máximo ${MAX_CUSTOM_APPS} páginas propias.`);
          const created = `custom-${randomUUID()}`;
          const icon = await favicon(input.url); // Mejor esfuerzo: nunca bloquea ni falla.
          preferences.customApps.push({ id: created, name: input.name, url: input.url, ...(icon ? { icon } : {}) });
          preferences.remember[created] = true;
          if (input.pin) preferences.pinned = [...preferences.pinned, created];
          await savePreferences(preferencesFile, preferences);
          publish();
          return created;
        }
        case 'custom-edit': {
          const target = customId();
          const input = customInput(args[1], false);
          const entry = preferences.customApps.find(item => item.id === target)!;
          const originChanged = new URL(entry.url).origin !== new URL(input.url).origin;
          const visible = manager.active === target && manager.panel === 'service';
          entry.name = input.name;
          entry.url = input.url;
          if (originChanged) { delete entry.icon; const icon = await favicon(input.url); if (icon) entry.icon = icon; }
          await savePreferences(preferencesFile, preferences);
          // Otro origen: las pestañas abiertas ya no pertenecen a la página; se cierran y se reabre en el nuevo.
          if (originChanged) { manager.dropApp(target, fallbackApp(target)); if (visible) manager.activate(target); }
          break;
        }
        case 'custom-remove': {
          const target = customId();
          manager.dropApp(target, fallbackApp(target));
          await manager.wipeStorage(target);
          preferences.customApps = preferences.customApps.filter(item => item.id !== target);
          preferences.pinned = preferences.pinned.filter(item => item !== target);
          delete preferences.remember[target];
          if (preferences.splitService === target) preferences.splitService = DEFAULT_SPLIT_SERVICE;
          await savePreferences(preferencesFile, preferences);
          break;
        }
        case 'overlay': {
          if (typeof args[0] !== 'boolean') throw new Error('Estado inválido');
          manager.setOverlay(args[0]);
          break;
        }
        case 'split-open': {
          const serviceId = args[0] === undefined ? preferences.splitService : id();
          manager.openSplit(serviceId);
          preferences.splitService = serviceId;
          await savePreferences(preferencesFile, preferences);
          break;
        }
        case 'split-set': {
          const serviceId = id();
          manager.setSplitService(serviceId);
          preferences.splitService = serviceId;
          await savePreferences(preferencesFile, preferences);
          break;
        }
        case 'split-resize': {
          const ratio = args[0];
          if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) throw new Error('Proporción inválida');
          if (args[1] !== undefined && typeof args[1] !== 'boolean') throw new Error('Preferencia inválida');
          const effective = manager.setSplitRatio(ratio);
          if (args[1] === true) { preferences.splitRatio = effective; await savePreferences(preferencesFile, preferences); }
          break;
        }
        case 'split-close': manager.closeSplit(); break;
        case 'split-to-tab': manager.splitToTab(); break;
        case 'split-capture': return manager.capture();
        case 'split-drag': {
          if (typeof args[0] !== 'boolean') throw new Error('Estado inválido');
          manager.setDragging(args[0]);
          break;
        }
        default: throw new Error('Comando desconocido');
      }
      publish();
    };
    const result = queue.then(run);
    queue = result.catch(() => undefined);
    return result;
  });
  window.on('focus', () => void network.check());
  window.on('close', () => { network.dispose(); cursor.dispose(); clearTimeout(initialCheck); clearInterval(periodicCheck); splashTimers.forEach(clearTimeout); if (testUpdates) (app as EventEmitter).removeListener('ama:test-update', testUpdate); notice.dispose(); updates.dispose(); manager.dispose(); });
  window.on('closed', () => ipcMain.removeHandler('portal:command'));
  window.once('ready-to-show', () => window.show());
  await window.loadURL('app://bundle/index.html');
  void desktopApps.warm().then(publish);
  network.start();
  splashTimers.push(setTimeout(publish, splashLimits.minMs), setTimeout(publish, splashLimits.maxMs));
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
