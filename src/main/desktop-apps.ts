import { statSync } from 'node:fs';
import path from 'node:path';
import type { DesktopApp, DesktopAppView, Preferences } from '../shared/contracts';

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
  save(preferences: Preferences): Promise<void>;
  id(): string;
  log(message: string, detail?: unknown): void;
}

/** Apps de escritorio vinculadas: el renderer solo conoce id, nombre e icono; la ruta vive únicamente en el proceso principal. */
export class DesktopApps {
  private icons = new Map<string, string>();
  constructor(private preferences: Preferences, private source: DesktopAppsSource) {}

  views(): DesktopAppView[] {
    return this.preferences.desktopApps.map(({ id, name }) => ({ id, name, icon: this.icons.get(id) }));
  }

  private async cacheIcon(app: DesktopApp) {
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
    if (this.preferences.desktopApps.some(app => app.path.toLowerCase() === file.toLowerCase())) return;
    const app: DesktopApp = { id: this.source.id(), name: desktopAppName(file), path: file };
    this.preferences.desktopApps = [...this.preferences.desktopApps, app];
    await this.source.save(this.preferences);
    await this.cacheIcon(app);
  }

  private find(id: unknown): DesktopApp {
    const app = typeof id === 'string' ? this.preferences.desktopApps.find(item => item.id === id) : undefined;
    if (!app) throw new Error('Aplicación de escritorio desconocida');
    return app;
  }

  async open(id: unknown, ...extra: unknown[]) {
    if (extra.length > 0) throw new Error('Acción inválida');
    const app = this.find(id);
    if (!validDesktopPath(app.path)) throw new Error('La aplicación ya no está disponible');
    try {
      const error = await this.source.open(app.path);
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
