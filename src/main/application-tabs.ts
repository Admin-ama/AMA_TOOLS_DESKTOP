import { STARTUP_SERVICE, type ApplicationTab, type AppId, type ServiceState } from '../shared/contracts';

export class ApplicationTabs {
  private items: ApplicationTab[] = [];
  private selection = new Map<AppId, string>();
  private numbers = new Map<AppId, number>();
  private sequence = 0;
  active: AppId = STARTUP_SERVICE;

  get all(): ApplicationTab[] { return this.items.map(tab => ({ ...tab, state: { ...tab.state } })); }
  get activeTabId(): string | null { return this.selection.get(this.active) ?? null; }
  get current(): ApplicationTab {
    const tab = this.items.find(item => item.id === this.activeTabId);
    if (!tab) throw new Error('No hay pestaña activa');
    return tab;
  }

  switchApplication(id: AppId): ApplicationTab {
    this.active = id;
    if (!this.selection.has(id)) return this.open(id);
    return this.current;
  }

  open(serviceId: AppId = this.active, focus = true): ApplicationTab {
    const number = (this.numbers.get(serviceId) ?? 0) + 1;
    this.numbers.set(serviceId, number);
    const tab: ApplicationTab = { id: `tab-${++this.sequence}`, serviceId, number, title: '', state: { status: 'idle' } };
    this.items.push(tab);
    if (focus) this.active = serviceId;
    if (focus || !this.selection.has(serviceId)) this.selection.set(serviceId, tab.id);
    return tab;
  }

  select(id: string): ApplicationTab {
    const tab = this.items.find(item => item.id === id);
    if (!tab || tab.serviceId !== this.active) throw new Error('Pestaña inválida para esta aplicación');
    this.selection.set(this.active, id);
    return tab;
  }

  /** `fallback`: app a la que volver si se cierra la última pestaña (apps no fijadas); sin ella se abre una pestaña nueva. */
  close(id: string, fallback?: AppId): void {
    const tab = this.items.find(item => item.id === id);
    if (!tab || tab.serviceId !== this.active) throw new Error('Pestaña inválida para esta aplicación');
    const peers = this.items.filter(item => item.serviceId === tab.serviceId);
    const index = peers.findIndex(item => item.id === id);
    this.items = this.items.filter(item => item.id !== id);
    if (peers.length === 1) {
      this.selection.delete(tab.serviceId);
      if (fallback && fallback !== tab.serviceId) this.switchApplication(fallback);
      else this.open(tab.serviceId);
    } else if (this.selection.get(tab.serviceId) === id) {
      this.selection.set(tab.serviceId, (peers[index - 1] ?? peers[index + 1]).id);
    }
  }

  update(id: string, state: ServiceState): void {
    const tab = this.items.find(item => item.id === id);
    if (tab) tab.state = state;
  }

  updateTitle(id: string, title: string): void {
    const tab = this.items.find(item => item.id === id);
    if (tab) tab.title = title.trim();
  }

  reset(serviceId: AppId): void {
    for (const tab of this.items) if (tab.serviceId === serviceId) tab.state = { status: 'idle' };
  }

  /** Elimina todas las pestañas de una app (borrado o cambio de origen). Quien llama decide a qué app volver. */
  removeApp(serviceId: AppId): void {
    this.items = this.items.filter(tab => tab.serviceId !== serviceId);
    this.selection.delete(serviceId);
    this.numbers.delete(serviceId);
  }

  /** `ids`: el catálogo vigente (globales + páginas propias). */
  serviceStates(ids: readonly AppId[]): Record<AppId, ServiceState> {
    return Object.fromEntries(ids.map(serviceId => [serviceId, this.items.find(tab => tab.id === this.selection.get(serviceId))?.state ?? { status: 'idle' }]));
  }
}
