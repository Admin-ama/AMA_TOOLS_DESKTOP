import { type AppId, type CustomApp, type Service } from '../shared/contracts';

export const SERVICES: Service[] = [
  { id: 'huly', name: 'Huly Workspace', shortName: 'Huly', category: 'operacion', url: 'http://172.16.8.73:8087/' },
  { id: 'n8n', name: 'n8n Automations', shortName: 'n8n', category: 'automatizacion', url: 'http://172.16.8.73:5678/' },
  { id: 'librechat', name: 'LibreChat AI', shortName: 'LibreChat', category: 'control', url: 'https://172.16.8.73/' },
  { id: 'portal', name: 'Portal de Operaciones', shortName: 'Portal Ops', category: 'operacion', url: 'https://app.amatime.com/' },
  { id: 'emailai', name: 'Email Category AI', shortName: 'Email AI', category: 'automatizacion', url: 'https://email-category-ai.vercel.app/', authOrigins: ['https://login.microsoftonline.com', 'https://login.live.com', 'https://mysignins.microsoft.com'] },
  { id: 'stirling', name: 'Stirling PDF', shortName: 'Stirling PDF', category: 'automatizacion', url: 'http://172.16.8.73:8080/' },
  {
    id: 'teams', name: 'Microsoft Teams', shortName: 'Teams', category: 'comunicacion', url: 'https://teams.microsoft.com/v2/',
    authOrigins: ['https://login.microsoftonline.com', 'https://login.live.com', 'https://login.microsoft.com', 'https://aadcdn.msauth.net', 'https://aadcdn.msftauth.net'],
    // Teams v2 salta entre dominios de Microsoft; lista explícita, sin más comodines que estos sufijos.
    hostSuffixes: ['teams.microsoft.com', 'teams.cloud.microsoft', 'office.com', 'microsoft.com'],
  },
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
// Navegación de la vista: su origen, el login externo declarado (p. ej. MSAL loginRedirect) o sus sufijos de host (https).
export function allowedNavigation(destination: string, service: Service): boolean {
  if (sameServiceOrigin(destination, service)) return true;
  try {
    const url = new URL(destination);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    return (service.authOrigins ?? []).includes(url.origin) || hostMatchesSuffix(url.hostname, service.hostSuffixes ?? []);
  } catch { return false; }
}
// Descargas: solo archivos servidos por el propio origen del servicio.
export function allowedDownload(destination: string, service: Service): boolean {
  return sameServiceOrigin(destination, service);
}
export function isPdfUrl(destination: string): boolean {
  try { return new URL(destination).pathname.toLowerCase().endsWith('.pdf'); } catch { return false; }
}
/** Cada app (global o propia) tiene su partición; los ids propios ya llevan el prefijo `custom-`. */
export function partitionFor(id: AppId, persistent: boolean): string {
  return `${persistent ? 'persist:' : ''}amatime-${id}`;
}
export function remotePreferences(id: AppId, persistent: boolean) {
  return { partition: partitionFor(id, persistent), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false };
}
export { contentBounds } from '../shared/layout';
export { splitBounds, SPLIT } from '../shared/split';
