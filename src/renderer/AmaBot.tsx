import { useEffect, useRef } from 'react';
import { eyeOffset } from '../shared/bot-eyes';

const MAX_OFFSET = 110; // SVG units, keeps pupils inside the face

export function AmaBot({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    // Main process polls the cursor: mousemove never fires while hovering a remote service view.
    const unsubscribe = window.portal.onCursor(point => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const svg = svgRef.current, eyes = eyesRef.current;
        if (!svg || !eyes) return;
        const box = svg.getBoundingClientRect();
        const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        const { x, y } = eyeOffset(center, point, MAX_OFFSET);
        eyes.style.transform = `translate(${x}px, ${y}px)`;
      });
    });
    return () => { cancelAnimationFrame(frame); unsubscribe(); };
  }, []);

  return <svg ref={svgRef} className={className} viewBox="0 0 1280 1280" aria-hidden="true">
    <rect x="264" y="300" width="728" height="712" rx="170" fill="#00534F" />
    <g ref={eyesRef} className="bot-eyes" fill="#FFFFFF">
      <g className="bot-eye"><rect x="449" y="560" width="90" height="196" rx="45" /></g>
      <g className="bot-eye"><rect x="715" y="560" width="90" height="196" rx="45" /></g>
    </g>
  </svg>;
}
