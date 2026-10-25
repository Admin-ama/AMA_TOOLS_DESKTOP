import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { IconAppWindow, IconPlus, IconShieldLock, IconTrash } from '@tabler/icons-react';
import type { DesktopAppView } from '../shared/contracts';

const MOTION = '(prefers-reduced-motion: no-preference)';

interface Props {
  apps: DesktopAppView[];
  forticlient: boolean;
  blocked: boolean;
  full: boolean;
  onForticlient(): void;
  onAdd(): void;
  onOpen(id: string): void;
  onRemove(id: string): void;
}

/** Accesos directos a apps de escritorio del equipo; solo conoce id, nombre e icono, nunca rutas. */
export function DesktopDock({ apps, forticlient, blocked, full, onForticlient, onAdd, onOpen, onRemove }: Props) {
  const [menu, setMenu] = useState<{ id: string; top: number }>();
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(undefined);
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', key); };
  }, [menu]);
  // Un icono recién vinculado entra con un pequeño pop (respeta movimiento reducido); la primera carga no anima.
  const known = useRef<Set<string> | null>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    const fresh = known.current ? apps.filter(app => !known.current!.has(app.id)).map(app => nodes.current.get(app.id)).filter((node): node is HTMLElement => !!node) : [];
    known.current = new Set(apps.map(app => app.id));
    if (!fresh.length) return;
    const mm = gsap.matchMedia();
    mm.add(MOTION, () => { gsap.fromTo(fresh, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.38, ease: 'back.out(2.2)', clearProps: 'transform,opacity' }); });
  }, [apps]);
  const target = apps.find(app => app.id === menu?.id);
  return <aside className="dock" aria-label="Aplicaciones de escritorio">
    <div className="dock-list">
      {forticlient && <button className="nav-item dock-item" aria-label="Abrir FortiClient" title="Abrir FortiClient" onClick={onForticlient}><IconShieldLock size={24} stroke={1.65} /></button>}
      {apps.map(app => <button key={app.id} ref={node => { if (node) nodes.current.set(app.id, node); else nodes.current.delete(app.id); }} className="nav-item dock-item" aria-label={`Abrir ${app.name} (escritorio)`} title={app.name} onClick={() => onOpen(app.id)}
        onContextMenu={event => { event.preventDefault(); const dock = event.currentTarget.closest('.dock')!.getBoundingClientRect(); setMenu({ id: app.id, top: event.clientY - dock.top }); }}>
        {app.icon ? <img className="dock-icon" src={app.icon} alt="" draggable={false} /> : <IconAppWindow size={24} stroke={1.65} />}
      </button>)}
    </div>
    <button className="nav-item dock-add" aria-label="Vincular aplicación de escritorio" title={full ? 'Máximo de aplicaciones alcanzado' : 'Vincular aplicación de escritorio'} disabled={blocked || full} onClick={onAdd}><IconPlus size={22} stroke={1.65} /></button>
    {menu && target && <div className="dock-menu" role="menu" style={{ top: menu.top }}>
      <button role="menuitem" className="icon-button destructive" aria-label={`Quitar ${target.name} de la barra`} title="Quitar de la barra" onClick={() => { setMenu(undefined); onRemove(target.id); }}><IconTrash size={18} /></button>
    </div>}
  </aside>;
}
