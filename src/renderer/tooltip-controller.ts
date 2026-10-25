import type { TooltipRequest } from '../shared/tooltip';

export const SHOW_DELAY_MS = 300;
/** Como en Windows: si acabas de ver un tooltip, el siguiente aparece sin esperar. */
export const REARM_MS = 400;
const LEAVE_GRACE_MS = 60;
interface Deps { show(target: TooltipRequest): void; hide(): void; now(): number; setTimer(fn: () => void, ms: number): unknown; clearTimer(handle: unknown): void }

/** Temporización pura del tooltip: sin DOM, para poder probarla con timers falsos. */
export class TooltipController {
  private visible = false;
  private lastHidden = -Infinity;
  private showTimer: unknown;
  private hideTimer: unknown;
  constructor(private deps: Deps) {}
  enter(target: TooltipRequest) {
    this.clear();
    if (this.visible || this.deps.now() - this.lastHidden < REARM_MS) this.present(target);
    else this.showTimer = this.deps.setTimer(() => { this.showTimer = undefined; this.present(target); }, SHOW_DELAY_MS);
  }
  /** La gracia evita ocultar y volver a mostrar al pasar entre iconos contiguos. */
  leave() {
    if (this.showTimer !== undefined) { this.deps.clearTimer(this.showTimer); this.showTimer = undefined; }
    if (this.visible && this.hideTimer === undefined) this.hideTimer = this.deps.setTimer(() => this.hideNow(), LEAVE_GRACE_MS);
  }
  hideNow() {
    this.clear();
    if (!this.visible) return;
    this.visible = false; this.lastHidden = this.deps.now(); this.deps.hide();
  }
  private present(target: TooltipRequest) { this.visible = true; this.deps.show(target); }
  private clear() {
    if (this.showTimer !== undefined) this.deps.clearTimer(this.showTimer);
    if (this.hideTimer !== undefined) this.deps.clearTimer(this.hideTimer);
    this.showTimer = this.hideTimer = undefined;
  }
}
