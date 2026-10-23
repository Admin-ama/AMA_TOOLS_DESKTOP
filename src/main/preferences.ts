import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { SERVICE_IDS, DEFAULT_PINNED, type DesktopApp, type Preferences, type ServiceId } from '../shared/contracts';
import { MAX_DESKTOP_APPS, MAX_DESKTOP_APP_NAME } from './desktop-apps';

export function normalizePinned(input: unknown): ServiceId[] {
  if (!Array.isArray(input)) return [...DEFAULT_PINNED];
  return [...new Set(input)].filter((id): id is ServiceId => SERVICE_IDS.some(known => known === id));
}
/** Solo la forma: que la ruta exista se comprueba al vincular y al abrir. */
export function normalizeDesktopApps(input: unknown): DesktopApp[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const apps: DesktopApp[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const { id, name, path: file } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !id || seen.has(id) || typeof name !== 'string' || typeof file !== 'string' || !path.isAbsolute(file)) continue;
    const clean = name.trim().slice(0, MAX_DESKTOP_APP_NAME);
    if (!clean) continue;
    seen.add(id);
    apps.push({ id, name: clean, path: file });
  }
  return apps.slice(0, MAX_DESKTOP_APPS);
}
export function normalizePreferences(input: unknown): Preferences {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const remember = source.remember && typeof source.remember === 'object' ? source.remember as Record<string, unknown> : {};
  return {
    theme: source.theme === 'light' ? 'light' : 'dark',
    remember: Object.fromEntries(SERVICE_IDS.map(id => [id, typeof remember[id] === 'boolean' ? remember[id] : true])) as Preferences['remember'],
    pinned: normalizePinned(source.pinned),
    desktopApps: normalizeDesktopApps(source.desktopApps),
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
