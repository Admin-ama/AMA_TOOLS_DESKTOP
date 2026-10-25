import { describe, expect, it } from 'vitest';
import { tooltipBounds, pillPosition, parseTooltipShow, TOOLTIP_SIZE, TOOLTIP_GAP, TOOLTIP_MAX } from '../../src/shared/tooltip';

const parent = { x: 100, y: 50, width: 1280, height: 800 };
const size = TOOLTIP_SIZE;

describe('tooltipBounds', () => {
  it('a la derecha: borde izquierdo = ancla + hueco, centrado vertical', () => {
    const b = tooltipBounds({ x: 0, y: 200, width: 64, height: 44 }, 'right', size, parent, 1);
    expect(b.x).toBe(100 + 64 + TOOLTIP_GAP);
    expect(b.y).toBe(50 + 200 + 22 - size.height / 2);
    expect([b.width, b.height]).toEqual([size.width, size.height]);
    expect(b.anchorY).toBe(size.height / 2);
  });
  it('a la izquierda: borde derecho = borde izquierdo del ancla - hueco', () => {
    const b = tooltipBounds({ x: 1224, y: 200, width: 56, height: 44 }, 'left', size, parent, 1);
    expect(b.x + b.width).toBe(100 + 1224 - TOOLTIP_GAP);
    expect(b.y).toBe(50 + 222 - size.height / 2);
  });
  it('abajo: centrado horizontal bajo el ancla con hueco', () => {
    const b = tooltipBounds({ x: 600, y: 0, width: 40, height: 40 }, 'bottom', size, parent, 1);
    expect(b.x).toBe(100 + 620 - size.width / 2);
    expect(b.y).toBe(50 + 40 + TOOLTIP_GAP);
    expect(b.anchorX).toBe(size.width / 2);
  });
  it('recorta dentro del área del padre y mueve el punto de ancla', () => {
    const top = tooltipBounds({ x: 0, y: 0, width: 64, height: 44 }, 'right', size, parent, 1);
    expect(top.y).toBe(parent.y);
    expect(top.anchorY).toBe(22);
    const bottom = tooltipBounds({ x: 0, y: 770, width: 64, height: 28 }, 'right', size, parent, 1);
    expect(bottom.y + bottom.height).toBe(parent.y + parent.height);
    const edge = tooltipBounds({ x: 1230, y: 0, width: 40, height: 40 }, 'bottom', size, parent, 1);
    expect(edge.x + edge.width).toBe(parent.x + parent.width);
    expect(edge.anchorX).toBeGreaterThan(size.width / 2);
    expect(edge.x + edge.anchorX).toBe(100 + 1250);
    const left = tooltipBounds({ x: 2, y: 0, width: 40, height: 40 }, 'bottom', size, parent, 1);
    expect(left.x).toBe(parent.x);
  });
  it('aplica el zoom del shell a las coordenadas CSS y redondea a DIP enteros', () => {
    const b = tooltipBounds({ x: 10, y: 100, width: 40, height: 40 }, 'right', size, parent, 1.25);
    expect(Number.isInteger(b.x) && Number.isInteger(b.y)).toBe(true);
    expect(b.x).toBe(Math.round(100 + (10 + 40) * 1.25 + TOOLTIP_GAP));
  });
  it('si el padre es menor que el tooltip lo ancla a su esquina', () => {
    const b = tooltipBounds({ x: 0, y: 0, width: 10, height: 10 }, 'right', size, { x: 5, y: 5, width: 100, height: 30 }, 1);
    expect([b.x, b.y]).toEqual([5, 5]);
  });
});

describe('pillPosition', () => {
  const win = { width: 360, height: 64 };
  const pill = { width: 100, height: 32 };
  it('derecha: pegado al borde de la ventana, centrado en el ancla', () => {
    const p = pillPosition('right', { anchorX: 0, anchorY: 32 }, pill, win);
    expect(p.x).toBeGreaterThan(0);
    expect(p.y).toBe(16);
    expect(p.arrow).toBe(16);
  });
  it('izquierda: pegado al borde derecho', () => {
    const p = pillPosition('left', { anchorX: 360, anchorY: 32 }, pill, win);
    expect(p.x + pill.width).toBeLessThan(win.width);
    expect(p.x + pill.width).toBeGreaterThan(win.width - 8);
  });
  it('abajo: centrado y acotado; la flecha sigue al ancla', () => {
    const c = pillPosition('bottom', { anchorX: 180, anchorY: 0 }, pill, win);
    expect(c.x).toBe(130);
    expect(c.arrow).toBe(50);
    const edge = pillPosition('bottom', { anchorX: 350, anchorY: 0 }, pill, win);
    expect(edge.x + pill.width).toBeLessThanOrEqual(win.width);
    expect(edge.arrow).toBeGreaterThan(50);
  });
});

describe('parseTooltipShow', () => {
  const rect = { x: 1, y: 2, width: 30, height: 40 };
  it('acepta entradas válidas', () => {
    expect(parseTooltipShow(['Ajustes', rect, 'right'])).toEqual({ text: 'Ajustes', rect, side: 'right' });
    expect(parseTooltipShow(['x'.repeat(TOOLTIP_MAX), rect, 'bottom']).text).toHaveLength(TOOLTIP_MAX);
  });
  it('rechaza texto, rect o lado inválidos', () => {
    const bad: unknown[][] = [
      [], ['', rect, 'right'], ['   ', rect, 'right'], [3, rect, 'right'], ['x'.repeat(TOOLTIP_MAX + 1), rect, 'right'],
      ['a', null, 'right'], ['a', [], 'right'], ['a', { ...rect, x: NaN }, 'right'], ['a', { ...rect, width: Infinity }, 'right'], ['a', { ...rect, height: -1 }, 'right'], ['a', { ...rect, y: '2' }, 'right'], ['a', { ...rect, x: 1e9 }, 'right'],
      ['a', rect, 'top'], ['a', rect, undefined], ['a', rect],
    ];
    for (const args of bad) expect(() => parseTooltipShow(args)).toThrow('Tooltip inválido');
  });
});
