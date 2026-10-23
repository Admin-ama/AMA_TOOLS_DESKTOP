import { WebContentsView, session, type BrowserWindow } from 'electron';
import { type ApplicationTab, type Service, type ServiceId, type ServiceState, type Snapshot, type Preferences } from '../shared/contracts';
import { allowedNavigation, allowedDownload, isPdfUrl, sameServiceOrigin, contentBounds, partitionFor, remotePreferences } from './policy';
import { ApplicationTabs } from './application-tabs';
import { isZoomPercent, PAGE_ZOOM } from '../shared/zoom';
import { allowInternalCertificate } from './certificate-policy';

interface Entry { view: WebContentsView; disposed: boolean; failed: boolean }
const securedSessions = new WeakSet<Electron.Session>();

export class ServiceViewManager {
  private views = new Map<string, Entry>();
  private tabs = new ApplicationTabs();
  private zoomLevels = new Map<ServiceId, number>();
  get active(): ServiceId { return this.tabs.active; }
  panel: Snapshot['panel'] = 'service';
  /** Sin acceso a la red interna: ninguna vista se muestra ni se crea. Empieza bloqueado hasta la primera sonda. */
  private blocked = true;

  constructor(private window: BrowserWindow, readonly services: Service[], readonly preferences: Preferences, private changed: () => void) {
    window.on('resize', () => this.resize());
  }

  snapshot(): Omit<Snapshot, 'splash' | 'updates' | 'network' | 'desktopApps'> {
    // Las rutas de las apps de escritorio nunca salen del proceso principal.
    const { desktopApps: _paths, ...preferences } = this.preferences;
    return { services: this.services, active: this.active, activeTabId: this.tabs.activeTabId, zoomPercent: this.zoomLevels.get(this.active) ?? PAGE_ZOOM.default, tabs: this.tabs.all, states: this.tabs.serviceStates(), preferences, panel: this.panel };
  }

  private update(id: string, state: ServiceState) {
    if (!this.views.has(id)) return;
    this.tabs.update(id, state);
    this.visibility();
    this.changed();
  }

  private shouldShow(id: string) { return !this.splash && !this.blocked && id === this.tabs.activeTabId && this.panel === 'service'; }

  /** La pantalla de arranque oculta las vistas nativas hasta que el renderer termina su animación de salida. */
  endSplash() {
    if (!this.splash) return;
    this.splash = false;
    this.visibility();
    this.changed();
  }

  private visibility() {
    for (const [id, entry] of this.views) entry.view.setVisible(this.shouldShow(id));
  }

  private splash = true;
  // Primera carga por servicio: did-start-loading se repite y no sirve para saber si ya hay algo que mostrar.
  private loaded = new Set<ServiceId>();

  hasLoaded(id: ServiceId) { return this.loaded.has(id); }

  setBlocked(blocked: boolean) {
    if (this.blocked === blocked) return;
    this.blocked = blocked;
    if (blocked && this.panel === 'launcher') this.panel = 'service';
    if (!blocked) {
      const current = this.tabs.all.find(tab => tab.id === this.tabs.activeTabId);
      if (current) this.ensureView(current);
    }
    this.visibility();
    this.changed();
  }

  resize() {
    const [width, height] = this.window.getContentSize();
    for (const { view } of this.views.values()) view.setBounds(contentBounds(width, height));
  }

  activate(id: ServiceId) {
    this.panel = 'service';
    const tab = this.tabs.switchApplication(id);
    this.ensureView(tab);
    this.visibility();
    this.changed();
  }

  openTab(serviceId: ServiceId = this.active, url?: string, focus = true) {
    const service = this.services.find(item => item.id === serviceId)!;
    if (url && !sameServiceOrigin(url, service)) throw new Error('Destino de pestaña inválido');
    const tab = this.tabs.open(serviceId, focus);
    if (focus) this.panel = 'service';
    this.ensureView(tab, url);
    this.visibility();
    this.changed();
  }

  selectTab(id: string) {
    const tab = this.tabs.select(id);
    this.panel = 'service';
    this.ensureView(tab);
    this.visibility();
    this.changed();
  }

  closeTab(id: string) {
    // App no fijada: cerrar su última pestaña la cierra, como en una barra de tareas.
    const fallback = this.preferences.pinned.includes(this.tabs.active) ? undefined : this.preferences.pinned[0];
    this.tabs.close(id, fallback); // Validar antes de destruir una vista.
    this.destroyView(id);
    this.ensureView(this.tabs.current);
    this.visibility();
    this.changed();
  }

  private ensureView(tab: ApplicationTab, url?: string) {
    if (!this.blocked && !this.views.has(tab.id)) this.create(tab, url);
  }

  showPanel(panel: Snapshot['panel']) {
    this.panel = panel;
    this.visibility();
    this.changed();
  }

  reload() {
    const entry = this.views.get(this.tabs.activeTabId ?? '');
    if (entry) entry.view.webContents.reload();
    else this.activate(this.active);
  }

  zoom(percent: number) {
    if (!isZoomPercent(percent)) throw new Error('Zoom inválido');
    this.zoomLevels.set(this.active, percent);
    for (const tab of this.tabs.all) {
      if (tab.serviceId === this.active) this.views.get(tab.id)?.view.webContents.setZoomFactor(percent / 100);
    }
    this.changed();
  }

  private create(tab: ApplicationTab, url?: string) {
    const service = this.services.find(item => item.id === tab.serviceId)!;
    const id = tab.id;
    const view = new WebContentsView({ webPreferences: remotePreferences(service.id, this.preferences.remember[service.id]) });
    const entry: Entry = { view, disposed: false, failed: false };
    this.views.set(id, entry);
    view.setVisible(this.shouldShow(id));
    view.setBackgroundColor('#020617');
    this.window.contentView.addChildView(view);
    this.resize();
    const web = view.webContents;
    web.on('certificate-error', (event, destination, error, _certificate, callback) => {
      if (!entry.disposed && allowInternalCertificate(service.id, destination, error)) {
        event.preventDefault();
        callback(true);
      } else callback(false);
    });
    if (!securedSessions.has(web.session)) {
      web.session.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
      web.session.setPermissionCheckHandler(() => false);
      // La sesión es por servicio: solo se permite bajar archivos de su propio origen (diálogo "Guardar como" nativo).
      web.session.on('will-download', (event, item) => {
        if (!allowedDownload(item.getURL(), service)) event.preventDefault();
      });
      securedSessions.add(web.session);
    }
    const guard = (event: Electron.Event, url: string) => {
      if (entry.disposed) return;
      if (!allowedNavigation(url, service)) {
        event.preventDefault();
        // Solo el origen: ruta y query pueden llevar códigos o tokens de login.
        let origin = 'URL inválida';
        try { origin = new URL(url).origin; } catch { /* se registra como inválida */ }
        console.warn(`[${service.id}] navegación bloqueada hacia ${origin}`);
        this.update(id, { ...this.tabs.all.find(item => item.id === id)!.state, message: 'Navegación externa bloqueada. Consulta Ayuda.' });
      }
    };
    web.on('will-navigate', guard);
    web.on('will-redirect', guard);
    web.setWindowOpenHandler(details => {
      if (entry.disposed) return { action: 'deny' };
      // Los enlaces internos que abren ventana crean otra pestaña de esta aplicación.
      // Enlaces "Descargar" a PDF (target=_blank): bajar el archivo en vez de abrir una pestaña vacía.
      if (sameServiceOrigin(details.url, service) && isPdfUrl(details.url)) web.downloadURL(details.url);
      else if (sameServiceOrigin(details.url, service)) this.openTab(service.id, details.url, service.id === this.active && this.panel === 'service');
      else {
        let origin = 'URL inválida';
        try { origin = new URL(details.url).origin; } catch { /* se registra como inválida */ }
        console.warn(`[${service.id}] ventana bloqueada hacia ${origin}`);
        this.update(id, { ...this.tabs.all.find(item => item.id === id)!.state, message: 'Ventana externa bloqueada. Consulta Ayuda.' });
      }
      return { action: 'deny' };
    });
    web.on('did-start-loading', () => {
      if (entry.disposed) return;
      this.update(id, { status: 'loading' });
    });
    web.on('did-start-navigation', (_event, url, _inPlace, mainFrame) => {
      if (mainFrame && allowedNavigation(url, service)) entry.failed = false;
    });
    const updateTitle = (title: string) => {
      if (entry.disposed) return;
      this.tabs.updateTitle(id, title);
      this.changed();
    };
    web.on('page-title-updated', (_event, title) => updateTitle(title));
    // Metadatos internos; la página permanece visible desde el inicio.
    web.on('dom-ready', () => {
      if (!entry.disposed) web.setZoomFactor((this.zoomLevels.get(service.id) ?? PAGE_ZOOM.default) / 100);
      if (!entry.disposed) updateTitle(web.getTitle());
      if (!entry.disposed && !entry.failed) { this.loaded.add(service.id); this.update(id, { status: 'ready' }); }
    });
    web.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (!mainFrame || code === -3 || entry.disposed) return;
      entry.failed = true;
      this.loaded.add(service.id);
      this.update(id, { status: 'error', message: `No se pudo cargar el servicio (${code}). Revisa la red o VPN y vuelve a intentar.` });
    });
    web.on('render-process-gone', () => {
      this.update(id, { status: 'error', message: 'La vista del servicio se cerró inesperadamente. Vuelve a intentar.' });
    });
    this.update(id, { status: 'loading' });
    void web.loadURL(url ?? service.url).catch(() => undefined); // Sin tocar el login del servicio.
  }

  private destroyView(id: string) {
    const entry = this.views.get(id);
    if (!entry) return;
    entry.disposed = true;
    this.window.contentView.removeChildView(entry.view);
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
    this.views.delete(id);
  }

  async clearSession(id: ServiceId) {
    for (const tab of this.tabs.all) if (tab.serviceId === id) this.destroyView(tab.id);
    for (const persistent of [true, false]) {
      const isolated = session.fromPartition(partitionFor(id, persistent));
      await isolated.closeAllConnections();
      await isolated.clearStorageData();
      await isolated.clearCache();
    }
    this.tabs.reset(id);
    this.changed();
    // No recrear mientras Ajustes está abierto; evita que una página escriba otra sesión inmediatamente.
  }

  dispose() {
    for (const id of this.views.keys()) this.destroyView(id);
  }
}
