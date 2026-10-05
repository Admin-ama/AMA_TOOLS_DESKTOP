import { contextBridge, ipcRenderer } from 'electron';
import type { PortalApi, Snapshot } from '../shared/contracts';
const command = (name: string, ...args: unknown[]) => ipcRenderer.invoke('portal:command', name, ...args);
const api: PortalApi = {
  snapshot: () => command('snapshot'),
  activate: id => command('activate', id),
  openTab: () => command('new-tab'),
  selectTab: id => command('select-tab', id),
  closeTab: id => command('close-tab', id),
  reload: () => command('reload'),
  zoom: percent => command('zoom', percent),
  checkUpdates: () => command('check-updates'),
  downloadUpdate: () => command('download-update'),
  installUpdate: () => command('install-update'),
  snoozeUpdate: () => command('snooze-update'),
  panel: panel => command('panel', panel),
  theme: theme => command('theme', theme),
  remember: (id, enabled) => command('remember', id, enabled),
  clearSession: id => command('clear-session', id),
  onChange: listener => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: Snapshot) => listener(snapshot);
    ipcRenderer.on('portal:changed', handler);
    return () => ipcRenderer.removeListener('portal:changed', handler);
  },
  onCursor: listener => {
    const handler = (_event: Electron.IpcRendererEvent, point: { x: number; y: number }) => listener(point);
    ipcRenderer.on('portal:cursor', handler);
    return () => ipcRenderer.removeListener('portal:cursor', handler);
  },
};
contextBridge.exposeInMainWorld('portal', api);
