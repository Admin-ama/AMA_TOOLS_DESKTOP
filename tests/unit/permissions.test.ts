import { describe, expect, it } from 'vitest';
import { SERVICES, customService } from '../../src/main/policy';
import { permissionAllowed, sanitizeUserAgent, TEAMS_PERMISSIONS } from '../../src/main/permissions';

const teams = SERVICES.find(s => s.id === 'teams')!;
const origins = ['https://teams.microsoft.com/v2/', 'https://teams.microsoft.com', 'https://teams.cloud.microsoft/', 'https://eu.teams.microsoft.com/', 'https://x.teams.cloud.microsoft/'];

describe('permisos del dispositivo', () => {
  it('Teams recibe solo audio/video, notificaciones, portapapeles seguro y pantalla completa desde sus orígenes', () => {
    expect([...TEAMS_PERMISSIONS].sort()).toEqual(['clipboard-sanitized-write', 'fullscreen', 'media', 'notifications']);
    for (const permission of TEAMS_PERMISSIONS) for (const origin of origins) expect(permissionAllowed(teams, permission, origin), `${permission} ${origin}`).toBe(true);
  });
  it('Teams deniega todo lo demás, incluida la captura de pantalla', () => {
    for (const permission of ['display-capture', 'geolocation', 'midi', 'midiSysex', 'clipboard-read', 'openExternal', 'hid', 'usb', 'serial', 'pointerLock', 'idle-detection', 'window-management', 'unknown', '']) {
      expect(permissionAllowed(teams, permission, origins[0]), permission).toBe(false);
    }
  });
  it('Teams deniega los permisos si quien los pide no es un origen de Teams', () => {
    for (const origin of ['https://evil.com/', 'http://teams.microsoft.com/', 'https://teams.microsoft.com.attacker.com/', 'https://evil-teams.microsoft.com.attacker.com/', 'https://www.office.com/', 'https://login.microsoftonline.com/', 'https://user:pw@teams.microsoft.com/', 'http://127.0.0.1:9000/teams', 'not a url', '', undefined]) {
      expect(permissionAllowed(teams, 'media', origin as string), String(origin)).toBe(false);
    }
  });
  it('las demás apps y las páginas propias lo deniegan todo', () => {
    const wiki = customService({ id: 'custom-0a1b2c3d-aaaa', name: 'Wiki', url: 'https://wiki.com/' });
    for (const service of [...SERVICES.filter(s => s.id !== 'teams'), wiki, undefined]) {
      for (const permission of TEAMS_PERMISSIONS) expect(permissionAllowed(service, permission, origins[0])).toBe(false);
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
