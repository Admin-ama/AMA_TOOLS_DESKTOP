export const SERVICE_IDS = ['huly', 'n8n', 'librechat', 'portal', 'emailai'] as const;
export type ServiceId = typeof SERVICE_IDS[number];
export const STARTUP_SERVICE: ServiceId = 'librechat';
export type Theme = 'dark' | 'light';
export type PageStatus = 'idle' | 'loading' | 'ready' | 'error';
export interface Service { id: ServiceId; name: string; shortName: string; url: string }
export interface ServiceState { status: PageStatus; message?: string }
export interface ApplicationTab { id: string; serviceId: ServiceId; number: number; title: string; state: ServiceState }
export interface Preferences { theme: Theme; remember: Record<ServiceId, boolean> }
export interface UpdateState {
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'installing' | 'error';
  currentVersion: string;
  version?: string;
  progress?: number;
  noticeVisible?: boolean;
}
export interface Snapshot {
  updates: UpdateState;
  services: Service[];
  active: ServiceId;
  activeTabId: string | null;
  zoomPercent: number;
  tabs: ApplicationTab[];
  states: Record<ServiceId, ServiceState>;
  preferences: Preferences;
  panel: 'service' | 'settings' | 'help';
}
export interface PortalApi {
  snapshot(): Promise<Snapshot>;
  activate(id: ServiceId): Promise<void>;
  openTab(): Promise<void>;
  selectTab(id: string): Promise<void>;
  closeTab(id: string): Promise<void>;
  reload(): Promise<void>;
  zoom(percent: number): Promise<void>;
  checkUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  snoozeUpdate(): Promise<void>;
  panel(panel: Snapshot['panel']): Promise<void>;
  theme(theme: Theme): Promise<void>;
  remember(id: ServiceId, enabled: boolean): Promise<void>;
  clearSession(id: ServiceId): Promise<void>;
  onChange(listener: (snapshot: Snapshot) => void): () => void;
  /** Cursor position in shell coordinates, also while hovering a remote service view. */
  onCursor(listener: (point: { x: number; y: number }) => void): () => void;
}
declare global { interface Window { portal: PortalApi } }
