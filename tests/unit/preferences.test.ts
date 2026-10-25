import { describe, expect, it } from 'vitest';
import { normalizePreferences } from '../../src/main/preferences';
import { assetPath } from '../../src/main/assets';
import path from 'node:path';

describe('preferencias sin secretos', () => {
  it('usa tema oscuro y particiones persistentes por defecto', () => {
    expect(normalizePreferences(null)).toEqual({ theme: 'dark', remember: { huly: true, n8n: true, librechat: true, portal: true, emailai: true, stirling: true, teams: true }, pinned: ['librechat', 'portal', 'huly', 'n8n', 'emailai', 'stirling'], desktopApps: [], customApps: [], splitRatio: 0.38, splitService: 'librechat' });
  });
  it('acepta solo valores booleanos y temas conocidos', () => {
    expect(normalizePreferences({ theme: 'light', remember: { huly: false, n8n: 'false' }, password: 'secret' })).toEqual({ theme: 'light', remember: { huly: false, n8n: true, librechat: true, portal: true, emailai: true, stirling: true, teams: true }, pinned: ['librechat', 'portal', 'huly', 'n8n', 'emailai', 'stirling'], desktopApps: [], customApps: [], splitRatio: 0.38, splitService: 'librechat' });
    expect(normalizePreferences({ theme: 'injected' }).theme).toBe('dark');
  });
  it('filtra apps fijadas inválidas y duplicadas, conservando el orden', () => {
    expect(normalizePreferences({ pinned: ['stirling', 'huly', 'stirling', 'evil', 3, 'constructor'] }).pinned).toEqual(['stirling', 'huly']);
  });
  it('permite no fijar ninguna app y cae al valor por defecto si el campo no es una lista', () => {
    expect(normalizePreferences({ pinned: [] }).pinned).toEqual([]);
    expect(normalizePreferences({ pinned: 'huly' }).pinned).toEqual(['librechat', 'portal', 'huly', 'n8n', 'emailai', 'stirling']);
  });
});

describe('vista dividida en preferencias', () => {
  it('conserva ratio y servicio válidos', () => {
    const result = normalizePreferences({ splitRatio: 0.5, splitService: 'n8n' });
    expect(result.splitRatio).toBe(0.5);
    expect(result.splitService).toBe('n8n');
  });
  it('vuelve al valor por defecto si son inválidos', () => {
    for (const splitRatio of [NaN, Infinity, -1, 0, 1, 5, '0.5', null, undefined, {}]) expect(normalizePreferences({ splitRatio }).splitRatio).toBe(0.38);
    for (const splitService of ['evil', 3, null, undefined, 'constructor']) expect(normalizePreferences({ splitService }).splitService).toBe('librechat');
  });
  it('acota el ratio a un rango razonable', () => {
    expect(normalizePreferences({ splitRatio: 0.01 }).splitRatio).toBe(0.1);
    expect(normalizePreferences({ splitRatio: 0.99 }).splitRatio).toBe(0.9);
  });
});

describe('apps de escritorio en preferencias', () => {
  const abs = 'C:\\Tools\\a.exe';
  it('arranca vacío', () => { expect(normalizePreferences(null).desktopApps).toEqual([]); });
  it('conserva entradas válidas y descarta forma inválida, rutas relativas y ids repetidos', () => {
    const result = normalizePreferences({ desktopApps: [
      { id: 'a', name: ' Excel ', path: abs, extra: 'x' }, { id: 'a', name: 'Dup', path: abs },
      { id: '', name: 'Sin id', path: abs }, { id: 'b', name: '', path: abs }, { id: 'c', name: 'Rel', path: 'a.exe' },
      { id: 'd', name: 'Num', path: 3 }, null, 'x',
    ] }).desktopApps;
    expect(result).toEqual([{ id: 'a', name: 'Excel', kind: 'path', path: abs }]);
  });
  it('migra entradas antiguas (sin kind) a kind path y valida las de kind aumid', () => {
    const aumid = 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App';
    const result = normalizePreferences({ desktopApps: [
      { id: 'old', name: 'Viejo', path: abs },
      { id: 'p', name: 'Ruta', kind: 'path', path: abs, aumid: 'ignorado' },
      { id: 'store', name: 'Calculadora', kind: 'aumid', aumid, path: abs },
      { id: 'bad1', name: 'Inyección', kind: 'aumid', aumid: 'foo;calc' },
      { id: 'bad2', name: 'Sin aumid', kind: 'aumid' },
      { id: 'bad3', name: 'Kind raro', kind: 'shell', path: abs },
      { id: 'bad4', name: 'Ruta como aumid', kind: 'aumid', aumid: abs },
    ] }).desktopApps;
    expect(result).toEqual([{ id: 'old', name: 'Viejo', kind: 'path', path: abs }, { id: 'p', name: 'Ruta', kind: 'path', path: abs }, { id: 'store', name: 'Calculadora', kind: 'aumid', aumid }]);
  });
  it('limita a 20 apps y exige lista', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, name: `n${i}`, path: abs }));
    expect(normalizePreferences({ desktopApps: many }).desktopApps).toHaveLength(20);
    expect(normalizePreferences({ desktopApps: 'x' }).desktopApps).toEqual([]);
  });
});

describe('páginas del usuario en preferencias', () => {
  const id = 'custom-0a1b2c3d-1111-2222-3333-444455556666';
  const app = { id, name: 'Wiki', url: 'https://wiki.com/' };
  it('arrancan vacías y conservan las válidas', () => {
    expect(normalizePreferences(null).customApps).toEqual([]);
    expect(normalizePreferences({ customApps: [{ ...app, url: 'https://wiki.com' }, { id: 'huly', name: 'x', url: 'https://x.com/' }] }).customApps).toEqual([app]);
  });
  it('cada app propia tiene su preferencia de recordar sesión (por defecto sí)', () => {
    expect(normalizePreferences({ customApps: [app] }).remember[id]).toBe(true);
    expect(normalizePreferences({ customApps: [app], remember: { [id]: false } }).remember[id]).toBe(false);
  });
  it('fijadas y panel lateral aceptan ids propios existentes', () => {
    const result = normalizePreferences({ customApps: [app], pinned: ['huly', id], splitService: id });
    expect(result.pinned).toEqual(['huly', id]);
    expect(result.splitService).toBe(id);
  });
  it('descarta ids desconocidos (también custom borradas) en fijadas, recordar y panel lateral', () => {
    const ghost = 'custom-ffffffff-0000-0000-0000-000000000000';
    const result = normalizePreferences({ customApps: [app], pinned: [ghost, id, 'evil'], remember: { [ghost]: false, [id]: false, evil: false }, splitService: ghost });
    expect(result.pinned).toEqual([id]);
    expect(Object.keys(result.remember)).toEqual(['huly', 'n8n', 'librechat', 'portal', 'emailai', 'stirling', 'teams', id]);
    expect(result.splitService).toBe('librechat');
  });
  it('Teams es una app global: se puede fijar y recordar', () => {
    expect(normalizePreferences({ pinned: ['teams'], remember: { teams: false } })).toMatchObject({ pinned: ['teams'], remember: { teams: false } });
    expect(normalizePreferences({ splitService: 'teams' }).splitService).toBe('teams');
  });
});

describe('recursos del shell', () => {
  const root = path.resolve('dist/renderer');
  it('resuelve solamente recursos locales del host bundle', () => {
    expect(assetPath('app://bundle/index.html', root)).toBe(path.join(root, 'index.html'));
    expect(assetPath('app://bundle/assets/main.css', root)).toBe(path.join(root, 'assets/main.css'));
  });
  it('rechaza host ajeno, protocolo ajeno y traversal codificado', () => {
    for (const url of ['app://evil/index.html', 'https://bundle/index.html', 'app://bundle/%2e%2e%2fsecret', 'app://bundle/%2e%2e%5csecret', 'app://bundle/%00', 'app://bundle/C:%5csecret']) {
      expect(assetPath(url, root)).toBeNull();
    }
  });
});
