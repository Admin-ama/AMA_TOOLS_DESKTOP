import type { Service } from '../shared/contracts';
import { groupAllows, sameServiceOrigin } from './policy';
import { isInternalHost } from './certificate-policy';

type AppRef = Pick<Service, 'id' | 'group'> & Partial<Pick<Service, 'url'>>;

const NONE: ReadonlySet<string> = new Set();
/** Teams: llamadas (micrófono y cámara), avisos, copiar y pantalla completa. */
const TEAMS_PERMISSIONS: ReadonlySet<string> = new Set(['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen']);
/** Outlook y Copilot: micrófono, avisos y copiar. El resto del grupo Microsoft y la red interna: micrófono y copiar. */
const MAIL_PERMISSIONS: ReadonlySet<string> = new Set(['media', 'notifications', 'clipboard-sanitized-write']);
const COPY_PERMISSIONS: ReadonlySet<string> = new Set(['media', 'clipboard-sanitized-write']);
/** Cualquier otra app (catálogo externo o página propia): solo micrófono. */
const MIC_PERMISSIONS: ReadonlySet<string> = new Set(['media']);

const internal = (service: Partial<Pick<Service, 'url'>> | undefined) => { try { return !!service?.url && isInternalHost(new URL(service.url).hostname); } catch { return false; } };

/** Permisos que puede recibir una app: las del grupo Microsoft según cuál sea; las de la red interna, copiar; todas, micrófono. */
export function permissionsFor(service: AppRef | undefined): ReadonlySet<string> {
  if (!service) return NONE;
  if (service.group !== 'microsoft') return internal(service) ? COPY_PERMISSIONS : MIC_PERMISSIONS;
  if (service.id === 'teams') return TEAMS_PERMISSIONS;
  return service.id === 'outlook' || service.id === 'copilot' ? MAIL_PERMISSIONS : COPY_PERMISSIONS;
}

/** `media` abarca micrófono y cámara: Teams recibe ambos; el resto, solo micrófono y solo desde una vista (no un service worker). */
function mediaAllowed(service: AppRef, mediaTypes: readonly string[] | undefined): boolean {
  if (service.group === 'microsoft' && service.id === 'teams') return true;
  return !!service.id && !!mediaTypes?.length && mediaTypes.every(type => type === 'audio');
}

/**
 * Todo se deniega salvo lo anterior, y solo si quien lo pide es un origen https permitido del grupo (o, fuera del grupo, el propio origen de la app).
 * `mediaTypes`: lo que pide un `media` (petición: `mediaTypes`; comprobación: `mediaType`).
 */
export function permissionAllowed(service: AppRef | undefined, permission: string, requestingUrl: string | undefined, mediaTypes?: readonly string[]): boolean {
  if (!requestingUrl || !service || !permissionsFor(service).has(permission)) return false;
  if (permission === 'media' && !mediaAllowed(service, mediaTypes)) return false;
  return service.group ? groupAllows(requestingUrl, service.group) : !!service.url && sameServiceOrigin(requestingUrl, service as Service);
}

/** Microsoft rechaza el UA de Electron: sin el token de la app ni `Electron/x.y.z` es el de Chrome que lo motoriza. */
export function sanitizeUserAgent(userAgent: string): string {
  return userAgent
    .replace(/\s+Electron\/[\d.]+/g, '')
    .replace(/(Gecko\))\s+(?!Chrome\/)(?:[^/)]+\/[\d.]+\s+)+(?=Chrome\/)/, '$1 ');
}
