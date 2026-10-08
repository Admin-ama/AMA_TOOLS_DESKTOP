import type { EventEmitter } from 'node:events';
import type { UpdateState } from '../shared/contracts';

export interface UpdateBackend extends EventEmitter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent: boolean, runAfter: boolean): void;
}

export class UpdateController {
  private state: UpdateState;
  private listeners: Array<[string, (...args: any[]) => void]> = [];
  private disposed = false;
  private deferredVersions = new Set<string>();
  constructor(private backend: UpdateBackend, private enabled: boolean, version: string, private changed: () => void) {
    this.state = { status: enabled ? 'idle' : 'disabled', currentVersion: version };
    backend.autoDownload = false;
    backend.autoInstallOnAppQuit = false;
    backend.allowPrerelease = false;
    backend.allowDowngrade = false;
    if (!enabled) return;
    this.listen('update-available', info => this.set({ status: 'available', version: info.version }));
    this.listen('update-not-available', () => this.set({ status: 'current' }));
    this.listen('download-progress', info => this.set({ ...this.state, status: 'downloading', progress: Math.max(0, Math.min(100, Math.round(info.percent))) }));
    this.listen('update-downloaded', info => this.set({ status: 'downloaded', version: info.version, progress: 100 }));
    this.listen('error', () => this.set({ ...this.state, status: 'error' }));
  }
  get snapshot(): UpdateState {
    const noticeVisible = ['available', 'downloading', 'downloaded', 'error'].includes(this.state.status)
      && !!this.state.version && !this.deferredVersions.has(this.state.version);
    return { ...this.state, noticeVisible };
  }
  snooze() {
    if (this.disposed) return;
    if (this.state.version) this.deferredVersions.add(this.state.version);
    this.changed();
  }
  private listen(event: string, listener: (...args: any[]) => void) {
    this.backend.on(event, listener);
    this.listeners.push([event, listener]);
  }
  private set(value: Omit<UpdateState, 'currentVersion'>) {
    if (this.disposed) return;
    this.state = { ...value, currentVersion: this.state.currentVersion };
    this.changed();
  }
  async check() {
    if (!this.enabled || this.disposed) throw new Error('Actualizaciones no disponibles');
    if (['checking', 'downloading', 'downloaded', 'installing'].includes(this.state.status)) return;
    this.set({ status: 'checking' });
    try { await this.backend.checkForUpdates(); }
    catch { this.set({ status: 'error' }); }
  }
  async download() {
    if (this.state.status !== 'available' || this.disposed) throw new Error('No hay actualización para descargar');
    if (this.state.version) this.deferredVersions.delete(this.state.version);
    this.set({ ...this.state, status: 'downloading', progress: 0 });
    try { await this.backend.downloadUpdate(); }
    catch { this.set({ ...this.state, status: 'error' }); }
  }
  install() {
    if (this.state.status !== 'downloaded' || this.disposed) throw new Error('La actualización no está descargada');
    this.set({ ...this.state, status: 'installing' });
    // Silencioso: NSIS reutiliza la carpeta instalada, sin asistente, y reabre la app.
    this.backend.quitAndInstall(true, true);
  }
  dispose() {
    this.disposed = true;
    for (const [event, listener] of this.listeners) this.backend.removeListener(event, listener);
    this.listeners = [];
  }
}
