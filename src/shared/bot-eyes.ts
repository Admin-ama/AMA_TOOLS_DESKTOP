export type Point = { x: number; y: number };

/** Pupil offset toward `target`, capped at `max`; reaches `max` once the cursor is `reach` px away. */
export function eyeOffset(eye: Point, target: Point, max: number, reach = 200): Point {
  const dx = target.x - eye.x;
  const dy = target.y - eye.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: 0, y: 0 };
  const scale = Math.min(distance, reach) / reach * max / distance;
  return { x: dx * scale, y: dy * scale };
}
