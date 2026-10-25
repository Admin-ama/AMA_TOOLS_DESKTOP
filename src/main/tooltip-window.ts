import { BrowserWindow } from 'electron';
import path from 'node:path';
import type { EventEmitter } from 'node:events';
import { tooltipBounds, TOOLTIP_SIZE, type TooltipPush, type TooltipRequest } from '../shared/tooltip';
import type { Theme } from '../shared/contracts';

export const TOOLTIP_URL = 'app://bundle/index.html#tooltip';
const HIDE_AFTER_MS = 140;
const PARENT_EVENTS = ['move', 'resize', 'minimize', 'hide'];

/** Las vistas nativas pintan sobre el DOM del shell: el tooltip vive en una ventana hija transparente, sin foco y que ignora el ratón. */
export class TooltipWindow {
  window?: BrowserWindow;
  private ready = false;
  private pending?: TooltipRequest;
  private hideTimer?: NodeJS.Timeout;
  private disposed = false;
  private away = () => this.hide();
  constructor(private parent: BrowserWindow, private theme: () => Theme) {
    for (const event of PARENT_EVENTS) (parent as EventEmitter).on(event, this.away);
  }
  private send(push: TooltipPush) { if (this.window && !this.window.isDestroyed()) this.window.webContents.send('tooltip:push', push); }
  private create() {
    const tip = this.window = new BrowserWindow({
      parent: this.parent, modal: false, frame: false, transparent: true, hasShadow: false, skipTaskbar: true, focusable: false, show: false,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false, width: TOOLTIP_SIZE.width, height: TOOLTIP_SIZE.height, title: 'Tooltip',
      webPreferences: { preload: path.join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, zoomFactor: 1, backgroundThrottling: false },
    });
    tip.setMenu(null);
    tip.setIgnoreMouseEvents(true);
    tip.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    tip.webContents.on('will-navigate', event => event.preventDefault());
    tip.webContents.on('will-attach-webview', event => event.preventDefault());
    tip.webContents.on('zoom-changed', () => tip.webContents.setZoomFactor(1));
    tip.on('close', event => { if (!this.disposed) { event.preventDefault(); tip.hide(); } });
    // Una ventana hija oculta puede no pintar nunca fuera de automatización: ready-to-show solo no basta.
    const markReady = () => { if (this.ready) return; this.ready = true; const next = this.pending; this.pending = undefined; if (next) this.show(next); };
    tip.once('ready-to-show', markReady);
    tip.webContents.once('did-finish-load', markReady);
    void tip.loadURL(TOOLTIP_URL).catch(() => { if (!tip.isDestroyed()) tip.hide(); });
  }
  show(request: TooltipRequest) {
    if (this.disposed || this.parent.isDestroyed() || !this.parent.isVisible() || this.parent.isMinimized()) return;
    if (!this.window) this.create();
    if (!this.ready) { this.pending = request; return; }
    const tip = this.window!;
    if (tip.isDestroyed()) return;
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = undefined; }
    const bounds = tooltipBounds(request.rect, request.side, TOOLTIP_SIZE, this.parent.getContentBounds(), this.parent.webContents.getZoomFactor());
    tip.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
    this.send({ kind: 'show', text: request.text, side: request.side, anchorX: bounds.anchorX, anchorY: bounds.anchorY, theme: this.theme() });
    if (!tip.isVisible()) tip.showInactive();
  }
  hide() {
    this.pending = undefined;
    const tip = this.window;
    if (!tip || tip.isDestroyed() || !tip.isVisible() || this.hideTimer) return;
    this.send({ kind: 'hide' });
    // El renderer necesita un instante para el fundido de salida; un show posterior cancela el ocultado.
    this.hideTimer = setTimeout(() => { this.hideTimer = undefined; if (!tip.isDestroyed()) tip.hide(); }, HIDE_AFTER_MS);
  }
  dispose() {
    this.disposed = true;
    if (this.hideTimer) clearTimeout(this.hideTimer);
    for (const event of PARENT_EVENTS) (this.parent as EventEmitter).removeListener(event, this.away);
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
  }
}
