import { describe, expect, it } from 'vitest';
import { badgeOf, formatSize, formatTime } from '../../src/shared/download-format';

describe('tamaño legible', () => {
  it('escala B, KB, MB, GB sin decimales de más', () => {
    expect(formatSize(0)).toBe('—');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(84_000)).toBe('82 KB');
    expect(formatSize(1_500_000)).toBe('1,4 MB');
    expect(formatSize(12 * 1024 * 1024)).toBe('12 MB');
    expect(formatSize(3.2 * 1024 ** 3)).toBe('3,2 GB');
  });
});

describe('hora de la descarga', () => {
  it('formato corto de 12 horas en español', () => {
    const at = new Date(2026, 10, 7, 19, 10).getTime();
    expect(formatTime(at)).toMatch(/^07:10\s?p\.\s?m\.$/);
  });
});

describe('insignia por extensión', () => {
  it('colores y etiqueta por tipo', () => {
    expect(badgeOf('pdf')).toEqual({ label: 'PDF', tone: 'red' });
    expect(badgeOf('xlsx')).toEqual({ label: 'XLSX', tone: 'green' });
    expect(badgeOf('csv')).toEqual({ label: 'CSV', tone: 'green' });
    expect(badgeOf('docx')).toEqual({ label: 'DOCX', tone: 'blue' });
    expect(badgeOf('pptx')).toEqual({ label: 'PPTX', tone: 'orange' });
    expect(badgeOf('png')).toEqual({ label: 'PNG', tone: 'purple' });
    expect(badgeOf('zip')).toEqual({ label: 'ZIP', tone: 'gray' });
    expect(badgeOf('json')).toEqual({ label: 'JSON', tone: 'slate' });
  });
  it('desconocida o sin extensión: etiqueta corta y tono neutro', () => {
    expect(badgeOf('')).toEqual({ label: 'ARCH', tone: 'gray' });
    expect(badgeOf('exe')).toEqual({ label: 'EXE', tone: 'gray' });
    expect(badgeOf('abcdefgh')).toEqual({ label: 'ABCD', tone: 'gray' });
  });
});
