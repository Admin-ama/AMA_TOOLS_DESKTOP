import { useEffect, useRef, useState, type KeyboardEvent, type CSSProperties } from 'react';
import { IconSettings, IconHelpHexagon, IconMoon, IconSun, IconRefresh, IconShieldCheck, IconAlertTriangle, IconChevronLeft, IconTrash, IconActivity, IconPlus, IconMinus, IconX, IconLayoutGrid, IconLayoutSidebarRight } from '@tabler/icons-react';
import { CATEGORIES, MINE_CATEGORY, type AppId, type Snapshot } from '../shared/contracts';
import { SHELL_LAYOUT } from '../shared/layout';
import { PAGE_ZOOM } from '../shared/zoom';
import { Launcher } from './Launcher';
import { AppContextMenu, anchorOf, isMenuKey, type MenuAction, type MenuAnchor } from './AppContextMenu';
import { NetworkBlock } from './NetworkBlock';
import { DesktopDock } from './DesktopDock';
import { DesktopPicker } from './DesktopPicker';
import { StatusBar } from './StatusBar';
import { Splash } from './Splash';
import { SplitView } from './SplitView';
import { ServiceLogo, AppIcon } from './service-visuals';
import { useTooltips } from './use-tooltips';

const updateLabels = { disabled: 'Las actualizaciones están disponibles en la app instalada de Windows.', idle: 'Puedes buscar una nueva versión.', checking: 'Buscando actualizaciones…', available: 'Hay una nueva versión disponible.', current: 'Tienes la última versión disponible.', downloading: 'Descargando actualización…', downloaded: 'La actualización está lista para instalar.', installing: 'Instalando actualización…', error: 'No se pudo actualizar. Revisa la conexión a GitHub y vuelve a intentar.' };

export function App() {
  const [state, setState] = useState<Snapshot>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [menu, setMenu] = useState<{ id: AppId; anchor: MenuAnchor } | null>(null);
  // "Editar…" desde el menú abre el launcher con el formulario de esa página; cada petición es un objeto nuevo.
  const [editRequest, setEditRequest] = useState<{ id: AppId } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [picker, setPicker] = useState(false);
  useEffect(() => {
    const unsubscribe = window.portal.onChange(setState);
    void window.portal.snapshot().then(setState).catch(() => setError('No se pudo conectar con el contenedor. Reinicia la aplicación.'));
    return unsubscribe;
  }, []);
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useTooltips(!!menu || picker || (!!state && state.panel !== 'service'));
  useEffect(() => { if (state) document.documentElement.dataset.theme = state.preferences.theme; }, [state?.preferences.theme]);
  useEffect(() => { if (state && state.panel !== 'launcher') setEditRequest(null); }, [state?.panel]);
  // Sin red las vistas ya están ocultas y los botones deshabilitados: el menú no debe quedar flotando.
  useEffect(() => { if (menu && state && state.network.status !== 'connected') { setMenu(null); void window.portal.overlay(false).catch(() => undefined); } }, [menu, state?.network.status]);
  useEffect(() => { if (picker && state && state.network.status !== 'connected') { setPicker(false); void window.portal.overlay(false).catch(() => undefined); } }, [picker, state?.network.status]);
  useEffect(() => { if (state?.activeTabId) document.getElementById(`tab-${state.activeTabId}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [state?.activeTabId]);

  async function action(task: () => Promise<void>, success = '') {
    setError(''); setNotice('');
    try { await task(); if (success) setNotice(success); }
    catch { setError('No se pudo completar la acción. Vuelve a intentar.'); }
  }

  // Sin estado todavía, el logo ya ocupa la ventana: nunca se ve un fondo negro vacío.
  if (!state) return error ? <p role="alert">{error}</p> : <><Splash key="splash" /></>;
  const service = state.services.find(s => s.id === state.active)!;
  const activeTabs = state.tabs.filter(tab => tab.serviceId === state.active);
  const light = state.preferences.theme === 'light';
  const blocked = state.network.status !== 'connected';
  // Fijadas por categoría; como en una barra de tareas, una app no fijada se muestra mientras tenga pestañas abiertas.
  const sidebarGroups = [...CATEGORIES, MINE_CATEGORY].map(category => ({
    label: category.label,
    ids: state.services.filter(item => item.category === category.id && (state.preferences.pinned.includes(item.id) || item.id === state.active || state.tabs.some(tab => tab.serviceId === item.id)))
      .sort((a, b) => { const rank = (id: AppId) => { const index = state.preferences.pinned.indexOf(id); return index < 0 ? Infinity : index; }; return rank(a.id) - rank(b.id); }),
  })).filter(group => group.ids.length > 0);
  const activate = (id: AppId) => void action(() => window.portal.activate(id));
  const selectTab = (id: string) => void action(() => window.portal.selectTab(id));
  const panel = (value: Snapshot['panel']) => void action(() => window.portal.panel(value));
  const toggleTheme = () => void action(() => window.portal.theme(light ? 'dark' : 'light'));

  // Las vistas nativas pintan por encima del DOM: mientras el menú está abierto el proceso principal las oculta.
  function openMenu(id: AppId, source: HTMLElement) {
    trigger.current = source;
    setMenu({ id, anchor: anchorOf(source) });
    void window.portal.overlay(true).catch(() => undefined);
  }
  function closeMenu(restoreFocus: boolean) {
    setMenu(null);
    void window.portal.overlay(false).catch(() => undefined);
    if (restoreFocus) trigger.current?.focus();
  }
  // Selector de apps instaladas: mismo mecanismo que el menú, las vistas nativas se ocultan mientras está abierto.
  function openPicker() {
    setPicker(true);
    void window.portal.overlay(true).catch(() => undefined);
  }
  function closePicker() {
    setPicker(false);
    void window.portal.overlay(false).catch(() => undefined);
    document.querySelector<HTMLElement>('.dock-add')?.focus();
  }
  function runMenu(choice: MenuAction) {
    if (!menu) return;
    const { id } = menu;
    closeMenu(false);
    if (choice === 'open') activate(id);
    // Una app aún sin abrir ya recibe su primera pestaña al activarse: abrir otra daría dos.
    else if (choice === 'tab') { const opened = state!.tabs.some(tab => tab.serviceId === id); void action(async () => { await window.portal.activate(id); if (opened) await window.portal.openTab(); }); }
    else if (choice === 'split') void action(() => window.portal.splitOpen(id));
    else if (choice === 'unpin') void action(() => window.portal.pin(id, false));
    else if (choice === 'edit') { setEditRequest({ id }); panel('launcher'); }
    else void action(() => window.portal.customRemove(id));
  }

  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % activeTabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + activeTabs.length) % activeTabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = activeTabs.length - 1;
    else return;
    event.preventDefault();
    const id = activeTabs[next].id;
    document.getElementById(`tab-${id}`)?.focus();
    selectTab(id);
  }

  async function settingsAction(task: () => Promise<void>, success: string) {
    setBusy(true);
    try { await action(task, success); } finally { setBusy(false); }
  }

  // Misma clave en ambos returns: la animación del logo no se reinicia al llegar el primer estado.
  return <><div key="shell" className="app-shell" style={{ '--sidebar-width': `${SHELL_LAYOUT.sidebarWidth}px`, '--header-height': `${SHELL_LAYOUT.headerHeight}px`, '--right-sidebar-width': `${SHELL_LAYOUT.rightSidebarWidth}px`, '--status-bar-height': `${SHELL_LAYOUT.statusBarHeight}px` } as CSSProperties}>
    <aside className="sidebar" aria-label="Navegación principal">
      <div className="brand"><button className={`nav-item launcher-button ${state.panel === 'launcher' ? 'active' : ''}`} disabled={blocked} aria-label="Ver todas las aplicaciones" data-tooltip="Aplicaciones" data-tooltip-side="right" aria-pressed={state.panel === 'launcher'} onClick={() => panel(state.panel === 'launcher' ? 'service' : 'launcher')}><IconLayoutGrid size={24} stroke={1.65} /></button></div>
      <nav className="service-nav" aria-label="Servicios">
        {sidebarGroups.map(group => <div className="nav-group" role="group" aria-label={group.label} key={group.label}>
        {group.ids.map(item => {
          return <button key={item.id} className={`nav-item ${state.active === item.id && state.panel === 'service' ? 'active' : ''}`} disabled={blocked} aria-label={`Abrir ${item.name}`} data-tooltip={item.name} data-tooltip-side="right" aria-current={state.active === item.id && state.panel === 'service' ? 'page' : undefined} aria-haspopup="menu" onClick={() => activate(item.id)} onContextMenu={event => { event.preventDefault(); openMenu(item.id, event.currentTarget); }} onKeyDown={event => { if (isMenuKey(event)) { event.preventDefault(); openMenu(item.id, event.currentTarget); } }}>
            <ServiceLogo id={item.id} icon={item.icon} />
            {state.states[item.id].status === 'ready' && <span className="nav-dot" />}
          </button>;
        })}
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <button className={`nav-item ${state.panel === 'settings' ? 'active' : ''}`} aria-label="Ajustes" data-tooltip="Ajustes" data-tooltip-side="right" onClick={() => panel('settings')}><IconSettings size={22} stroke={1.65} /></button>
        <button className={`nav-item ${state.panel === 'help' ? 'active' : ''}`} aria-label="Ayuda" data-tooltip="Ayuda y seguridad" data-tooltip-side="right" onClick={() => panel('help')}><IconHelpHexagon size={22} stroke={1.65} /></button>
      </div>
    </aside>

    <header className="header">
      <div className="tab-strip">
      <div className="tabs" role="tablist" aria-label={`Pestañas de ${service.shortName}`}>
        {activeTabs.map((tab, index) => {
          const label = tab.title || service.shortName;
          const selected = state.activeTabId === tab.id;
          return <div key={tab.id} className={`tab-group ${selected ? 'selected' : ''}`}>
            <button id={`tab-${tab.id}`} data-testid={`${tab.serviceId}-tab-${tab.number}`} role="tab" data-tooltip={label} data-tooltip-side="bottom" aria-selected={selected} disabled={blocked} aria-controls="service-content" tabIndex={selected ? 0 : -1} className={`app-tab ${selected ? 'selected' : ''}`} onClick={() => selectTab(tab.id)} onKeyDown={event => tabKey(event, index)}>
              <AppIcon id={tab.serviceId} icon={service.icon} /><span>{label}</span>
            </button>
            <button className="close-tab" data-testid={`close-${tab.serviceId}-tab-${tab.number}`} aria-label={`Cerrar ${label}`} data-tooltip={`Cerrar ${label}`} data-tooltip-side="bottom" onClick={() => void action(() => window.portal.closeTab(tab.id))}><IconX size={13} /></button>
          </div>;
        })}
      </div>
      <button className="icon-button new-tab" disabled={blocked} aria-label={`Abrir nueva pestaña de ${service.shortName}`} data-tooltip={`Nueva pestaña de ${service.shortName}`} data-tooltip-side="bottom" onClick={() => void action(() => window.portal.openTab())}><IconPlus size={19} /></button>
      </div>
      <div className="header-actions">
        <div className="zoom-control" role="group" aria-label="Zoom de la aplicación">
          <button className="icon-button" aria-label="Reducir zoom" data-tooltip="Reducir zoom" data-tooltip-side="bottom" disabled={blocked || state.panel !== 'service' || state.zoomPercent <= PAGE_ZOOM.min} onClick={() => void action(() => window.portal.zoom(Math.max(PAGE_ZOOM.min, state.zoomPercent - PAGE_ZOOM.step)))}><IconMinus size={15} /></button>
          <button className="zoom-percent" aria-label="Restablecer zoom" data-tooltip="Restablecer zoom al 100%" data-tooltip-side="bottom" disabled={blocked || state.panel !== 'service'} onClick={() => void action(() => window.portal.zoom(PAGE_ZOOM.default))}>{state.zoomPercent}%</button>
          <button className="icon-button" aria-label="Aumentar zoom" data-tooltip="Aumentar zoom" data-tooltip-side="bottom" disabled={blocked || state.panel !== 'service' || state.zoomPercent >= PAGE_ZOOM.max} onClick={() => void action(() => window.portal.zoom(Math.min(PAGE_ZOOM.max, state.zoomPercent + PAGE_ZOOM.step)))}><IconPlus size={15} /></button>
        </div>
        <button className="icon-button" aria-label="Recargar servicio" data-tooltip="Recargar servicio" data-tooltip-side="bottom" onClick={() => void action(() => window.portal.reload())}><IconRefresh size={19} /></button>
        <button className={`icon-button ${state.split ? 'toggled' : ''}`} aria-label={state.split ? 'Cerrar panel lateral' : 'Abrir panel lateral'} aria-pressed={!!state.split} data-tooltip={state.split ? 'Cerrar panel lateral' : 'Abrir panel lateral'} data-tooltip-side="bottom" disabled={blocked && !state.split} onClick={() => void action(() => state.split ? window.portal.splitClose() : window.portal.splitOpen())}><IconLayoutSidebarRight size={19} /></button>
        <button className="icon-button" aria-label={light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'} data-tooltip={light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'} data-tooltip-side="bottom" onClick={toggleTheme}>{light ? <IconSun size={19} /> : <IconMoon size={19} />}</button>
      </div>
    </header>

    <DesktopDock apps={state.desktopApps} forticlient={state.network.forticlient} blocked={blocked} full={state.desktopApps.length >= 20} onForticlient={() => void action(() => window.portal.openForticlient())} onAdd={openPicker} onOpen={id => void action(() => window.portal.openDesktopApp(id))} onRemove={id => void action(() => window.portal.removeDesktopApp(id))} />

    <main id="service-content" className="content" role="tabpanel" aria-labelledby={state.activeTabId ? `tab-${state.activeTabId}` : undefined}>
      {blocked && (state.panel === 'service' || state.panel === 'launcher') && <NetworkBlock network={state.network} onRetry={() => action(() => window.portal.reload())} onForticlient={() => action(() => window.portal.openForticlient())} />}
      {!blocked && state.panel === 'launcher' && <Launcher services={state.services} pinned={state.preferences.pinned} onOpen={activate} onSplit={id => void action(() => window.portal.splitOpen(id))} onPin={(id, pinned) => void action(() => window.portal.pin(id, pinned))} onClose={() => panel('service')} onAdd={input => window.portal.customAdd(input)} onEdit={(id, input) => window.portal.customEdit(id, input)} onMenu={openMenu} editRequest={editRequest} />}
      {state.panel === 'settings' && <section className="settings-page">
        <button className="back-button" onClick={() => panel('service')}><IconChevronLeft size={17} />Volver al servicio</button>
        <div className="page-heading"><span className="eyebrow">PERSONALIZA TU ESPACIO</span><h1>Preferencias del portal</h1><p>Tu interfaz y tus sesiones. Cada aplicación conserva su propio inicio de sesión.</p></div>
        <div className="settings-card theme-setting"><div><h2>Apariencia</h2><p>El tema se aplica al contenedor, no al contenido de los servicios.</p></div><button className="secondary-button" onClick={toggleTheme}>{light ? <IconMoon size={18} /> : <IconSun size={18} />}{light ? 'Usar tema oscuro' : 'Usar tema claro'}</button></div>
        <div className="settings-card" aria-label="Actualizaciones">
          <h2>Actualizaciones · v{state.updates.currentVersion}</h2>
          <p aria-live="polite">{updateLabels[state.updates.status]}{state.updates.version && ` Versión ${state.updates.version}.`}{state.updates.status === 'downloading' && ` ${state.updates.progress ?? 0}%`}</p>
          <div className="update-actions">
            <button className="secondary-button" disabled={!['idle', 'current', 'error', 'available'].includes(state.updates.status)} onClick={() => void action(() => window.portal.checkUpdates())}>Buscar actualizaciones</button>
            {state.updates.status === 'available' && <button className="secondary-button" onClick={() => void action(() => window.portal.downloadUpdate())}>Descargar actualización</button>}
            {state.updates.status === 'downloaded' && <button className="secondary-button" onClick={() => void action(() => window.portal.installUpdate())}>Instalar y reiniciar</button>}
          </div>
        </div>
        <h2 className="section-title">Sesiones independientes</h2><p className="section-description">Cambiar la persistencia borra la sesión local de ese servicio. No guardamos contraseñas.</p>
        <div className="settings-card session-list">
          {state.services.map(item => {
            return <div className="session-row" key={item.id}><span className="session-icon"><AppIcon id={item.id} icon={item.icon} size={22} /></span><div className="session-info"><h3>{item.name}</h3><p>{item.url}</p>{item.group && <p className="session-hint">Compartida con las apps de Microsoft 365</p>}</div><label className="remember-label"><input type="checkbox" checked={state.preferences.remember[item.id] ?? true} disabled={busy} onChange={event => void settingsAction(() => window.portal.remember(item.id, event.target.checked), `Persistencia actualizada: ${item.name}`)} /><span>Recordar sesión</span></label><button className="icon-button destructive" aria-label={`Borrar sesión de ${item.name}`} title="Borrar sesión local" disabled={busy} onClick={() => void settingsAction(() => window.portal.clearSession(item.id), `Sesión local eliminada: ${item.name}`)}><IconTrash size={18} /></button></div>;
          })}
        </div>
        <p className="section-description">Borrar la sesión local no revoca sesiones en el servidor. Para eso, usa el cierre de sesión de la aplicación.</p>
        {notice && <p className="notice" aria-live="polite">{notice}</p>}
      </section>}

      {state.panel === 'help' && <section className="settings-page help-page">
        <button className="back-button" onClick={() => panel('service')}><IconChevronLeft size={17} />Volver al servicio</button>
        <div className="page-heading"><span className="eyebrow">AMATIME TOOLS · {state.updates.currentVersion}</span><h1>Tus herramientas, conectadas</h1><p>Un contenedor de escritorio. Cinco aplicaciones independientes.</p></div>
        <div className="settings-card"><IconActivity className="help-icon" /><h2>Navegación sin perder contexto</h2><p>La barra lateral cambia de aplicación. La barra superior muestra solo sus pestañas: usa + para abrir otra y × para cerrarla. Cada pestaña conserva su página y comparte la sesión de su aplicación. Las flechas del teclado recorren las pestañas; al volver a una aplicación se restaura la última seleccionada.</p></div>
        <div className="settings-card"><IconShieldCheck className="help-icon" /><h2>Cada aplicación gestiona su acceso</h2><p>El portal no tiene formulario de login, no comprueba credenciales y no asegura que una página cargada sea una sesión autenticada. Usa el login y logout propios del servicio.</p></div>
        <div className="settings-card"><IconAlertTriangle className="help-icon" /><h2>Red, permisos y seguridad</h2><p>Huly, n8n y LibreChat necesitan acceso a la red interna o VPN. Huly y n8n todavía usan HTTP: configura HTTPS antes de un despliegue de producción. LibreChat usa HTTPS. LibreChat admite una excepción de autoridad no confiable únicamente en https://172.16.8.73/; úsala solo en red interna de confianza. Los demás destinos y errores TLS siguen validándose.</p><p>La navegación a otros orígenes, ventanas externas, descargas y permisos del dispositivo están bloqueados. Si un SSO requiere otro dominio, su integración debe revisarse antes de habilitarlo.</p></div>
      </section>}
      {error && <p className="action-error" role="alert">{error}</p>}
    </main>

    {!blocked && state.panel === 'service' && state.split && <SplitView services={state.services} split={state.split} width={size.width} height={size.height} onSet={id => void action(() => window.portal.splitSet(id))} onToTab={() => void action(() => window.portal.splitToTab())} onClose={() => void action(() => window.portal.splitClose())} onResize={(ratio, persist) => window.portal.splitResize(ratio, persist)} onCapture={() => window.portal.splitCapture()} onDrag={active => window.portal.splitDrag(active)} />}

    <StatusBar network={state.network.status} version={state.updates.currentVersion} />
  </div>{picker && <DesktopPicker onClose={closePicker} onLink={id => { closePicker(); void action(() => window.portal.desktopLink(id)); }} onBrowse={() => { closePicker(); void action(() => window.portal.addDesktopApp()); }} />}{menu && state.services.some(item => item.id === menu.id) && <AppContextMenu service={state.services.find(item => item.id === menu.id)!} pinned={state.preferences.pinned.includes(menu.id)} anchor={menu.anchor} onAction={runMenu} onClose={closeMenu} />}{state.splash !== 'done' && <Splash key="splash" state={state} />}</>;
}



