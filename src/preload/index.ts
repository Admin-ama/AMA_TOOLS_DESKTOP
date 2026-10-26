import { contextBridge, ipcRenderer } from 'electron';
import type { PortalApi, Snapshot } from '../shared/contracts';
import type { TooltipPush } from '../shared/tooltip';
const command = (name: string, ...args: unknown[]) => ipcRenderer.invoke('portal:command', name, ...args);
const api: PortalApi = {
  snapshot: () => command('snapshot'),
  activate: id => command('activate', id),
  openTab: () => command('new-tab'),
  selectTab: id => command('select-tab', id),
  closeTab: id => command('close-tab', id),
  reload: () => command('reload'),
  openForticlient: () => command('open-forticlient'),
  addDesktopApp: () => command('add-desktop-app'),
  desktopCandidates: refresh => command('desktop-candidates', refresh),
  desktopIcons: ids => command('desktop-icons', ids),
  desktopLink: id => command('desktop-link', id),
  openDesktopApp: id => command('open-desktop-app', id),
  openOfficeApp: id => command('open-office-app', id),
  removeDesktopApp: id => command('remove-desktop-app', id),
  zoom: percent => command('zoom', percent),
  checkUpdates: () => command('check-updates'),
  downloadUpdate: () => command('download-update'),
  installUpdate: () => command('install-update'),
  snoozeUpdate: () => command('snooze-update'),
  panel: panel => command('panel', panel),
  finishSplash: () => command('finish-splash'),
  requestAccess: id => command('request-access', id),
  theme: theme => command('theme', theme),
  remember: (id, enabled) => command('remember', id, enabled),
  pin: (id, pinned) => command('pin', id, pinned),
  reorderPinned: ids => command('pin-order', ids),
  clearSession: id => command('clear-session', id),
  splitOpen: id => command('split-open', id),
  splitSet: id => command('split-set', id),
  splitResize: (ratio, persist) => command('split-resize', ratio, persist),
  splitClose: () => command('split-close'),
  splitToTab: () => command('split-to-tab'),
  splitCapture: () => command('split-capture'),
  freezeViews: () => command('freeze-views'),
  splitDrag: active => command('split-drag', active),
  customAdd: input => command('custom-add', input),
  customEdit: (id, input) => command('custom-edit', id, input),
  customRemove: id => command('custom-remove', id),
  overlay: active => command('overlay', active),
  tooltipShow: (text, rect, side) => command('tooltip-show', text, rect, side),
  tooltipHide: () => command('tooltip-hide'),
  onTooltip: listener => {
    const handler = (_event: Electron.IpcRendererEvent, push: TooltipPush) => listener(push);
    ipcRenderer.on('tooltip:push', handler);
    return () => ipcRenderer.removeListener('tooltip:push', handler);
  },
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
