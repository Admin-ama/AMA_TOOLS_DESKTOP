import { SERVICE_IDS, type ServiceId, type Service } from '../shared/contracts';
import { SHELL_LAYOUT } from '../shared/layout';

export const SERVICES: Service[] = [
  { id: 'huly', name: 'Huly Workspace', shortName: 'Huly', category: 'operacion', url: 'http://172.16.8.73:8087/' },
  { id: 'n8n', name: 'n8n Automations', shortName: 'n8n', category: 'automatizacion', url: 'http://172.16.8.73:5678/' },
  { id: 'librechat', name: 'LibreChat AI', shortName: 'LibreChat', category: 'control', url: 'https://172.16.8.73/' },
  { id: 'portal', name: 'Portal de Operaciones', shortName: 'Portal Ops', category: 'operacion', url: 'https://app.amatime.com/' },
  { id: 'emailai', name: 'Email Category AI', shortName: 'Email AI', category: 'automatizacion', url: 'https://email-category-ai.vercel.app/', authOrigins: ['https://login.microsoftonline.com', 'https://login.live.com', 'https://mysignins.microsoft.com'] },
  { id: 'stirling', name: 'Stirling PDF', shortName: 'Stirling PDF', category: 'automatizacion', url: 'http://172.16.8.73:8080/' },
];
export function isServiceId(value: unknown): value is ServiceId {
  return typeof value === 'string' && SERVICE_IDS.some(id => id === value);
}
export function sameServiceOrigin(destination: string, service: Service): boolean {
  try {
    const url = new URL(destination);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.origin === new URL(service.url).origin;
  } catch { return false; }
}
// Navegación de la vista: su origen o el login externo declarado (p. ej. MSAL loginRedirect).
export function allowedNavigation(destination: string, service: Service): boolean {
  if (sameServiceOrigin(destination, service)) return true;
  try {
    const url = new URL(destination);
    return url.protocol === 'https:' && !url.username && !url.password && (service.authOrigins ?? []).includes(url.origin);
  } catch { return false; }
}
// Descargas: solo archivos servidos por el propio origen del servicio.
export function allowedDownload(destination: string, service: Service): boolean {
  return sameServiceOrigin(destination, service);
}
export function isPdfUrl(destination: string): boolean {
  try { return new URL(destination).pathname.toLowerCase().endsWith('.pdf'); } catch { return false; }
}
export function partitionFor(id: ServiceId, persistent: boolean): string {
  return `${persistent ? 'persist:' : ''}amatime-${id}`;
}
export function remotePreferences(id: ServiceId, persistent: boolean) {
  return { partition: partitionFor(id, persistent), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false };
}
export function contentBounds(width: number, height: number) {
  const { sidebarWidth: x, headerHeight: y, rightSidebarWidth: right, statusBarHeight: bottom } = SHELL_LAYOUT;
  return { x, y, width: Math.max(0, width - x - right), height: Math.max(0, height - y - bottom) };
}
