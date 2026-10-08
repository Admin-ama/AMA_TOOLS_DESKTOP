import { describe, expect, it } from 'vitest';
import { SERVICES, isServiceId, allowedNavigation, partitionFor, contentBounds, remotePreferences } from '../../src/main/policy';

describe('registro y aislamiento', () => {
  it('registra las cinco direcciones reales', () => {
    expect(SERVICES.map(s => s.url)).toEqual([
      'http://172.16.8.73:8087/', 'http://172.16.8.73:5678/',
      'https://172.16.8.73/', 'https://app.amatime.com/',
      'https://email-category-ama-ia.netlify.app/',
    ]);
  });
  it('solo acepta IDs conocidos, nunca URLs ni propiedades heredadas', () => {
    expect(isServiceId('huly')).toBe(true);
    for (const id of ['constructor', 'http://evil.test', null, 1, {}]) expect(isServiceId(id)).toBe(false);
  });
  it('permite solo el mismo origen exacto, incluyendo puerto', () => {
    expect(allowedNavigation('http://172.16.8.73:8087/login', SERVICES[0])).toBe(true);
    for (const url of ['http://172.16.8.73:5678/', 'https://evil.test/', 'javascript:alert(1)', 'file:///secret', 'not a url']) {
      expect(allowedNavigation(url, SERVICES[0])).toBe(false);
    }
  });
  it('permite el login de Microsoft solo a Email Category AI, por HTTPS y origen exacto', () => {
    const email = SERVICES.find(s => s.id === 'emailai')!;
    expect(allowedNavigation('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?x=1', email)).toBe(true);
    expect(allowedNavigation('https://login.live.com/oauth20_authorize.srf', email)).toBe(true);
    for (const url of ['http://login.microsoftonline.com/', 'https://evil.login.microsoftonline.com/', 'https://login.microsoftonline.com.evil.test/', 'https://user:pw@login.microsoftonline.com/']) {
      expect(allowedNavigation(url, email)).toBe(false);
    }
    expect(allowedNavigation('https://login.microsoftonline.com/', SERVICES[0])).toBe(false);
  });
  it('separa las sesiones persistentes y temporales por servicio', () => {
    expect(partitionFor('huly', true)).toBe('persist:amatime-huly');
    expect(partitionFor('huly', false)).toBe('amatime-huly');
    expect(partitionFor('n8n', true)).not.toBe(partitionFor('huly', true));
  });
  it('desactiva privilegios para contenido remoto', () => {
    expect(remotePreferences('huly', true)).toMatchObject({ nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true });
    expect(remotePreferences('huly', true)).not.toHaveProperty('preload');
  });
  it('mantiene el contenido fuera de sidebar y header incluso en ventanas pequeñas', () => {
    expect(contentBounds(1280, 720)).toEqual({ x: 64, y: 52, width: 1216, height: 668 });
    expect(contentBounds(20, 30)).toEqual({ x: 64, y: 52, width: 0, height: 0 });
  });
});
