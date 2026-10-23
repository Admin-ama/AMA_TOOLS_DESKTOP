import { useEffect, useState } from 'react';
import { IconAppWindow, IconPlus, IconShieldLock, IconTrash } from '@tabler/icons-react';
import type { DesktopAppView } from '../shared/contracts';

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
  const target = apps.find(app => app.id === menu?.id);
  return <aside className="dock" aria-label="Aplicaciones de escritorio">
    <div className="dock-list">
      {forticlient && <button className="nav-item dock-item" aria-label="Abrir FortiClient" title="Abrir FortiClient" onClick={onForticlient}><IconShieldLock size={24} stroke={1.65} /></button>}
      {apps.map(app => <button key={app.id} className="nav-item dock-item" aria-label={`Abrir ${app.name} (escritorio)`} title={app.name} onClick={() => onOpen(app.id)}
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
