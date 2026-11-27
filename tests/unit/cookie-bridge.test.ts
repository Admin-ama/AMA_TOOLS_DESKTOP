import { describe, expect, it } from 'vitest';
import { copyDetails, mirrorChange, syncHost, type BridgeCookie, type CookieJar } from '../../src/main/cookie-bridge';

const METABASE = 'metabase.172.16.8.73.sslip.io';

/** Jar en memoria con la semántica mínima de session.cookies (get por dominio, set reemplaza, remove por url + nombre). */
class FakeJar implements CookieJar {
  cookies: BridgeCookie[] = [];
  constructor(initial: BridgeCookie[] = []) { this.cookies = [...initial]; }
  async get(filter: { domain: string }) {
    return this.cookies.filter(cookie => { const domain = cookie.domain!.replace(/^\./, ''); return domain === filter.domain || domain.endsWith(`.${filter.domain}`); });
  }
  async set(details: Electron.CookiesSetDetails) {
    const host = new URL(details.url).hostname;
    const cookie: BridgeCookie = {
      name: details.name!, value: details.value!, domain: details.domain ?? host, hostOnly: !details.domain, path: details.path ?? '/',
      secure: !!details.secure, httpOnly: !!details.httpOnly, session: details.expirationDate === undefined, sameSite: details.sameSite ?? 'unspecified',
      ...(details.expirationDate === undefined ? {} : { expirationDate: details.expirationDate }),
    };
    this.cookies = this.cookies.filter(item => !(item.name === cookie.name && item.domain === cookie.domain && item.path === cookie.path));
    this.cookies.push(cookie);
  }
  async remove(url: string, name: string) {
    const host = new URL(url).hostname;
    this.cookies = this.cookies.filter(item => !(item.name === name && item.domain!.replace(/^\./, '') === host));
  }
}
const cookie = (overrides: Partial<BridgeCookie> = {}): BridgeCookie => ({ name: 'metabase.SESSION', value: 'cuenta-a', domain: METABASE, hostOnly: true, path: '/', secure: false, httpOnly: true, session: false, expirationDate: 2_000_000_000, sameSite: 'lax', ...overrides });
const libreChatOwn = cookie({ name: 'refreshToken', value: 'lc', domain: '172.16.8.73', secure: true });

describe('copia de una cookie a otra sesión', () => {
  it('conserva host-only, caducidad y atributos; la de sesión sigue siendo de sesión', () => {
    expect(copyDetails(cookie())).toEqual({ url: `http://${METABASE}/`, name: 'metabase.SESSION', value: 'cuenta-a', path: '/', secure: false, httpOnly: true, sameSite: 'lax', expirationDate: 2_000_000_000 });
    expect(copyDetails(cookie({ session: true, expirationDate: undefined, sameSite: 'unspecified' }))).toEqual({ url: `http://${METABASE}/`, name: 'metabase.SESSION', value: 'cuenta-a', path: '/', secure: false, httpOnly: true });
    expect(copyDetails(cookie({ hostOnly: false, domain: `.${METABASE}`, secure: true, path: '/api' }))).toMatchObject({ url: `https://${METABASE}/api`, domain: `.${METABASE}`, path: '/api' });
  });
});

describe('sincronización inicial: la pestaña de Metabase manda', () => {
  it('deja en AMA IA la cuenta de la pestaña y no toca las cookies propias de AMA IA', async () => {
    const tab = new FakeJar([cookie({ value: 'cuenta-b' })]);
    const chat = new FakeJar([cookie({ value: 'cuenta-a' }), libreChatOwn]);
    await syncHost(tab, chat, METABASE);
    expect(chat.cookies.find(item => item.name === 'metabase.SESSION')!.value).toBe('cuenta-b');
    expect(chat.cookies).toContainEqual(libreChatOwn);
  });
  it('si la pestaña no tiene sesión, AMA IA tampoco: el login OAuth vuelve a pedir usuario', async () => {
    const chat = new FakeJar([cookie(), libreChatOwn]);
    await syncHost(new FakeJar(), chat, METABASE);
    expect(chat.cookies).toEqual([libreChatOwn]);
  });
});

describe('cambios en vivo', () => {
  it('pestaña → AMA IA: altas y bajas reales (cerrar sesión en Metabase llega como expired-overwrite)', async () => {
    const chat = new FakeJar([libreChatOwn]);
    expect(await mirrorChange(chat, METABASE, cookie(), 'inserted', false, true)).toBe('set');
    expect(chat.cookies.find(item => item.name === 'metabase.SESSION')!.value).toBe('cuenta-a');
    expect(await mirrorChange(chat, METABASE, cookie(), 'expired-overwrite', true, true)).toBe('removed');
    expect(chat.cookies).toEqual([libreChatOwn]);
  });
  it('un reemplazo no es una baja: después llega el alta', async () => {
    const chat = new FakeJar([cookie()]);
    for (const cause of ['overwrite', 'inserted-no-change-overwrite', 'inserted-no-value-change-overwrite'] as const) expect(await mirrorChange(chat, METABASE, cookie(), cause, true, true), cause).toBe('skip');
    expect(chat.cookies).toHaveLength(1);
  });
  it('login en la ventana OAuth → pestaña: solo altas; borrar la sesión de AMA IA no cierra la de Metabase', async () => {
    const tab = new FakeJar();
    expect(await mirrorChange(tab, METABASE, cookie(), 'inserted', false, false)).toBe('set');
    expect(await mirrorChange(tab, METABASE, cookie(), 'explicit', true, false)).toBe('skip');
    expect(tab.cookies).toHaveLength(1);
  });
  it('ignora cookies de otros hosts y lo que el destino ya tiene (sin rebote infinito)', async () => {
    const tab = new FakeJar([cookie()]);
    expect(await mirrorChange(tab, METABASE, libreChatOwn, 'inserted', false, false)).toBe('skip');
    expect(await mirrorChange(tab, METABASE, cookie({ domain: 'evil.metabase.172.16.8.73.sslip.io.test' }), 'inserted', false, false)).toBe('skip');
    expect(await mirrorChange(tab, METABASE, cookie(), 'inserted', false, false)).toBe('skip');
    expect(tab.cookies).toEqual([cookie()]);
  });
  it('la cookie de sesión reescrita con caducidad (recordar sesión) se vuelve a copiar', async () => {
    const tab = new FakeJar([cookie({ session: true, expirationDate: undefined })]);
    expect(await mirrorChange(tab, METABASE, cookie(), 'inserted', false, false)).toBe('set');
    expect(tab.cookies).toEqual([cookie()]);
  });
});
