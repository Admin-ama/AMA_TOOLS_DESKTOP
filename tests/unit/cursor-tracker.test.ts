import { describe, expect, it, vi } from 'vitest';
import { CursorTracker, toContentPoint } from '../../src/main/cursor-tracker';

describe('toContentPoint', () => {
  it('converts screen coordinates to window content coordinates', () => {
    expect(toContentPoint({ x: 500, y: 300 }, { x: 100, y: 50, width: 800, height: 600 })).toEqual({ x: 400, y: 250 });
  });

  it('keeps coordinates outside the window so eyes can look beyond it', () => {
    expect(toContentPoint({ x: 0, y: 0 }, { x: 100, y: 50, width: 800, height: 600 })).toEqual({ x: -100, y: -50 });
  });
});

describe('CursorTracker', () => {
  it('only emits when the cursor moves', () => {
    vi.useFakeTimers();
    let cursor = { x: 10, y: 10 };
    const send = vi.fn();
    const tracker = new CursorTracker({ cursor: () => cursor, bounds: () => ({ x: 0, y: 0, width: 100, height: 100 }), visible: () => true, send }, 30);
    vi.advanceTimersByTime(90);
    expect(send).toHaveBeenCalledTimes(1);
    cursor = { x: 20, y: 10 };
    vi.advanceTimersByTime(30);
    expect(send).toHaveBeenLastCalledWith({ x: 20, y: 10 });
    expect(send).toHaveBeenCalledTimes(2);
    tracker.dispose();
    vi.useRealTimers();
  });

  it('does not emit while the window is hidden', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const tracker = new CursorTracker({ cursor: () => ({ x: 1, y: 1 }), bounds: () => ({ x: 0, y: 0, width: 10, height: 10 }), visible: () => false, send }, 30);
    vi.advanceTimersByTime(90);
    expect(send).not.toHaveBeenCalled();
    tracker.dispose();
    vi.useRealTimers();
  });
});
