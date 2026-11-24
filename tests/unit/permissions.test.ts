import { describe, expect, it } from 'vitest';
import { SERVICES, customService } from '../../src/main/policy';
import { permissionAllowed, permissionsFor, sanitizeUserAgent } from '../../src/main/permissions';

const svc = (id: string) => SERVICES.find(s => s.id === id)!;
const teams = svc('teams');
const origins = ['https://teams.microsoft.com/v2/', 'https://teams.cloud.microsoft/', 'https://eu.teams.microsoft.com/', 'https://outlook.office.com/mail/', 'https://m365.cloud.microsoft/', 'https://amatime.sharepoint.com/', 'https://forms.cloud.microsoft/'];
const TEAMS = ['clipboard-sanitized-write', 'fullscreen', 'media', 'notifications'];
const INTERNAL = ['huly', 'n8n', 'librechat', 'stirling'];

describe('permisos del dispositivo', () => {
  it('cada app del grupo recibe solo lo suyo', () => {
    expect([...permissionsFor(teams)].sort()).toEqual(TEAMS);
    for (const id of ['outlook', 'copilot']) expect([...permissionsFor(svc(id))].sort(), id).toEqual(['clipboard-sanitized-write', 'media', 'notifications']);
    for (const id of ['sharepoint', 'powerautomate', 'forms']) expect([...permissionsFor(svc(id))].sort(), id).toEqual(['clipboard-sanitized-write', 'media']);
  });
  it('concede esos permisos desde cualquier origen permitido del grupo', () => {
    for (const permission of TEAMS) for (const origin of origins) expect(permissionAllowed(teams, permission, origin), permission + ' ' + origin).toBe(true);
    for (const id of ['outlook', 'copilot']) for (const permission of ['notifications', 'clipboard-sanitized-write']) expect(permissionAllowed(svc(id), permission, origins[3]), id + permission).toBe(true);
    for (const id of ['sharepoint', 'powerautomate', 'forms']) expect(permissionAllowed(svc(id), 'clipboard-sanitized-write', origins[5]), id).toBe(true);
  });
  it('Teams recibe micrófono y cámara para las llamadas', () => {
    for (const types of [['audio'], ['video'], ['audio', 'video']] as const) expect(permissionAllowed(teams, 'media', origins[0], types), types.join()).toBe(true);
  });
  it('Outlook, Copilot y el resto reciben micrófono, pero no cámara ni pantalla completa', () => {
    for (const id of ['outlook', 'copilot', 'sharepoint', 'powerautomate', 'forms']) {
      expect(permissionAllowed(svc(id), 'media', svc(id).url, ['audio']), id).toBe(true);
      for (const types of [['video'], ['audio', 'video'], ['unknown'], [], undefined] as const) expect(permissionAllowed(svc(id), 'media', svc(id).url, types as readonly string[] | undefined), id + String(types)).toBe(false);
      expect(permissionAllowed(svc(id), 'fullscreen', svc(id).url), id).toBe(false);
    }
    for (const id of ['sharepoint', 'powerautomate', 'forms']) expect(permissionAllowed(svc(id), 'notifications', origins[5]), id).toBe(false);
  });
  it('sin vista asociada (service worker) no hay micrófono', () => {
    expect(permissionAllowed({ id: '', group: 'microsoft' }, 'media', origins[3], ['audio'])).toBe(false);
    expect(permissionAllowed({ id: '', group: 'microsoft' }, 'clipboard-sanitized-write', origins[3])).toBe(true);
  });
  it('deniega todo lo demás, incluida la captura de pantalla', () => {
    for (const permission of ['display-capture', 'geolocation', 'midi', 'midiSysex', 'clipboard-read', 'openExternal', 'hid', 'usb', 'serial', 'pointerLock', 'idle-detection', 'window-management', 'unknown', '']) {
      for (const service of SERVICES.filter(s => s.group)) expect(permissionAllowed(service, permission, origins[0]), service.id + permission).toBe(false);
    }
  });
  it('deniega los permisos si quien los pide no es un origen permitido del grupo', () => {
    for (const origin of ['https://evil.com/', 'http://teams.microsoft.com/', 'https://teams.microsoft.com.attacker.com/', 'https://evil-office.com/', 'https://othertenant.sharepoint.com/', 'https://user:pw@teams.microsoft.com/', 'http://127.0.0.1:9000/teams', 'not a url', '', undefined]) {
      expect(permissionAllowed(teams, 'media', origin as string), String(origin)).toBe(false);
      expect(permissionAllowed(svc('outlook'), 'notifications', origin as string), String(origin)).toBe(false);
    }
  });
  it('las apps externas fuera del grupo y las páginas propias solo reciben micrófono, y solo desde su origen', () => {
    const wiki = customService({ id: 'custom-0a1b2c3d-aaaa', name: 'Wiki', url: 'https://wiki.com/' });
    for (const service of [...SERVICES.filter(s => !s.group && !INTERNAL.includes(s.id)), wiki]) {
      expect([...permissionsFor(service)], service.id).toEqual(['media']);
      expect(permissionAllowed(service, 'media', service.url, ['audio']), service.id).toBe(true);
      expect(permissionAllowed(service, 'media', service.url, ['video']), service.id).toBe(false);
      expect(permissionAllowed(service, 'media', 'https://evil.com/', ['audio']), service.id).toBe(false);
      for (const permission of TEAMS.filter(p => p !== 'media')) expect(permissionAllowed(service, permission, service.url), service.id + permission).toBe(false);
    }
  });
  it('sin app no hay ningún permiso', () => {
    expect(permissionsFor(undefined).size).toBe(0);
    expect(permissionAllowed(undefined, 'media', origins[0], ['audio'])).toBe(false);
  });
  it('cualquier app del catálogo puede usar el micrófono desde su propio origen', () => {
    for (const service of SERVICES) expect(permissionAllowed(service, 'media', service.url, ['audio']), service.id).toBe(true);
  });
});

describe('apps del catálogo en la red interna (172.16.8.x)', () => {
  it('pueden copiar al portapapeles y usar el micrófono desde su propio origen', () => {
    for (const id of INTERNAL) {
      expect([...permissionsFor(svc(id))].sort(), id).toEqual(['clipboard-sanitized-write', 'media']);
      expect(permissionAllowed(svc(id), 'clipboard-sanitized-write', svc(id).url + 'c/agentes'), id).toBe(true);
      expect(permissionAllowed(svc(id), 'media', svc(id).url + 'c/new', ['audio']), id).toBe(true);
      expect(permissionAllowed(svc(id), 'media', svc(id).url, ['video']), id).toBe(false);
    }
  });
  it('una página propia alojada en la red interna también puede copiar desde su origen', () => {
    const lan = customService({ id: 'custom-0a1b2c3d-bbbb', name: 'Interna', url: 'https://172.16.8.20/' });
    expect(permissionAllowed(lan, 'clipboard-sanitized-write', 'https://172.16.8.20/x')).toBe(true);
    expect(permissionAllowed(lan, 'clipboard-sanitized-write', 'https://172.16.8.21/x')).toBe(false);
  });
  it('desde otro origen o pidiendo otra cosa, nada', () => {
    for (const id of INTERNAL) {
      for (const origin of ['https://evil.com/', 'http://172.16.8.74:5678/', 'https://172.16.8.73:9999/', undefined]) {
        expect(permissionAllowed(svc(id), 'clipboard-sanitized-write', origin as string), id + origin).toBe(false);
        expect(permissionAllowed(svc(id), 'media', origin as string, ['audio']), id + origin).toBe(false);
      }
      for (const permission of ['clipboard-read', 'notifications', 'geolocation']) expect(permissionAllowed(svc(id), permission, svc(id).url), id + permission).toBe(false);
    }
  });
});

describe('sanitizeUserAgent', () => {
  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.0 Safari/537.36';
  const electron = (app: string) => chrome.replace('Chrome/', `${app} Chrome/`).replace('Safari', 'Electron/44.5.1 Safari');
  it('quita Electron y el token de la app', () => {
    expect(sanitizeUserAgent(electron('amatime-tools-desktop/0.3.9'))).toBe(chrome);
    expect(sanitizeUserAgent(electron('AMATIMETools/0.3.9'))).toBe(chrome);
  });
  it('deja intacto un UA que ya es de Chrome', () => { expect(sanitizeUserAgent(chrome)).toBe(chrome); });
  it('conserva el resto del UA', () => {
    const result = sanitizeUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) app/1.0.0 Chrome/146.0.0.0 Electron/44.5.1 Safari/537.36');
    expect(result).toBe('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');
    expect(result).not.toMatch(/Electron|app\//);
  });
});
