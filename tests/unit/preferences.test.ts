import { describe, expect, it } from 'vitest';
import { normalizePreferences, reorderPinned } from '../../src/main/preferences';
import { assetPath } from '../../src/main/assets';
import path from 'node:path';

describe('preferencias sin secretos', () => {
  it('usa tema oscuro y particiones persistentes por defecto', () => {
    expect(normalizePreferences(null)).toEqual({ theme: 'dark', remember: { huly: true, n8n: true, librechat: true, portal: true, emailai: true, stirling: true, teams: true, copilot: true, outlook: true, sharepoint: true, powerautomate: true, forms: true, costeador: true, buk: true }, pinned: ['librechat', 'copilot', 'buk', 'portal', 'huly', 'n8n', 'emailai', 'stirling'], desktopApps: [], customApps: [], splitRatio: 0.38, splitService: 'librechat' });
  });
  it('acepta solo valores booleanos y temas conocidos', () => {
    expect(normalizePreferences({ theme: 'light', remember: { huly: false, n8n: 'false' }, password: 'secret' })).toEqual({ theme: 'light', remember: { ...{ huly: true, n8n: true, librechat: true, portal: true, emailai: true, stirling: true, teams: true, copilot: true, outlook: true, sharepoint: true, powerautomate: true, forms: true, costeador: true, buk: true }, huly: false }, pinned: ['librechat', 'copilot', 'buk', 'portal', 'huly', 'n8n', 'emailai', 'stirling'], desktopApps: [], customApps: [], splitRatio: 0.38, splitService: 'librechat' });
    expect(normalizePreferences({ theme: 'injected' }).theme).toBe('dark');
  });
  it('filtra apps fijadas inválidas y duplicadas, conservando el orden', () => {
    expect(normalizePreferences({ pinned: ['stirling', 'huly', 'stirling', 'evil', 3, 'constructor'] }).pinned).toEqual(['librechat', 'copilot', 'buk', 'stirling', 'huly']);
  });
  it('sin apps configurables quedan solo las fijas; si el campo no es una lista, el valor por defecto', () => {
    expect(normalizePreferences({ pinned: [] }).pinned).toEqual(['librechat', 'copilot', 'buk']);
    expect(normalizePreferences({ pinned: 'huly' }).pinned).toEqual(['librechat', 'copilot', 'buk', 'portal', 'huly', 'n8n', 'emailai', 'stirling']);
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
    expect(result.pinned).toEqual(['librechat', 'copilot', 'buk', 'huly', id]);
    expect(result.splitService).toBe(id);
  });
  it('descarta ids desconocidos (también custom borradas) en fijadas, recordar y panel lateral', () => {
    const ghost = 'custom-ffffffff-0000-0000-0000-000000000000';
    const result = normalizePreferences({ customApps: [app], pinned: [ghost, id, 'evil'], remember: { [ghost]: false, [id]: false, evil: false }, splitService: ghost });
    expect(result.pinned).toEqual(['librechat', 'copilot', 'buk', id]);
    expect(Object.keys(result.remember)).toEqual(['huly', 'n8n', 'librechat', 'portal', 'emailai', 'stirling', 'teams', 'copilot', 'outlook', 'sharepoint', 'powerautomate', 'forms', 'costeador', 'buk', id]);
    expect(result.splitService).toBe('librechat');
  });
  it('Teams es una app global: se puede fijar y recordar', () => {
    expect(normalizePreferences({ pinned: ['teams'], remember: { teams: false } })).toMatchObject({ pinned: ['librechat', 'copilot', 'buk', 'teams'], remember: { teams: false } });
    expect(normalizePreferences({ splitService: 'teams' }).splitService).toBe('teams');
  });
});

describe('apps de Microsoft 365 en preferencias', () => {
  const group = ['teams', 'copilot', 'outlook', 'sharepoint', 'powerautomate', 'forms'];
  it('las demás apps de Microsoft no se fijan por defecto', () => {
    const pinned = normalizePreferences({ pinned: [] }).pinned;
    for (const id of ['outlook', 'sharepoint', 'powerautomate', 'forms', 'teams']) expect(pinned).not.toContain(id);
  });
  it('recordar sesión es común al grupo: basta un miembro en false para que todos lo estén', () => {
    const off = normalizePreferences({ remember: { forms: false } }).remember;
    for (const id of group) expect(off[id], id).toBe(false);
    expect(off.huly).toBe(true);
    const on = normalizePreferences({ remember: { outlook: true } }).remember;
    for (const id of group) expect(on[id], id).toBe(true);
  });
});

describe('apps fijas (LibreChat, Copilot, Buk)', () => {
  const fixed = ['librechat', 'copilot', 'buk'];
  it('siempre van primero y en ese orden, aunque las preferencias guardadas digan otra cosa', () => {
    expect(normalizePreferences(null).pinned.slice(0, 3)).toEqual(fixed);
    expect(normalizePreferences({ pinned: ['copilot', 'huly', 'buk', 'librechat'] }).pinned).toEqual([...fixed, 'huly']);
  });
  it('no se pueden quitar: si faltan se vuelven a fijar', () => {
    expect(normalizePreferences({ pinned: ['huly', 'n8n'] }).pinned).toEqual([...fixed, 'huly', 'n8n']);
  });
  it('el resto conserva el orden elegido por el usuario', () => {
    expect(normalizePreferences({ pinned: ['stirling', 'buk', 'portal'] }).pinned).toEqual([...fixed, 'stirling', 'portal']);
  });
  it('ya no guarda seenCatalog (preferencias antiguas lo descartan)', () => {
    expect(normalizePreferences({ seenCatalog: ['copilot'] })).not.toHaveProperty('seenCatalog');
  });
});

describe('reordenar apps fijadas', () => {
  const current = ['librechat', 'copilot', 'buk', 'portal', 'huly', 'n8n'];
  it('acepta otro orden de las mismas apps; las fijas siguen primero y en su orden', () => {
    expect(reorderPinned(current, ['librechat', 'copilot', 'buk', 'n8n', 'portal', 'huly'])).toEqual(['librechat', 'copilot', 'buk', 'n8n', 'portal', 'huly']);
    expect(reorderPinned(current, ['huly', 'buk', 'librechat', 'portal', 'copilot', 'n8n'])).toEqual(['librechat', 'copilot', 'buk', 'huly', 'portal', 'n8n']);
  });
  it('rechaza listas que no son una permutación de las fijadas actuales', () => {
    for (const bad of [null, 'huly', {}, [...current, 'stirling'], current.slice(1), [...current.slice(0, -1), 'portal'], [...current, 3], current.map((id, i) => i === 5 ? 'evil' : id)]) {
      expect(() => reorderPinned(current, bad), JSON.stringify(bad)).toThrow('Orden inválido');
    }
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
