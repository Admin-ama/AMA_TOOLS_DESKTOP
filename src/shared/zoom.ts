export const PAGE_ZOOM = { min: 50, max: 200, step: 10, default: 100 } as const;
export function isZoomPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= PAGE_ZOOM.min && value <= PAGE_ZOOM.max;
}
