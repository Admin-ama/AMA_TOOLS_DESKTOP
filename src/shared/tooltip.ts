/** Tooltips nativos: ventana hija transparente que flota sobre las vistas del contenido. */
export type TooltipSide = 'right' | 'left' | 'bottom';
export interface Rect { x: number; y: number; width: number; height: number }
export interface TooltipRequest { text: string; rect: Rect; side: TooltipSide }
/** Lo único que recibe la ventana del tooltip: el proceso principal empuja, ella nunca llama. */
export type TooltipPush = { kind: 'show'; text: string; side: TooltipSide; anchorX: number; anchorY: number; theme: 'dark' | 'light' } | { kind: 'hide' };
export const TOOLTIP_SIZE = { width: 360, height: 64 } as const;
export const TOOLTIP_GAP = 8;
export const TOOLTIP_MAX = 120;
/** Margen entre la ventana y la píldora: deja sitio a la flecha y a la sombra. */
export const TOOLTIP_INSET = 4;
const SIDES: readonly string[] = ['right', 'left', 'bottom'];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));

/** Ventana (DIP de pantalla) para un ancla en px CSS del shell, acotada al área del padre; anchorX/Y = centro del ancla dentro de la ventana. */
export function tooltipBounds(anchor: Rect, side: TooltipSide, size: { width: number; height: number }, parent: Rect, zoom: number) {
  const left = parent.x + anchor.x * zoom, top = parent.y + anchor.y * zoom, width = anchor.width * zoom, height = anchor.height * zoom;
  const centerX = left + width / 2, centerY = top + height / 2;
  const ideal = side === 'right' ? { x: left + width + TOOLTIP_GAP, y: centerY - size.height / 2 }
    : side === 'left' ? { x: left - TOOLTIP_GAP - size.width, y: centerY - size.height / 2 }
    : { x: centerX - size.width / 2, y: top + height + TOOLTIP_GAP };
  const x = Math.round(clamp(ideal.x, parent.x, parent.x + parent.width - size.width));
  const y = Math.round(clamp(ideal.y, parent.y, parent.y + parent.height - size.height));
  return { x, y, width: size.width, height: size.height, anchorX: Math.round(centerX - x), anchorY: Math.round(centerY - y) };
}

/** Posición de la píldora dentro de la ventana y de su flecha (desplazamiento a lo largo del borde). */
export function pillPosition(side: TooltipSide, anchor: { anchorX: number; anchorY: number }, pill: { width: number; height: number }, win: { width: number; height: number }) {
  const edge = 4, tip = 10;
  if (side === 'bottom') { const x = clamp(anchor.anchorX - pill.width / 2, edge, win.width - pill.width - edge); return { x, y: TOOLTIP_INSET, arrow: clamp(anchor.anchorX - x, tip, pill.width - tip) }; }
  const y = clamp(anchor.anchorY - pill.height / 2, edge, win.height - pill.height - edge);
  return { x: side === 'right' ? TOOLTIP_INSET : win.width - pill.width - TOOLTIP_INSET, y, arrow: clamp(anchor.anchorY - y, tip, pill.height - tip) };
}

const finite = (value: unknown, min: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= 1e5;
/** Todo dato del renderer se valida aquí: texto plano ≤ 120, rect finito y lado conocido. */
export function parseTooltipShow(args: unknown[]): TooltipRequest {
  const [text, rect, side] = args;
  if (typeof text !== 'string' || !text.trim() || text.length > TOOLTIP_MAX || typeof side !== 'string' || !SIDES.includes(side) || !rect || typeof rect !== 'object' || Array.isArray(rect)) throw new Error('Tooltip inválido');
  const { x, y, width, height } = rect as Record<string, unknown>;
  if (!finite(x, -1e5) || !finite(y, -1e5) || !finite(width, 0) || !finite(height, 0)) throw new Error('Tooltip inválido');
  return { text, rect: { x, y, width, height }, side: side as TooltipSide };
}
