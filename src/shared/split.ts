import { contentBounds } from './layout';
import { DEFAULT_SPLIT_RATIO } from './contracts';

/** Divisor, cabecera DOM del panel y ancho mínimo de cada lado, en píxeles. */
export const SPLIT = { divider: 6, header: 36, minPane: 320 } as const;
export interface Rect { x: number; y: number; width: number; height: number }
export interface SplitBounds { ratio: number; main: Rect; divider: Rect; panelHeader: Rect; panel: Rect }

/** Una sola geometría para el DOM del renderer y las vistas nativas. `null`: no caben dos lados de 320 px. */
export function splitBounds(width: number, height: number, ratio: number): SplitBounds | null {
  const area = contentBounds(width, height);
  const room = area.width - SPLIT.divider;
  if (room < SPLIT.minPane * 2) return null;
  const wanted = Number.isFinite(ratio) ? ratio : DEFAULT_SPLIT_RATIO;
  const panelWidth = Math.min(room - SPLIT.minPane, Math.max(SPLIT.minPane, Math.round(area.width * wanted)));
  const mainWidth = room - panelWidth;
  const dividerX = area.x + mainWidth;
  const panelX = dividerX + SPLIT.divider;
  return {
    ratio: panelWidth / area.width,
    main: { x: area.x, y: area.y, width: mainWidth, height: area.height },
    divider: { x: dividerX, y: area.y, width: SPLIT.divider, height: area.height },
    panelHeader: { x: panelX, y: area.y, width: panelWidth, height: SPLIT.header },
    panel: { x: panelX, y: area.y + SPLIT.header, width: panelWidth, height: Math.max(0, area.height - SPLIT.header) },
  };
}
