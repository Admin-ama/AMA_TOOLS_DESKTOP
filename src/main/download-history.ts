import { randomUUID } from 'node:crypto';
import type { DownloadView } from '../shared/contracts';

/** Tope de la lista: las más viejas ya terminadas se descartan. */
export const MAX_DOWNLOADS = 50;

const RUNNABLE = new Set(['exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'ps1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'hta', 'lnk', 'jar', 'reg']);
/** Un clic en "abrir" no debe ejecutar nada bajado de internet: los ejecutables y scripts solo se muestran en su carpeta. */
export function opensDirectly(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot < 0 || !RUNNABLE.has(name.slice(dot + 1).toLowerCase());
}

interface Entry extends DownloadView { path: string }
interface NewDownload { path: string; name: string; app: string }

/** Descargas de la sesión. Las rutas reales no salen de main: el renderer solo conoce el id. */
export class DownloadHistory {
  private entries: Entry[] = [];
  private listeners = new Set<() => void>();
  constructor(private readonly now: () => number = Date.now) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private emit() { for (const listener of this.listeners) listener(); }

  add({ path, name, app }: NewDownload): string {
    const id = randomUUID();
    const dot = name.lastIndexOf('.');
    this.entries.unshift({ id, path, name, app, ext: dot > 0 ? name.slice(dot + 1).toLowerCase() : '', size: 0, at: this.now(), state: 'downloading' });
    const overflow = this.entries.length - MAX_DOWNLOADS;
    if (overflow > 0) {
      for (let i = this.entries.length - 1, drop = overflow; i >= 0 && drop > 0; i--) {
        if (this.entries[i].state !== 'downloading') { this.entries.splice(i, 1); drop--; }
      }
    }
    this.emit();
    return id;
  }
  finish(id: string, size: number): void { this.settle(id, 'completed', size); }
  fail(id: string): void { this.settle(id, 'failed', 0); }
  private settle(id: string, state: DownloadView['state'], size: number) {
    const entry = this.entries.find(item => item.id === id);
    if (!entry) return; // Ya se limpió la lista.
    entry.state = state;
    entry.size = size;
    this.emit();
  }

  /** Vacía lo terminado; lo que sigue bajando se queda para poder mostrar su resultado. */
  clear(): void {
    this.entries = this.entries.filter(entry => entry.state === 'downloading');
    this.emit();
  }
  pathOf(id: string): string | undefined { return this.entries.find(entry => entry.id === id)?.path; }
  views(): DownloadView[] { return this.entries.map(({ path: _path, ...view }) => view); }
}

export const downloadHistory = new DownloadHistory();
