import { SERVICE_IDS, type ServiceId, type Service } from '../shared/contracts';
import { SHELL_LAYOUT } from '../shared/layout';

export const SERVICES: Service[] = [
  { id: 'huly', name: 'Huly Workspace', shortName: 'Huly', url: 'http://172.16.8.73:8087/' },
  { id: 'n8n', name: 'n8n Automations', shortName: 'n8n', url: 'http://172.16.8.73:5678/' },
  { id: 'librechat', name: 'LibreChat AI', shortName: 'LibreChat', url: 'https://172.16.8.73/' },
  { id: 'portal', name: 'Portal de Operaciones', shortName: 'Portal Ops', url: 'https://app.amatime.com/' },
];
export function isServiceId(value: unknown): value is ServiceId {
  return typeof value === 'string' && SERVICE_IDS.some(id => id === value);
}
export function allowedNavigation(destination: string, service: Service): boolean {
  try {
    const url = new URL(destination);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.origin === new URL(service.url).origin;
  } catch { return false; }
}
export function partitionFor(id: ServiceId, persistent: boolean): string {
  return `${persistent ? 'persist:' : ''}amatime-${id}`;
}
export function remotePreferences(id: ServiceId, persistent: boolean) {
  return { partition: partitionFor(id, persistent), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false };
}
export function contentBounds(width: number, height: number) {
  const { sidebarWidth: x, headerHeight: y } = SHELL_LAYOUT;
  return { x, y, width: Math.max(0, width - x), height: Math.max(0, height - y) };
}
