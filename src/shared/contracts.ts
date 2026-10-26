/** Apps globales del catálogo (código); las páginas del usuario tienen ids `custom-<uuid>`. */
export const GLOBAL_APP_IDS = ['huly', 'n8n', 'librechat', 'portal', 'emailai', 'stirling', 'teams', 'copilot', 'outlook', 'sharepoint', 'powerautomate', 'forms', 'costeador', 'buk'] as const;
export type AppId = string;
export const STARTUP_SERVICE: AppId = 'librechat';
export type Theme = 'dark' | 'light';
export type PageStatus = 'idle' | 'loading' | 'ready' | 'error';
export const CATEGORIES = [
  { id: 'control', label: 'Control' },
  /** Apps internas de la empresa, con sus propias bases de datos, homologadas por TI. */
  { id: 'amatime', label: 'Apps Amatime' },
  { id: 'operacion', label: 'Operación' },
  { id: 'comunicacion', label: 'Comunicación' },
  { id: 'automatizacion', label: 'Automatización y herramientas' },
] as const;
export type CategoryId = typeof CATEGORIES[number]['id'] | 'mine';
/** Sección del launcher y de la sidebar para las páginas definidas por el usuario. */
export const MINE_CATEGORY = { id: 'mine', label: 'Mis páginas' } as const;
/** Apps fijadas por defecto: LibreChat es el centro de mando; después operación y herramientas. */
/** Siempre fijadas, primero y en este orden; el usuario no puede quitarlas. */
export const FIXED_APPS: readonly AppId[] = ['librechat', 'copilot', 'buk'];
export const DEFAULT_PINNED: readonly AppId[] = [...FIXED_APPS, 'portal', 'huly', 'n8n', 'emailai', 'stirling'];
export interface AppAdmin { name: string; email: string }
export interface Service {
  id: AppId; name: string; shortName: string; category: CategoryId; url: string;
  /** Orígenes https exactos de login externo (SSO). */
  authOrigins?: string[];
  /** Apps del mismo grupo comparten una sola sesión (partición) y la lista de navegación del grupo. */
  group?: 'microsoft';
  /** Se fija en la barra lateral una vez (usuarios nuevos y existentes); después manda el usuario. */
  /** Apps Amatime: a quién pedir credenciales (chat de Teams desde la tarjeta). */
  admin?: AppAdmin;
  /** Solo páginas del usuario. */
  custom?: boolean; icon?: string;
}
/** Página web definida por el usuario; el icono es un data URL de la favicon (mejor esfuerzo). */
export interface CustomApp { id: AppId; name: string; url: string; icon?: string }
export interface ServiceState { status: PageStatus; message?: string }
export interface ApplicationTab { id: string; serviceId: AppId; number: number; title: string; state: ServiceState }
/** path: .exe/.lnk/.url/carpeta; aumid: app empaquetada (Tienda) que se lanza por su AppUserModelID. */
export interface DesktopApp { id: string; name: string; kind: 'path' | 'aumid'; path?: string; aumid?: string }
/** Lo único que ve el renderer de una app de escritorio: nunca la ruta. */
export interface DesktopAppView { id: string; name: string; icon?: string }
/** App instalada que ofrece el selector: id opaco (nunca ruta ni AUMID). */
export interface DesktopCandidate { id: string; name: string; kind: 'path' | 'aumid'; icon?: string; linked?: boolean }
export const DEFAULT_SPLIT_RATIO = 0.38;
export const DEFAULT_SPLIT_SERVICE: AppId = 'librechat';
/** Panel lateral: ratio = fracción del área de contenido que ocupa el panel. */
export interface SplitState { serviceId: AppId; ratio: number }
/** Capturas (data URL) de ambas vistas para pintarlas mientras se arrastra el divisor. */
export interface SplitCapture { main: string | null; panel: string | null }
/** Captura de una vista nativa visible y dónde está (coordenadas del contenido de la ventana = CSS del shell). */
export interface FrozenView { image: string; bounds: { x: number; y: number; width: number; height: number } }
export interface Preferences { theme: Theme; remember: Record<AppId, boolean>; pinned: AppId[]; desktopApps: DesktopApp[]; customApps: CustomApp[]; splitRatio: number; splitService: AppId }
export type PublicPreferences = Omit<Preferences, 'desktopApps'>;
export interface UpdateState {
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'installing' | 'error';
  currentVersion: string;
  version?: string;
  progress?: number;
  noticeVisible?: boolean;
}
/** Alcance TCP a los servicios internos (LAN o VPN). */
export type NetworkStatus = 'checking' | 'connected' | 'disconnected';
export interface NetworkState { status: NetworkStatus; forticlient: boolean }
/** loading: logo animado tapa la app · leaving: el renderer anima la salida · done: la app es visible. */
export type SplashPhase = 'loading' | 'leaving' | 'done';
export interface Snapshot {
  splash: SplashPhase;
  updates: UpdateState;
  network: NetworkState;
  /** Catálogo vigente: apps globales + páginas del usuario. */
  services: Service[];
  active: AppId;
  activeTabId: string | null;
  zoomPercent: number;
  tabs: ApplicationTab[];
  states: Record<AppId, ServiceState>;
  preferences: PublicPreferences;
  desktopApps: DesktopAppView[];
  /** Office fijo del dock (solo los instalados); sin rutas. */
  officeApps: DesktopAppView[];
  panel: 'service' | 'settings' | 'help' | 'launcher';
  split: SplitState | null;
}
export interface PortalApi {
  snapshot(): Promise<Snapshot>;
  activate(id: AppId): Promise<void>;
  openTab(): Promise<void>;
  selectTab(id: string): Promise<void>;
  closeTab(id: string): Promise<void>;
  reload(): Promise<void>;
  openForticlient(): Promise<void>;
  addDesktopApp(): Promise<void>;
  /** Apps instaladas en el equipo (menú Inicio y Tienda); refresh vuelve a escanear. */
  desktopCandidates(refresh?: boolean): Promise<DesktopCandidate[]>;
  /** Iconos (data URL) de los candidatos pedidos, por id. */
  desktopIcons(ids: string[]): Promise<Record<string, string>>;
  desktopLink(candidateId: string): Promise<void>;
  openDesktopApp(id: string): Promise<void>;
  openOfficeApp(id: string): Promise<void>;
  removeDesktopApp(id: string): Promise<void>;
  zoom(percent: number): Promise<void>;
  checkUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  snoozeUpdate(): Promise<void>;
  panel(panel: Snapshot['panel']): Promise<void>;
  finishSplash(): Promise<void>;
  requestAccess(id: AppId): Promise<void>;
  theme(theme: Theme): Promise<void>;
  remember(id: AppId, enabled: boolean): Promise<void>;
  pin(id: AppId, pinned: boolean): Promise<void>;
  /** Nuevo orden de las fijadas (misma lista, otro orden). */
  reorderPinned(ids: AppId[]): Promise<void>;
  clearSession(id: AppId): Promise<void>;
  splitOpen(id?: AppId): Promise<void>;
  splitSet(id: AppId): Promise<void>;
  /** Sin persist el ratio solo se aplica; con persist se guarda en preferencias. */
  splitResize(ratio: number, persist?: boolean): Promise<void>;
  splitClose(): Promise<void>;
  splitToTab(): Promise<void>;
  splitCapture(): Promise<SplitCapture>;
  /** Capturas de las vistas visibles, para dejarlas a la vista mientras un menú las oculta. */
  freezeViews(): Promise<FrozenView[]>;
  /** Devuelve el id de la página creada. */
  customAdd(input: { name: string; url: string; pin: boolean }): Promise<string>;
  customEdit(id: AppId, input: { name: string; url: string }): Promise<void>;
  customRemove(id: AppId): Promise<void>;
  /** Oculta las vistas nativas mientras un menú o diálogo del DOM está abierto. */
  overlay(active: boolean): Promise<void>;
  /** Oculta las vistas nativas mientras se arrastra el divisor. */
  splitDrag(active: boolean): Promise<void>;
  /** Tooltip nativo sobre un ancla (px CSS del shell). Texto plano de hasta 120 caracteres. */
  tooltipShow(text: string, rect: { x: number; y: number; width: number; height: number }, side: 'right' | 'left' | 'bottom'): Promise<void>;
  tooltipHide(): Promise<void>;
  /** Solo la ventana del tooltip: el proceso principal le empuja qué mostrar. */
  onTooltip(listener: (push: import('./tooltip').TooltipPush) => void): () => void;
  onChange(listener: (snapshot: Snapshot) => void): () => void;
  /** Cursor position in shell coordinates, also while hovering a remote service view. */
  onCursor(listener: (point: { x: number; y: number }) => void): () => void;
}
declare global { interface Window { portal: PortalApi } }
