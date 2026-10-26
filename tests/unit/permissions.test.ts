import { describe, expect, it } from 'vitest';
import { SERVICES, customService } from '../../src/main/policy';
import { permissionAllowed, permissionsFor, sanitizeUserAgent } from '../../src/main/permissions';

const svc = (id: string) => SERVICES.find(s => s.id === id)!;
const teams = svc('teams');
const origins = ['https://teams.microsoft.com/v2/', 'https://teams.cloud.microsoft/', 'https://eu.teams.microsoft.com/', 'https://outlook.office.com/mail/', 'https://m365.cloud.microsoft/', 'https://amatime.sharepoint.com/', 'https://forms.office.com/'];
const TEAMS = ['clipboard-sanitized-write', 'fullscreen', 'media', 'notifications'];
const INTERNAL = ['huly', 'n8n', 'librechat', 'stirling'];

describe('permisos del dispositivo', () => {
  it('cada app del grupo recibe solo lo suyo', () => {
    expect([...permissionsFor(teams)].sort()).toEqual(TEAMS);
    for (const id of ['outlook', 'copilot']) expect([...permissionsFor(svc(id))].sort(), id).toEqual(['clipboard-sanitized-write', 'notifications']);
    for (const id of ['sharepoint', 'powerautomate', 'forms']) expect([...permissionsFor(svc(id))], id).toEqual(['clipboard-sanitized-write']);
  });
  it('concede esos permisos desde cualquier origen permitido del grupo', () => {
    for (const permission of TEAMS) for (const origin of origins) expect(permissionAllowed(teams, permission, origin), permission + ' ' + origin).toBe(true);
    for (const id of ['outlook', 'copilot']) for (const permission of ['notifications', 'clipboard-sanitized-write']) expect(permissionAllowed(svc(id), permission, origins[3]), id + permission).toBe(true);
    for (const id of ['sharepoint', 'powerautomate', 'forms']) expect(permissionAllowed(svc(id), 'clipboard-sanitized-write', origins[5]), id).toBe(true);
  });
  it('Outlook, Copilot y el resto no reciben cámara, micrófono ni pantalla completa', () => {
    for (const id of ['outlook', 'copilot']) for (const permission of ['media', 'fullscreen']) expect(permissionAllowed(svc(id), permission, origins[3]), id + permission).toBe(false);
    for (const id of ['sharepoint', 'powerautomate', 'forms']) for (const permission of ['media', 'fullscreen', 'notifications']) expect(permissionAllowed(svc(id), permission, origins[5]), id + permission).toBe(false);
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
  it('las apps externas fuera del grupo y las páginas propias lo deniegan todo', () => {
    const wiki = customService({ id: 'custom-0a1b2c3d-aaaa', name: 'Wiki', url: 'https://wiki.com/' });
    for (const service of [...SERVICES.filter(s => !s.group && !INTERNAL.includes(s.id)), wiki, undefined]) {
      for (const permission of TEAMS) expect(permissionAllowed(service, permission, origins[0])).toBe(false);
      expect(permissionsFor(service).size).toBe(0);
    }
  });
});

describe('apps del catálogo en la red interna (172.16.8.x)', () => {
  it('pueden copiar al portapapeles desde su propio origen', () => {
    for (const id of INTERNAL) {
      expect([...permissionsFor(svc(id))], id).toEqual(['clipboard-sanitized-write']);
      expect(permissionAllowed(svc(id), 'clipboard-sanitized-write', svc(id).url + 'c/agentes'), id).toBe(true);
    }
  });
  it('una página propia alojada en la red interna también puede copiar desde su origen', () => {
    const lan = customService({ id: 'custom-0a1b2c3d-bbbb', name: 'Interna', url: 'https://172.16.8.20/' });
    expect(permissionAllowed(lan, 'clipboard-sanitized-write', 'https://172.16.8.20/x')).toBe(true);
    expect(permissionAllowed(lan, 'clipboard-sanitized-write', 'https://172.16.8.21/x')).toBe(false);
  });
  it('desde otro origen o pidiendo otra cosa, nada', () => {
    for (const id of INTERNAL) {
      for (const origin of ['https://evil.com/', 'http://172.16.8.74:5678/', 'https://172.16.8.73:9999/', undefined]) expect(permissionAllowed(svc(id), 'clipboard-sanitized-write', origin as string), id + origin).toBe(false);
      for (const permission of ['clipboard-read', 'media', 'notifications', 'geolocation']) expect(permissionAllowed(svc(id), permission, svc(id).url), id + permission).toBe(false);
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
