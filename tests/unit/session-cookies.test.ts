import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE_DAYS, persistentCookie } from '../../src/main/session-cookies';

const now = Date.UTC(2026, 9, 26) / 1000;
const base = { name: '_buk_session', value: 'abc', domain: 'amatime.buk.cl', hostOnly: true, path: '/', secure: true, httpOnly: true, session: true, sameSite: 'lax' as const };

describe('cookies de sesión en apps con "recordar sesión"', () => {
  it('una cookie de sesión se vuelve a guardar con caducidad de 30 días, conservando sus atributos', () => {
    expect(SESSION_COOKIE_DAYS).toBe(30);
    expect(persistentCookie(base, now)).toEqual({ url: 'https://amatime.buk.cl/', name: '_buk_session', value: 'abc', path: '/', secure: true, httpOnly: true, sameSite: 'lax', expirationDate: now + 30 * 86400 });
  });
  it('cookie de dominio (no host-only) conserva el dominio; http sin secure usa http', () => {
    expect(persistentCookie({ ...base, domain: '.buk.cl', hostOnly: false, secure: false, path: '/app' }, now)).toMatchObject({ url: 'http://buk.cl/app', domain: '.buk.cl', secure: false });
  });
  it('las cookies que ya caducan solas, o sin nombre/dominio, no se tocan', () => {
    expect(persistentCookie({ ...base, session: false, expirationDate: now + 60 }, now)).toBeNull();
    expect(persistentCookie({ ...base, domain: '' }, now)).toBeNull();
    expect(persistentCookie({ ...base, domain: undefined }, now)).toBeNull();
  });
  it('sameSite desconocido no se envía (Electron lo rechazaría)', () => {
    expect(persistentCookie({ ...base, sameSite: 'unspecified' }, now)).not.toHaveProperty('sameSite');
  });
});
