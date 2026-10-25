import { validIcon, MAX_ICON_LENGTH } from '../shared/custom-apps';

/** Tope de bytes crudos: en base64 + prefijo el data URL sigue por debajo de MAX_ICON_LENGTH. */
export const MAX_FAVICON_BYTES = Math.floor((MAX_ICON_LENGTH - 64) / 4) * 3;
const TYPES = new Set(['image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/svg+xml']);
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Mejor esfuerzo: cualquier fallo significa "sin icono"; nunca bloquea ni lanza. */
export async function fetchFavicon(origin: string, fetchFn: Fetch, timeoutMs = 3000): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(`${origin}/favicon.ico`, { signal: controller.signal });
    if (!response.ok || !response.body) return undefined;
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!TYPES.has(type)) return undefined;
    if (Number(response.headers.get('content-length')) > MAX_FAVICON_BYTES) return undefined;
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FAVICON_BYTES) { void reader.cancel().catch(() => undefined); return undefined; }
      chunks.push(value);
    }
    if (size === 0) return undefined;
    const icon = `data:${type};base64,${Buffer.concat(chunks).toString('base64')}`;
    return validIcon(icon) ? icon : undefined;
  } catch { return undefined; }
  finally { clearTimeout(timer); }
}
