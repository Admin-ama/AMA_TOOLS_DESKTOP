import type { DesktopAppView } from '../shared/contracts';

/** Apps de Office fijas en el dock derecho, en este orden; solo aparecen si están instaladas. */
export const OFFICE_APPS = [
  { id: 'office-word', name: 'Word', exe: 'WINWORD.EXE' },
  { id: 'office-powerpoint', name: 'PowerPoint', exe: 'POWERPNT.EXE' },
  { id: 'office-excel', name: 'Excel', exe: 'EXCEL.EXE' },
  { id: 'office-outlook', name: 'Outlook (clásico)', exe: 'OUTLOOK.EXE' },
] as const;
const DEFAULT_ROOTS = ['C:\\Program Files', 'C:\\Program Files (x86)'];
/** Clic para ejecutar (root\Office16) y MSI (Office16). */
const OFFICE_DIRS = ['Microsoft Office\\root\\Office16', 'Microsoft Office\\Office16'];

export function officeCandidates(env: Record<string, string | undefined> = process.env): string[] {
  const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], ...DEFAULT_ROOTS].filter((root): root is string => !!root);
  return [...new Set(roots.flatMap(root => OFFICE_DIRS.map(dir => `${root.replace(/[\\/]+$/, '')}\\${dir}`)))];
}

interface OfficeSource {
  roots: string[];
  exists(file: string): boolean;
  /** Devuelve '' si abrió, o el mensaje de error (contrato de shell.openPath). */
  open(file: string): Promise<string>;
  icon(file: string): Promise<string | undefined>;
  log(message: string, detail?: unknown): void;
}

/** El renderer solo pide "abrir Word" por id; la ruta la resuelve siempre el proceso principal. */
export class OfficeApps {
  private icons = new Map<string, string>();
  constructor(private source: OfficeSource) {}

  private path(exe: string): string | undefined {
    return this.source.roots.map(root => `${root}\\${exe}`).find(file => this.source.exists(file));
  }

  views(): DesktopAppView[] {
    return OFFICE_APPS.filter(app => this.path(app.exe)).map(({ id, name }) => ({ id, name, ...(this.icons.has(id) ? { icon: this.icons.get(id) } : {}) }));
  }

  async warm() {
    await Promise.all(OFFICE_APPS.map(async app => {
      const file = this.path(app.exe);
      if (!file || this.icons.has(app.id)) return;
      try { const icon = await this.source.icon(file); if (icon) this.icons.set(app.id, icon); }
      catch (error) { this.source.log('No se pudo leer el icono de Office:', error); }
    }));
  }

  async open(id: unknown, ...extra: unknown[]) {
    if (extra.length > 0) throw new Error('Acción inválida');
    const app = OFFICE_APPS.find(item => item.id === id);
    if (!app) throw new Error('Aplicación de Office desconocida');
    const file = this.path(app.exe);
    if (!file) throw new Error(`${app.name} no está instalado`);
    try {
      const error = await this.source.open(file);
      if (error) this.source.log(`No se pudo abrir ${app.name}:`, error);
    } catch (error) { this.source.log(`No se pudo abrir ${app.name}:`, error); }
  }
}
