import { describe, expect, it } from 'vitest';
import { validCustomUrl, checkCustomUrl, checkCustomName, validIcon, normalizeCustomApps, MAX_CUSTOM_APPS } from '../../src/shared/custom-apps';
import { fetchFavicon } from '../../src/main/favicon';

describe('validCustomUrl', () => {
  it('acepta https de cualquier host y normaliza a origen + ruta', () => {
    expect(validCustomUrl('https://wiki.ejemplo.com')).toBe('https://wiki.ejemplo.com/');
    expect(validCustomUrl('  https://wiki.ejemplo.com/app/inicio?x=1#frag ')).toBe('https://wiki.ejemplo.com/app/inicio?x=1');
    expect(validCustomUrl('https://WIKI.ejemplo.com:8443/a')).toBe('https://wiki.ejemplo.com:8443/a');
  });
  it('acepta http solo en hosts de red local', () => {
    for (const url of ['http://172.16.8.73:3000/', 'http://172.31.255.1/', 'http://10.0.0.5/', 'http://192.168.1.20:8080/x', 'http://localhost:3000/', 'http://127.0.0.1:9000/custom']) {
      expect(validCustomUrl(url)).not.toBeNull();
    }
  });
  it('rechaza http público o que solo parece local', () => {
    for (const url of ['http://example.com/', 'http://8.8.8.8/', 'http://172.32.0.1/', 'http://172.15.0.1/', 'http://11.0.0.1/', 'http://192.169.0.1/', 'http://10.evil.com/', 'http://192.168.1.1.evil.com/', 'http://localhost.evil.com/']) {
      expect(validCustomUrl(url)).toBeNull();
    }
  });
  it('rechaza credenciales, esquemas no web y entradas inválidas', () => {
    for (const url of ['https://user:pw@example.com/', 'https://user@example.com/', 'javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///C:/secret', 'ftp://example.com/', 'blob:https://example.com/x', 'example.com', '', '   ', 'https://', 'not a url', 'localhost:3000']) {
      expect(validCustomUrl(url), url).toBeNull();
    }
    for (const value of [null, undefined, 3, {}, []]) expect(validCustomUrl(value as unknown as string)).toBeNull();
  });
  it('checkCustomUrl explica el motivo en español', () => {
    expect(checkCustomUrl('https://ok.com/')).toEqual({ url: 'https://ok.com/' });
    expect(checkCustomUrl('example.com')).toEqual({ error: expect.stringContaining('https://') });
    expect(checkCustomUrl('http://example.com/')).toEqual({ error: expect.stringContaining('HTTP') });
    expect(checkCustomUrl('https://u:p@example.com/')).toEqual({ error: expect.stringContaining('usuario') });
    expect(checkCustomUrl('javascript:alert(1)')).toEqual({ error: expect.stringContaining('http') });
  });
});

describe('nombre e icono', () => {
  it('el nombre se recorta y debe tener entre 1 y 40 caracteres', () => {
    expect(checkCustomName('  Wiki interna ')).toEqual({ name: 'Wiki interna' });
    expect(checkCustomName('a'.repeat(40))).toEqual({ name: 'a'.repeat(40) });
    for (const name of ['', '   ', 'a'.repeat(41), null, 3]) expect(checkCustomName(name)).toEqual({ error: expect.any(String) });
  });
  it('el icono solo puede ser un data URL de imagen permitida de hasta 64 KB', () => {
    for (const type of ['png', 'x-icon', 'vnd.microsoft.icon', 'svg+xml']) expect(validIcon(`data:image/${type};base64,QUJD`)).toBe(true);
    for (const icon of ['data:image/jpeg;base64,QUJD', 'data:text/html;base64,QUJD', 'data:image/png,QUJD', 'https://x.com/a.png', 'javascript:alert(1)', 'data:image/png;base64,<script>', '', null, 3]) expect(validIcon(icon)).toBe(false);
    expect(validIcon(`data:image/png;base64,${'A'.repeat(64 * 1024)}`)).toBe(false);
  });
});

describe('normalizeCustomApps', () => {
  const id = 'custom-0a1b2c3d-1111-2222-3333-444455556666';
  const icon = 'data:image/png;base64,QUJD';
  it('conserva entradas válidas y normaliza la URL', () => {
    expect(normalizeCustomApps([{ id, name: ' Wiki ', url: 'https://wiki.com', icon, extra: 1 }])).toEqual([{ id, name: 'Wiki', url: 'https://wiki.com/', icon }]);
  });
  it('descarta forma inválida, ids malos o repetidos, nombres y URLs inválidos', () => {
    const result = normalizeCustomApps([
      { id, name: 'A', url: 'https://a.com/' }, { id, name: 'Dup', url: 'https://dup.com/' },
      { id: 'huly', name: 'Huly', url: 'https://x.com/' }, { id: 'custom-../x', name: 'Mal', url: 'https://x.com/' }, { id: 'custom-UPPER', name: 'Mal', url: 'https://x.com/' },
      { id: 'custom-aaaaaaaa-b', name: '', url: 'https://x.com/' }, { id: 'custom-bbbbbbbb-c', name: 'x'.repeat(41), url: 'https://x.com/' },
      { id: 'custom-cccccccc-d', name: 'Sin url', url: 'javascript:alert(1)' }, { id: 'custom-dddddddd-e', name: 'Pública', url: 'http://example.com/' },
      null, 'x', 3,
    ]);
    expect(result).toEqual([{ id, name: 'A', url: 'https://a.com/' }]);
  });
  it('quita un icono inválido pero conserva la app', () => {
    expect(normalizeCustomApps([{ id, name: 'A', url: 'https://a.com/', icon: 'https://evil/x.png' }])).toEqual([{ id, name: 'A', url: 'https://a.com/' }]);
  });
  it('exige lista y limita a 30', () => {
    expect(normalizeCustomApps('x')).toEqual([]);
    expect(normalizeCustomApps(undefined)).toEqual([]);
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `custom-${String(i).padStart(8, '0')}`, name: `n${i}`, url: 'https://a.com/' }));
    expect(normalizeCustomApps(many)).toHaveLength(MAX_CUSTOM_APPS);
    expect(MAX_CUSTOM_APPS).toBe(30);
  });
});

describe('fetchFavicon', () => {
  const body = (bytes: number[], type: string, init: ResponseInit = {}) => async () => new Response(new Uint8Array(bytes), { headers: { 'content-type': type }, ...init });
  it('pide <origen>/favicon.ico y devuelve un data URL', async () => {
    let requested = '';
    const result = await fetchFavicon('https://wiki.com', async (url) => { requested = String(url); return new Response(new Uint8Array([65, 66, 67]), { headers: { 'content-type': 'image/png' } }); });
    expect(requested).toBe('https://wiki.com/favicon.ico');
    expect(result).toBe('data:image/png;base64,QUJD');
  });
  it('acepta ico con parámetros de content-type y svg', async () => {
    expect(await fetchFavicon('https://a.com', body([65], 'image/x-icon; charset=binary'))).toBe('data:image/x-icon;base64,QQ==');
    expect(await fetchFavicon('https://a.com', body([65], 'image/vnd.microsoft.icon'))).toBe('data:image/vnd.microsoft.icon;base64,QQ==');
    expect(await fetchFavicon('https://a.com', body([65], 'image/svg+xml'))).toBe('data:image/svg+xml;base64,QQ==');
  });
  it('descarta tipos no permitidos, respuestas con error, vacías o demasiado grandes', async () => {
    expect(await fetchFavicon('https://a.com', body([65], 'text/html'))).toBeUndefined();
    expect(await fetchFavicon('https://a.com', body([65], 'image/jpeg'))).toBeUndefined();
    expect(await fetchFavicon('https://a.com', body([65], 'image/png', { status: 404 }))).toBeUndefined();
    expect(await fetchFavicon('https://a.com', body([], 'image/png'))).toBeUndefined();
    expect(await fetchFavicon('https://a.com', body(new Array(60 * 1024).fill(1), 'image/png'))).toBeUndefined();
    expect(await fetchFavicon('https://a.com', async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png', 'content-length': '999999' } }))).toBeUndefined();
  });
  it('nunca lanza: un fallo de red o un tiempo agotado solo significa sin icono', async () => {
    expect(await fetchFavicon('https://a.com', async () => { throw new Error('red'); })).toBeUndefined();
    const hang = (_url: string | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort'))));
    expect(await fetchFavicon('https://a.com', hang, 30)).toBeUndefined();
  });
});
