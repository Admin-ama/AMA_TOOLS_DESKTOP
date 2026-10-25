import type { CustomApp } from './contracts';

export const MAX_CUSTOM_APPS = 30;
export const MAX_CUSTOM_NAME = 40;
/** Largo máximo del data URL completo del icono (≈ 64 KB). */
export const MAX_ICON_LENGTH = 64 * 1024;
export const CUSTOM_ID_PATTERN = /^custom-[a-z0-9-]{8,64}$/;
const ICON_PATTERN = /^data:image\/(?:png|x-icon|vnd\.microsoft\.icon|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

export function isCustomId(value: unknown): value is string { return typeof value === 'string' && CUSTOM_ID_PATTERN.test(value); }

/** Hosts donde http es tolerable: la LAN de la empresa y el propio equipo (pruebas). */
function privateHost(host: string): boolean {
  if (host === 'localhost') return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const [a, b, c, d] = match.slice(1).map(Number);
  if ([a, b, c, d].some(octet => octet > 255)) return false;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export type UrlCheck = { url: string } | { error: string };
export function checkCustomUrl(input: unknown): UrlCheck {
  if (typeof input !== 'string') return { error: 'Ingresa una URL completa que empiece con https://' };
  let url: URL;
  try { url = new URL(input.trim()); } catch { return { error: 'Ingresa una URL completa que empiece con https:// (por ejemplo https://ejemplo.com).' }; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'Solo se permiten direcciones http o https.' };
  if (url.username || url.password) return { error: 'La URL no puede incluir usuario ni contraseña.' };
  if (!url.hostname) return { error: 'Ingresa una URL completa que empiece con https://' };
  if (url.protocol === 'http:' && !privateHost(url.hostname)) return { error: 'HTTP solo se permite en la red local; usa https://.' };
  return { url: url.origin + url.pathname + url.search };
}
/** URL normalizada (origen + ruta + consulta, sin fragmento) o null si no es válida. */
export function validCustomUrl(input: unknown): string | null {
  const result = checkCustomUrl(input);
  return 'url' in result ? result.url : null;
}

export type NameCheck = { name: string } | { error: string };
export function checkCustomName(input: unknown): NameCheck {
  const name = typeof input === 'string' ? input.trim() : '';
  if (!name) return { error: 'Escribe un nombre para la página.' };
  if (name.length > MAX_CUSTOM_NAME) return { error: `El nombre admite hasta ${MAX_CUSTOM_NAME} caracteres.` };
  return { name };
}

export function validIcon(input: unknown): input is string {
  return typeof input === 'string' && input.length <= MAX_ICON_LENGTH && ICON_PATTERN.test(input);
}

/** Descarta lo inválido en vez de fallar: un archivo de preferencias dañado no debe impedir abrir la app. */
export function normalizeCustomApps(input: unknown): CustomApp[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const apps: CustomApp[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const { id, name, url, icon } = item as Record<string, unknown>;
    if (!isCustomId(id) || seen.has(id)) continue;
    const checkedName = checkCustomName(name);
    const checkedUrl = validCustomUrl(url);
    if (!('name' in checkedName) || !checkedUrl) continue;
    seen.add(id);
    apps.push({ id, name: checkedName.name, url: checkedUrl, ...(validIcon(icon) ? { icon } : {}) });
  }
  return apps.slice(0, MAX_CUSTOM_APPS);
}
