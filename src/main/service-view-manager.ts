import { WebContentsView, session, type BrowserWindow } from 'electron';
import { type ApplicationTab, type Service, type ServiceId, type ServiceState, type Snapshot, type Preferences, type SplitCapture } from '../shared/contracts';
import { allowedNavigation, allowedDownload, isPdfUrl, sameServiceOrigin, contentBounds, splitBounds, partitionFor, remotePreferences } from './policy';
import { ApplicationTabs } from './application-tabs';
import { isZoomPercent, PAGE_ZOOM } from '../shared/zoom';
import { allowInternalCertificate } from './certificate-policy';

interface Entry { view: WebContentsView; disposed: boolean; failed: boolean }
/** Lo que cambia entre una pestaña y el panel lateral; el resto (guardas, sesión, descargas, certificados) es común. */
interface Hooks { attach(entry: Entry): void; state(): ServiceState; set(state: ServiceState): void; title(title: string): void; openWindow(url: string, web: Electron.WebContents): void }
const securedSessions = new WeakSet<Electron.Session>();

export class ServiceViewManager {
  private views = new Map<string, Entry>();
  private tabs = new ApplicationTabs();
  private zoomLevels = new Map<ServiceId, number>();
  get active(): ServiceId { return this.tabs.active; }
  panel: Snapshot['panel'] = 'service';
  private split: Snapshot['split'] = null;
  private panelEntry?: Entry & { serviceId: ServiceId };
  /** Mientras se arrastra el divisor las vistas nativas se ocultan: el renderer pinta capturas. */
  private dragging = false;
  /** Sin acceso a la red interna: ninguna vista se muestra ni se crea. Empieza bloqueado hasta la primera sonda. */
  private blocked = true;

  constructor(private window: BrowserWindow, readonly services: Service[], readonly preferences: Preferences, private changed: () => void) {
    window.on('resize', () => this.resize());
  }

  snapshot(): Omit<Snapshot, 'splash' | 'updates' | 'network' | 'desktopApps'> {
    // Las rutas de las apps de escritorio nunca salen del proceso principal.
    const { desktopApps: _paths, ...preferences } = this.preferences;
    return { services: this.services, active: this.active, activeTabId: this.tabs.activeTabId, zoomPercent: this.zoomLevels.get(this.active) ?? PAGE_ZOOM.default, tabs: this.tabs.all, states: this.tabs.serviceStates(), preferences, panel: this.panel, split: this.split ? { ...this.split } : null };
  }

  private update(id: string, state: ServiceState) {
    if (!this.views.has(id)) return;
    this.tabs.update(id, state);
    this.visibility();
    this.changed();
  }

  private shouldShow(id: string) { return !this.splash && !this.blocked && !this.dragging && id === this.tabs.activeTabId && this.panel === 'service'; }
  private shouldShowPanel() { return !!this.panelEntry && !this.splash && !this.blocked && !this.dragging && this.panel === 'service' && this.splitLayout() !== null; }

  /** La pantalla de arranque oculta las vistas nativas hasta que el renderer termina su animación de salida. */
  endSplash() {
    if (!this.splash) return;
    this.splash = false;
    this.visibility();
    this.changed();
  }

  private visibility() {
    for (const [id, entry] of this.views) entry.view.setVisible(this.shouldShow(id));
    this.panelEntry?.view.setVisible(this.shouldShowPanel());
  }

  private splash = true;
  // Primera carga por servicio: did-start-loading se repite y no sirve para saber si ya hay algo que mostrar.
  private loaded = new Set<ServiceId>();

  hasLoaded(id: ServiceId) { return this.loaded.has(id); }

  setBlocked(blocked: boolean) {
    if (this.blocked === blocked) return;
    this.blocked = blocked;
    if (blocked) this.dragging = false;
    if (blocked && this.panel === 'launcher') this.panel = 'service';
    if (!blocked) {
      const current = this.tabs.all.find(tab => tab.id === this.tabs.activeTabId);
      if (current) this.ensureView(current);
      this.ensurePanel();
    }
    this.visibility();
    this.changed();
  }

  resize() {
    const [width, height] = this.window.getContentSize();
    const layout = this.splitLayout();
    for (const { view } of this.views.values()) view.setBounds(layout?.main ?? contentBounds(width, height));
    if (layout) this.panelEntry?.view.setBounds(layout.panel);
    this.panelEntry?.view.setVisible(this.shouldShowPanel());
  }

  private splitLayout() {
    if (!this.split) return null;
    const [width, height] = this.window.getContentSize();
    return splitBounds(width, height, this.split.ratio);
  }

  openSplit(serviceId: ServiceId) {
    const same = this.split?.serviceId === serviceId && this.panelEntry;
    this.panel = 'service';
    this.split = { serviceId, ratio: this.split?.ratio ?? this.preferences.splitRatio };
    if (!same) { this.destroyPanel(); this.ensurePanel(); }
    this.resize();
    this.visibility();
    this.changed();
  }

  setSplitService(serviceId: ServiceId) {
    if (!this.split) throw new Error('Panel lateral cerrado');
    this.openSplit(serviceId);
  }

  /** Devuelve el ratio efectivo (ya limitado a 320 px por lado). */
  setSplitRatio(ratio: number): number {
    if (!this.split) throw new Error('Panel lateral cerrado');
    this.split.ratio = Math.min(0.9, Math.max(0.1, ratio));
    this.split.ratio = this.splitLayout()?.ratio ?? this.split.ratio;
    this.resize();
    this.changed();
    return this.split.ratio;
  }

  setDragging(active: boolean) {
    if (!this.split) throw new Error('Panel lateral cerrado');
    this.dragging = active;
    this.visibility();
    this.changed();
  }

  closeSplit() {
    this.split = null;
    this.dragging = false;
    this.destroyPanel();
    this.resize();
    this.visibility();
    this.changed();
  }

  /** Cierra el panel y abre ese servicio, en la misma página, como pestaña del área principal. */
  splitToTab() {
    if (!this.split) throw new Error('Panel lateral cerrado');
    const { serviceId } = this.split;
    const service = this.services.find(item => item.id === serviceId)!;
    const current = this.panelEntry?.view.webContents.getURL();
    this.closeSplit();
    this.openTab(serviceId, current && sameServiceOrigin(current, service) ? current : undefined);
  }

  async capture(): Promise<SplitCapture> {
    if (!this.split) throw new Error('Panel lateral cerrado');
    const grab = async (entry?: Entry) => {
      try {
        if (!entry || entry.disposed || entry.view.webContents.isDestroyed()) return null;
        const image = await entry.view.webContents.capturePage();
        return image.isEmpty() ? null : 'data:image/jpeg;base64,' + image.toJPEG(70).toString('base64');
      } catch { return null; }
    };
    return { main: await grab(this.views.get(this.tabs.activeTabId ?? '')), panel: await grab(this.panelEntry) };
  }

  private ensurePanel() {
    if (this.blocked || !this.split || this.panelEntry) return;
    const serviceId = this.split.serviceId;
    const service = this.services.find(item => item.id === serviceId)!;
    this.build(service, {
      attach: entry => { this.panelEntry = Object.assign(entry, { serviceId }); },
      state: () => ({ status: 'ready' }),
      set: () => undefined,
      title: () => undefined,
      // Los enlaces internos que abren ventana navegan dentro del propio panel.
      openWindow: (url, web) => void web.loadURL(url).catch(() => undefined),
    });
  }

  private destroyPanel() {
    const entry = this.panelEntry;
    if (!entry) return;
    entry.disposed = true;
    this.window.contentView.removeChildView(entry.view);
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
    this.panelEntry = undefined;
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
    if (this.panelEntry?.serviceId === this.active) this.panelEntry.view.webContents.setZoomFactor(percent / 100);
    this.changed();
  }

  private create(tab: ApplicationTab, url?: string) {
    const service = this.services.find(item => item.id === tab.serviceId)!;
    const id = tab.id;
    this.build(service, {
      attach: entry => { this.views.set(id, entry); entry.view.setVisible(this.shouldShow(id)); },
      state: () => this.tabs.all.find(item => item.id === id)!.state,
      set: state => this.update(id, state),
      title: title => { this.tabs.updateTitle(id, title); this.changed(); },
      openWindow: target => this.openTab(service.id, target, service.id === this.active && this.panel === 'service'),
    }, url);
  }

  /** Vista remota de un servicio con todas las guardas (navegación, ventanas, descargas, certificados, permisos). */
  private build(service: Service, hooks: Hooks, url?: string) {
    const view = new WebContentsView({ webPreferences: remotePreferences(service.id, this.preferences.remember[service.id]) });
    const entry: Entry = { view, disposed: false, failed: false };
    hooks.attach(entry);
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
    const guard = (event: Electron.Event, target: string) => {
      if (entry.disposed) return;
      if (!allowedNavigation(target, service)) {
        event.preventDefault();
        // Solo el origen: ruta y query pueden llevar códigos o tokens de login.
        let origin = 'URL inválida';
        try { origin = new URL(target).origin; } catch { /* se registra como inválida */ }
        console.warn(`[${service.id}] navegación bloqueada hacia ${origin}`);
        hooks.set({ ...hooks.state(), message: 'Navegación externa bloqueada. Consulta Ayuda.' });
      }
    };
    web.on('will-navigate', guard);
    web.on('will-redirect', guard);
    web.setWindowOpenHandler(details => {
      if (entry.disposed) return { action: 'deny' };
      // Los enlaces internos que abren ventana crean otra pestaña de esta aplicación (o navegan el panel).
      // Enlaces "Descargar" a PDF (target=_blank): bajar el archivo en vez de abrir una pestaña vacía.
      if (sameServiceOrigin(details.url, service) && isPdfUrl(details.url)) web.downloadURL(details.url);
      else if (sameServiceOrigin(details.url, service)) hooks.openWindow(details.url, web);
      else {
        let origin = 'URL inválida';
        try { origin = new URL(details.url).origin; } catch { /* se registra como inválida */ }
        console.warn(`[${service.id}] ventana bloqueada hacia ${origin}`);
        hooks.set({ ...hooks.state(), message: 'Ventana externa bloqueada. Consulta Ayuda.' });
      }
      return { action: 'deny' };
    });
    web.on('did-start-loading', () => {
      if (entry.disposed) return;
      hooks.set({ status: 'loading' });
    });
    web.on('did-start-navigation', (_event, target, _inPlace, mainFrame) => {
      if (mainFrame && allowedNavigation(target, service)) entry.failed = false;
    });
    const updateTitle = (title: string) => { if (!entry.disposed) hooks.title(title); };
    web.on('page-title-updated', (_event, title) => updateTitle(title));
    // Metadatos internos; la página permanece visible desde el inicio.
    web.on('dom-ready', () => {
      if (!entry.disposed) web.setZoomFactor((this.zoomLevels.get(service.id) ?? PAGE_ZOOM.default) / 100);
      if (!entry.disposed) updateTitle(web.getTitle());
      if (!entry.disposed && !entry.failed) { this.loaded.add(service.id); hooks.set({ status: 'ready' }); }
    });
    web.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (!mainFrame || code === -3 || entry.disposed) return;
      entry.failed = true;
      this.loaded.add(service.id);
      hooks.set({ status: 'error', message: `No se pudo cargar el servicio (${code}). Revisa la red o VPN y vuelve a intentar.` });
    });
    web.on('render-process-gone', () => {
      hooks.set({ status: 'error', message: 'La vista del servicio se cerró inesperadamente. Vuelve a intentar.' });
    });
    hooks.set({ status: 'loading' });
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
    if (this.split?.serviceId === id) this.closeSplit();
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
    this.destroyPanel();
    for (const id of this.views.keys()) this.destroyView(id);
  }
}
