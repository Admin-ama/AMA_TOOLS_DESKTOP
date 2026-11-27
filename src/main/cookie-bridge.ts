/**
 * Sesión compartida entre dos particiones para un solo host (p. ej. Metabase dentro de AMA IA).
 * La ventana OAuth que abre AMA IA corre en la partición de AMA IA, así que la cookie de login de Metabase
 * se refleja ahí desde la pestaña de Metabase (que manda) y un login hecho en esa ventana vuelve a la pestaña.
 */
export type BridgeCookie = Pick<Electron.Cookie, 'name' | 'value' | 'path' | 'secure' | 'httpOnly' | 'session' | 'sameSite'> & { domain?: string; hostOnly?: boolean; expirationDate?: number };
/** Lo que se usa de session.cookies. */
export interface CookieJar {
  get(filter: { domain: string }): Promise<BridgeCookie[]>;
  set(details: Electron.CookiesSetDetails): Promise<void>;
  remove(url: string, name: string): Promise<void>;
}
export type ChangeCause = 'inserted' | 'inserted-no-change-overwrite' | 'inserted-no-value-change-overwrite' | 'explicit' | 'overwrite' | 'expired' | 'evicted' | 'expired-overwrite';

/** Bajas que solo reemplazan la cookie: enseguida llega el alta con el valor nuevo. */
const REPLACED: ReadonlySet<ChangeCause> = new Set(['overwrite', 'inserted-no-change-overwrite', 'inserted-no-value-change-overwrite']);

const bareDomain = (cookie: BridgeCookie) => (cookie.domain ?? '').replace(/^\./, '').toLowerCase();
const cookieUrl = (cookie: BridgeCookie) => `${cookie.secure ? 'https' : 'http'}://${bareDomain(cookie)}${cookie.path || '/'}`;
/** La cookie se envía a ese host: host-only exacta o de un dominio que lo cubre. */
function forHost(cookie: BridgeCookie, host: string): boolean {
  const domain = bareDomain(cookie);
  if (!domain) return false;
  return cookie.hostOnly ? domain === host : host === domain || host.endsWith(`.${domain}`);
}
const sameScope = (a: BridgeCookie, b: BridgeCookie) => a.name === b.name && bareDomain(a) === bareDomain(b) && !!a.hostOnly === !!b.hostOnly && (a.path || '/') === (b.path || '/');
const sameCookie = (a: BridgeCookie, b: BridgeCookie) => sameScope(a, b) && a.value === b.value && !!a.session === !!b.session;

/** La misma cookie para otra sesión; sin dominio si es host-only (con él valdría para subdominios). */
export function copyDetails(cookie: BridgeCookie): Electron.CookiesSetDetails {
  return {
    url: cookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
    path: cookie.path || '/',
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    ...(cookie.sameSite === 'lax' || cookie.sameSite === 'strict' || cookie.sameSite === 'no_restriction' ? { sameSite: cookie.sameSite } : {}),
    ...(cookie.session || cookie.expirationDate === undefined ? {} : { expirationDate: cookie.expirationDate }),
  };
}

/** Deja en `to` exactamente las cookies del host que tiene `from`; el resto de `to` no se toca. */
export async function syncHost(from: CookieJar, to: CookieJar, host: string): Promise<void> {
  const source = (await from.get({ domain: host })).filter(cookie => forHost(cookie, host));
  const target = (await to.get({ domain: host })).filter(cookie => forHost(cookie, host));
  for (const cookie of target) if (!source.some(item => sameScope(item, cookie))) await to.remove(cookieUrl(cookie), cookie.name);
  for (const cookie of source) if (!target.some(item => sameCookie(item, cookie))) await to.set(copyDetails(cookie));
}

/**
 * Refleja en `to` un cambio de una cookie del host. Con `removals` false solo se copian altas:
 * el login hecho en la ventana OAuth llega a la pestaña, pero borrar la sesión de AMA IA no cierra la de Metabase.
 * Lo que `to` ya tiene igual no se reescribe: así el reflejo de vuelta no rebota sin fin.
 */
export async function mirrorChange(to: CookieJar, host: string, cookie: BridgeCookie, cause: ChangeCause, removed: boolean, removals: boolean): Promise<'set' | 'removed' | 'skip'> {
  if (!forHost(cookie, host)) return 'skip';
  if (removed) {
    if (!removals || REPLACED.has(cause)) return 'skip';
    await to.remove(cookieUrl(cookie), cookie.name);
    return 'removed';
  }
  if ((await to.get({ domain: host })).some(item => sameCookie(item, cookie))) return 'skip';
  await to.set(copyDetails(cookie));
  return 'set';
}
