import type { Point } from '../shared/bot-eyes';

type Bounds = { x: number; y: number; width: number; height: number };
interface CursorSource { cursor(): Point; bounds(): Bounds; visible(): boolean; send(point: Point): void }

export function toContentPoint(screen: Point, content: Bounds): Point {
  return { x: screen.x - content.x, y: screen.y - content.y };
}

/** Polls the global cursor because remote WebContentsViews swallow mouse events before the shell sees them. */
export class CursorTracker {
  private last?: Point;
  private timer: ReturnType<typeof setInterval>;

  constructor(private source: CursorSource, interval = 33) {
    this.timer = setInterval(() => this.tick(), interval);
  }

  private tick() {
    if (!this.source.visible()) return;
    const point = toContentPoint(this.source.cursor(), this.source.bounds());
    if (this.last && this.last.x === point.x && this.last.y === point.y) return;
    this.last = point;
    this.source.send(point);
  }

  dispose() { clearInterval(this.timer); }
}
