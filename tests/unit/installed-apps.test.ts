import { describe, expect, it, vi } from 'vitest';
import { InstalledApps, enumerateInstalled, isJunk, mergeInstalled, parseStartApps, readStoreApps, scanShortcuts, startMenuRoots, validAumid, type InstalledEntry, type ScanDeps } from '../../src/main/installed-apps';

const CALC = 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App';

/** Árbol de carpetas falso: clave = carpeta, valor = nombres (los que terminan en "/" son subcarpetas). */
function fakeDeps(tree: Record<string, string[]>, targets: Record<string, { target?: string; args?: string } | undefined>, existing: string[], roots = Object.keys(tree).slice(0, 1)): ScanDeps {
  return {
    roots,
    readdir: async dir => { if (!tree[dir]) throw new Error('ENOENT'); return tree[dir].map(name => ({ name: name.replace(/\/$/, ''), directory: name.endsWith('/') })); },
    shortcut: lnk => targets[lnk],
    exists: file => existing.includes(file),
    validLink: lnk => existing.includes(lnk),
  };
}

describe('validAumid', () => {
  it('acepta un AUMID empaquetado y rechaza inyección, rutas y vacíos', () => {
    expect(validAumid(CALC)).toBe(true);
    for (const value of ['foo;calc', 'C:\\Windows\\notepad.exe', '', '   ', null, undefined, 3, {}, `${CALC} & calc`, 'Pkg_8wekyb3d8bbwe', '..\\x_8wekyb3d8bbwe!App', 'a b_8wekyb3d8bbwe!App']) expect(validAumid(value)).toBe(false);
  });
});

describe('isJunk', () => {
  it('descarta desinstaladores, ayuda, léame y sitios web por nombre', () => {
    for (const name of ['Uninstall Foo', 'Desinstalar Foo', 'Foo uninst', 'Léame', 'Readme', 'Ayuda de Foo', 'Foo Help', 'Foo Documentation', 'Release Notes', 'Foo Website', 'Sitio web de Foo', 'Manual de Advanced IP Scanner', 'Getting Started', 'User Guide', 'Guía del usuario', 'Python 3.13 Module Docs (64-bit)', 'Foo Manual']) expect(isJunk(name)).toBe(true);
  });
  it('conserva apps normales y descarta destinos que no son aplicaciones', () => {
    for (const name of ['Excel', 'Visual Studio Code', 'Helper Tools', 'Docker Desktop']) expect(isJunk(name)).toBe(false);
    for (const target of ['C:\\x\\a.url', 'C:\\x\\a.html', 'C:\\x\\a.chm', 'C:\\x\\a.txt', 'C:\\x\\a.pdf', 'C:\\x\\unins000.exe', 'C:\\x\\uninstall.exe']) expect(isJunk('Foo', target)).toBe(true);
    expect(isJunk('Foo', 'C:\\x\\foo.exe')).toBe(false);
  });
});

describe('scanShortcuts', () => {
  const root = 'C:\\SM';
  it('resuelve .lnk a su .exe, filtra basura, deduplica por destino y por nombre, y ordena en español', async () => {
    const deps = fakeDeps({
      [root]: ['Word.lnk', 'Zeta.lnk', 'Uninstall Zeta.lnk', 'Sub/', 'Notas.txt', 'Roto.lnk', 'Ñandú.lnk'],
      [`${root}\\Sub`]: ['Word copia.lnk', 'Alfa.lnk', 'Docs.lnk', 'Word.lnk'],
    }, {
      [`${root}\\Word.lnk`]: { target: 'C:\\P\\word.exe' }, [`${root}\\Zeta.lnk`]: { target: 'C:\\P\\zeta.exe' }, [`${root}\\Uninstall Zeta.lnk`]: { target: 'C:\\P\\zeta.exe' },
      [`${root}\\Roto.lnk`]: { target: 'C:\\P\\gone.exe' }, [`${root}\\Ñandú.lnk`]: { target: 'C:\\P\\nandu.exe' },
      [`${root}\\Sub\\Word copia.lnk`]: { target: 'C:\\p\\WORD.exe' }, [`${root}\\Sub\\Alfa.lnk`]: { target: 'C:\\P\\alfa.exe' },
      [`${root}\\Sub\\Docs.lnk`]: { target: 'C:\\P\\docs.pdf' }, [`${root}\\Sub\\Word.lnk`]: { target: 'C:\\P\\word2.exe' },
    }, ['C:\\P\\word.exe', 'C:\\P\\zeta.exe', 'C:\\P\\nandu.exe', 'C:\\P\\alfa.exe', 'C:\\P\\docs.pdf', 'C:\\P\\word2.exe', 'C:\\p\\WORD.exe']);
    const result = await scanShortcuts(deps);
    expect(result).toEqual([
      { name: 'Alfa', kind: 'path', path: 'C:\\P\\alfa.exe' },
      { name: 'Ñandú', kind: 'path', path: 'C:\\P\\nandu.exe' },
      { name: 'Word', kind: 'path', path: 'C:\\P\\word.exe' },
      { name: 'Zeta', kind: 'path', path: 'C:\\P\\zeta.exe' },
    ]);
  });
  it('usa el propio .lnk si no se lee el destino pero el acceso es válido, y cuando el acceso lleva argumentos', async () => {
    const root2 = 'C:\\SM2';
    const deps = fakeDeps({ [root2]: ['Opaco.lnk', 'Invalido.lnk', 'ConArgs.lnk'] }, {
      [`${root2}\\Opaco.lnk`]: undefined, [`${root2}\\Invalido.lnk`]: undefined,
      [`${root2}\\ConArgs.lnk`]: { target: 'C:\\P\\update.exe', args: '--processStart app.exe' },
    }, [`${root2}\\Opaco.lnk`, 'C:\\P\\update.exe', `${root2}\\ConArgs.lnk`]);
    expect(await scanShortcuts(deps)).toEqual([
      { name: 'ConArgs', kind: 'path', path: `${root2}\\ConArgs.lnk` },
      { name: 'Opaco', kind: 'path', path: `${root2}\\Opaco.lnk` },
    ]);
  });
  it('limita la profundidad a 4 niveles y tolera carpetas inexistentes', async () => {
    const r = 'C:\\D';
    const tree: Record<string, string[]> = { [r]: ['a/'], [`${r}\\a`]: ['b/'], [`${r}\\a\\b`]: ['c/'], [`${r}\\a\\b\\c`]: ['d/'], [`${r}\\a\\b\\c\\d`]: ['L4.lnk', 'e/'], [`${r}\\a\\b\\c\\d\\e`]: ['L5.lnk'] };
    const targets = { [`${r}\\a\\b\\c\\d\\L4.lnk`]: { target: 'C:\\P\\l4.exe' }, [`${r}\\a\\b\\c\\d\\e\\L5.lnk`]: { target: 'C:\\P\\l5.exe' } };
    const deps = fakeDeps(tree, targets, ['C:\\P\\l4.exe', 'C:\\P\\l5.exe'], [r, 'C:\\NoExiste']);
    expect((await scanShortcuts(deps)).map(item => item.name)).toEqual(['L4']);
  });
});

describe('parseStartApps', () => {
  it('lee un objeto único o un arreglo y conserva solo AUMID empaquetados', () => {
    expect(parseStartApps(JSON.stringify({ Name: 'Calculadora', AppID: CALC }))).toEqual([{ name: 'Calculadora', kind: 'aumid', aumid: CALC }]);
    const list = parseStartApps(JSON.stringify([
      { Name: 'Calculadora', AppID: CALC }, { Name: 'Bloc', AppID: 'C:\\Windows\\notepad.exe' }, { Name: 'Inyección', AppID: 'foo;calc' },
      { Name: 'Ayuda de Foo', AppID: 'Foo.App_8wekyb3d8bbwe!App' }, { Name: 3, AppID: CALC }, { Name: 'SinId' }, null, 'x',
    ]));
    expect(list).toEqual([{ name: 'Calculadora', kind: 'aumid', aumid: CALC }]);
  });
  it('basura o vacío devuelven []', () => {
    for (const value of ['', 'no json', '{', 'null', '42', '"x"', '[]']) expect(parseStartApps(value)).toEqual([]);
  });
});

describe('readStoreApps', () => {
  it('degrada a [] si PowerShell falla o agota el tiempo', async () => {
    expect(await readStoreApps(async () => { throw new Error('timeout'); })).toEqual([]);
    expect(await readStoreApps(async () => 'basura')).toEqual([]);
    expect(await readStoreApps(async () => JSON.stringify([{ Name: 'Calculadora', AppID: CALC }]))).toHaveLength(1);
  });
});

describe('mergeInstalled y enumerateInstalled', () => {
  const lnk: InstalledEntry[] = [{ name: 'Calculadora', kind: 'path', path: 'C:\\P\\calc.exe' }, { name: 'Word', kind: 'path', path: 'C:\\P\\word.exe' }];
  const store: InstalledEntry[] = [{ name: 'calculadora', kind: 'aumid', aumid: CALC }, { name: 'Fotos', kind: 'aumid', aumid: 'Microsoft.Windows.Photos_8wekyb3d8bbwe!App' }];
  it('los accesos directos van primero y las apps de la Tienda no repiten nombres', () => {
    expect(mergeInstalled(lnk, store).map(item => item.name)).toEqual(['Calculadora', 'Word', 'Fotos']);
  });
  it('enumerateInstalled devuelve lo encontrado aunque falle la Tienda o falten carpetas', async () => {
    const deps = fakeDeps({ 'C:\\SM': ['Word.lnk'] }, { 'C:\\SM\\Word.lnk': { target: 'C:\\P\\word.exe' } }, ['C:\\P\\word.exe'], ['C:\\SM', 'C:\\Falta']);
    const result = await enumerateInstalled(deps, async () => { throw new Error('boom'); });
    expect(result).toEqual([{ name: 'Word', kind: 'path', path: 'C:\\P\\word.exe' }]);
  });
});

describe('startMenuRoots', () => {
  it('usa ProgramData y AppData y omite las variables ausentes', () => {
    expect(startMenuRoots({ ProgramData: 'C:\\PD', APPDATA: 'C:\\U\\AppData\\Roaming' })).toEqual(['C:\\PD\\Microsoft\\Windows\\Start Menu\\Programs', 'C:\\U\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs']);
    expect(startMenuRoots({})).toEqual([]);
  });
});

describe('InstalledApps', () => {
  const entries: InstalledEntry[] = [{ name: 'Word', kind: 'path', path: 'C:\\P\\word.exe' }, { name: 'Calculadora', kind: 'aumid', aumid: CALC }];
  function setup() {
    let time = 0;
    const source = { enumerate: vi.fn(async () => entries), icon: vi.fn(async (file: string) => `data:image/png;base64,${file.length}` as string | undefined), now: () => time };
    return { source, apps: new InstalledApps(source), advance: (ms: number) => { time += ms; } };
  }
  it('lista sin rutas, con ids estables y ordenada por nombre', async () => {
    const { apps } = setup();
    const first = await apps.list();
    expect(first.map(item => item.name)).toEqual(['Calculadora', 'Word']);
    expect(JSON.stringify(first)).not.toContain('C:\\P');
    expect(JSON.stringify(first)).not.toContain(CALC);
    expect((await apps.list(true)).map(item => item.id)).toEqual(first.map(item => item.id));
  });
  it('cachea 60 s y vuelve a escanear al caducar o con refresco', async () => {
    const { apps, source, advance } = setup();
    await apps.list(); await apps.list();
    expect(source.enumerate).toHaveBeenCalledTimes(1);
    advance(59_000); await apps.list();
    expect(source.enumerate).toHaveBeenCalledTimes(1);
    advance(2_000); await apps.list();
    expect(source.enumerate).toHaveBeenCalledTimes(2);
    await apps.list(true);
    expect(source.enumerate).toHaveBeenCalledTimes(3);
  });
  it('resuelve solo ids de la última enumeración', async () => {
    const { apps } = setup();
    expect(apps.resolve('cand-zzz')).toBeUndefined();
    const [calc, word] = await apps.list();
    expect(apps.resolve(calc.id)).toEqual(entries[1]);
    expect(apps.resolve(word.id)).toEqual(entries[0]);
    for (const value of [3, null, undefined, {}, 'C:\\P\\word.exe']) expect(apps.resolve(value)).toBeUndefined();
  });
  it('icono solo de apps con ruta, ignora ids desconocidos y limita la concurrencia a 8', async () => {
    const many: InstalledEntry[] = Array.from({ length: 20 }, (_, i) => ({ name: `App ${String(i).padStart(2, '0')}`, kind: 'path' as const, path: `C:\\P\\app${i}.exe` }));
    let running = 0; let peak = 0;
    const source = { enumerate: async () => [...many, { name: 'Calculadora', kind: 'aumid' as const, aumid: CALC }], icon: vi.fn(async () => { running++; peak = Math.max(peak, running); await new Promise(resolve => setTimeout(resolve, 5)); running--; return 'data:image/png;base64,AA'; }), now: () => 0 };
    const apps = new InstalledApps(source);
    const list = await apps.list();
    const icons = await apps.icons([...list.map(item => item.id), 'cand-zzz', 3]);
    expect(Object.keys(icons)).toHaveLength(20);
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
    await apps.icons(list.map(item => item.id));
    expect(source.icon).toHaveBeenCalledTimes(20);
    expect((await apps.list())[0].icon).toBe('data:image/png;base64,AA');
  });
});
