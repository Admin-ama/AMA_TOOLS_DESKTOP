import { describe, expect, it } from 'vitest';
import { CATEGORIES, FIXED_APPS, GLOBAL_APP_IDS } from '../../src/shared/contracts';
import { SERVICES, isAuthPopup, validAdmin, accessRequestUrl, isAppId, allowedNavigation, allowedDownload, isPdfUrl, partitionFor, contentBounds, remotePreferences, customService, catalogOf, sameServiceOrigin, groupMembers, windowTarget } from '../../src/main/policy';

describe('registro y aislamiento', () => {
  it('registra las direcciones reales', () => {
    expect(SERVICES.map(s => s.url)).toEqual([
      'http://172.16.8.73:8087/', 'https://172.16.8.73:5443/',
      'https://172.16.8.73/', 'https://app.amatime.com/',
      'https://email-category-ai.vercel.app/', 'http://172.16.8.73:8080/',
      'https://teams.microsoft.com/v2/',
      'https://m365.cloud.microsoft/', 'https://outlook.office.com/mail/', 'https://amatime.sharepoint.com/',
      'https://make.powerautomate.com/', 'https://forms.office.com/', 'https://julio-sepulveda-costeo-bulk-copacki.vercel.app/', 'https://amatime.buk.cl/users/sign_in'
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
  it('permite descargar archivos del mismo origen del servicio', () => {
    const chat = SERVICES.find(s => s.id === 'librechat')!;
    expect(allowedDownload('https://172.16.8.73/pdf-out/abc/PDFs_unidos.pdf', chat)).toBe(true);
    for (const url of ['https://evil.test/a.pdf', 'file:///a.pdf', 'not a url', 'javascript:alert(1)']) {
      expect(allowedDownload(url, chat), url).toBe(false);
    }
  });
  it('permite descargar lo que genera la propia página (blob del mismo origen y data:), p. ej. exportar en LibreChat o n8n', () => {
    const chat = SERVICES.find(s => s.id === 'librechat')!, n8n = SERVICES.find(s => s.id === 'n8n')!, portal = SERVICES.find(s => s.id === 'portal')!;
    expect(allowedDownload('blob:https://172.16.8.73/0f1e2d3c-aaaa-bbbb-cccc-000000000000', chat)).toBe(true);
    expect(allowedDownload('blob:https://172.16.8.73:5443/0f1e2d3c', n8n)).toBe(true);
    expect(allowedDownload('blob:https://app.amatime.com/0f1e2d3c', portal)).toBe(true);
    expect(allowedDownload('data:application/json;base64,e30=', n8n)).toBe(true);
    for (const url of ['blob:https://evil.test/0f1e', 'blob:null/0f1e', 'blob:not a url']) expect(allowedDownload(url, portal), url).toBe(false);
  });
  it('las apps de la red interna descargan de cualquier servidor 172.16.8.x; las externas no', () => {
    const chat = SERVICES.find(s => s.id === 'librechat')!, portal = SERVICES.find(s => s.id === 'portal')!;
    for (const url of ['http://172.16.8.73/a.pdf', 'https://172.16.8.20:8443/export.xlsx', 'http://172.16.8.5/files/x.zip']) expect(allowedDownload(url, chat), url).toBe(true);
    for (const url of ['http://172.16.9.5/a.pdf', 'https://user:pw@172.16.8.20/a.pdf', 'https://172.16.8.73.evil.test/a.pdf']) expect(allowedDownload(url, chat), url).toBe(false);
    expect(allowedDownload('https://172.16.8.20/a.pdf', portal)).toBe(false);
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
  it('es una app global de Comunicación del grupo Microsoft', () => {
    expect(teams).toMatchObject({ name: 'Microsoft Teams', shortName: 'Teams', category: 'comunicacion', url: 'https://teams.microsoft.com/v2/', group: 'microsoft' });
  });
  it('las descargas siguen limitadas al origen de la app o al grupo', () => {
    expect(allowedDownload('https://teams.microsoft.com/v2/file.pdf', teams)).toBe(true);
    expect(allowedDownload('https://evil.test/file.pdf', teams)).toBe(false);
  });
});

describe('catálogo de Microsoft 365', () => {
  const byId = (id: string) => SERVICES.find(s => s.id === id)!;
  const added = [
    ['copilot', 'Copilot M365', 'Copilot', 'control', 'https://m365.cloud.microsoft/'],
    ['outlook', 'Outlook', 'Outlook', 'comunicacion', 'https://outlook.office.com/mail/'],
    ['sharepoint', 'SharePoint', 'SharePoint', 'operacion', 'https://amatime.sharepoint.com/'],
    ['powerautomate', 'Power Automate', 'Power Automate', 'automatizacion', 'https://make.powerautomate.com/'],
    ['forms', 'Microsoft Forms', 'Forms', 'automatizacion', 'https://forms.office.com/'],
  ] as const;
  it('incluye las apps nuevas con su categoría y url', () => {
    for (const [id, name, shortName, category, url] of added) expect(byId(id), id).toMatchObject({ name, shortName, category, url, group: 'microsoft' });
  });
  it('dentro de su categoría respeta el orden pedido', () => {
    const order = (category: string) => SERVICES.filter(s => s.category === category).map(s => s.id);
    expect(order('control')).toEqual(['librechat', 'copilot', 'buk']);
    expect(order('comunicacion')).toEqual(['teams', 'outlook']);
    expect(order('operacion')).toEqual(['huly', 'sharepoint']);
    expect(order('amatime')).toEqual(['portal', 'costeador']);
  });
  it('GLOBAL_APP_IDS coincide con el catálogo', () => { expect([...GLOBAL_APP_IDS]).toEqual(SERVICES.map(s => s.id)); });
  it('el grupo Microsoft son exactamente Teams y las apps nuevas; LibreChat, Copilot y Buk son fijas', () => {
    expect(groupMembers('outlook', SERVICES).map(s => s.id).sort()).toEqual(['copilot', 'forms', 'outlook', 'powerautomate', 'sharepoint', 'teams']);
    expect(groupMembers('huly', SERVICES)).toEqual([SERVICES.find(s => s.id === 'huly')]);
    expect(FIXED_APPS).toEqual(['librechat', 'copilot', 'buk']);
  });
  it('comparten una única partición persistente; el resto, la suya', () => {
    for (const s of SERVICES.filter(x => x.group)) expect(partitionFor(s.id, true, s.group)).toBe('persist:amatime-microsoft');
    expect(partitionFor('outlook', false, 'microsoft')).toBe('amatime-microsoft');
    expect(partitionFor('huly', true, undefined)).toBe('persist:amatime-huly');
    expect(remotePreferences('forms', true, 'microsoft').partition).toBe('persist:amatime-microsoft');
  });
});

describe('navegación del grupo Microsoft', () => {
  const members = SERVICES.filter(s => s.group === 'microsoft');
  const allowed = [
    'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', 'https://login.microsoft.com/', 'https://login.live.com/oauth20_authorize.srf',
    'https://aadcdn.msauth.net/shared/x.js', 'https://aadcdn.msftauth.net/x.js', 'https://a.b.msauth.net/', 'https://x.msftauth.net/',
    'https://teams.microsoft.com/v2/', 'https://eu.teams.microsoft.com/api/x', 'https://teams.cloud.microsoft/', 'https://m365.cloud.microsoft/chat', 'https://forms.cloud.microsoft/',
    'https://www.office.com/', 'https://outlook.office.com/mail/', 'https://x.office.net/', 'https://word-edit.officeapps.live.com/we/wordeditorframe.aspx',
    'https://www.microsoft365.com/', 'https://outlook.office365.com/owa/', 'https://amatime.sharepoint.com/sites/x', 'https://amatime-my.sharepoint.com/personal/u',
    'https://make.powerautomate.com/', 'https://us.powerautomate.com/', 'https://make.powerapps.com/', 'https://x.powerplatform.com/', 'https://flow.microsoft.com/',
    'https://forms.office.com/Pages/x', 'https://learn.microsoft.com/',
  ];
  const rejected = [
    'http://outlook.office.com/', 'https://evil-office.com/', 'https://office.com.attacker.net/', 'https://notmicrosoft.com/', 'https://microsoft.com.evil.test/', 'https://evilmsauth.net/',
    'https://othertenant.sharepoint.com/', 'https://amatime.sharepoint.com.evil.test/', 'https://evil-amatime.sharepoint.com/', 'https://sharepoint.com/', 'https://amatime-my.sharepoint.com.evil.test/',
    'https://user:pw@outlook.office.com/', 'https://evil.test/', 'javascript:alert(1)', 'file:///secret', 'not a url',
  ];
  it('todo miembro navega a los destinos permitidos por https', () => {
    for (const member of members) for (const url of allowed) expect(allowedNavigation(url, member), `${member.id} ${url}`).toBe(true);
  });
  it('rechaza hosts parecidos, otros tenants de SharePoint, http, credenciales y esquemas ajenos', () => {
    for (const member of members) for (const url of rejected) expect(allowedNavigation(url, member), `${member.id} ${url}`).toBe(false);
  });
  it('la lista del grupo no se aplica a otras apps', () => {
    for (const id of ['huly', 'librechat', 'emailai']) for (const url of ['https://teams.microsoft.com/v2/', 'https://outlook.office.com/', 'https://amatime.sharepoint.com/']) expect(allowedNavigation(url, SERVICES.find(s => s.id === id)!), `${id} ${url}`).toBe(false);
  });
  it('descarga archivos de destinos permitidos del grupo, no de otros', () => {
    const outlook = SERVICES.find(s => s.id === 'outlook')!;
    expect(allowedDownload('https://amatime.sharepoint.com/sites/x/_layouts/15/download.aspx?id=1', outlook)).toBe(true);
    expect(allowedDownload('https://outlook.office.com/owa/attachment.ashx', outlook)).toBe(true);
    for (const url of ['https://othertenant.sharepoint.com/a.zip', 'http://outlook.office.com/a.zip', 'https://evil.test/a.zip']) expect(allowedDownload(url, outlook), url).toBe(false);
    expect(allowedDownload('https://amatime.sharepoint.com/a.zip', SERVICES.find(s => s.id === 'huly')!)).toBe(false);
  });
});

describe('ventanas nuevas dentro del grupo Microsoft', () => {
  const source = (id: string) => SERVICES.find(s => s.id === id)!;
  it('un enlace al origen de otro miembro abre una pestaña de ese miembro', () => {
    expect(windowTarget('https://amatime.sharepoint.com/:w:/r/sites/x/doc.docx', source('outlook'), SERVICES)).toBe('sharepoint');
    expect(windowTarget('https://forms.office.com/r/abc', source('teams'), SERVICES)).toBe('forms');
    expect(windowTarget('https://teams.microsoft.com/l/meetup-join/x', source('outlook'), SERVICES)).toBe('teams');
  });
  it('sin origen exacto elige el miembro con el dominio más parecido', () => {
    expect(windowTarget('https://www.office.com/launch/word', source('sharepoint'), SERVICES)).toBe('outlook');
    expect(windowTarget('https://amatime-my.sharepoint.com/personal/u', source('outlook'), SERVICES)).toBe('sharepoint');
  });
  it('si ninguno encaja, o hay empate con el origen, se queda en la misma app', () => {
    expect(windowTarget('https://word-edit.officeapps.live.com/we/x', source('sharepoint'), SERVICES)).toBe('sharepoint');
    expect(windowTarget('https://amatime.sharepoint.com/x', source('sharepoint'), SERVICES)).toBe('sharepoint');
    expect(windowTarget('https://login.live.com/x', source('copilot'), SERVICES)).toBe('copilot');
  });
  it('un destino no permitido no abre nada; fuera del grupo solo el mismo origen', () => {
    expect(windowTarget('https://evil.test/', source('outlook'), SERVICES)).toBeNull();
    expect(windowTarget('https://othertenant.sharepoint.com/', source('outlook'), SERVICES)).toBeNull();
    expect(windowTarget('https://172.16.8.73:8087/x', source('huly'), SERVICES)).toBeNull();
    expect(windowTarget('http://172.16.8.73:8087/x', source('huly'), SERVICES)).toBe('huly');
  });
  it('con todos los miembros en el mismo origen (e2e) gana la app de origen', () => {
    const same = SERVICES.map(s => s.group ? { ...s, url: 'http://127.0.0.1:9/' + s.id } : s);
    expect(windowTarget('http://127.0.0.1:9/x', same.find(s => s.id === 'forms')!, same)).toBe('forms');
  });
});

describe('páginas del usuario', () => {
  const app = { id: 'custom-0a1b2c3d-aaaa', name: 'Wiki interna', url: 'https://wiki.empresa.com/inicio' };
  const service = customService({ ...app, icon: 'data:image/png;base64,QUJD' });
  it('se describen como una app de la categoría "mine" con su icono', () => {
    expect(service).toMatchObject({ id: app.id, name: 'Wiki interna', shortName: 'Wiki interna', category: 'mine', url: app.url, custom: true, icon: 'data:image/png;base64,QUJD' });
  });
  it('solo navegan dentro de su origen: sin login externo ni grupo', () => {
    expect(service.authOrigins).toBeUndefined();
    expect(service.group).toBeUndefined();
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

describe('n8n (https en el puerto 5443)', () => {
  const n8n = () => SERVICES.find(service => service.id === 'n8n')!;
  it('usa la URL https nueva', () => { expect(n8n().url).toBe('https://172.16.8.73:5443/'); });
  it('puede ir al login de Microsoft para conectar credenciales OAuth (Outlook, SharePoint…) y volver', () => {
    for (const url of ['https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=x', 'https://login.live.com/oauth20_authorize.srf', 'https://172.16.8.73:5443/rest/oauth2-credential/callback?code=x']) expect(allowedNavigation(url, n8n()), url).toBe(true);
    for (const url of ['http://login.microsoftonline.com/', 'https://login.microsoftonline.com.evil.test/', 'https://evil.test/', 'http://172.16.8.73:5678/']) expect(allowedNavigation(url, n8n()), url).toBe(false);
  });
});

describe('ventanas emergentes de login (OAuth)', () => {
  const n8n = SERVICES.find(service => service.id === 'n8n')!, emailai = SERVICES.find(service => service.id === 'emailai')!, huly = SERVICES.find(service => service.id === 'huly')!;
  it('se abren como ventana real (con opener) solo hacia un origen de login declarado por la app', () => {
    expect(isAuthPopup('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=x', n8n)).toBe(true);
    expect(isAuthPopup('https://login.microsoftonline.com/x', emailai)).toBe(true);
  });
  it('el resto sigue el camino normal (pestaña o bloqueo)', () => {
    for (const url of ['https://172.16.8.73:5443/workflow/1', 'http://login.microsoftonline.com/x', 'https://login.microsoftonline.com.evil.test/x', 'https://user:pw@login.microsoftonline.com/x', 'https://evil.test/', 'javascript:alert(1)', 'not a url']) expect(isAuthPopup(url, n8n), url).toBe(false);
    expect(isAuthPopup('https://login.microsoftonline.com/x', huly)).toBe(false);
  });
});

describe('AMA IA (LibreChat)', () => {
  it('se muestra como AMA IA sin cambiar su id ni su dirección', () => {
    expect(SERVICES.find(service => service.id === 'librechat')).toMatchObject({ name: 'AMA IA', shortName: 'AMA IA', url: 'https://172.16.8.73/' });
  });
});

describe('Buk (RRHH)', () => {
  it('es una app web de Control (pegada bajo Copilot) con su login de Amatime, sin grupo ni administrador', () => {
    expect(SERVICES.find(service => service.id === 'buk')).toEqual({ id: 'buk', name: 'Buk', shortName: 'Buk', category: 'control', url: 'https://amatime.buk.cl/users/sign_in' });
    expect(GLOBAL_APP_IDS).toContain('buk');
  });
});

describe('Apps Amatime (internas, con administrador)', () => {
  it('tienen su categoría justo después de Control con el Portal y el Costeador', () => {
    expect(CATEGORIES.map(category => category.id).slice(0, 2)).toEqual(['control', 'amatime']);
    expect(CATEGORIES.find(category => category.id === 'amatime')!.label).toBe('Apps Amatime');
    expect(SERVICES.find(service => service.id === 'costeador')).toMatchObject({ name: 'Costeador', category: 'amatime', url: 'https://julio-sepulveda-costeo-bulk-copacki.vercel.app/' });
    expect(SERVICES.find(service => service.id === 'portal')).toMatchObject({ category: 'amatime' });
    expect(GLOBAL_APP_IDS).toContain('costeador');
    expect(SERVICES.find(service => service.id === 'costeador')!.admin).toEqual({ name: 'Julio Sepúlveda', email: 'jsepulveda@amatime.com' });
    // El Portal es de AMA: sin administrador individual.
    expect(SERVICES.find(service => service.id === 'portal')!.admin).toBeUndefined();
  });
  it('solo las Apps Amatime declaran administrador, siempre con nombre y correo válidos', () => {
    for (const service of SERVICES.filter(service => service.admin)) {
      expect(service.category).toBe('amatime');
      expect(validAdmin(service.admin)).toBe(true);
    }
  });
  it('valida el administrador: nombre corto y correo simple, sin parámetros escondidos', () => {
    expect(validAdmin({ name: 'Julio Sepúlveda', email: 'jsepulveda@amatime.com' })).toBe(true);
    for (const admin of [{ name: '', email: 'a@b.cl' }, { name: 'X', email: 'no-es-correo' }, { name: 'X', email: 'a@b.cl?cc=evil@x.com' }, { name: 'X', email: 'a b@c.cl' }, { name: 'x'.repeat(61), email: 'a@b.cl' }, null, 'a@b.cl']) expect(validAdmin(admin as never)).toBe(false);
  });
  it('arma el chat de Teams con el administrador y un mensaje ya escrito', () => {
    const url = new URL(accessRequestUrl({ name: 'Julio Sepúlveda', email: 'jsepulveda@amatime.com' }, 'Costeador'));
    expect(url.origin + url.pathname).toBe('https://teams.microsoft.com/l/chat/0/0');
    expect(url.searchParams.get('users')).toBe('jsepulveda@amatime.com');
    expect(url.searchParams.get('message')).toBe('Hola Julio, quiero solicitar acceso a Costeador.');
    expect(() => accessRequestUrl({ name: 'X', email: 'a@b.cl?x=1' }, 'Costeador')).toThrow();
  });
});
