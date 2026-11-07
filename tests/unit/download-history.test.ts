import { describe, expect, it, vi } from 'vitest';
import { DownloadHistory, MAX_DOWNLOADS, opensDirectly } from '../../src/main/download-history';

describe('qué se abre con un clic', () => {
  it('documentos e imágenes sí; ejecutables y scripts solo se muestran en su carpeta', () => {
    for (const name of ['a.pdf', 'b.XLSX', 'c.png', 'sin-extension']) expect(opensDirectly(name), name).toBe(true);
    for (const name of ['setup.exe', 'run.BAT', 'x.cmd', 'y.ps1', 'z.msi', 'a.vbs', 'b.js', 'c.lnk', 'd.scr', 'e.jar', 'f.hta', 'g.reg']) expect(opensDirectly(name), name).toBe(false);
  });
});

const entry = (name: string, extra: Partial<Parameters<DownloadHistory['add']>[0]> = {}) => ({ path: `C:\\Descargas\\AMA Tools\\n8n\\Datos\\${name}`, name, app: 'n8n Automations', ...extra });

describe('historial de descargas', () => {
  it('lo más reciente primero, sin exponer la ruta', () => {
    const history = new DownloadHistory(() => 1000);
    history.add(entry('a.json'));
    history.add(entry('b.xlsx'));
    const views = history.views();
    expect(views.map(view => view.name)).toEqual(['b.xlsx', 'a.json']);
    expect(views[0]).toMatchObject({ app: 'n8n Automations', ext: 'xlsx', state: 'downloading', size: 0, at: 1000 });
    expect(JSON.stringify(views)).not.toContain('Descargas');
  });
  it('la extensión va en minúsculas y vacía si no hay', () => {
    const history = new DownloadHistory();
    history.add(entry('Informe.PDF'));
    history.add(entry('sin-extension'));
    expect(history.views().map(view => view.ext)).toEqual(['', 'pdf']);
  });
  it('finish marca el estado y el tamaño; fail marca el error', () => {
    const history = new DownloadHistory();
    const done = history.add(entry('a.pdf'));
    const bad = history.add(entry('b.pdf'));
    history.finish(done, 84_000);
    history.fail(bad);
    expect(history.views().map(view => [view.name, view.state, view.size])).toEqual([['b.pdf', 'failed', 0], ['a.pdf', 'completed', 84_000]]);
  });
  it('pathOf devuelve la ruta real solo para ids conocidos', () => {
    const history = new DownloadHistory();
    const id = history.add(entry('a.pdf'));
    expect(history.pathOf(id)).toBe('C:\\Descargas\\AMA Tools\\n8n\\Datos\\a.pdf');
    expect(history.pathOf('inventado')).toBeUndefined();
  });
  it('clear vacía la lista pero no toca descargas en curso', () => {
    const history = new DownloadHistory();
    const running = history.add(entry('lento.zip'));
    const done = history.add(entry('a.pdf'));
    history.finish(done, 1);
    history.clear();
    expect(history.views().map(view => view.name)).toEqual(['lento.zip']);
    expect(history.pathOf(done)).toBeUndefined();
    expect(history.pathOf(running)).toBeDefined();
  });
  it(`guarda como máximo ${MAX_DOWNLOADS}, descartando las más viejas ya terminadas`, () => {
    const history = new DownloadHistory();
    for (let i = 0; i < MAX_DOWNLOADS + 5; i++) history.finish(history.add(entry(`f${i}.pdf`)), 1);
    const names = history.views().map(view => view.name);
    expect(names).toHaveLength(MAX_DOWNLOADS);
    expect(names[0]).toBe(`f${MAX_DOWNLOADS + 4}.pdf`);
  });
  it('avisa a quien escucha en cada cambio', () => {
    const history = new DownloadHistory();
    const listener = vi.fn();
    history.onChange(listener);
    const id = history.add(entry('a.pdf'));
    history.finish(id, 1);
    history.clear();
    expect(listener).toHaveBeenCalledTimes(3);
  });
  it('finish/fail de un id desconocido (ya limpiado) no avisa ni rompe', () => {
    const history = new DownloadHistory();
    const listener = vi.fn();
    history.onChange(listener);
    history.finish('x', 1);
    history.fail('x');
    expect(listener).not.toHaveBeenCalled();
  });
});
