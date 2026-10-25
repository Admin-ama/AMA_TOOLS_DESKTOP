import { statSync } from 'node:fs';
import path from 'node:path';
import type { DesktopApp, DesktopAppView, DesktopCandidate, Preferences } from '../shared/contracts';
import type { InstalledCandidate, InstalledEntry } from './installed-apps';

export const MAX_DESKTOP_APPS = 20;
export const MAX_DESKTOP_APP_NAME = 60;
const LAUNCHABLE = new Set(['.exe', '.lnk', '.url']);

/** Ruta absoluta y local a una carpeta o a un .exe/.lnk/.url existente; nunca scripts ni rutas de red. */
export function validDesktopPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value || !path.isAbsolute(value) || value.startsWith('\\\\')) return false;
  try {
    const stat = statSync(value);
    return stat.isDirectory() || (stat.isFile() && LAUNCHABLE.has(path.extname(value).toLowerCase()));
  } catch { return false; }
}

/** AppUserModelID de una app empaquetada (Tienda): Familia_PublisherId!AppId. Nunca se interpola sin pasar por aquí. */
const AUMID = /^[A-Za-z0-9._-]+_[a-z0-9]{13}![A-Za-z0-9._-]+$/;
export function validAumid(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 256 && AUMID.test(value);
}

export function desktopAppName(file: string): string {
  const name = LAUNCHABLE.has(path.extname(file).toLowerCase()) ? path.parse(file).name : path.basename(file);
  return name.trim().slice(0, MAX_DESKTOP_APP_NAME) || 'Aplicación';
}

interface DesktopAppsSource {
  /** Diálogo nativo en el proceso principal; el renderer nunca envía rutas. */
  pickFile(): Promise<string | undefined>;
  /** Devuelve '' si abrió, o el mensaje de error (contrato de shell.openPath). */
  open(file: string): Promise<string>;
  icon(file: string): Promise<string | undefined>;
  /** Lanza una app empaquetada por su AUMID (ya validado). */
  openAumid(aumid: string): Promise<void>;
  save(preferences: Preferences): Promise<void>;
  id(): string;
  log(message: string, detail?: unknown): void;
}

/** Catálogo de apps instaladas (última enumeración); solo se elige por id opaco. */
export interface InstalledCatalog {
  list(refresh?: boolean): Promise<InstalledCandidate[]>;
  icons(ids: unknown): Promise<Record<string, string>>;
  resolve(id: unknown): InstalledEntry | undefined;
}

/** Apps de escritorio vinculadas: el renderer solo conoce id, nombre e icono; la ruta vive únicamente en el proceso principal. */
export class DesktopApps {
  private icons = new Map<string, string>();
  constructor(private preferences: Preferences, private source: DesktopAppsSource, private installed: InstalledCatalog) {}

  views(): DesktopAppView[] {
    return this.preferences.desktopApps.map(({ id, name }) => ({ id, name, icon: this.icons.get(id) }));
  }

  private async cacheIcon(app: DesktopApp) {
    if (app.kind !== 'path' || !app.path) return;
    try {
      const icon = await this.source.icon(app.path);
      if (icon) this.icons.set(app.id, icon);
    } catch (error) { this.source.log('No se pudo leer el icono de la aplicación:', error); }
  }

  /** Carga los iconos pendientes (arranque). */
  async warm() {
    await Promise.all(this.preferences.desktopApps.filter(app => !this.icons.has(app.id)).map(app => this.cacheIcon(app)));
  }

  async add(...extra: unknown[]) {
    if (extra.length > 0) throw new Error('Acción inválida');
    if (this.preferences.desktopApps.length >= MAX_DESKTOP_APPS) throw new Error(`Máximo ${MAX_DESKTOP_APPS} aplicaciones`);
    const file = await this.source.pickFile();
    if (!file) return;
    if (!validDesktopPath(file)) throw new Error('Aplicación no permitida');
    if (this.preferences.desktopApps.some(app => app.path?.toLowerCase() === file.toLowerCase())) return;
    await this.store({ id: this.source.id(), name: desktopAppName(file), kind: 'path', path: file });
  }

  private async store(app: DesktopApp) {
    this.preferences.desktopApps = [...this.preferences.desktopApps, app];
    await this.source.save(this.preferences);
    await this.cacheIcon(app);
  }

  /** Apps instaladas para el selector; sin rutas ni AUMID, con las ya vinculadas marcadas. */
  async candidates(refresh?: unknown, ...extra: unknown[]): Promise<DesktopCandidate[]> {
    if (extra.length > 0 || (refresh !== undefined && typeof refresh !== 'boolean')) throw new Error('Acción inválida');
    const list = await this.installed.list(refresh === true);
    return list.map(item => { const entry = this.installed.resolve(item.id); return { ...item, linked: !!entry && this.isLinked(entry) }; });
  }

  async candidateIcons(ids: unknown, ...extra: unknown[]) {
    if (extra.length > 0) throw new Error('Acción inválida');
    return Array.isArray(ids) ? this.installed.icons(ids) : {};
  }

  private isLinked(entry: InstalledEntry) {
    return this.preferences.desktopApps.some(app => entry.kind === 'aumid' ? app.aumid?.toLowerCase() === entry.aumid?.toLowerCase() : app.path?.toLowerCase() === entry.path?.toLowerCase());
  }

  /** Vincula una app del selector. El renderer solo envía el id; main resuelve y revalida el destino. */
  async link(candidateId: unknown, ...extra: unknown[]) {
    if (extra.length > 0) throw new Error('Acción inválida');
    const entry = this.installed.resolve(candidateId);
    if (!entry) throw new Error('Aplicación desconocida');
    if (this.preferences.desktopApps.length >= MAX_DESKTOP_APPS) throw new Error(`Máximo ${MAX_DESKTOP_APPS} aplicaciones`);
    const name = entry.name.trim().slice(0, MAX_DESKTOP_APP_NAME) || 'Aplicación';
    if (entry.kind === 'aumid') {
      if (!validAumid(entry.aumid)) throw new Error('Aplicación no permitida');
      if (this.isLinked(entry)) return;
      await this.store({ id: this.source.id(), name, kind: 'aumid', aumid: entry.aumid });
      return;
    }
    if (!validDesktopPath(entry.path)) throw new Error('Aplicación no permitida');
    if (this.isLinked(entry)) return;
    await this.store({ id: this.source.id(), name, kind: 'path', path: entry.path });
  }

  private find(id: unknown): DesktopApp {
    const app = typeof id === 'string' ? this.preferences.desktopApps.find(item => item.id === id) : undefined;
    if (!app) throw new Error('Aplicación de escritorio desconocida');
    return app;
  }

  async open(id: unknown, ...extra: unknown[]) {
    if (extra.length > 0) throw new Error('Acción inválida');
    const app = this.find(id);
    if (app.kind === 'aumid' ? !validAumid(app.aumid) : !validDesktopPath(app.path)) throw new Error('La aplicación ya no está disponible');
    try {
      if (app.kind === 'aumid') { await this.source.openAumid(app.aumid!); return; }
      const error = await this.source.open(app.path!);
      if (error) this.source.log('No se pudo abrir la aplicación:', error);
    } catch (error) { this.source.log('No se pudo abrir la aplicación:', error); }
  }

  async remove(id: unknown, ...extra: unknown[]) {
    if (extra.length > 0) throw new Error('Acción inválida');
    const app = this.find(id);
    this.preferences.desktopApps = this.preferences.desktopApps.filter(item => item !== app);
    this.icons.delete(app.id);
    await this.source.save(this.preferences);
  }
}
