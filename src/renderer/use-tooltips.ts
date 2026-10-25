import { useEffect, useRef } from 'react';
import { TOOLTIP_MAX, type TooltipRequest, type TooltipSide } from '../shared/tooltip';
import { TooltipController } from './tooltip-controller';

const sideOf = (value: string | undefined): TooltipSide => value === 'left' || value === 'bottom' ? value : 'right';
const targetOf = (node: EventTarget | null) => node instanceof Element ? node.closest<HTMLElement>('[data-tooltip]') : null;
function requestOf(el: HTMLElement): TooltipRequest {
  const { x, y, width, height } = el.getBoundingClientRect();
  return { text: (el.dataset.tooltip ?? '').slice(0, TOOLTIP_MAX), rect: { x, y, width, height }, side: sideOf(el.dataset.tooltipSide) };
}

/** Hover/foco delegado sobre `[data-tooltip]`; el dibujo ocurre en la ventana nativa del tooltip. `overlay` true oculta cualquier tooltip. */
export function useTooltips(overlay: boolean) {
  const controller = useRef<TooltipController | undefined>(undefined);
  useEffect(() => {
    const quiet = () => undefined;
    const c = controller.current = new TooltipController({
      show: t => void window.portal.tooltipShow(t.text, t.rect, t.side).catch(quiet),
      hide: () => void window.portal.tooltipHide().catch(quiet),
      now: () => Date.now(), setTimer: (fn, ms) => window.setTimeout(fn, ms), clearTimer: handle => window.clearTimeout(handle as number),
    });
    let current: HTMLElement | null = null;
    const over = (event: MouseEvent) => {
      const el = targetOf(event.target);
      if (el === current) return;
      current = el;
      if (el?.dataset.tooltip) c.enter(requestOf(el)); else c.leave();
    };
    const out = (event: MouseEvent) => { if (!event.relatedTarget) { current = null; c.leave(); } };
    const focus = (event: FocusEvent) => { const el = targetOf(event.target); if (el?.dataset.tooltip && el.matches(':focus-visible')) c.enter(requestOf(el)); };
    const blurred = (event: FocusEvent) => { if (targetOf(event.target)) c.leave(); };
    const hide = () => c.hideNow();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') c.hideNow(); };
    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', blurred);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('contextmenu', hide, true);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('mouseover', over); document.removeEventListener('mouseout', out);
      document.removeEventListener('focusin', focus); document.removeEventListener('focusout', blurred);
      document.removeEventListener('pointerdown', hide, true); document.removeEventListener('contextmenu', hide, true);
      document.removeEventListener('scroll', hide, true); document.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', hide);
      c.hideNow();
    };
  }, []);
  useEffect(() => { if (overlay) controller.current?.hideNow(); }, [overlay]);
}
