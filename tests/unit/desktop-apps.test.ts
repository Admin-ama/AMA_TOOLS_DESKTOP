import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DesktopApps, MAX_DESKTOP_APPS, validDesktopPath } from '../../src/main/desktop-apps';
import type { InstalledEntry } from '../../src/main/installed-apps';

const AUMID = 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App';
import type { DesktopApp, Preferences } from '../../src/shared/contracts';
import { normalizePreferences } from '../../src/main/preferences';

let dir: string;
const file = (name: string) => path.join(dir, name);
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'amatime-desktop-apps-'));
  for (const name of ['tool.exe', 'Excel.LNK', 'site.url', 'run.bat', 'run.cmd', 'run.ps1', 'run.vbs', 'run.js', 'notes.txt', 'noext']) await writeFile(file(name), 'x');
  await mkdir(file('Documentos'));
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('validDesktopPath', () => {
  it('acepta ejecutables, accesos directos, enlaces y carpetas existentes', () => {
    for (const name of ['tool.exe', 'Excel.LNK', 'site.url', 'Documentos']) expect(validDesktopPath(file(name))).toBe(true);
  });
  it('rechaza scripts, otras extensiones, rutas relativas, inexistentes y valores no string', () => {
    for (const name of ['run.bat', 'run.cmd', 'run.ps1', 'run.vbs', 'run.js', 'notes.txt', 'noext', 'missing.exe']) expect(validDesktopPath(file(name))).toBe(false);
    for (const value of ['tool.exe', '.\\tool.exe', '', null, undefined, 3, {}, '\\\\servidor\\recurso\\tool.exe']) expect(validDesktopPath(value)).toBe(false);
  });
});

function setup(initial: DesktopApp[] = [], picked: string | undefined = undefined) {
  const preferences = normalizePreferences(null);
  preferences.desktopApps = initial;
  let counter = 0;
  const deps = {
    pickFile: vi.fn(async () => picked),
    open: vi.fn(async (_file: string) => ''),
    icon: vi.fn(async (_file: string) => 'data:image/png;base64,AAAA' as string | undefined),
    save: vi.fn(async (_preferences: Preferences) => undefined),
    id: () => `id-${++counter}`,
    log: vi.fn(),
    openAumid: vi.fn(async (_aumid: string) => undefined),
  };
  const catalog: Record<string, InstalledEntry> = {
    'cand-exe': { name: 'Tool', kind: 'path', path: file('tool.exe') },
    'cand-bat': { name: 'Script', kind: 'path', path: file('run.bat') },
    'cand-store': { name: 'Calculadora', kind: 'aumid', aumid: AUMID },
    'cand-badstore': { name: 'Malo', kind: 'aumid', aumid: 'foo;calc' },
  };
  const installed = {
    list: vi.fn(async (_refresh?: boolean) => Object.entries(catalog).map(([id, entry]) => ({ id, name: entry.name, kind: entry.kind }))),
    icons: vi.fn(async (_ids: unknown) => ({ 'cand-exe': 'data:image/png;base64,BBBB' })),
    resolve: (id: unknown) => typeof id === 'string' ? catalog[id] : undefined,
  };
  return { preferences, deps, installed, apps: new DesktopApps(preferences, deps, installed) };
}

describe('DesktopApps', () => {
  it('abre solo por id usando la ruta guardada y sin argumentos', async () => {
    const { apps, deps } = setup([{ id: 'a', name: 'Tool', kind: 'path' as const, path: file('tool.exe') }]);
    await apps.open('a');
    expect(deps.open).toHaveBeenCalledWith(file('tool.exe'));
  });
  it('lanza con id desconocido o argumentos extra y no abre nada', async () => {
    const { apps, deps } = setup([{ id: 'a', name: 'Tool', kind: 'path' as const, path: file('tool.exe') }]);
    for (const id of ['zzz', 3, null, undefined, {}, file('tool.exe')]) await expect(apps.open(id)).rejects.toThrow();
    await expect(apps.open('a', '--flag')).rejects.toThrow();
    expect(deps.open).not.toHaveBeenCalled();
  });
  it('no abre una ruta guardada que dejó de ser válida', async () => {
    const { apps, deps } = setup([{ id: 'a', name: 'Gone', kind: 'path' as const, path: file('missing.exe') }]);
    await expect(apps.open('a')).rejects.toThrow();
    expect(deps.open).not.toHaveBeenCalled();
  });
  it('registra el error de shell.openPath sin romper', async () => {
    const { apps, deps } = setup([{ id: 'a', name: 'Tool', kind: 'path' as const, path: file('tool.exe') }]);
    deps.open.mockResolvedValueOnce('boom');
    await expect(apps.open('a')).resolves.toBeUndefined();
    expect(deps.log).toHaveBeenCalled();
  });
  it('vincula la app elegida en el diálogo: nombre sin extensión e id propio, y guarda', async () => {
    const { apps, deps, preferences } = setup([], file('tool.exe'));
    await apps.add();
    expect(preferences.desktopApps).toEqual([{ id: 'id-1', name: 'tool', kind: 'path' as const, path: file('tool.exe') }]);
    expect(deps.save).toHaveBeenCalledTimes(1);
    expect(apps.views()).toEqual([{ id: 'id-1', name: 'tool', icon: 'data:image/png;base64,AAAA' }]);
  });
  it('ignora diálogo cancelado, rutas inválidas y duplicados', async () => {
    const cancelled = setup([], undefined);
    await cancelled.apps.add();
    expect(cancelled.preferences.desktopApps).toEqual([]);
    const bad = setup([], file('run.bat'));
    await expect(bad.apps.add()).rejects.toThrow();
    expect(bad.preferences.desktopApps).toEqual([]);
    const dup = setup([{ id: 'a', name: 'tool', kind: 'path' as const, path: file('TOOL.exe') }], file('tool.exe'));
    await dup.apps.add();
    expect(dup.preferences.desktopApps).toHaveLength(1);
  });
  it(`rechaza vincular más de ${MAX_DESKTOP_APPS} apps`, async () => {
    const full = Array.from({ length: MAX_DESKTOP_APPS }, (_, i) => ({ id: `n${i}`, name: `n${i}`, kind: 'path' as const, path: file(`n${i}.exe`) }));
    const { apps, deps } = setup(full, file('tool.exe'));
    await expect(apps.add()).rejects.toThrow();
    expect(deps.pickFile).not.toHaveBeenCalled();
  });
  it('quita por id, valida el id y nunca expone la ruta en las vistas', async () => {
    const { apps, deps, preferences } = setup([{ id: 'a', name: 'Tool', kind: 'path' as const, path: file('tool.exe') }]);
    await expect(apps.remove('zzz')).rejects.toThrow();
    expect(JSON.stringify(apps.views())).not.toContain(dir);
    await apps.remove('a');
    expect(preferences.desktopApps).toEqual([]);
    expect(deps.save).toHaveBeenCalledTimes(1);
  });
});

describe('DesktopApps: selector de apps instaladas', () => {
  it('candidates marca las ya vinculadas y nunca expone rutas ni AUMID', async () => {
    const { apps, installed } = setup([{ id: 'a', name: 'Tool', kind: 'path', path: file('TOOL.exe') }]);
    const list = await apps.candidates(true);
    expect(installed.list).toHaveBeenCalledWith(true);
    expect(list.find(item => item.id === 'cand-exe')?.linked).toBe(true);
    expect(list.find(item => item.id === 'cand-store')?.linked).toBe(false);
    expect(JSON.stringify(list)).not.toContain(dir);
    expect(JSON.stringify(list)).not.toContain(AUMID);
  });
  it('link vincula por candidateId: guarda ruta, nombre e icono; no duplica', async () => {
    const { apps, preferences, deps } = setup();
    await apps.link('cand-exe');
    expect(preferences.desktopApps).toEqual([{ id: 'id-1', name: 'Tool', kind: 'path', path: file('tool.exe') }]);
    expect(apps.views()).toEqual([{ id: 'id-1', name: 'Tool', icon: 'data:image/png;base64,AAAA' }]);
    await apps.link('cand-exe');
    expect(preferences.desktopApps).toHaveLength(1);
    expect(deps.save).toHaveBeenCalledTimes(1);
  });
  it('link de una app empaquetada guarda el AUMID y deduplica por AUMID', async () => {
    const { apps, preferences, deps } = setup();
    await apps.link('cand-store');
    await apps.link('cand-store');
    expect(preferences.desktopApps).toEqual([{ id: 'id-1', name: 'Calculadora', kind: 'aumid', aumid: AUMID }]);
    expect(deps.icon).not.toHaveBeenCalled();
    expect(JSON.stringify(apps.views())).not.toContain(AUMID);
  });
  it('link rechaza ids desconocidos, rutas del renderer, argumentos extra, destinos inválidos y el máximo', async () => {
    const { apps, preferences, deps } = setup();
    for (const id of ['zzz', file('tool.exe'), AUMID, 3, null, undefined, {}]) await expect(apps.link(id)).rejects.toThrow();
    await expect(apps.link('cand-exe', '--flag')).rejects.toThrow();
    await expect(apps.link('cand-bat')).rejects.toThrow();
    await expect(apps.link('cand-badstore')).rejects.toThrow();
    expect(preferences.desktopApps).toEqual([]);
    expect(deps.save).not.toHaveBeenCalled();
    const full = Array.from({ length: MAX_DESKTOP_APPS }, (_, i) => ({ id: `n${i}`, name: `n${i}`, kind: 'path' as const, path: file(`n${i}.exe`) }));
    await expect(setup(full).apps.link('cand-exe')).rejects.toThrow();
  });
  it('abre una app empaquetada por id con su AUMID validado y sin tocar shell.openPath', async () => {
    const { apps, deps } = setup([{ id: 's', name: 'Calculadora', kind: 'aumid', aumid: AUMID }]);
    await apps.open('s');
    expect(deps.openAumid).toHaveBeenCalledWith(AUMID);
    expect(deps.open).not.toHaveBeenCalled();
    const bad = setup([{ id: 's', name: 'Malo', kind: 'aumid', aumid: 'foo;calc' }]);
    await expect(bad.apps.open('s')).rejects.toThrow();
    expect(bad.deps.openAumid).not.toHaveBeenCalled();
  });
  it('icons delega en el catálogo e ignora entradas que no son lista de strings', async () => {
    const { apps, installed } = setup();
    expect(await apps.candidateIcons(['cand-exe'])).toEqual({ 'cand-exe': 'data:image/png;base64,BBBB' });
    expect(await apps.candidateIcons('x')).toEqual({});
    expect(installed.icons).toHaveBeenCalledTimes(1);
  });
});
