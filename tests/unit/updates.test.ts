import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { UpdateController } from '../../src/main/update-controller';

function fixture(enabled = true) {
  const backend = Object.assign(new EventEmitter(), {
    autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true, allowDowngrade: true,
    checkForUpdates: vi.fn(async () => null), downloadUpdate: vi.fn(async () => []), quitAndInstall: vi.fn(),
  });
  const changed = vi.fn();
  return { backend, changed, controller: new UpdateController(backend, enabled, '0.2.0', changed) };
}
it('desactiva actualizaciones de desarrollo sin consultar la red', async () => {
  const { controller, backend } = fixture(false);
  expect(controller.snapshot.status).toBe('disabled');
  await expect(controller.check()).rejects.toThrow();
  expect(backend.checkForUpdates).not.toHaveBeenCalled();
});
it('comprueba sin descargar y exige descarga completa antes de instalar', async () => {
  const { controller, backend } = fixture();
  expect(backend.autoDownload).toBe(false);
  expect(backend.autoInstallOnAppQuit).toBe(false);
  expect(backend.allowDowngrade).toBe(false);
  await controller.check();
  backend.emit('update-available', { version: '0.3.0' });
  expect(controller.snapshot.status).toBe('available');
  expect(backend.downloadUpdate).not.toHaveBeenCalled();
  expect(() => controller.install()).toThrow();
  await controller.download();
  backend.emit('download-progress', { percent: 42.4 });
  expect(controller.snapshot.progress).toBe(42);
  backend.emit('update-downloaded', { version: '0.3.0' });
  controller.install();
  expect(backend.quitAndInstall).toHaveBeenCalledWith(false, true);
});
it('evita búsquedas simultáneas y expone errores sin filtrar detalles internos', async () => {
  const { controller, backend } = fixture();
  await controller.check();
  await controller.check();
  expect(backend.checkForUpdates).toHaveBeenCalledTimes(1);
  backend.emit('error', new Error('secret-internal-url'));
  expect(controller.snapshot.status).toBe('error');
  expect(JSON.stringify(controller.snapshot)).not.toContain('secret-internal-url');
  await controller.check();
  backend.emit('update-not-available');
  expect(controller.snapshot.status).toBe('current');
});
it('libera listeners al cerrar la ventana', () => {
  const { controller, backend } = fixture();
  controller.dispose();
  expect(backend.listenerCount('update-available')).toBe(0);
});

it('pospone el aviso de la misma versión durante la sesión sin descargar', async () => {
  const { controller, backend } = fixture();
  backend.emit('update-available', { version: '0.3.0' });
  expect(controller.snapshot.noticeVisible).toBe(true);
  controller.snooze();
  await controller.check();
  backend.emit('update-available', { version: '0.3.0' });
  expect(controller.snapshot.noticeVisible).toBe(false);
  expect(backend.downloadUpdate).not.toHaveBeenCalled();
  backend.emit('update-available', { version: '0.4.0' });
  expect(controller.snapshot.noticeVisible).toBe(true);
});

it('permite descargar después desde Ajustes, posponer el progreso y no reinicia al terminar', async () => {
  const { controller, backend } = fixture();
  backend.emit('update-available', { version: '0.3.0' });
  controller.snooze();
  await controller.download();
  expect(controller.snapshot.noticeVisible).toBe(true);
  controller.snooze();
  backend.emit('download-progress', { percent: 75 });
  backend.emit('update-downloaded', { version: '0.3.0' });
  expect(controller.snapshot.noticeVisible).toBe(false);
  expect(controller.snapshot.status).toBe('downloaded');
  expect(backend.quitAndInstall).not.toHaveBeenCalled();
});
