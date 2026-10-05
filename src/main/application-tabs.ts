import { SERVICE_IDS, STARTUP_SERVICE, type ApplicationTab, type ServiceId, type ServiceState } from '../shared/contracts';

export class ApplicationTabs {
  private items: ApplicationTab[] = [];
  private selection = new Map<ServiceId, string>();
  private numbers = new Map<ServiceId, number>();
  private sequence = 0;
  active: ServiceId = STARTUP_SERVICE;

  get all(): ApplicationTab[] { return this.items.map(tab => ({ ...tab, state: { ...tab.state } })); }
  get activeTabId(): string | null { return this.selection.get(this.active) ?? null; }
  get current(): ApplicationTab {
    const tab = this.items.find(item => item.id === this.activeTabId);
    if (!tab) throw new Error('No hay pestaña activa');
    return tab;
  }

  switchApplication(id: ServiceId): ApplicationTab {
    this.active = id;
    if (!this.selection.has(id)) return this.open(id);
    return this.current;
  }

  open(serviceId: ServiceId = this.active, focus = true): ApplicationTab {
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

  close(id: string): void {
    const tab = this.items.find(item => item.id === id);
    if (!tab || tab.serviceId !== this.active) throw new Error('Pestaña inválida para esta aplicación');
    const peers = this.items.filter(item => item.serviceId === tab.serviceId);
    const index = peers.findIndex(item => item.id === id);
    this.items = this.items.filter(item => item.id !== id);
    if (peers.length === 1) {
      this.selection.delete(tab.serviceId);
      this.open(tab.serviceId);
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

  reset(serviceId: ServiceId): void {
    for (const tab of this.items) if (tab.serviceId === serviceId) tab.state = { status: 'idle' };
  }

  serviceStates(): Record<ServiceId, ServiceState> {
    return Object.fromEntries(SERVICE_IDS.map(serviceId => [serviceId, this.items.find(tab => tab.id === this.selection.get(serviceId))?.state ?? { status: 'idle' }])) as Record<ServiceId, ServiceState>;
  }
}
