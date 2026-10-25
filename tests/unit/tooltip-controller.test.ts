import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipController, SHOW_DELAY_MS, REARM_MS } from '../../src/renderer/tooltip-controller';

const target = (text: string) => ({ text, rect: { x: 0, y: 0, width: 10, height: 10 }, side: 'right' as const });
let shown: string[]; let hidden: number; let controller: TooltipController;
beforeEach(() => {
  vi.useFakeTimers(); shown = []; hidden = 0;
  controller = new TooltipController({ show: t => shown.push(t.text), hide: () => { hidden++; }, now: () => Date.now(), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: handle => clearTimeout(handle as NodeJS.Timeout) });
});
afterEach(() => vi.useRealTimers());

describe('TooltipController', () => {
  it('la primera vez espera 300 ms', () => {
    controller.enter(target('A'));
    vi.advanceTimersByTime(SHOW_DELAY_MS - 1); expect(shown).toEqual([]);
    vi.advanceTimersByTime(1); expect(shown).toEqual(['A']);
  });
  it('salir antes del retardo cancela la aparición', () => {
    controller.enter(target('A')); vi.advanceTimersByTime(100); controller.leave(); vi.advanceTimersByTime(1000);
    expect(shown).toEqual([]); expect(hidden).toBe(0);
  });
  it('pasar a otro destino con el tooltip visible lo muestra al instante sin ocultar', () => {
    controller.enter(target('A')); vi.advanceTimersByTime(SHOW_DELAY_MS);
    controller.leave(); controller.enter(target('B'));
    expect(shown).toEqual(['A', 'B']); vi.advanceTimersByTime(1000); expect(hidden).toBe(0);
  });
  it('al dejar el último destino se oculta tras una breve gracia', () => {
    controller.enter(target('A')); vi.advanceTimersByTime(SHOW_DELAY_MS); controller.leave();
    expect(hidden).toBe(0); vi.advanceTimersByTime(100); expect(hidden).toBe(1);
  });
  it('tras ocultar, otro destino dentro de 400 ms aparece sin retardo; después vuelve el retardo', () => {
    controller.enter(target('A')); vi.advanceTimersByTime(SHOW_DELAY_MS); controller.hideNow();
    vi.advanceTimersByTime(REARM_MS - 50); controller.enter(target('B')); expect(shown).toEqual(['A', 'B']);
    controller.hideNow(); vi.advanceTimersByTime(REARM_MS + 10); controller.enter(target('C')); expect(shown).toEqual(['A', 'B']);
    vi.advanceTimersByTime(SHOW_DELAY_MS); expect(shown).toEqual(['A', 'B', 'C']);
  });
  it('hideNow oculta de inmediato, cancela pendientes y es idempotente', () => {
    controller.enter(target('A')); controller.hideNow(); vi.advanceTimersByTime(1000); expect(shown).toEqual([]); expect(hidden).toBe(0);
    controller.enter(target('A')); vi.advanceTimersByTime(SHOW_DELAY_MS); controller.hideNow(); controller.hideNow(); expect(hidden).toBe(1);
  });
});
