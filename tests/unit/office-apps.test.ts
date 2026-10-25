import { describe, expect, it, vi } from 'vitest';
import { OFFICE_APPS, OfficeApps, officeCandidates } from '../../src/main/office-apps';

const root = 'C:\\Program Files\\Microsoft Office\\root\\Office16';
const installed = new Set(['WINWORD.EXE', 'POWERPNT.EXE', 'EXCEL.EXE', 'OUTLOOK.EXE'].map(exe => `${root}\\${exe}`.toLowerCase()));
const source = (overrides: Partial<ConstructorParameters<typeof OfficeApps>[0]> = {}) => ({
  roots: [root], exists: (file: string) => installed.has(file.toLowerCase()), open: vi.fn(async () => ''), icon: vi.fn(async (file: string) => `data:${file}`), log: vi.fn(), ...overrides,
});

describe('apps de Office fijas en el dock', () => {
  it('son Word, PowerPoint, Excel y Outlook clásico, en ese orden', () => {
    expect(OFFICE_APPS.map(app => [app.id, app.name])).toEqual([['office-word', 'Word'], ['office-powerpoint', 'PowerPoint'], ['office-excel', 'Excel'], ['office-outlook', 'Outlook (clásico)']]);
  });
  it('busca en Office de clic para ejecutar y MSI, 64 y 32 bits, sin duplicados', () => {
    const roots = officeCandidates({ ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' });
    expect(roots).toEqual(['C:\\Program Files\\Microsoft Office\\root\\Office16', 'C:\\Program Files\\Microsoft Office\\Office16', 'C:\\Program Files (x86)\\Microsoft Office\\root\\Office16', 'C:\\Program Files (x86)\\Microsoft Office\\Office16']);
  });
  it('solo muestra las instaladas, sin rutas, y con icono tras warm()', async () => {
    const apps = new OfficeApps(source({ exists: file => file.endsWith('WINWORD.EXE') || file.endsWith('EXCEL.EXE') }));
    expect(apps.views()).toEqual([{ id: 'office-word', name: 'Word' }, { id: 'office-excel', name: 'Excel' }]);
    await apps.warm();
    expect(apps.views()).toEqual([{ id: 'office-word', name: 'Word', icon: `data:${root}\\WINWORD.EXE` }, { id: 'office-excel', name: 'Excel', icon: `data:${root}\\EXCEL.EXE` }]);
  });
  it('abre la app por id con la ruta resuelta en el proceso principal', async () => {
    const deps = source();
    await new OfficeApps(deps).open('office-outlook');
    expect(deps.open).toHaveBeenCalledWith(`${root}\\OUTLOOK.EXE`);
  });
  it('rechaza ids desconocidos, argumentos extra y apps no instaladas', async () => {
    const apps = new OfficeApps(source({ exists: () => false }));
    for (const id of ['office-word', 'winword', '__proto__', 3, null]) await expect(apps.open(id)).rejects.toThrow();
    await expect(new OfficeApps(source()).open('office-word', 'C:\\evil.exe')).rejects.toThrow('Acción inválida');
  });
  it('un fallo al abrir se registra, no rompe la cola de comandos', async () => {
    const deps = source({ open: vi.fn(async () => 'Sin asociación') });
    await new OfficeApps(deps).open('office-word');
    expect(deps.log).toHaveBeenCalled();
  });
});
