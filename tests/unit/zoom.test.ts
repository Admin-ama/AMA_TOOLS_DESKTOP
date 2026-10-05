import { expect, it } from 'vitest';
import { isZoomPercent } from '../../src/shared/zoom';

it('zoom solo acepta porcentajes enteros entre 50 y 200', () => {
  for (const value of [50, 100, 110, 200]) expect(isZoomPercent(value)).toBe(true);
  for (const value of [49, 201, NaN, Infinity, 100.5, '110', null]) expect(isZoomPercent(value)).toBe(false);
});
