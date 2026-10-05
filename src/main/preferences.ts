import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { SERVICE_IDS, type Preferences } from '../shared/contracts';

export function normalizePreferences(input: unknown): Preferences {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const remember = source.remember && typeof source.remember === 'object' ? source.remember as Record<string, unknown> : {};
  return {
    theme: source.theme === 'light' ? 'light' : 'dark',
    remember: Object.fromEntries(SERVICE_IDS.map(id => [id, typeof remember[id] === 'boolean' ? remember[id] : true])) as Preferences['remember'],
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
