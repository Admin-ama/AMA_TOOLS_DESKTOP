import { describe, expect, it } from 'vitest';
import { appInitial } from '../../src/shared/app-initial';

describe('inicial de una app anclada sin icono', () => {
  it('es la primera letra del nombre, en mayúscula', () => {
    expect(['Word', 'PowerPoint', 'Excel', 'Outlook (clásico)', 'notepad'].map(appInitial)).toEqual(['W', 'P', 'E', 'O', 'N']);
  });
  it('salta espacios y signos iniciales y conserva acentos', () => {
    expect(appInitial('  (beta) Árbol')).toBe('B');
    expect(appInitial('¿Ñandú?')).toBe('Ñ');
    expect(appInitial('7-Zip')).toBe('7');
  });
  it('usa ? si el nombre no tiene letras ni números', () => {
    expect(appInitial('')).toBe('?');
    expect(appInitial(' -- ')).toBe('?');
  });
});
