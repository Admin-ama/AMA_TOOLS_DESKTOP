export const SERVICE_IDS = ['huly', 'n8n', 'librechat', 'portal', 'emailai', 'stirling'] as const;
export type ServiceId = typeof SERVICE_IDS[number];
export const STARTUP_SERVICE: ServiceId = 'librechat';
export type Theme = 'dark' | 'light';
export type PageStatus = 'idle' | 'loading' | 'ready' | 'error';
export const CATEGORIES = [
  { id: 'control', label: 'Control' },
  { id: 'operacion', label: 'Operación' },
  { id: 'automatizacion', label: 'Automatización y herramientas' },
] as const;
export type CategoryId = typeof CATEGORIES[number]['id'];
/** Apps fijadas por defecto: LibreChat es el centro de mando; después operación y herramientas. */
export const DEFAULT_PINNED: readonly ServiceId[] = ['librechat', 'portal', 'huly', 'n8n', 'emailai', 'stirling'];
export interface Service { id: ServiceId; name: string; shortName: string; category: CategoryId; url: string; authOrigins?: string[] }
export interface ServiceState { status: PageStatus; message?: string }
export interface ApplicationTab { id: string; serviceId: ServiceId; number: number; title: string; state: ServiceState }
export interface DesktopApp { id: string; name: string; path: string }
/** Lo único que ve el renderer de una app de escritorio: nunca la ruta. */
export interface DesktopAppView { id: string; name: string; icon?: string }
export const DEFAULT_SPLIT_RATIO = 0.38;
export const DEFAULT_SPLIT_SERVICE: ServiceId = 'librechat';
/** Panel lateral: ratio = fracción del área de contenido que ocupa el panel. */
export interface SplitState { serviceId: ServiceId; ratio: number }
/** Capturas (data URL) de ambas vistas para pintarlas mientras se arrastra el divisor. */
export interface SplitCapture { main: string | null; panel: string | null }
export interface Preferences { theme: Theme; remember: Record<ServiceId, boolean>; pinned: ServiceId[]; desktopApps: DesktopApp[]; splitRatio: number; splitService: ServiceId }
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
  services: Service[];
  active: ServiceId;
  activeTabId: string | null;
  zoomPercent: number;
  tabs: ApplicationTab[];
  states: Record<ServiceId, ServiceState>;
  preferences: PublicPreferences;
  desktopApps: DesktopAppView[];
  panel: 'service' | 'settings' | 'help' | 'launcher';
  split: SplitState | null;
}
export interface PortalApi {
  snapshot(): Promise<Snapshot>;
  activate(id: ServiceId): Promise<void>;
  openTab(): Promise<void>;
  selectTab(id: string): Promise<void>;
  closeTab(id: string): Promise<void>;
  reload(): Promise<void>;
  openForticlient(): Promise<void>;
  addDesktopApp(): Promise<void>;
  openDesktopApp(id: string): Promise<void>;
  removeDesktopApp(id: string): Promise<void>;
  zoom(percent: number): Promise<void>;
  checkUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  snoozeUpdate(): Promise<void>;
  panel(panel: Snapshot['panel']): Promise<void>;
  finishSplash(): Promise<void>;
  theme(theme: Theme): Promise<void>;
  remember(id: ServiceId, enabled: boolean): Promise<void>;
  pin(id: ServiceId, pinned: boolean): Promise<void>;
  clearSession(id: ServiceId): Promise<void>;
  splitOpen(id?: ServiceId): Promise<void>;
  splitSet(id: ServiceId): Promise<void>;
  /** Sin persist el ratio solo se aplica; con persist se guarda en preferencias. */
  splitResize(ratio: number, persist?: boolean): Promise<void>;
  splitClose(): Promise<void>;
  splitToTab(): Promise<void>;
  splitCapture(): Promise<SplitCapture>;
  /** Oculta las vistas nativas mientras se arrastra el divisor. */
  splitDrag(active: boolean): Promise<void>;
  onChange(listener: (snapshot: Snapshot) => void): () => void;
  /** Cursor position in shell coordinates, also while hovering a remote service view. */
  onCursor(listener: (point: { x: number; y: number }) => void): () => void;
}
declare global { interface Window { portal: PortalApi } }
