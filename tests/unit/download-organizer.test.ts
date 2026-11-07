import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { ROOT_FOLDER, classify, createDownloadOrganizer, fallbackFilename, sanitizeSegment } from '../../src/main/download-organizer';

const downloads = join('C:', 'Users', 'ana', 'Downloads');

describe('clasificación por tipo de archivo', () => {
  it('usa la extensión, sin importar mayúsculas', () => {
    expect(classify('Informe.PDF', '')).toBe('Documentos');
    expect(classify('acta.docx', '')).toBe('Documentos');
    expect(classify('costos.xlsx', '')).toBe('Hojas de cálculo');
    expect(classify('export.csv', '')).toBe('Hojas de cálculo');
    expect(classify('deck.pptx', '')).toBe('Presentaciones');
    expect(classify('foto.jpeg', '')).toBe('Imágenes');
    expect(classify('todo.zip', '')).toBe('Comprimidos');
    expect(classify('workflow.json', '')).toBe('Datos');
  });
  it('sin extensión conocida cae al MIME y luego a Otros', () => {
    expect(classify('descarga', 'application/pdf')).toBe('Documentos');
    expect(classify('descarga', 'image/png')).toBe('Imágenes');
    expect(classify('descarga', 'application/zip')).toBe('Comprimidos');
    expect(classify('descarga', 'application/octet-stream')).toBe('Otros');
    expect(classify('instalador.exe', '')).toBe('Otros');
  });
  it('la extensión manda sobre un MIME genérico', () => {
    expect(classify('reporte.xlsx', 'application/octet-stream')).toBe('Hojas de cálculo');
  });
});

describe('nombres seguros para Windows', () => {
  it('quita caracteres inválidos y separadores de ruta', () => {
    expect(sanitizeSegment('a<b>c:d"e/f\\g|h?i*j')).toBe('a_b_c_d_e_f_g_h_i_j');
    expect(sanitizeSegment('..\\..\\Windows')).not.toMatch(/[\\/]|^\.\./);
  });
  it('quita puntos y espacios finales y conserva acentos y ñ', () => {
    expect(sanitizeSegment('Reporte año 2026. ')).toBe('Reporte año 2026');
  });
  it('evita nombres reservados de Windows', () => {
    for (const name of ['CON', 'nul', 'COM1', 'lpt9', 'con.txt']) expect(sanitizeSegment(name), name).toMatch(/^_/);
  });
  it('vacío o solo puntos cae a "Descarga"', () => {
    expect(sanitizeSegment('')).toBe('Descarga');
    expect(sanitizeSegment('...')).toBe('Descarga');
  });
  it('trunca el largo conservando la extensión', () => {
    const long = `${'a'.repeat(300)}.pdf`;
    const safe = sanitizeSegment(long);
    expect(safe.length).toBeLessThanOrEqual(120);
    expect(safe.endsWith('.pdf')).toBe(true);
  });
});

describe('nombre cuando la página no da uno', () => {
  it('fecha y hora locales', () => {
    expect(fallbackFilename(new Date(2026, 10, 7, 9, 5, 3))).toBe('descarga-20261107-090503');
  });
});

describe('ruta destino', () => {
  const organizer = (existing: string[] = []) => createDownloadOrganizer({ downloadsDir: () => downloads, exists: path => existing.includes(path) });
  it('Descargas / AMA Tools / app / tipo / archivo', () => {
    expect(organizer().resolve('Stirling PDF', 'PDFs_unidos.pdf', 'application/pdf')).toBe(join(downloads, ROOT_FOLDER, 'Stirling PDF', 'Documentos', 'PDFs_unidos.pdf'));
  });
  it('sanea el nombre de la app (los servicios propios traen texto del usuario)', () => {
    const path = organizer().resolve('../Mi: app?', 'a.zip', '');
    expect(path).toBe(join(downloads, ROOT_FOLDER, '_Mi_ app_', 'Comprimidos', 'a.zip'));
  });
  it('nunca sale de la carpeta de descargas', () => {
    const path = organizer().resolve('..', '..\\..\\evil.exe', '');
    expect(path.startsWith(join(downloads, ROOT_FOLDER))).toBe(true);
  });
  it('si el archivo existe agrega (1), (2)…', () => {
    const base = join(downloads, ROOT_FOLDER, 'n8n', 'Datos');
    const path = organizer([join(base, 'x.json'), join(base, 'x (1).json')]).resolve('n8n', 'x.json', '');
    expect(path).toBe(join(base, 'x (2).json'));
  });
  it('dos descargas simultáneas del mismo nombre no pisan la misma ruta', () => {
    const o = organizer();
    const first = o.resolve('Outlook', 'adjunto.pdf', '');
    const second = o.resolve('Outlook', 'adjunto.pdf', '');
    expect(second).not.toBe(first);
    expect(second.endsWith('adjunto (1).pdf')).toBe(true);
  });
  it('al liberar una ruta reservada vuelve a estar disponible', () => {
    const o = organizer();
    const first = o.resolve('Outlook', 'adjunto.pdf', '');
    o.release(first);
    expect(o.resolve('Outlook', 'adjunto.pdf', '')).toBe(first);
  });
  it('nombre vacío usa el nombre de respaldo con fecha', () => {
    const name = organizer().resolve('Portal Ops', '', 'application/json').split(/[\\/]/).pop()!;
    expect(name).toMatch(/^descarga-\d{8}-\d{6}$/);
  });
});
