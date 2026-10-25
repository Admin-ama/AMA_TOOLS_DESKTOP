import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { MAX_DESKTOP_APP_NAME, validAumid, validDesktopPath } from './desktop-apps';

export { validAumid };

/** Lo que el proceso principal sabe de una app instalada; el renderer solo ve un id opaco. */
export interface InstalledEntry { name: string; kind: 'path' | 'aumid'; path?: string; aumid?: string }
export interface InstalledCandidate { id: string; name: string; kind: 'path' | 'aumid'; icon?: string }

const MAX_DEPTH = 4;
const CACHE_MS = 60_000;
const ICON_CONCURRENCY = 8;
const MAX_ICON_REQUEST = 60;
const MAX_CANDIDATES = 600;
const JUNK_NAME = /uninstall|desinstal|uninst|readme|l[eé]ame|\bhelp\b|ayuda|documentation|documentaci[oó]n|release notes|website|sitio web|\bmanual\b|getting started|user guide|gu[ií]a del usuario|module docs/i;
const JUNK_TARGET_NAME = /unins|desinstal/i;
const JUNK_EXT = new Set(['.url', '.html', '.htm', '.chm', '.txt', '.pdf']);
const win = path.win32;
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es');

/** Desinstaladores, ayuda, léame, sitios web y destinos que no son aplicaciones. */
export function isJunk(name: string, target?: string): boolean {
  if (JUNK_NAME.test(name)) return true;
  if (!target) return false;
  return JUNK_EXT.has(win.extname(target).toLowerCase()) || JUNK_TARGET_NAME.test(win.basename(target));
}

export interface ScanDeps {
  roots: string[];
  readdir(dir: string): Promise<Array<{ name: string; directory: boolean }>>;
  /** Destino y argumentos del acceso directo; undefined si no se puede leer. */
  shortcut(lnk: string): { target?: string; args?: string } | undefined;
  /** Archivo existente. */
  exists(file: string): boolean;
  /** El propio .lnk es un destino permitido (validDesktopPath). */
  validLink(lnk: string): boolean;
}

async function walk(dir: string, depth: number, deps: ScanDeps, out: string[]) {
  let items: Array<{ name: string; directory: boolean }>;
  try { items = await deps.readdir(dir); } catch { return; }
  for (const item of items) {
    const full = win.join(dir, item.name);
    if (item.directory) { if (depth < MAX_DEPTH) await walk(full, depth + 1, deps, out); }
    else if (win.extname(item.name).toLowerCase() === '.lnk') out.push(full);
  }
}

/** Accesos directos del menú Inicio. Con argumentos se vincula el propio .lnk para no perderlos (p. ej. Update.exe --processStart). */
export async function scanShortcuts(deps: ScanDeps): Promise<InstalledEntry[]> {
  const links: string[] = [];
  for (const root of deps.roots) await walk(root, 0, deps, links);
  const keys = new Set<string>();
  const names = new Set<string>();
  const entries: InstalledEntry[] = [];
  for (const lnk of links) {
    const name = win.parse(lnk).name.trim().slice(0, MAX_DESKTOP_APP_NAME);
    if (!name || isJunk(name)) continue;
    const info = deps.shortcut(lnk);
    let file: string;
    if (info?.target) {
      const { target } = info;
      if (win.extname(target).toLowerCase() !== '.exe' || !deps.exists(target) || isJunk(name, target)) continue;
      if (info.args?.trim()) { if (!deps.validLink(lnk)) continue; file = lnk; } else file = target;
    } else {
      if (!deps.validLink(lnk)) continue;
      file = lnk;
    }
    const key = file.toLowerCase();
    if (keys.has(key) || names.has(name.toLowerCase())) continue;
    keys.add(key); names.add(name.toLowerCase());
    entries.push({ name, kind: 'path', path: file });
  }
  return entries.sort(byName);
}

/** Salida de `Get-StartApps | ConvertTo-Json`: un objeto o un arreglo; solo AUMID empaquetados válidos. */
export function parseStartApps(stdout: string): InstalledEntry[] {
  let data: unknown;
  try { data = JSON.parse(stdout.replace(/^﻿/, '').trim()); } catch { return []; }
  const list = Array.isArray(data) ? data : [data];
  const seen = new Set<string>();
  const entries: InstalledEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const { Name, AppID } = item as Record<string, unknown>;
    if (typeof Name !== 'string' || !validAumid(AppID) || seen.has(AppID)) continue;
    const name = Name.trim().slice(0, MAX_DESKTOP_APP_NAME);
    if (!name || isJunk(name)) continue;
    seen.add(AppID);
    entries.push({ name, kind: 'aumid', aumid: AppID });
  }
  return entries.sort(byName);
}

/** Apps de la Tienda; cualquier fallo (PowerShell ausente, tiempo agotado, salida rara) degrada a []. */
export async function readStoreApps(run: () => Promise<string>): Promise<InstalledEntry[]> {
  try { return parseStartApps(await run()); } catch { return []; }
}

/** Accesos directos primero; las apps de la Tienda no repiten nombres ya presentes. */
export function mergeInstalled(shortcuts: InstalledEntry[], store: InstalledEntry[]): InstalledEntry[] {
  const names = new Set(shortcuts.map(item => item.name.toLowerCase()));
  const extra = store.filter(item => { const key = item.name.toLowerCase(); if (names.has(key)) return false; names.add(key); return true; });
  return [...shortcuts, ...extra];
}

export async function enumerateInstalled(deps: ScanDeps, runStore: () => Promise<string>): Promise<InstalledEntry[]> {
  const [shortcuts, store] = await Promise.all([scanShortcuts(deps).catch(() => []), readStoreApps(runStore)]);
  return mergeInstalled(shortcuts, store);
}

export function startMenuRoots(env: Record<string, string | undefined> = process.env): string[] {
  return [env.ProgramData, env.APPDATA].filter((root): root is string => !!root).map(root => win.join(root, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
}

/** Dependencias reales: sistema de archivos y lector de accesos directos de Electron (inyectado). */
export function systemScanDeps(shortcut: ScanDeps['shortcut'], env: Record<string, string | undefined> = process.env): ScanDeps {
  return {
    roots: startMenuRoots(env),
    readdir: async dir => (await readdir(dir, { withFileTypes: true })).map(item => ({ name: item.name, directory: item.isDirectory() })),
    shortcut,
    exists: file => { try { return statSync(file).isFile(); } catch { return false; } },
    validLink: validDesktopPath,
  };
}

export const START_APPS_SCRIPT = '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-StartApps | ConvertTo-Json -Compress';
export const START_APPS_TIMEOUT_MS = 8_000;

interface InstalledSource {
  enumerate(): Promise<InstalledEntry[]>;
  icon(file: string): Promise<string | undefined>;
  now(): number;
}

/** Catálogo en memoria de la última enumeración: el renderer solo puede elegir ids de aquí. */
export class InstalledApps {
  private entries = new Map<string, InstalledEntry>();
  private iconCache = new Map<string, string>();
  private stamp = -Infinity;
  private scanning?: Promise<void>;
  constructor(private source: InstalledSource) {}

  private async scan() {
    const found = (await this.source.enumerate()).slice(0, MAX_CANDIDATES);
    const next = new Map<string, InstalledEntry>();
    for (const entry of [...found].sort(byName)) {
      const key = (entry.kind === 'aumid' ? entry.aumid : entry.path)?.toLowerCase();
      if (!key) continue;
      const id = `cand-${createHash('sha1').update(`${entry.kind}:${key}`).digest('hex').slice(0, 16)}`;
      if (!next.has(id)) next.set(id, entry);
    }
    this.entries = next;
    this.stamp = this.source.now();
  }

  async list(refresh = false): Promise<InstalledCandidate[]> {
    if (refresh || this.source.now() - this.stamp >= CACHE_MS) {
      this.scanning ??= this.scan().finally(() => { this.scanning = undefined; });
      await this.scanning;
    }
    return [...this.entries].map(([id, { name, kind }]) => ({ id, name, kind, ...(this.iconCache.has(id) ? { icon: this.iconCache.get(id) } : {}) }));
  }

  resolve(id: unknown): InstalledEntry | undefined {
    return typeof id === 'string' ? this.entries.get(id) : undefined;
  }

  /** Iconos perezosos con concurrencia acotada; las apps empaquetadas no tienen (el renderer usa uno genérico). */
  async icons(ids: unknown): Promise<Record<string, string>> {
    if (!Array.isArray(ids)) return {};
    const wanted = [...new Set(ids.filter((id): id is string => typeof id === 'string'))].slice(0, MAX_ICON_REQUEST).filter(id => this.entries.get(id)?.path);
    const queue = wanted.filter(id => !this.iconCache.has(id));
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        try { const icon = await this.source.icon(this.entries.get(id)!.path!); if (icon) this.iconCache.set(id, icon); } catch { /* sin icono: el renderer usa el genérico */ }
      }
    };
    await Promise.all(Array.from({ length: Math.min(ICON_CONCURRENCY, queue.length) }, worker));
    return Object.fromEntries(wanted.filter(id => this.iconCache.has(id)).map(id => [id, this.iconCache.get(id)!]));
  }
}
