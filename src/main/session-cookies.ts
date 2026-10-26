/** Días que dura una cookie de sesión convertida (como "Continuar donde lo dejaste" de Chrome). */
export const SESSION_COOKIE_DAYS = 30;

type SessionCookie = Pick<Electron.Cookie, 'name' | 'value' | 'path' | 'secure' | 'httpOnly' | 'session' | 'sameSite'> & { domain?: string; hostOnly?: boolean; expirationDate?: number };

/**
 * Cookie de sesión (sin caducidad) reescrita con caducidad: Chromium las borra al cerrar y apps como Buk
 * piden credenciales cada vez. Solo se aplica en particiones persistentes ("recordar sesión"). null = no tocar.
 */
export function persistentCookie(cookie: SessionCookie, nowSeconds: number): Electron.CookiesSetDetails | null {
  if (!cookie.session || !cookie.name || !cookie.domain) return null;
  const host = cookie.domain.replace(/^\./, '');
  const path = cookie.path || '/';
  return {
    url: `${cookie.secure ? 'https' : 'http'}://${host}${path}`,
    name: cookie.name,
    value: cookie.value,
    // Host-only no lleva dominio: con él pasaría a valer para subdominios (y las __Host- se rechazarían).
    ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
    path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    ...(cookie.sameSite === 'lax' || cookie.sameSite === 'strict' || cookie.sameSite === 'no_restriction' ? { sameSite: cookie.sameSite } : {}),
    expirationDate: nowSeconds + SESSION_COOKIE_DAYS * 86400,
  };
}
