import { describe, expect, it } from 'vitest';
import { splitBounds, contentBounds, SPLIT } from '../../src/main/policy';
import { DEFAULT_SPLIT_RATIO } from '../../src/shared/contracts';

describe('geometría de la vista dividida', () => {
  const area = contentBounds(1280, 820);
  it('reparte el área de contenido en vista principal, divisor, cabecera y panel', () => {
    const b = splitBounds(1280, 820, 0.38)!;
    expect(b.panelHeader.width).toBe(441);
    expect(b.panel).toEqual({ x: area.x + area.width - 441, y: area.y + SPLIT.header, width: 441, height: area.height - SPLIT.header });
    expect(b.divider).toEqual({ x: area.x + area.width - 441 - SPLIT.divider, y: area.y, width: SPLIT.divider, height: area.height });
    expect(b.main).toEqual({ x: area.x, y: area.y, width: area.width - 441 - SPLIT.divider, height: area.height });
    expect(b.panelHeader).toEqual({ x: b.panel.x, y: area.y, width: 441, height: SPLIT.header });
  });
  it('no deja huecos ni solapes: principal + divisor + panel = ancho de contenido', () => {
    for (const ratio of [0.2, 0.38, 0.5, 0.7]) {
      const b = splitBounds(1280, 820, ratio)!;
      expect(b.main.width + b.divider.width + b.panel.width).toBe(area.width);
      expect(b.main.x + b.main.width).toBe(b.divider.x);
      expect(b.divider.x + b.divider.width).toBe(b.panel.x);
      expect(b.panel.x + b.panel.width).toBe(area.x + area.width);
    }
  });
  it('limita cada lado a 320 px como mínimo', () => {
    const small = splitBounds(1280, 820, 0.1)!;
    expect(small.panel.width).toBe(SPLIT.minPane);
    const large = splitBounds(1280, 820, 0.9)!;
    expect(large.main.width).toBe(SPLIT.minPane);
    expect(large.ratio).toBeCloseTo(large.panel.width / area.width, 10);
  });
  it('el ratio devuelto es el efectivo tras limitar', () => {
    expect(splitBounds(1280, 820, 0.38)!.ratio).toBeCloseTo(441 / area.width, 10);
    expect(splitBounds(1280, 820, 0.1)!.ratio).toBeCloseTo(320 / area.width, 10);
  });
  it('oculta el panel si la ventana es demasiado estrecha para dos lados de 320 px', () => {
    // contenido mínimo: 2 * 320 + 6 = 646
    expect(splitBounds(900, 600, 0.38)).not.toBeNull();
    const width = 646 + 64 + 56; // sidebar + dock
    expect(contentBounds(width, 600).width).toBe(646);
    expect(splitBounds(width, 600, 0.5)).not.toBeNull();
    expect(splitBounds(width - 1, 600, 0.5)).toBeNull();
    expect(splitBounds(300, 600, 0.5)).toBeNull();
  });
  it('un ratio no finito usa el valor por defecto', () => {
    const base = splitBounds(1280, 820, DEFAULT_SPLIT_RATIO)!;
    for (const bad of [NaN, Infinity, -Infinity, undefined as unknown as number]) expect(splitBounds(1280, 820, bad)).toEqual(base);
  });
  it('mantiene la altura del panel no negativa en ventanas bajas', () => {
    const b = splitBounds(1280, SPLIT.header + 52 + 28 - 10, 0.4)!;
    expect(b.panel.height).toBe(0);
    expect(b.panelHeader.height).toBe(SPLIT.header);
  });
});
