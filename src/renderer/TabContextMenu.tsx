import { useRef } from 'react';
import { useMenu, type MenuAnchor } from './AppContextMenu';

export type TabMenuAction = 'copy-url' | 'open-browser';

interface Props {
  /** Título de la pestaña, para el nombre accesible del menú. */
  label: string;
  anchor: MenuAnchor;
  onAction(action: TabMenuAction): void;
  /** `restoreFocus`: se cerró con el teclado, el foco vuelve a la pestaña. */
  onClose(restoreFocus: boolean): void;
}

/** Menú de una pestaña: copiar su URL o abrirla en el navegador del sistema. Mismo aspecto y teclado que el de las apps. */
export function TabContextMenu({ label, anchor, onAction, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const key = useMenu(root, anchor, onClose);
  const item = (action: TabMenuAction, text: string) => <button role="menuitem" className="app-menu-item" onClick={() => onAction(action)}>{text}</button>;
  return <>
    <div className="menu-backdrop" onMouseDown={() => onClose(false)} onContextMenu={event => { event.preventDefault(); onClose(false); }} />
    <div ref={root} className="app-menu" role="menu" aria-label={`Acciones de la pestaña ${label}`} style={{ left: anchor.left, top: anchor.top }} onKeyDown={key}>
      {item('copy-url', 'Copiar URL')}
      {item('open-browser', 'Abrir en el navegador')}
    </div>
  </>;
}
