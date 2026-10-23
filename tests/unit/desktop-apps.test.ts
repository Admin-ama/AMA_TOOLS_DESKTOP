import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DesktopApps, MAX_DESKTOP_APPS, validDesktopPath } from '../../src/main/desktop-apps';
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
  };
  return { preferences, deps, apps: new DesktopApps(preferences, deps) };
}

describe('DesktopApps', () => {
  it('abre solo por id usando la ruta guardada y sin argumentos', async () => {
    const { apps, deps } = setup([{ id: 'a', name: 'Tool', path: file('tool.exe') }]);
    await apps.open('a');
    expect(deps.open).toHaveBeenCalledWith(file('tool.exe'));
  });
  it('lanza con id desconocido o argumentos extra y no abre nada', async () => {
    const { apps, deps } = setup([{ id: 'a', name: 'Tool', path: file('tool.exe') }]);
    for (const id of ['zzz', 3, null, undefined, {}, file('tool.exe')]) await expect(apps.open(id)).rejects.toThrow();
    await expect(apps.open('a', '--flag')).rejects.toThrow();
    expect(deps.open).not.toHaveBeenCalled();
  });
  it('no abre una ruta guardada que dejó de ser válida', async () => {
    const { apps, deps } = setup([{ id: 'a', name: 'Gone', path: file('missing.exe') }]);
    await expect(apps.open('a')).rejects.toThrow();
    expect(deps.open).not.toHaveBeenCalled();
  });
  it('registra el error de shell.openPath sin romper', async () => {
    const { apps, deps } = setup([{ id: 'a', name: 'Tool', path: file('tool.exe') }]);
    deps.open.mockResolvedValueOnce('boom');
    await expect(apps.open('a')).resolves.toBeUndefined();
    expect(deps.log).toHaveBeenCalled();
  });
  it('vincula la app elegida en el diálogo: nombre sin extensión e id propio, y guarda', async () => {
    const { apps, deps, preferences } = setup([], file('tool.exe'));
    await apps.add();
    expect(preferences.desktopApps).toEqual([{ id: 'id-1', name: 'tool', path: file('tool.exe') }]);
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
    const dup = setup([{ id: 'a', name: 'tool', path: file('TOOL.exe') }], file('tool.exe'));
    await dup.apps.add();
    expect(dup.preferences.desktopApps).toHaveLength(1);
  });
  it(`rechaza vincular más de ${MAX_DESKTOP_APPS} apps`, async () => {
    const full = Array.from({ length: MAX_DESKTOP_APPS }, (_, i) => ({ id: `n${i}`, name: `n${i}`, path: file(`n${i}.exe`) }));
    const { apps, deps } = setup(full, file('tool.exe'));
    await expect(apps.add()).rejects.toThrow();
    expect(deps.pickFile).not.toHaveBeenCalled();
  });
  it('quita por id, valida el id y nunca expone la ruta en las vistas', async () => {
    const { apps, deps, preferences } = setup([{ id: 'a', name: 'Tool', path: file('tool.exe') }]);
    await expect(apps.remove('zzz')).rejects.toThrow();
    expect(JSON.stringify(apps.views())).not.toContain(dir);
    await apps.remove('a');
    expect(preferences.desktopApps).toEqual([]);
    expect(deps.save).toHaveBeenCalledTimes(1);
  });
});
