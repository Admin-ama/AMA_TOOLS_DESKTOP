import { type AppAdmin, type AppId, type CustomApp, type Service } from '../shared/contracts';
import { isInternalHost } from './certificate-policy';

/** Navegación del grupo Microsoft (login, Teams, Office, SharePoint del tenant, Power Platform, Forms): una lista para todas las apps del grupo. */
const MICROSOFT_HOSTS: readonly string[] = ['login.microsoftonline.com', 'login.live.com', 'outlook.office365.com', 'amatime.sharepoint.com', 'amatime-my.sharepoint.com'];
/** Sufijos con frontera de punto; *.sharepoint.com NO está: solo los dos hosts exactos del tenant. */
const MICROSOFT_SUFFIXES: readonly string[] = ['msauth.net', 'msftauth.net', 'cloud.microsoft', 'office.com', 'office.net', 'officeapps.live.com', 'microsoft365.com', 'powerautomate.com', 'powerapps.com', 'powerplatform.com', 'microsoft.com'];

export const SERVICES: Service[] = [
  { id: 'huly', name: 'Huly Workspace', shortName: 'Huly', category: 'operacion', url: 'http://172.16.8.73:8087/' },
  { id: 'n8n', name: 'n8n Automations', shortName: 'n8n', category: 'automatizacion', url: 'https://172.16.8.73:5443/', authOrigins: ['https://login.microsoftonline.com', 'https://login.live.com'] },
  { id: 'librechat', name: 'AMA IA', shortName: 'AMA IA', category: 'control', url: 'https://172.16.8.73/' },
  { id: 'portal', name: 'Portal de Operaciones', shortName: 'Portal Ops', category: 'amatime', url: 'https://app.amatime.com/' },
  { id: 'emailai', name: 'Email Category AI', shortName: 'Email AI', category: 'automatizacion', url: 'https://email-category-ai.vercel.app/', authOrigins: ['https://login.microsoftonline.com', 'https://login.live.com', 'https://mysignins.microsoft.com'] },
  { id: 'stirling', name: 'Stirling PDF', shortName: 'Stirling PDF', category: 'automatizacion', url: 'http://172.16.8.73:8080/' },
  {
    id: 'teams', name: 'Microsoft Teams', shortName: 'Teams', category: 'comunicacion', url: 'https://teams.microsoft.com/v2/',
    group: 'microsoft',
  },
  { id: 'copilot', name: 'Copilot M365', shortName: 'Copilot', category: 'control', url: 'https://m365.cloud.microsoft/', group: 'microsoft' },
  { id: 'outlook', name: 'Outlook', shortName: 'Outlook', category: 'comunicacion', url: 'https://outlook.office.com/mail/', group: 'microsoft' },
  { id: 'sharepoint', name: 'SharePoint', shortName: 'SharePoint', category: 'operacion', url: 'https://amatime.sharepoint.com/', group: 'microsoft' },
  { id: 'powerautomate', name: 'Power Automate', shortName: 'Power Automate', category: 'automatizacion', url: 'https://make.powerautomate.com/', group: 'microsoft' },
  { id: 'forms', name: 'Microsoft Forms', shortName: 'Forms', category: 'automatizacion', url: 'https://forms.office.com/', group: 'microsoft' },
  { id: 'costeador', name: 'Costeador', shortName: 'Costeador', category: 'amatime', url: 'https://julio-sepulveda-costeo-bulk-copacki.vercel.app/', admin: { name: 'Julio Sepúlveda', email: 'jsepulveda@amatime.com' } },
  { id: 'buk', name: 'Buk', shortName: 'Buk', category: 'control', url: 'https://amatime.buk.cl/users/sign_in' },
];
/** Una página del usuario es una app más del catálogo: solo su origen, sin login externo. */
export function customService(app: CustomApp): Service {
  return { id: app.id, name: app.name, shortName: app.name, category: 'mine', url: app.url, custom: true, ...(app.icon ? { icon: app.icon } : {}) };
}
/** Catálogo vigente: apps globales (código) + páginas del usuario (preferencias). */
export function catalogOf(globals: readonly Service[], customApps: readonly CustomApp[]): Service[] {
  return [...globals, ...customApps.map(customService)];
}
export function isAppId(value: unknown, catalog: readonly Pick<Service, 'id'>[]): value is AppId {
  return typeof value === 'string' && catalog.some(service => service.id === value);
}
export function sameServiceOrigin(destination: string, service: Service): boolean {
  try {
    const url = new URL(destination);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.origin === new URL(service.url).origin;
  } catch { return false; }
}
/** El host es el sufijo o un subdominio suyo (nunca "evilsufijo" ni "sufijo.evil"). */
export function hostMatchesSuffix(host: string, suffixes: readonly string[]): boolean {
  return suffixes.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
}
/** Destino https (sin credenciales) permitido por la lista del grupo; las apps sin grupo nunca. */
export function groupAllows(destination: string, group: Service['group']): boolean {
  if (group !== 'microsoft') return false;
  try {
    const url = new URL(destination);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    return MICROSOFT_HOSTS.includes(url.hostname) || hostMatchesSuffix(url.hostname, MICROSOFT_SUFFIXES);
  } catch { return false; }
}
/** window.open hacia el login externo declarado por la app (OAuth de n8n, MSAL loginPopup): necesita una ventana real con opener. */
export function isAuthPopup(destination: string, service: Service): boolean {
  try {
    const url = new URL(destination);
    return url.protocol === 'https:' && !url.username && !url.password && (service.authOrigins ?? []).includes(url.origin);
  } catch { return false; }
}
// Navegación de la vista: su origen, el login externo declarado (p. ej. MSAL loginRedirect) o la lista de su grupo (https).
export function allowedNavigation(destination: string, service: Service): boolean {
  if (sameServiceOrigin(destination, service) || groupAllows(destination, service.group)) return true;
  try {
    const url = new URL(destination);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    return (service.authOrigins ?? []).includes(url.origin);
  } catch { return false; }
}
const internalWeb = (value: string) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && isInternalHost(url.hostname);
  } catch { return false; }
};
/**
 * Descargas: archivos del propio origen del servicio o, en el grupo Microsoft, de destinos permitidos del grupo (SharePoint, adjuntos).
 * También lo que genera la propia página (blob: de su origen, data:) y, si la app es de la red interna, cualquier servidor 172.16.8.x.
 */
export function allowedDownload(destination: string, service: Service): boolean {
  if (sameServiceOrigin(destination, service) || groupAllows(destination, service.group)) return true;
  if (destination.startsWith('data:')) return true;
  if (destination.startsWith('blob:')) { try { return new URL(destination).origin === new URL(service.url).origin; } catch { return false; } }
  return internalWeb(service.url) && internalWeb(destination);
}
/** Apps que comparten sesión con el id (incluida ella); sin grupo, solo ella. */
export function groupMembers(id: AppId, catalog: readonly Service[]): Service[] {
  const service = catalog.find(item => item.id === id);
  if (!service) return [];
  return service.group ? catalog.filter(item => item.group === service.group) : [service];
}
const sharedLabels = (a: string, b: string) => { const x = a.split('.').reverse(), y = b.split('.').reverse(); let n = 0; while (n < x.length && n < y.length && x[n] === y[n]) n++; return n; };
/**
 * App en cuya pestaña se abre una ventana nueva (window.open) pedida por source; null = bloquear.
 * Grupo: el miembro cuyo origen coincide con el destino; si no, el de dominio más parecido (2+ etiquetas); en empate o sin parecido, la propia app.
 */
export function windowTarget(destination: string, source: Service, catalog: readonly Service[]): AppId | null {
  if (!allowedNavigation(destination, source)) return null;
  if (!source.group) return source.id;
  const members = groupMembers(source.id, catalog);
  const exact = members.filter(member => sameServiceOrigin(destination, member));
  if (exact.length) return exact.some(member => member.id === source.id) ? source.id : exact[0].id;
  const host = new URL(destination).hostname;
  const score = (member: Service) => sharedLabels(host, new URL(member.url).hostname);
  let best = source, top = score(source);
  for (const member of members) if (score(member) > top) { best = member; top = score(member); }
  return top >= 2 ? best.id : source.id;
}
export function isPdfUrl(destination: string): boolean {
  try { return new URL(destination).pathname.toLowerCase().endsWith('.pdf'); } catch { return false; }
}
/** Cada app (global o propia) tiene su partición; las del mismo grupo comparten una (SSO). Los ids propios ya llevan el prefijo `custom-`. */
export function partitionFor(id: AppId, persistent: boolean, group?: Service['group']): string {
  return `${persistent ? 'persist:' : ''}amatime-${group ?? id}`;
}
export function remotePreferences(id: AppId, persistent: boolean, group?: Service['group']) {
  return { partition: partitionFor(id, persistent, group), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false };
}
export { contentBounds } from '../shared/layout';
export { splitBounds, SPLIT } from '../shared/split';

/** Correo simple: sin espacios ni caracteres que permitan colar parámetros en el enlace de Teams. */
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export function validAdmin(admin: unknown): admin is AppAdmin {
  if (!admin || typeof admin !== 'object') return false;
  const { name, email } = admin as Record<string, unknown>;
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 60 && typeof email === 'string' && email.length <= 254 && EMAIL.test(email);
}
/** Chat de Teams con el administrador y el mensaje de solicitud ya escrito. */
export function accessRequestUrl(admin: AppAdmin, appName: string, teamsOrigin = 'https://teams.microsoft.com'): string {
  if (!validAdmin(admin)) throw new Error('Administrador inválido');
  const url = new URL('/l/chat/0/0', teamsOrigin);
  url.searchParams.set('users', admin.email);
  url.searchParams.set('message', `Hola ${admin.name.trim().split(/\s+/)[0]}, quiero solicitar acceso a ${appName}.`);
  return url.toString();
}
