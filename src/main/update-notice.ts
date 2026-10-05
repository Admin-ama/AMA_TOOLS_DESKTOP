import { BrowserWindow } from 'electron';
import path from 'node:path';
import type { EventEmitter } from 'node:events';
import type { Snapshot } from '../shared/contracts';

export const UPDATE_NOTICE_URL = 'app://bundle/index.html#update-notice';

/** A local nonmodal surface above native service views, never above other apps. */
export class UpdateNoticeWindow {
  window?: BrowserWindow;
  private ready = false;
  private state?: Snapshot;
  private disposed = false;
  private sync = () => {
    const notice = this.window;
    if (!notice || notice.isDestroyed() || this.parent.isDestroyed()) return;
    if (!this.ready || !this.state?.updates.noticeVisible || !this.parent.isVisible() || this.parent.isMinimized()) {
      notice.hide();
      return;
    }
    const bounds = this.parent.getContentBounds();
    notice.setBounds({ x: bounds.x + bounds.width - 400 - 16, y: bounds.y + bounds.height - 216 - 16, width: 400, height: 216 });
    notice.webContents.send('portal:changed', this.state);
    if (!notice.isVisible()) notice.showInactive();
  };
  constructor(private parent: BrowserWindow, private snooze: () => void) {
    for (const event of ['move', 'resize', 'minimize', 'restore', 'hide', 'show']) (parent as EventEmitter).on(event, this.sync);
  }
  update(state: Snapshot) {
    if (this.disposed) return;
    this.state = state;
    if (state.updates.noticeVisible && !this.window) {
      const notice = this.window = new BrowserWindow({
        parent: this.parent, modal: false, frame: false, show: false, skipTaskbar: true,
        width: 400, height: 216, resizable: false, minimizable: false, maximizable: false,
        backgroundColor: '#0b1222', title: 'Actualización de AMATIME Tools',
        webPreferences: { preload: path.join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, zoomFactor: 1 },
      });
      notice.setMenu(null);
      notice.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      notice.webContents.on('will-navigate', event => event.preventDefault());
      notice.webContents.on('will-attach-webview', event => event.preventDefault());
      notice.webContents.on('zoom-changed', () => notice.webContents.setZoomFactor(1));
      notice.on('close', event => { if (!this.disposed) { event.preventDefault(); this.snooze(); notice.hide(); } });
      notice.once('ready-to-show', () => { this.ready = true; this.sync(); });
      void notice.loadURL(UPDATE_NOTICE_URL).catch(() => { if (!notice.isDestroyed()) notice.hide(); });
    }
    this.sync();
  }
  dispose() {
    this.disposed = true;
    for (const event of ['move', 'resize', 'minimize', 'restore', 'hide', 'show']) (this.parent as EventEmitter).removeListener(event, this.sync);
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
  }
}
