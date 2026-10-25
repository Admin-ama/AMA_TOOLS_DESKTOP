import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { FIXED_APPS, type Service } from '../shared/contracts';

gsap.registerPlugin(useGSAP);

const MOTION = '(prefers-reduced-motion: no-preference)';
export type MenuAction = 'open' | 'tab' | 'split' | 'unpin' | 'edit' | 'remove';
/** Zona del icono (o tarjeta) a la que se ancla el menú. */
export interface MenuAnchor { left: number; top: number }

/** Posición a la derecha del elemento; Shift+F10 / tecla Menú y clic derecho comparten esta forma de abrir. */
export function anchorOf(element: Element): MenuAnchor {
  const rect = element.getBoundingClientRect();
  return { left: rect.right + 6, top: rect.top };
}
/** Tecla de menú contextual del teclado (Shift+F10 o la tecla Menú). */
export const isMenuKey = (event: KeyboardEvent) => event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');

interface Props {
  service: Service;
  pinned: boolean;
  anchor: MenuAnchor;
  onAction(action: MenuAction): void;
  /** `restoreFocus`: se cerró con el teclado, el foco vuelve al icono. */
  onClose(restoreFocus: boolean): void;
}

/**
 * Menú de acciones de una app. Vive en el DOM: mientras está abierto el proceso principal oculta las vistas
 * nativas (comando overlay), que de otro modo pintarían por encima de él.
 */
export function AppContextMenu({ service, pinned, anchor, onAction, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const unpinnable = pinned && !FIXED_APPS.includes(service.id); // las fijas no se quitan
  const items = () => [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
  useGSAP(() => {
    gsap.matchMedia().add(MOTION, () => { gsap.from(root.current, { opacity: 0, y: -4, scale: 0.97, duration: 0.12, ease: 'power2.out', clearProps: 'opacity,transform' }); });
  }, { scope: root });
  // Dentro de la ventana: no se sale por abajo ni por la derecha.
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(anchor.top, window.innerHeight - height - 8))}px`;
  }, [anchor, confirming]);
  useEffect(() => { items()[0]?.focus(); }, [confirming]);

  function key(event: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (next: number) => { event.preventDefault(); list[(next + list.length) % list.length]?.focus(); };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(list.length - 1);
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(true); }
    else if (event.key === 'Tab') { event.preventDefault(); onClose(true); }
  }

  const item = (action: MenuAction, label: string, danger = false) => <button role="menuitem" className={`app-menu-item ${danger ? 'danger' : ''}`} onClick={() => onAction(action)}>{label}</button>;
  return <>
    <div className="menu-backdrop" onMouseDown={() => onClose(false)} onContextMenu={event => { event.preventDefault(); onClose(false); }} />
    <div ref={root} className="app-menu" role="menu" aria-label={`Acciones de ${service.name}`} style={{ left: anchor.left, top: anchor.top }} onKeyDown={key}>
      {confirming ? <>
        <p className="app-menu-confirm">¿Eliminar {service.name}?</p>
        {item('remove', 'Eliminar', true)}
        <button role="menuitem" className="app-menu-item" onClick={() => setConfirming(false)}>Cancelar</button>
      </> : <>
        {item('open', 'Abrir')}
        {item('tab', 'Abrir en pestaña nueva')}
        {item('split', 'Abrir a la derecha')}
        {(unpinnable || service.custom) && <div className="app-menu-separator" role="separator" />}
        {unpinnable && item('unpin', 'Quitar de la barra')}
        {service.custom && item('edit', 'Editar…')}
        {service.custom && <button role="menuitem" className="app-menu-item danger" onClick={() => setConfirming(true)}>Eliminar</button>}
      </>}
    </div>
  </>;
}
