import { useEffect, useState, type KeyboardEvent, type CSSProperties } from 'react';
import { IconCalendarEvent, IconGitBranch, IconMessageCircle2, IconServerCog, IconSettings, IconHelpHexagon, IconMoon, IconSun, IconRefresh, IconShieldCheck, IconAlertTriangle, IconChevronLeft, IconTrash, IconActivity, IconPlus, IconMinus, IconX } from '@tabler/icons-react';
import type { ServiceId, Snapshot } from '../shared/contracts';
import { SHELL_LAYOUT } from '../shared/layout';
import { PAGE_ZOOM } from '../shared/zoom';
import hulyLogo from '../../images/Huly-logo.svg';
import n8nLogo from '../../images/n8n-logo.svg';
import amaBotLogo from '../../images/ama-bot-cuadrado.svg';
import amaAppLogo from '../../images/icon_144x144.png';
import amaDigitalLogo from '../../images/AMA-TIME-digital.png';
import { AmaBot } from './AmaBot';

const icons = { huly: IconCalendarEvent, n8n: IconGitBranch, librechat: IconMessageCircle2, portal: IconServerCog };
const sidebarLogos: Record<ServiceId, string> = { huly: hulyLogo, n8n: n8nLogo, librechat: amaBotLogo, portal: amaAppLogo };
const sidebarOrder: ServiceId[] = ['librechat', 'portal', 'huly', 'n8n'];
const updateLabels = { disabled: 'Las actualizaciones están disponibles en la app instalada de Windows.', idle: 'Puedes buscar una nueva versión.', checking: 'Buscando actualizaciones…', available: 'Hay una nueva versión disponible.', current: 'Tienes la última versión disponible.', downloading: 'Descargando actualización…', downloaded: 'La actualización está lista para instalar.', installing: 'Instalando actualización…', error: 'No se pudo actualizar. Revisa la conexión a GitHub y vuelve a intentar.' };

export function App() {
  const [state, setState] = useState<Snapshot>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const unsubscribe = window.portal.onChange(setState);
    void window.portal.snapshot().then(setState).catch(() => setError('No se pudo conectar con el contenedor. Reinicia la aplicación.'));
    return unsubscribe;
  }, []);
  useEffect(() => { if (state) document.documentElement.dataset.theme = state.preferences.theme; }, [state?.preferences.theme]);
  useEffect(() => { if (state?.activeTabId) document.getElementById(`tab-${state.activeTabId}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [state?.activeTabId]);

  async function action(task: () => Promise<void>, success = '') {
    setError(''); setNotice('');
    try { await task(); if (success) setNotice(success); }
    catch { setError('No se pudo completar la acción. Vuelve a intentar.'); }
  }

  if (!state) return error ? <p role="alert">{error}</p> : null;
  const service = state.services.find(s => s.id === state.active)!;
  const activeTabs = state.tabs.filter(tab => tab.serviceId === state.active);
  const light = state.preferences.theme === 'light';
  const activate = (id: ServiceId) => void action(() => window.portal.activate(id));
  const selectTab = (id: string) => void action(() => window.portal.selectTab(id));
  const panel = (value: Snapshot['panel']) => void action(() => window.portal.panel(value));
  const toggleTheme = () => void action(() => window.portal.theme(light ? 'dark' : 'light'));

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

  return <div className="app-shell" style={{ '--sidebar-width': `${SHELL_LAYOUT.sidebarWidth}px`, '--header-height': `${SHELL_LAYOUT.headerHeight}px` } as CSSProperties}>
    <aside className="sidebar" aria-label="Navegación principal">
      <div className="brand" title="AMATIME · Portal Operacional"><img className="brand-logo" src={amaDigitalLogo} alt="AMA Time Digital" draggable={false} /></div>
      <nav className="service-nav" aria-label="Servicios">
        {sidebarOrder.map(id => state.services.find(item => item.id === id)!).map(item => {
          return <button key={item.id} className={`nav-item ${state.active === item.id && state.panel === 'service' ? 'active' : ''}`} aria-label={`Abrir ${item.name}`} aria-current={state.active === item.id && state.panel === 'service' ? 'page' : undefined} onClick={() => activate(item.id)}>
            {item.id === 'librechat' ? <AmaBot className="service-logo service-logo-librechat" /> : <img className={`service-logo service-logo-${item.id}`} src={sidebarLogos[item.id]} alt="" draggable={false} />}<span className="nav-tooltip">{item.name}</span>
            {state.states[item.id].status === 'ready' && <span className="nav-dot" />}
          </button>;
        })}
      </nav>
      <div className="sidebar-bottom">
        <button className={`nav-item ${state.panel === 'settings' ? 'active' : ''}`} aria-label="Ajustes" onClick={() => panel('settings')}><IconSettings size={22} stroke={1.65} /><span className="nav-tooltip">Ajustes</span></button>
        <button className={`nav-item ${state.panel === 'help' ? 'active' : ''}`} aria-label="Ayuda" onClick={() => panel('help')}><IconHelpHexagon size={22} stroke={1.65} /><span className="nav-tooltip">Ayuda y seguridad</span></button>
      </div>
    </aside>

    <header className="header">
      <div className="tab-strip">
      <div className="tabs" role="tablist" aria-label={`Pestañas de ${service.shortName}`}>
        {activeTabs.map((tab, index) => {
          const Icon = icons[tab.serviceId];
          const label = tab.title || service.shortName;
          const selected = state.activeTabId === tab.id;
          return <div key={tab.id} className={`tab-group ${selected ? 'selected' : ''}`}>
            <button id={`tab-${tab.id}`} data-testid={`${tab.serviceId}-tab-${tab.number}`} role="tab" title={label} aria-selected={selected} aria-controls="service-content" tabIndex={selected ? 0 : -1} className={`app-tab ${selected ? 'selected' : ''}`} onClick={() => selectTab(tab.id)} onKeyDown={event => tabKey(event, index)}>
              <Icon size={16} stroke={1.8} /><span>{label}</span>
            </button>
            <button className="close-tab" data-testid={`close-${tab.serviceId}-tab-${tab.number}`} aria-label={`Cerrar ${label}`} title={`Cerrar ${label}`} onClick={() => void action(() => window.portal.closeTab(tab.id))}><IconX size={13} /></button>
          </div>;
        })}
      </div>
      <button className="icon-button new-tab" aria-label={`Abrir nueva pestaña de ${service.shortName}`} title={`Abrir nueva pestaña de ${service.shortName}`} onClick={() => void action(() => window.portal.openTab())}><IconPlus size={19} /></button>
      </div>
      <div className="header-actions">
        <div className="zoom-control" role="group" aria-label="Zoom de la aplicación">
          <button className="icon-button" aria-label="Reducir zoom" title="Reducir zoom" disabled={state.panel !== 'service' || state.zoomPercent <= PAGE_ZOOM.min} onClick={() => void action(() => window.portal.zoom(Math.max(PAGE_ZOOM.min, state.zoomPercent - PAGE_ZOOM.step)))}><IconMinus size={15} /></button>
          <button className="zoom-percent" aria-label="Restablecer zoom" title="Restablecer zoom al 100%" disabled={state.panel !== 'service'} onClick={() => void action(() => window.portal.zoom(PAGE_ZOOM.default))}>{state.zoomPercent}%</button>
          <button className="icon-button" aria-label="Aumentar zoom" title="Aumentar zoom" disabled={state.panel !== 'service' || state.zoomPercent >= PAGE_ZOOM.max} onClick={() => void action(() => window.portal.zoom(Math.min(PAGE_ZOOM.max, state.zoomPercent + PAGE_ZOOM.step)))}><IconPlus size={15} /></button>
        </div>
        <button className="icon-button" aria-label="Recargar servicio" title="Recargar servicio" onClick={() => void action(() => window.portal.reload())}><IconRefresh size={19} /></button>
        <button className="icon-button" aria-label={light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'} title="Cambiar tema del portal" onClick={toggleTheme}>{light ? <IconSun size={19} /> : <IconMoon size={19} />}</button>
      </div>
    </header>

    <main id="service-content" className="content" role="tabpanel" aria-labelledby={state.activeTabId ? `tab-${state.activeTabId}` : undefined}>
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
            const Icon = icons[item.id];
            return <div className="session-row" key={item.id}><span className="session-icon"><Icon size={22} /></span><div className="session-info"><h3>{item.name}</h3><p>{item.url}</p></div><label className="remember-label"><input type="checkbox" checked={state.preferences.remember[item.id]} disabled={busy} onChange={event => void settingsAction(() => window.portal.remember(item.id, event.target.checked), `Persistencia actualizada: ${item.name}`)} /><span>Recordar sesión</span></label><button className="icon-button destructive" aria-label={`Borrar sesión de ${item.name}`} title="Borrar sesión local" disabled={busy} onClick={() => void settingsAction(() => window.portal.clearSession(item.id), `Sesión local eliminada: ${item.name}`)}><IconTrash size={18} /></button></div>;
          })}
        </div>
        <p className="section-description">Borrar la sesión local no revoca sesiones en el servidor. Para eso, usa el cierre de sesión de la aplicación.</p>
        {notice && <p className="notice" aria-live="polite">{notice}</p>}
      </section>}

      {state.panel === 'help' && <section className="settings-page help-page">
        <button className="back-button" onClick={() => panel('service')}><IconChevronLeft size={17} />Volver al servicio</button>
        <div className="page-heading"><span className="eyebrow">AMATIME TOOLS · {state.updates.currentVersion}</span><h1>Tus herramientas, conectadas</h1><p>Un contenedor de escritorio. Cuatro aplicaciones independientes.</p></div>
        <div className="settings-card"><IconActivity className="help-icon" /><h2>Navegación sin perder contexto</h2><p>La barra lateral cambia de aplicación. La barra superior muestra solo sus pestañas: usa + para abrir otra y × para cerrarla. Cada pestaña conserva su página y comparte la sesión de su aplicación. Las flechas del teclado recorren las pestañas; al volver a una aplicación se restaura la última seleccionada.</p></div>
        <div className="settings-card"><IconShieldCheck className="help-icon" /><h2>Cada aplicación gestiona su acceso</h2><p>El portal no tiene formulario de login, no comprueba credenciales y no asegura que una página cargada sea una sesión autenticada. Usa el login y logout propios del servicio.</p></div>
        <div className="settings-card"><IconAlertTriangle className="help-icon" /><h2>Red, permisos y seguridad</h2><p>Huly, n8n y LibreChat necesitan acceso a la red interna o VPN. Huly y n8n todavía usan HTTP: configura HTTPS antes de un despliegue de producción. LibreChat usa HTTPS. LibreChat admite una excepción de autoridad no confiable únicamente en https://172.16.8.73/; úsala solo en red interna de confianza. Los demás destinos y errores TLS siguen validándose.</p><p>La navegación a otros orígenes, ventanas externas, descargas y permisos del dispositivo están bloqueados. Si un SSO requiere otro dominio, su integración debe revisarse antes de habilitarlo.</p></div>
      </section>}
      {error && <p className="action-error" role="alert">{error}</p>}
    </main>
  </div>;
}



