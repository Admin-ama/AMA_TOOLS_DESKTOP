import { describe, expect, it } from 'vitest';
import { eyeOffset } from '../../src/shared/bot-eyes';

describe('eyeOffset', () => {
  it('stays centered when cursor is on the eye', () => {
    expect(eyeOffset({ x: 10, y: 10 }, { x: 10, y: 10 }, 40)).toEqual({ x: 0, y: 0 });
  });

  it('moves toward the cursor without exceeding the max offset', () => {
    const offset = eyeOffset({ x: 0, y: 0 }, { x: 1000, y: 0 }, 40);
    expect(offset.x).toBeCloseTo(40);
    expect(offset.y).toBeCloseTo(0);
  });

  it('scales proportionally for nearby cursors', () => {
    const offset = eyeOffset({ x: 0, y: 0 }, { x: 0, y: -100 }, 40, 200);
    expect(offset.x).toBeCloseTo(0);
    expect(offset.y).toBeCloseTo(-20);
  });
});
