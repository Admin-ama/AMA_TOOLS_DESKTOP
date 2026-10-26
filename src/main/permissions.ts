import type { Service } from '../shared/contracts';
import { groupAllows, sameServiceOrigin } from './policy';
import { isInternalHost } from './certificate-policy';

const NONE: ReadonlySet<string> = new Set();
/** Teams: llamadas (audio/video), avisos, copiar y pantalla completa. */
const TEAMS_PERMISSIONS: ReadonlySet<string> = new Set(['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen']);
/** Outlook y Copilot: avisos y copiar. El resto del grupo Microsoft: solo copiar. */
const MAIL_PERMISSIONS: ReadonlySet<string> = new Set(['notifications', 'clipboard-sanitized-write']);
const COPY_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write']);

const internal = (service: Partial<Pick<Service, 'url'>> | undefined) => { try { return !!service?.url && isInternalHost(new URL(service.url).hostname); } catch { return false; } };

/** Permisos que puede recibir una app: las del grupo Microsoft según cuál sea; las de la red interna, copiar. */
export function permissionsFor(service: Pick<Service, 'id' | 'group'> & Partial<Pick<Service, 'url'>> | undefined): ReadonlySet<string> {
  if (service?.group !== 'microsoft') return internal(service) ? COPY_PERMISSIONS : NONE;
  if (service.id === 'teams') return TEAMS_PERMISSIONS;
  return service.id === 'outlook' || service.id === 'copilot' ? MAIL_PERMISSIONS : COPY_PERMISSIONS;
}

/** Todo se deniega salvo lo anterior, y solo si quien lo pide es un origen https permitido del grupo (o, en la red interna, el propio origen de la app). */
export function permissionAllowed(service: Pick<Service, 'id' | 'group'> & Partial<Pick<Service, 'url'>> | undefined, permission: string, requestingUrl: string | undefined): boolean {
  if (!requestingUrl || !service || !permissionsFor(service).has(permission)) return false;
  return service.group ? groupAllows(requestingUrl, service.group) : !!service.url && sameServiceOrigin(requestingUrl, service as Service);
}

/** Microsoft rechaza el UA de Electron: sin el token de la app ni `Electron/x.y.z` es el de Chrome que lo motoriza. */
export function sanitizeUserAgent(userAgent: string): string {
  return userAgent
    .replace(/\s+Electron\/[\d.]+/g, '')
    .replace(/(Gecko\))\s+(?!Chrome\/)(?:[^/)]+\/[\d.]+\s+)+(?=Chrome\/)/, '$1 ');
}
