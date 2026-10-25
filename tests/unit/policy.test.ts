import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../../src/shared/contracts';
import { SERVICES, isAppId, allowedNavigation, allowedDownload, isPdfUrl, partitionFor, contentBounds, remotePreferences, customService, catalogOf, sameServiceOrigin } from '../../src/main/policy';

describe('registro y aislamiento', () => {
  it('registra las siete direcciones reales', () => {
    expect(SERVICES.map(s => s.url)).toEqual([
      'http://172.16.8.73:8087/', 'http://172.16.8.73:5678/',
      'https://172.16.8.73/', 'https://app.amatime.com/',
      'https://email-category-ai.vercel.app/', 'http://172.16.8.73:8080/',
      'https://teams.microsoft.com/v2/',
    ]);
  });
  it('cada servicio pertenece a una categoría válida y cada categoría tiene servicios', () => {
    const ids = CATEGORIES.map(c => c.id);
    for (const service of SERVICES) expect(ids).toContain(service.category);
    for (const id of ids) expect(SERVICES.some(s => s.category === id)).toBe(true);
  });
  it('solo acepta IDs del catálogo vigente, nunca URLs ni propiedades heredadas', () => {
    const app = { id: 'custom-0a1b2c3d-aaaa', name: 'Wiki', url: 'https://wiki.com/' };
    const catalog = catalogOf(SERVICES, [app]);
    expect(catalog).toEqual([...SERVICES, customService(app)]);
    for (const id of ['huly', 'teams', app.id]) expect(isAppId(id, catalog)).toBe(true);
    expect(isAppId(app.id, SERVICES)).toBe(false);
    for (const id of ['constructor', '__proto__', 'http://evil.test', 'custom-ffffffff-0000', null, 1, {}]) expect(isAppId(id, catalog)).toBe(false);
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
    expect(allowedNavigation('https://mysignins.microsoft.com/register', email)).toBe(true);
    for (const url of ['http://login.microsoftonline.com/', 'https://evil.login.microsoftonline.com/', 'https://login.microsoftonline.com.evil.test/', 'https://user:pw@login.microsoftonline.com/']) {
      expect(allowedNavigation(url, email)).toBe(false);
    }
    expect(allowedNavigation('https://login.microsoftonline.com/', SERVICES[0])).toBe(false);
  });
  it('permite descargar solo archivos del mismo origen del servicio', () => {
    const chat = SERVICES.find(s => s.id === 'librechat')!;
    expect(allowedDownload('https://172.16.8.73/pdf-out/abc/PDFs_unidos.pdf', chat)).toBe(true);
    for (const url of ['https://evil.test/a.pdf', 'http://172.16.8.73/a.pdf', 'file:///a.pdf', 'not a url']) {
      expect(allowedDownload(url, chat)).toBe(false);
    }
  });
  it('detecta enlaces a PDF para descargarlos en vez de abrir pestaña', () => {
    expect(isPdfUrl('https://172.16.8.73/pdf-out/abc/PDFs_unidos.pdf?x=1')).toBe(true);
    expect(isPdfUrl('https://172.16.8.73/c/new')).toBe(false);
    expect(isPdfUrl('not a url')).toBe(false);
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
    expect(contentBounds(1280, 720)).toEqual({ x: 64, y: 52, width: 1160, height: 640 });
    expect(contentBounds(20, 30)).toEqual({ x: 64, y: 52, width: 0, height: 0 });
  });
});

describe('Microsoft Teams', () => {
  const teams = SERVICES.find(s => s.id === 'teams')!;
  it('es una app global de Comunicación, con el login de Microsoft declarado', () => {
    expect(teams).toMatchObject({ name: 'Microsoft Teams', shortName: 'Teams', category: 'comunicacion', url: 'https://teams.microsoft.com/v2/' });
    expect(teams.authOrigins).toEqual(['https://login.microsoftonline.com', 'https://login.live.com', 'https://login.microsoft.com', 'https://aadcdn.msauth.net', 'https://aadcdn.msftauth.net']);
  });
  it('navega a Teams, su login y sus sufijos explícitos, solo por https', () => {
    for (const url of ['https://teams.microsoft.com/v2/', 'https://teams.cloud.microsoft/', 'https://eu.teams.microsoft.com/api/x', 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', 'https://login.live.com/oauth20_authorize.srf', 'https://aadcdn.msauth.net/shared/x.js', 'https://www.office.com/', 'https://products.office.com/', 'https://learn.microsoft.com/']) {
      expect(allowedNavigation(url, teams), url).toBe(true);
    }
  });
  it('rechaza hosts que solo se parecen, http, credenciales y esquemas ajenos', () => {
    for (const url of ['http://teams.microsoft.com/', 'https://evil-teams.microsoft.com.attacker.com/', 'https://teams.microsoft.com.attacker.com/', 'https://microsoft.com.evil.test/', 'https://notmicrosoft.com/', 'https://evilteams.cloud.microsoft.evil.test/', 'https://evil-office.com/', 'https://user:pw@teams.microsoft.com/', 'javascript:alert(1)', 'file:///secret', 'not a url']) {
      expect(allowedNavigation(url, teams), url).toBe(false);
    }
  });
  it('los sufijos de Teams no se aplican a otras apps', () => {
    for (const id of ['huly', 'librechat', 'emailai']) expect(allowedNavigation('https://teams.microsoft.com/v2/', SERVICES.find(s => s.id === id)!)).toBe(false);
    expect(allowedNavigation('https://www.office.com/', SERVICES.find(s => s.id === 'emailai')!)).toBe(false);
  });
  it('las descargas siguen limitadas al origen de la app', () => {
    expect(allowedDownload('https://teams.microsoft.com/v2/file.pdf', teams)).toBe(true);
    expect(allowedDownload('https://www.office.com/file.pdf', teams)).toBe(false);
  });
});

describe('páginas del usuario', () => {
  const app = { id: 'custom-0a1b2c3d-aaaa', name: 'Wiki interna', url: 'https://wiki.empresa.com/inicio' };
  const service = customService({ ...app, icon: 'data:image/png;base64,QUJD' });
  it('se describen como una app de la categoría "mine" con su icono', () => {
    expect(service).toMatchObject({ id: app.id, name: 'Wiki interna', shortName: 'Wiki interna', category: 'mine', url: app.url, custom: true, icon: 'data:image/png;base64,QUJD' });
  });
  it('solo navegan dentro de su origen: sin login externo ni sufijos', () => {
    expect(service.authOrigins).toBeUndefined();
    expect(service.hostSuffixes).toBeUndefined();
    expect(allowedNavigation('https://wiki.empresa.com/otra', service)).toBe(true);
    for (const url of ['https://login.microsoftonline.com/', 'https://evil.test/', 'http://wiki.empresa.com/', 'https://sub.wiki.empresa.com/', 'https://u:p@wiki.empresa.com/', 'javascript:alert(1)']) expect(allowedNavigation(url, service), url).toBe(false);
    expect(sameServiceOrigin('https://wiki.empresa.com/x', service)).toBe(true);
    expect(allowedDownload('https://wiki.empresa.com/a.zip', service)).toBe(true);
    expect(allowedDownload('https://cdn.empresa.com/a.zip', service)).toBe(false);
  });
  it('tienen su propia partición, distinta de cualquier otra', () => {
    expect(partitionFor(app.id, true)).toBe('persist:amatime-custom-0a1b2c3d-aaaa');
    expect(partitionFor(app.id, false)).toBe('amatime-custom-0a1b2c3d-aaaa');
    expect(partitionFor(app.id, true)).not.toBe(partitionFor('custom-0a1b2c3d-bbbb', true));
  });
});
