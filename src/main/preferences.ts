import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { GLOBAL_APP_IDS, DEFAULT_PINNED, FIXED_APPS, type DesktopApp, type Preferences, type AppId, DEFAULT_SPLIT_RATIO, DEFAULT_SPLIT_SERVICE } from '../shared/contracts';
import { normalizeCustomApps } from '../shared/custom-apps';
import { SERVICES } from './policy';
import { MAX_DESKTOP_APPS, MAX_DESKTOP_APP_NAME, validAumid } from './desktop-apps';
import { isZoomPercent, PAGE_ZOOM } from '../shared/zoom';

/** `ids`: catálogo vigente (globales + páginas propias); lo desconocido se descarta. Las fijas van siempre primero; el resto, en el orden del usuario. */
export function normalizePinned(input: unknown, ids: readonly AppId[] = GLOBAL_APP_IDS): AppId[] {
  const chosen = Array.isArray(input) ? [...new Set(input)].filter((id): id is AppId => ids.some(known => known === id)) : DEFAULT_PINNED.filter(id => ids.includes(id));
  return [...FIXED_APPS.filter(id => ids.includes(id)), ...chosen.filter(id => !FIXED_APPS.includes(id))];
}
/** Solo la forma: que la ruta exista se comprueba al vincular y al abrir. */
export function normalizeDesktopApps(input: unknown): DesktopApp[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const apps: DesktopApp[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const { id, name, kind, path: file, aumid } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !id || seen.has(id) || typeof name !== 'string') continue;
    const clean = name.trim().slice(0, MAX_DESKTOP_APP_NAME);
    if (!clean) continue;
    // Entradas antiguas no traen kind: eran rutas.
    if (kind === 'aumid') { if (!validAumid(aumid)) continue; seen.add(id); apps.push({ id, name: clean, kind: 'aumid', aumid }); }
    else if (kind === undefined || kind === 'path') { if (typeof file !== 'string' || !path.isAbsolute(file)) continue; seen.add(id); apps.push({ id, name: clean, kind: 'path', path: file }); }
  }
  return apps.slice(0, MAX_DESKTOP_APPS);
}
export function normalizeSplitRatio(input: unknown): number {
  return typeof input === 'number' && input > 0 && input < 1 ? Math.min(0.9, Math.max(0.1, input)) : DEFAULT_SPLIT_RATIO;
}
export function normalizeSplitService(input: unknown, ids: readonly AppId[] = GLOBAL_APP_IDS): AppId {
  return ids.find(id => id === input) ?? DEFAULT_SPLIT_SERVICE;
}
/** Zoom recordado por app: solo apps del catálogo y porcentajes válidos; el 100% es el valor por defecto y no se guarda. */
export function normalizeZoom(input: unknown, ids: readonly AppId[] = GLOBAL_APP_IDS): Record<AppId, number> {
  if (!input || typeof input !== 'object') return {};
  const source = input as Record<string, unknown>;
  return Object.fromEntries(ids.filter(id => Object.hasOwn(source, id) && isZoomPercent(source[id]) && source[id] !== PAGE_ZOOM.default).map(id => [id, source[id] as number]));
}
/** Nuevo orden pedido por el renderer: solo una permutación de las fijadas actuales (las fijas siguen primero). */
export function reorderPinned(current: readonly AppId[], requested: unknown): AppId[] {
  const valid = Array.isArray(requested) && requested.length === current.length && new Set(requested).size === current.length && requested.every(id => current.includes(id));
  if (!valid) throw new Error('Orden inválido');
  return normalizePinned(requested, current);
}
/** Las apps de un grupo comparten sesión: se recuerda solo si todas lo piden. */
function syncGroupRemember(remember: Record<AppId, boolean>): Record<AppId, boolean> {
  for (const group of new Set(SERVICES.map(service => service.group).filter(Boolean))) {
    const ids = SERVICES.filter(service => service.group === group).map(service => service.id);
    const value = ids.every(id => remember[id] !== false);
    for (const id of ids) remember[id] = value;
  }
  return remember;
}
export function normalizePreferences(input: unknown): Preferences {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const remember = source.remember && typeof source.remember === 'object' ? source.remember as Record<string, unknown> : {};
  const customApps = normalizeCustomApps(source.customApps);
  const ids: AppId[] = [...GLOBAL_APP_IDS, ...customApps.map(app => app.id)];
  return {
    theme: source.theme === 'light' ? 'light' : 'dark',
    remember: syncGroupRemember(Object.fromEntries(ids.map(id => [id, Object.hasOwn(remember, id) && typeof remember[id] === 'boolean' ? remember[id] : true]))),
    pinned: normalizePinned(source.pinned, ids),
    desktopApps: normalizeDesktopApps(source.desktopApps),
    customApps,
    splitRatio: normalizeSplitRatio(source.splitRatio),
    splitService: normalizeSplitService(source.splitService, ids),
    zoom: normalizeZoom(source.zoom, ids),
  };
}
export async function readPreferences(file: string): Promise<Preferences> {
  try { return normalizePreferences(JSON.parse(await readFile(file, 'utf8'))); }
  catch { return normalizePreferences(null); }
}
export async function savePreferences(file: string, preferences: Preferences): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(normalizePreferences(preferences), null, 2));
  await rename(`${file}.tmp`, file);
}
