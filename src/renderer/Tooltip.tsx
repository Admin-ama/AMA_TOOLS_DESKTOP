import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { pillPosition, TOOLTIP_SIZE, type TooltipSide } from '../shared/tooltip';

gsap.registerPlugin(useGSAP);
const MOTION = '(prefers-reduced-motion: no-preference)';
const SLIDE = { right: { x: -6, y: 0 }, left: { x: 6, y: 0 }, bottom: { x: 0, y: -6 } } as const;
const ORIGIN: Record<TooltipSide, string> = { right: '0% 50%', left: '100% 50%', bottom: '50% 0%' };

/** Contenido de la ventana nativa del tooltip: el proceso principal empuja qué mostrar y dónde; aquí nunca se llama a main. */
export function Tooltip() {
  const root = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const arrow = useRef<HTMLSpanElement>(null);
  useGSAP(() => {
    const el = pill.current!, text = label.current!, tip = arrow.current!;
    let visible = false;
    return window.portal.onTooltip(push => {
      const animate = window.matchMedia(MOTION).matches;
      if (push.kind === 'hide') {
        visible = false;
        gsap.killTweensOf(el);
        if (animate) gsap.to(el, { autoAlpha: 0, duration: 0.08, ease: 'power1.out' }); else gsap.set(el, { autoAlpha: 0 });
        return;
      }
      document.documentElement.dataset.theme = push.theme;
      el.dataset.side = push.side;
      const changed = text.textContent !== push.text;
      text.textContent = push.text; // Nodo de texto: nunca HTML.
      const pos = pillPosition(push.side, push, { width: el.offsetWidth, height: el.offsetHeight }, TOOLTIP_SIZE);
      const arrowAt = push.side === 'bottom' ? { left: pos.arrow - 4, top: -4.5 } : push.side === 'right' ? { top: pos.arrow - 4, left: -4.5 } : { top: pos.arrow - 4, left: el.offsetWidth - 5.5 };
      const place = { x: pos.x, y: pos.y, autoAlpha: 1, scale: 1 };
      gsap.killTweensOf(el);
      if (!animate) { gsap.set(el, place); gsap.set(tip, arrowAt); }
      else if (!visible) {
        const slide = SLIDE[push.side];
        gsap.set(tip, arrowAt);
        gsap.fromTo(el, { x: pos.x + slide.x, y: pos.y + slide.y, autoAlpha: 0, scale: 0.96, transformOrigin: ORIGIN[push.side] }, { ...place, duration: 0.14, ease: 'power2.out' });
      } else {
        // Entre iconos contiguos: la píldora se desliza y el texto se funde, sin volver a "saltar".
        gsap.set(el, { transformOrigin: ORIGIN[push.side] });
        gsap.to(el, { ...place, duration: 0.14, ease: 'power2.out' });
        gsap.to(tip, { ...arrowAt, duration: 0.14, ease: 'power2.out' });
        if (changed) gsap.fromTo(text, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12, ease: 'power1.out' });
      }
      visible = true;
    });
  }, { scope: root });
  return <div ref={root} className="tip-stage" aria-hidden="true"><div ref={pill} className="tip-pill"><span ref={label} className="tip-label" /><span ref={arrow} className="tip-arrow" /></div></div>;
}
