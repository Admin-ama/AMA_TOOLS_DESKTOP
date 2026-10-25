import type { Service } from '../shared/contracts';
import { hostMatchesSuffix } from './policy';

/** Únicos permisos que Teams puede recibir: llamadas (audio/video), avisos, copiar y pantalla completa. */
export const TEAMS_PERMISSIONS: ReadonlySet<string> = new Set(['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen']);
/** Quién puede pedirlos: solo orígenes propios de Teams (más estrecho que la lista de navegación). */
const TEAMS_ORIGIN_SUFFIXES = ['teams.microsoft.com', 'teams.cloud.microsoft'];

/** Todo se deniega salvo Teams, y solo si quien lo pide es un origen https de Teams. */
export function permissionAllowed(service: Pick<Service, 'id'> | undefined, permission: string, requestingUrl: string | undefined): boolean {
  if (service?.id !== 'teams' || !TEAMS_PERMISSIONS.has(permission) || !requestingUrl) return false;
  try {
    const url = new URL(requestingUrl);
    return url.protocol === 'https:' && !url.username && !url.password && hostMatchesSuffix(url.hostname, TEAMS_ORIGIN_SUFFIXES);
  } catch { return false; }
}

/** Teams rechaza el UA de Electron: sin el token de la app ni `Electron/x.y.z` es el de Chrome que lo motoriza. */
export function sanitizeUserAgent(userAgent: string): string {
  return userAgent
    .replace(/\s+Electron\/[\d.]+/g, '')
    .replace(/(Gecko\))\s+(?!Chrome\/)(?:[^/)]+\/[\d.]+\s+)+(?=Chrome\/)/, '$1 ');
}
