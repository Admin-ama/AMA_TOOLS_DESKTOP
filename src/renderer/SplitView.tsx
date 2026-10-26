import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { IconArrowsMaximize, IconX } from '@tabler/icons-react';
import type { Service, AppId, SplitCapture, SplitState } from '../shared/contracts';
import { splitBounds, type Rect, type SplitBounds } from '../shared/split';
import { ServiceLogo } from './service-visuals';

gsap.registerPlugin(useGSAP);

const MOTION = '(prefers-reduced-motion: no-preference)';
const KEY_STEP = 0.02;
const DRAG_THRESHOLD = 3;

interface Props {
  services: Service[];
  split: SplitState;
  width: number;
  height: number;
  onSet(id: AppId): void;
  onToTab(): void;
  onClose(): void;
  onResize(ratio: number, persist: boolean): Promise<void>;
  onCapture(): Promise<SplitCapture>;
  onDrag(active: boolean): Promise<void>;
}
interface Session { pointerId: number; startX: number; startPanel: number; area: number; ratio: number; moved: boolean; frame: number; start: SplitBounds; ready: Promise<void>; release(): void }
/** Lo que el arrastre necesita de un evento de puntero (React o nativo de window). */
type PointerPoint = Pick<globalThis.PointerEvent, 'pointerId' | 'clientX'>;
interface Ghost { capture: SplitCapture; main: Rect; panel: Rect }

const box = ({ x, y, width, height }: Rect): CSSProperties => ({ left: x, top: y, width, height });

/**
 * Cromo DOM del panel lateral: divisor, cabecera y el hueco donde la vista nativa se pega.
 * Las vistas nativas pintan por encima del DOM: durante el arrastre se ocultan y se muestran capturas.
 */
export function SplitView({ services, split, width, height, onSet, onToTab, onClose, onResize, onCapture, onDrag }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const session = useRef<Session | null>(null);
  // Pulsaciones seguidas: cada una parte del ratio ya enviado, no del que aún no se ha pintado desde el snapshot.
  const nudging = useRef<{ ratio: number; inflight: number } | null>(null);
  const [live, setLive] = useState<number | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  useGSAP(() => {
    gsap.matchMedia().add(MOTION, () => { gsap.from('.split-header', { opacity: 0, y: -6, duration: 0.18, ease: 'power2.out', clearProps: 'opacity,transform' }); });
  }, { scope: root });
  const layout = splitBounds(width, height, live ?? split.ratio);
  if (!layout) return null;
  const service = services.find(item => item.id === split.serviceId)!;

  async function begin(s: Session) {
    const capture = await onCapture().catch((): SplitCapture => ({ main: null, panel: null }));
    await onDrag(true);
    setGhost({ capture, main: s.start.main, panel: s.start.panel });
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || session.current || !layout) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    // Al ocultar las vistas nativas (split-drag) Chromium mueve el foco y el divisor pierde la captura:
    // el arrastre se sigue en window, que con las vistas ocultas cubre toda la ventana.
    const onMove = (next: globalThis.PointerEvent) => move(next);
    const onUp = (next: globalThis.PointerEvent) => void end(next, false);
    const onCancel = (next: globalThis.PointerEvent) => void end(next, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    const release = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel); };
    session.current = { pointerId: event.pointerId, startX: event.clientX, startPanel: layout.panel.width, area: layout.main.width + layout.divider.width + layout.panel.width, ratio: layout.ratio, moved: false, frame: 0, start: layout, ready: Promise.resolve(), release };
  }
  /** Si el foco salta al ocultar las vistas, se recupera la captura: así se sigue el puntero aunque salga de la ventana. */
  function recapture(event: PointerEvent<HTMLDivElement>) {
    if (session.current?.pointerId !== event.pointerId) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* el puntero ya se soltó: window recibe el pointerup */ }
  }
  function move(event: PointerPoint) {
    const s = session.current;
    if (!s || event.pointerId !== s.pointerId) return;
    const delta = s.startX - event.clientX; // Hacia la izquierda el panel crece.
    if (!s.moved) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;
      s.moved = true;
      s.ready = begin(s).catch(() => undefined);
    }
    const next = splitBounds(width, height, (s.startPanel + delta) / s.area);
    if (!next) return;
    s.ratio = next.ratio;
    cancelAnimationFrame(s.frame);
    s.frame = requestAnimationFrame(() => setLive(s.ratio));
  }
  async function end(event: PointerPoint, cancelled: boolean) {
    const s = session.current;
    if (!s || event.pointerId !== s.pointerId) return;
    session.current = null;
    s.release();
    cancelAnimationFrame(s.frame);
    if (!s.moved) return;
    // El punto de suelta manda: el último pointermove puede no haber llegado si la captura saltó.
    if (!cancelled) s.ratio = splitBounds(width, height, (s.startPanel + s.startX - event.clientX) / s.area)?.ratio ?? s.ratio;
    await s.ready;
    // Primero el ratio (con las vistas ocultas) y después se vuelven a mostrar en su nuevo sitio.
    if (!cancelled) await onResize(s.ratio, true).catch(() => undefined);
    await onDrag(false).catch(() => undefined);
    setGhost(null);
    setLive(null);
  }
  function key(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === 'ArrowLeft' ? KEY_STEP : event.key === 'ArrowRight' ? -KEY_STEP : 0;
    if (!step || !layout) return;
    event.preventDefault();
    const pending = nudging.current ?? { ratio: layout.ratio, inflight: 0 };
    pending.ratio = splitBounds(width, height, Math.min(0.9, Math.max(0.1, pending.ratio + step)))?.ratio ?? pending.ratio;
    pending.inflight++;
    nudging.current = pending;
    void onResize(pending.ratio, true).catch(() => undefined).finally(() => { if (--pending.inflight === 0) setTimeout(() => { if (pending.inflight === 0 && nudging.current === pending) nudging.current = null; }, 400); });
  }

  return <div ref={root} className="split-layer">
    <div className="split-slot" data-testid="split-panel-slot" aria-hidden="true" style={box(layout.panel)} />
    <div className="split-header" style={box(layout.panelHeader)}>
      <span className="split-logo"><ServiceLogo id={service.id} icon={service.icon} /></span>
      <select className="split-select" aria-label="App del panel" value={split.serviceId} onChange={event => onSet(event.target.value as AppId)}>
        {services.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <button className="icon-button" aria-label="Abrir como pestaña" title="Abrir como pestaña" onClick={onToTab}><IconArrowsMaximize size={16} /></button>
      <button className="icon-button" aria-label="Cerrar panel" title="Cerrar panel" onClick={onClose}><IconX size={17} /></button>
    </div>
    <div className={`split-divider ${ghost ? 'dragging' : ''}`} role="separator" aria-orientation="vertical" aria-label="Redimensionar panel lateral" aria-valuemin={10} aria-valuemax={90} aria-valuenow={Math.round(layout.ratio * 100)} tabIndex={0} style={box(layout.divider)}
      onPointerDown={down} onLostPointerCapture={recapture}
      onDoubleClick={() => void onResize(0.5, true).catch(() => undefined)} onKeyDown={key} />
    {ghost && <>
      <div className="split-ghost" data-testid="split-ghost-main" style={box(layout.main)}>{ghost.capture.main && <img src={ghost.capture.main} alt="" draggable={false} style={{ width: ghost.main.width, height: ghost.main.height }} />}</div>
      <div className="split-ghost" data-testid="split-ghost-panel" style={box(layout.panel)}>{ghost.capture.panel && <img src={ghost.capture.panel} alt="" draggable={false} style={{ width: ghost.panel.width, height: ghost.panel.height }} />}</div>
    </>}
  </div>;
}
