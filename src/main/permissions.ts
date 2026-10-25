import type { Service } from '../shared/contracts';
import { groupAllows } from './policy';

const NONE: ReadonlySet<string> = new Set();
/** Teams: llamadas (audio/video), avisos, copiar y pantalla completa. */
const TEAMS_PERMISSIONS: ReadonlySet<string> = new Set(['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen']);
/** Outlook y Copilot: avisos y copiar. El resto del grupo Microsoft: solo copiar. */
const MAIL_PERMISSIONS: ReadonlySet<string> = new Set(['notifications', 'clipboard-sanitized-write']);
const COPY_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write']);

/** Permisos que puede recibir una app: solo las del grupo Microsoft, según cuál sea. */
export function permissionsFor(service: Pick<Service, 'id' | 'group'> | undefined): ReadonlySet<string> {
  if (service?.group !== 'microsoft') return NONE;
  if (service.id === 'teams') return TEAMS_PERMISSIONS;
  return service.id === 'outlook' || service.id === 'copilot' ? MAIL_PERMISSIONS : COPY_PERMISSIONS;
}

/** Todo se deniega salvo lo anterior, y solo si quien lo pide es un origen https permitido del grupo. */
export function permissionAllowed(service: Pick<Service, 'id' | 'group'> | undefined, permission: string, requestingUrl: string | undefined): boolean {
  return !!requestingUrl && permissionsFor(service).has(permission) && groupAllows(requestingUrl, service?.group);
}

/** Microsoft rechaza el UA de Electron: sin el token de la app ni `Electron/x.y.z` es el de Chrome que lo motoriza. */
export function sanitizeUserAgent(userAgent: string): string {
  return userAgent
    .replace(/\s+Electron\/[\d.]+/g, '')
    .replace(/(Gecko\))\s+(?!Chrome\/)(?:[^/)]+\/[\d.]+\s+)+(?=Chrome\/)/, '$1 ');
}
