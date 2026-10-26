import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let app: ElectronApplication;
let page: Page;
let server: Server;
let directory: string;
let slowResource = false;
let slowDocument = false;

async function switchApplication(name: string, tabName: string) {
  await page.getByRole('button', { name: `Abrir ${name}`, exact: true }).click();
  await expect(page.getByTestId(tabName.toLowerCase().replace(' ', '-tab-'))).toHaveAttribute('aria-selected', 'true');
}

async function waitForPage() {
  await expect.poll(() => page.evaluate(async () => {
    const snapshot = await window.portal.snapshot();
    return snapshot.states[snapshot.active].status;
  })).toBe('ready');
}

async function availableUpdate() {
  await app.evaluate(({ app }) => app.emit('ama:test-update', 'update-available', { version: '0.3.0' }));
  await expect.poll(() => app.windows().some(w => w.url().endsWith('#update-notice'))).toBe(true);
  return app.windows().find(w => w.url().endsWith('#update-notice'))!;
}

test.beforeEach(async ({}, testInfo) => {
  slowResource = false;
  slowDocument = false;
  directory = await mkdtemp(path.join(tmpdir(), 'amatime-e2e-'));
  server = createServer((req, res) => {
    if (slowDocument && req.url === '/n8n') return;
    if (req.url === '/never-load') return;
    if (req.url === '/favicon.ico') { res.setHeader('Content-Type', 'image/png'); res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<html lang="es"><head><title>Página ${req.url}</title></head><body><h1>Login nativo ${req.url}</h1><input aria-label="Email del servicio">${slowResource ? '<img src="/never-load" alt="Recurso secundario">' : ''}<script>localStorage.setItem('visited','yes')</script></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server port');
  const config = Object.fromEntries(['huly', 'n8n', 'librechat', 'portal', 'emailai', 'stirling', 'teams', 'copilot', 'outlook', 'sharepoint', 'powerautomate', 'forms', 'costeador', 'buk'].map(id => [id, `http://127.0.0.1:${address.port}/${id}`]));
  await writeFile(path.join(directory, 'services.json'), JSON.stringify(config));
  await writeFile(path.join(directory, 'installed.json'), '[]');
  // [office]: Office falso (Word, Excel y Outlook; sin PowerPoint) en una carpeta temporal.
  const officeRoot = path.join(directory, 'office');
  if (testInfo.title.includes('[office]')) { await mkdir(officeRoot, { recursive: true }); for (const exe of ['WINWORD.EXE', 'EXCEL.EXE', 'OUTLOOK.EXE']) await writeFile(path.join(officeRoot, exe), 'x'); }
  app = await electron.launch({ args: ['.'], env: { ...process.env, AMA_E2E: '1', AMA_TEST_UPDATES: testInfo.title.includes('[updates]') ? '1' : '0', AMA_TEST_SPLASH_MS: testInfo.title.includes('[arranque]') ? '4000' : '', AMA_TEST_ADMINS: testInfo.title.includes('[admins]') ? JSON.stringify({ costeador: { name: 'Julio Prueba', email: 'julio.prueba@amatime.com' } }) : '', AMA_TEST_CONFIG: path.join(directory, 'services.json'), AMA_TEST_INSTALLED_APPS: path.join(directory, 'installed.json'), AMA_TEST_USER_DATA: path.join(directory, 'data'), AMA_TEST_OFFICE_ROOT: testInfo.title.includes('[office]') ? officeRoot : '' } });
  page = await app.firstWindow();
  if (testInfo.title.includes('[arranque]')) return;
  await expect(page.getByRole('status', { name: 'Iniciando Amatime OS' })).toHaveCount(0);
  await expect(page.getByTestId('librechat-tab-1')).toHaveAttribute('aria-selected', 'true');
  await switchApplication('Huly Workspace', 'huly 1');
});

test('[arranque] logo animado tapa la app hasta que el servicio de inicio carga', async ({}, testInfo) => {
  const splash = page.getByRole('status', { name: 'Iniciando Amatime OS' });
  await expect(splash).toBeVisible();
  await expect(splash.getByRole('img', { name: 'AMA Time' })).toBeVisible();
  // Logo sobrio: sin círculo expansivo, chispas ni brillo neón.
  expect(await splash.locator('.splash-ring, .splash-spark, .splash-logo-glow').count()).toBe(0);
  // Mientras se ve el logo, ninguna vista nativa puede pintar encima.
  expect(await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().find(w => !w.getParentWindow())!.contentView.children.some(view => (view as any).getVisible?.()))).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('splash.png') });
  await expect(splash).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(() => page.evaluate(async () => (await window.portal.snapshot()).splash)).toBe('done');
  await expect.poll(() => app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().find(w => !w.getParentWindow())!.contentView.children.some(view => (view as any).getVisible?.()))).toBe(true);
});

test('[updates] aviso nativo abajo a la derecha permite posponer sin descargar', async ({}, testInfo) => {
  await waitForPage();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.focus());
  const notice = await availableUpdate();
  await expect(notice.getByRole('button', { name: 'Descargar y actualizar' })).toBeVisible();
  const bounds = await app.evaluate(({ BrowserWindow, webContents }) => {
    const child = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#update-notice'))!;
    const parent = child.getParentWindow()!;
    return { child: child.getBounds(), parent: parent.getContentBounds(), modal: child.isModal(), onTop: child.isAlwaysOnTop(), visible: child.isVisible(), focusedParent: parent.isFocused(), remote: webContents.getAllWebContents().some(w => w.getURL().endsWith('/huly')) };
  });
  expect(bounds.child.x + bounds.child.width).toBe(bounds.parent.x + bounds.parent.width - 16);
  expect(bounds.child.y + bounds.child.height).toBe(bounds.parent.y + bounds.parent.height - 16);
  expect(bounds).toMatchObject({ modal: false, onTop: false, visible: true, focusedParent: true, remote: true });
  await notice.screenshot({ path: testInfo.outputPath('update-notice-dark.png') });
  await page.getByRole('button', { name: 'Cambiar a tema claro' }).click();
  await expect(notice.locator('html')).toHaveAttribute('data-theme', 'light');
  await notice.screenshot({ path: testInfo.outputPath('update-notice-light.png') });
  const denied = await notice.evaluate(async () => { try { await window.portal.openTab(); return false; } catch { return true; } });
  expect(denied).toBe(true);
  await notice.getByRole('button', { name: 'Más tarde' }).click();
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#update-notice'))!.isVisible())).toBe(false);
  await app.evaluate(({ app }) => app.emit('ama:test-update', 'update-available', { version: '0.3.0' }));
  await expect.poll(() => page.evaluate(async () => (await window.portal.snapshot()).updates.noticeVisible)).toBe(false);
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Descargar actualización' })).toBeVisible();
});

test('[updates] aviso sigue tamaño y minimización del padre y cerrar equivale a posponer', async () => {
  const notice = await availableUpdate();
  await expect(notice.getByRole('heading', { name: 'Nueva versión disponible' })).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.setContentSize(900, 600));
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
    const child = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#update-notice'))!;
    const parent = child.getParentWindow()!.getContentBounds();
    const bounds = child.getBounds();
    return { right: parent.x + parent.width - bounds.x - bounds.width, bottom: parent.y + parent.height - bounds.y - bounds.height };
  })).toEqual({ right: 16, bottom: 16 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.minimize());
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#update-notice'))!.isVisible())).toBe(false);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.restore());
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#update-notice'))!.isVisible())).toBe(true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#update-notice'))!.close());
  await expect.poll(() => page.evaluate(async () => (await window.portal.snapshot()).updates.noticeVisible)).toBe(false);
});

test('[updates] aviso aparece al restaurar si la versión se encontró con la ventana minimizada', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.minimize());
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.isMinimized())).toBe(true);
  await app.evaluate(({ app }) => app.emit('ama:test-update', 'update-available', { version: '0.3.0' }));
  await expect.poll(() => app.windows().some(w => w.url().endsWith('#update-notice'))).toBe(true);
  await new Promise(resolve => setTimeout(resolve, 1500));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.restore());
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#update-notice'))!.isVisible())).toBe(true);
});

test('[updates] descarga por consentimiento y permite posponer sin reinicio automático', async () => {
  const notice = await availableUpdate();
  await notice.getByRole('button', { name: 'Descargar y actualizar' }).click();
  await expect(notice.getByRole('heading', { name: 'Descargando actualización' })).toBeVisible();
  await notice.getByRole('button', { name: 'Más tarde' }).click();
  await app.evaluate(({ app }) => app.emit('ama:test-update', 'update-downloaded', { version: '0.3.0' }));
  await expect.poll(() => page.evaluate(async () => (await window.portal.snapshot()).updates)).toMatchObject({ status: 'downloaded', noticeVisible: false });
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Instalar y reiniciar' })).toBeVisible();
});

test.afterEach(async () => {
  await app?.close();
  server?.closeAllConnections();
  await new Promise<void>(resolve => server?.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});

test('actualizaciones visibles en Ajustes y desactivadas en desarrollo', async () => {
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Actualizaciones · v\d+\.\d+\.\d+$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buscar actualizaciones' })).toBeDisabled();
  const disabled = await page.evaluate(async () => {
    try { await window.portal.checkUpdates(); return false; } catch { return true; }
  });
  expect(disabled).toBe(true);
});

test('zoom del header ajusta la aplicación sin ampliar el shell y permite restaurar', async () => {
  await waitForPage();
  await page.getByRole('button', { name: 'Aumentar zoom' }).click();
  await expect(page.getByRole('button', { name: 'Restablecer zoom' })).toHaveText('110%');
  const zooms = await app.evaluate(({ webContents, BrowserWindow }) => ({
    remote: webContents.getAllWebContents().find(w => w.getURL().endsWith('/huly'))!.getZoomFactor(),
    shell: BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.webContents.getZoomFactor(),
  }));
  expect(zooms).toEqual({ remote: 1.1, shell: 1 });
  await page.getByRole('button', { name: 'Abrir nueva pestaña de Huly' }).click();
  await expect(page.getByTestId('huly-tab-2')).toHaveAttribute('aria-selected', 'true');
  await waitForPage();
  const shared = await app.evaluate(({ webContents }) => webContents.getAllWebContents().filter(w => w.getURL().endsWith('/huly')).map(w => w.getZoomFactor()));
  expect(shared).toEqual([1.1, 1.1]);
  await page.getByRole('button', { name: 'Recargar servicio' }).click();
  await waitForPage();
  await switchApplication('n8n Automations', 'n8n 1');
  await expect(page.getByRole('button', { name: 'Restablecer zoom' })).toHaveText('100%');
  await page.getByRole('button', { name: 'Abrir Huly Workspace' }).click();
  await expect(page.getByRole('button', { name: 'Restablecer zoom' })).toHaveText('110%');
  await page.getByRole('button', { name: 'Restablecer zoom' }).click();
  await expect(page.getByRole('button', { name: 'Restablecer zoom' })).toHaveText('100%');
  await page.getByRole('button', { name: 'Reducir zoom' }).click();
  await expect(page.getByRole('button', { name: 'Restablecer zoom' })).toHaveText('90%');
});

test('zoom valida IPC y respeta los límites', async () => {
  const rejected = await page.evaluate(async () => {
    const results = [];
    for (const value of [0, 201, NaN, '110']) {
      try { await window.portal.zoom(value as number); results.push(false); }
      catch { results.push(true); }
    }
    return results;
  });
  expect(rejected).toEqual([true, true, true, true]);
  await page.evaluate(() => window.portal.zoom(50));
  await expect(page.getByRole('button', { name: 'Reducir zoom' })).toBeDisabled();
  await page.evaluate(() => window.portal.zoom(200));
  await expect(page.getByRole('button', { name: 'Aumentar zoom' })).toBeDisabled();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restablecer zoom' })).toBeDisabled();
});

test('el botón de aplicaciones reemplaza al logo en la parte superior de la sidebar', async () => {
  await expect(page.getByRole('img', { name: 'AMA Time Digital', exact: true })).toHaveCount(0);
  const launcher = page.getByRole('button', { name: 'Ver todas las aplicaciones', exact: true });
  await expect(launcher).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Navegación principal' }).getByRole('button').first()).toHaveAccessibleName('Ver todas las aplicaciones');
});

test('launcher agrupa por categorías, fija y desfija apps y abre apps no fijadas', async ({}, testInfo) => {
  await waitForPage();
  const nav = page.getByRole('navigation', { name: 'Servicios' });
  await page.getByRole('button', { name: 'Ver todas las aplicaciones', exact: true }).click();
  const launcher = page.getByRole('region', { name: 'Todas las aplicaciones' });
  await expect(launcher).toBeVisible();
  for (const name of ['Control', 'Apps Amatime', 'Operación', 'Comunicación', 'Automatización y herramientas']) await expect(launcher.getByRole('heading', { name })).toBeVisible();
  await expect(launcher.getByRole('button', { name: /^Abrir (?!.*a la derecha)/ })).toHaveCount(14);
  await expect(launcher.getByRole('button', { name: /^Abrir .* a la derecha$/ })).toHaveCount(14);
  // Teams es global pero no está fijado por defecto: solo vive en Comunicación.
  await expect(launcher.getByRole('button', { name: 'Fijar Microsoft Teams en la barra lateral' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Servicios' }).getByRole('button', { name: 'Abrir Microsoft Teams' })).toHaveCount(0);
  // Las vistas nativas no pueden pintar sobre el launcher.
  const visibility = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.contentView.children.map(v => v.getVisible()));
  expect(visibility.every(v => !v)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('launcher.png') });
  // Buscar filtra.
  await launcher.getByRole('textbox', { name: 'Buscar aplicación' }).fill('stirl');
  await expect(launcher.getByRole('button', { name: /^Abrir (?!.*a la derecha)/ })).toHaveCount(1);
  await launcher.getByRole('textbox', { name: 'Buscar aplicación' }).fill('');
  // Desfijar n8n lo quita de la sidebar y se conserva en preferencias.
  await launcher.getByRole('button', { name: 'Quitar n8n Automations de la barra lateral' }).click();
  await expect(launcher.getByRole('button', { name: 'Fijar n8n Automations en la barra lateral' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(launcher).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Abrir n8n Automations' })).toHaveCount(0);
  await expect(nav.getByRole('button')).toHaveCount(7);
  expect(await page.evaluate(async () => (await window.portal.snapshot()).preferences.pinned)).not.toContain('n8n');
  // Abrir una app no fijada desde el launcher: aparece temporalmente en la sidebar.
  await page.getByRole('button', { name: 'Ver todas las aplicaciones', exact: true }).click();
  await launcher.getByRole('button', { name: 'Abrir n8n Automations', exact: true }).click();
  await expect(page.getByTestId('n8n-tab-1')).toHaveAttribute('aria-selected', 'true');
  await expect(launcher).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Abrir n8n Automations' })).toBeVisible();
  await waitForPage();
  // Como en una barra de tareas: la no fijada sigue visible mientras tenga pestañas abiertas.
  await page.getByRole('button', { name: 'Abrir Huly Workspace', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Abrir n8n Automations' })).toBeVisible();
  await nav.getByRole('button', { name: 'Abrir n8n Automations' }).click();
  await expect(page.getByTestId('n8n-tab-1')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('close-n8n-tab-1').click();
  await expect(nav.getByRole('button', { name: 'Abrir n8n Automations' })).toHaveCount(0);
  // IPC: ids y valores inválidos rechazados.
  const rejected = await page.evaluate(async () => {
    const results = [];
    for (const [id, value] of [['evil', true], ['huly', 'yes']] as const) { try { await window.portal.pin(id as never, value as never); results.push(false); } catch { results.push(true); } }
    return results;
  });
  expect(rejected).toEqual([true, true]);
});

test('launcher anima entrada y salida y respeta reducir movimiento', async () => {
  const button = page.getByRole('button', { name: 'Ver todas las aplicaciones', exact: true });
  const launcher = page.getByRole('region', { name: 'Todas las aplicaciones' });
  const opacity = () => launcher.locator('.launcher-panel').evaluate(el => getComputedStyle(el).opacity);
  await button.click();
  await expect(launcher.locator('.launcher-panel')).toBeAttached();
  await expect.poll(() => page.evaluate(() => document.querySelector('.launcher-panel')?.getAnimations?.().length ?? 0)).toBe(0);
  const animated = await page.evaluate(() => (window as any).gsap === undefined && document.querySelector('.launcher-panel')!.hasAttribute('style'));
  expect(animated).toBe(true);
  await expect.poll(opacity).toBe('1');
  await page.keyboard.press('Escape');
  await expect(launcher).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await button.click();
  expect(await opacity()).toBe('1');
  await expect(launcher.locator('.launcher-card').first()).toHaveCSS('opacity', '1');
  await page.keyboard.press('Escape');
  await expect(launcher).toHaveCount(0);
});

test('navegación compacta alinea shell y vista nativa', async () => {
  await expect.poll(() => page.getByRole('complementary', { name: 'Navegación principal' }).evaluate(el => el.getBoundingClientRect().width)).toBe(64);
  await expect.poll(() => page.getByRole('complementary', { name: 'Aplicaciones de escritorio' }).evaluate(el => el.getBoundingClientRect().width)).toBe(56);
  await expect.poll(() => page.getByRole('banner').evaluate(el => el.getBoundingClientRect().height)).toBe(52);
  await expect.poll(() => page.getByRole('contentinfo').evaluate(el => el.getBoundingClientRect().height)).toBe(28);
  const content = await page.getByRole('tabpanel').boundingBox();
  const view = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.contentView.children.find(v => v.getVisible())!.getBounds());
  expect(view).toEqual(content);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.setContentSize(900, 600));
  await expect(page.getByRole('button', { name: 'Abrir nueva pestaña de Huly' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recargar servicio' })).toBeVisible();
});

test('apps de escritorio: vincular con diálogo del proceso principal, abrir por id sin exponer rutas y quitar', async () => {
  const exe = path.join(directory, 'Fake Tool.exe');
  await writeFile(exe, 'MZ');
  // El diálogo y shell.openPath se sustituyen en main: no se abre nada real.
  await app.evaluate(({ dialog, shell }, file) => {
    const state = globalThis as unknown as { opened: string[] };
    state.opened = [];
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as never;
    shell.openPath = (async (target: string) => { state.opened.push(target); return ''; }) as never;
  }, exe);
  const dock = page.getByRole('complementary', { name: 'Aplicaciones de escritorio' });
  await expect(dock).toBeVisible();
  await dock.getByRole('button', { name: 'Vincular aplicación de escritorio' }).click();
  // El selector ofrece "Examinar…" como alternativa avanzada: abre el diálogo nativo de siempre.
  await page.getByRole('dialog', { name: 'Vincular aplicación de escritorio' }).getByRole('button', { name: /Examinar/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const item = dock.getByRole('button', { name: 'Abrir Fake Tool (escritorio)' });
  await expect(item).toBeVisible();
  // Ni el snapshot ni el DOM conocen la ruta; solo el archivo de preferencias del proceso principal.
  const snapshot = JSON.stringify(await page.evaluate(() => window.portal.snapshot()));
  expect(snapshot).not.toContain('amatime-e2e-');
  expect(snapshot).toContain('Fake Tool');
  expect(await page.evaluate(() => document.documentElement.innerHTML)).not.toContain('amatime-e2e-');
  const preferencesFile = path.join(directory, 'data', 'preferences.json');
  expect(JSON.parse(await readFile(preferencesFile, 'utf8')).desktopApps).toMatchObject([{ name: 'Fake Tool', path: exe }]);
  // Abrir: main resuelve la ruta por id.
  await item.click();
  await expect.poll(() => app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened)).toEqual([exe]);
  const rejected = await page.evaluate(async (file) => {
    const results = [];
    for (const task of [() => window.portal.openDesktopApp('desconocido'), () => window.portal.openDesktopApp(file), () => (window.portal.openDesktopApp as (...args: unknown[]) => Promise<void>)('x', '--flag'), () => window.portal.removeDesktopApp(file)]) { try { await task(); results.push(false); } catch { results.push(true); } }
    return results;
  }, exe);
  expect(rejected).toEqual([true, true, true, true]);
  expect(await app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened)).toEqual([exe]);
  // Quitar con clic derecho.
  await item.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Quitar Fake Tool de la barra' }).click();
  await expect(item).toHaveCount(0);
  expect(JSON.parse(await readFile(preferencesFile, 'utf8')).desktopApps).toEqual([]);
});

test('apps de escritorio: selector de apps instaladas vincula por id, oculta vistas nativas y rechaza ids desconocidos', async () => {
  const exe = path.join(directory, 'Fake Installed.exe');
  const other = path.join(directory, 'Other App.exe');
  const aumid = 'Fake.Calc_8wekyb3d8bbwe!App';
  await writeFile(exe, 'MZ'); await writeFile(other, 'MZ');
  await writeFile(path.join(directory, 'installed.json'), JSON.stringify([{ name: 'Fake Installed', kind: 'path', path: exe }, { name: 'Other App', kind: 'path', path: other }, { name: 'Calculadora Falsa', kind: 'aumid', aumid }]));
  // Nada se lanza de verdad: ni shell.openPath ni explorer.
  await app.evaluate(({ shell }) => { shell.openPath = (async () => '') as never; });
  const nativeVisible = () => app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().find(w => !w.getParentWindow())!.contentView.children.some(view => (view as any).getVisible?.()));
  const dock = page.getByRole('complementary', { name: 'Aplicaciones de escritorio' });
  const dialog = page.getByRole('dialog', { name: 'Vincular aplicación de escritorio' });
  const preferencesFile = path.join(directory, 'data', 'preferences.json');
  expect(await nativeVisible()).toBe(true);
  await dock.getByRole('button', { name: 'Vincular aplicación de escritorio' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Fake Installed' })).toBeVisible();
  await expect.poll(nativeVisible).toBe(false);
  // Búsqueda sin acentos ni mayúsculas.
  await dialog.getByRole('textbox', { name: 'Buscar aplicación instalada' }).fill('CALC');
  await expect(dialog.getByRole('button', { name: 'Calculadora Falsa' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Fake Installed' })).toHaveCount(0);
  await dialog.getByRole('textbox', { name: 'Buscar aplicación instalada' }).fill('zzz');
  await expect(dialog.getByText('Sin resultados')).toBeVisible();
  // Esc cierra y devuelve las vistas nativas.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect.poll(nativeVisible).toBe(true);
  // Vincular con un clic.
  await dock.getByRole('button', { name: 'Vincular aplicación de escritorio' }).click();
  await dialog.getByRole('button', { name: 'Fake Installed' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(dock.getByRole('button', { name: 'Abrir Fake Installed (escritorio)' })).toBeVisible();
  await expect.poll(nativeVisible).toBe(true);
  expect(JSON.parse(await readFile(preferencesFile, 'utf8')).desktopApps).toMatchObject([{ name: 'Fake Installed', kind: 'path', path: exe }]);
  // Ya vinculada: aparece marcada y deshabilitada; una app empaquetada se guarda por AUMID.
  await dock.getByRole('button', { name: 'Vincular aplicación de escritorio' }).click();
  await expect(dialog.getByRole('button', { name: 'Fake Installed (ya vinculada)' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.innerHTML)).not.toContain('amatime-e2e-');
  await dialog.getByRole('button', { name: 'Calculadora Falsa' }).click();
  await expect(dock.getByRole('button', { name: 'Abrir Calculadora Falsa (escritorio)' })).toBeVisible();
  expect(JSON.parse(await readFile(preferencesFile, 'utf8')).desktopApps).toMatchObject([{ kind: 'path' }, { name: 'Calculadora Falsa', kind: 'aumid', aumid }]);
  const snapshot = JSON.stringify(await page.evaluate(() => window.portal.snapshot()));
  expect(snapshot).not.toContain('amatime-e2e-');
  expect(snapshot).not.toContain('Fake.Calc_');
  // El renderer no puede vincular nada que main no haya enumerado.
  const candidates = await page.evaluate(() => window.portal.desktopCandidates());
  expect(JSON.stringify(candidates)).not.toContain('amatime-e2e-');
  expect(candidates.filter(item => item.linked).map(item => item.name).sort()).toEqual(['Calculadora Falsa', 'Fake Installed']);
  const rejected = await page.evaluate(async ([file, id]) => {
    const link = window.portal.desktopLink as (...args: unknown[]) => Promise<void>;
    const results = [];
    for (const args of [['cand-desconocido'], [file], [id], [''], [3], [undefined], ['cand-x', '--flag']]) { try { await link(...args); results.push(false); } catch { results.push(true); } }
    return results;
  }, [exe, aumid]);
  expect(rejected).toEqual([true, true, true, true, true, true, true]);
  expect(JSON.parse(await readFile(preferencesFile, 'utf8')).desktopApps).toHaveLength(2);
});

test('barra de estado inferior muestra red, versión y reloj alineada con la vista nativa', async ({}, testInfo) => {
  const bar = page.getByRole('contentinfo');
  await expect(bar.getByRole('status', { name: 'Red interna: disponible' })).toBeVisible();
  await expect(bar.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
  await expect(bar.getByRole('timer')).toHaveText(/^\d{2}:\d{2}$/);
  const box = await bar.boundingBox();
  const size = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.getContentSize());
  expect(box).toMatchObject({ x: 0, height: 28, width: size[0] });
  expect(box!.y + box!.height).toBe(size[1]);
  const view = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.contentView.children.find(v => v.getVisible())!.getBounds());
  expect(view.y + view.height).toBe(box!.y);
  await page.screenshot({ path: testInfo.outputPath('shell-dark.png') });
  await page.getByRole('button', { name: 'Cambiar a tema claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: testInfo.outputPath('shell-light.png') });
});

test('ojos del bot siguen el cursor aunque esté sobre la vista remota', async () => {
  const eyes = page.getByRole('button', { name: 'Abrir AMA IA', exact: true }).locator('.bot-eyes');
  // El cursor real no llega al shell sobre la vista remota; main reenvía la posición global.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.webContents.send('portal:cursor', { x: 1200, y: 120 }));
  await expect.poll(() => eyes.evaluate(el => (el as SVGGElement).style.transform)).toMatch(/^translate\(\d+(\.\d+)?px, /);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.webContents.send('portal:cursor', { x: 0, y: 120 }));
  await expect.poll(() => eyes.evaluate(el => (el as SVGGElement).style.transform)).toMatch(/^translate\(-\d+(\.\d+)?px, /);
});

test('sidebar carga los logos locales de las aplicaciones', async ({}, testInfo) => {
  expect(await page.getByRole('navigation', { name: 'Servicios' }).getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('data-tooltip')))).toEqual(['AMA IA', 'Copilot M365', 'Buk', 'Portal de Operaciones', 'Huly Workspace', 'n8n Automations', 'Email Category AI', 'Stirling PDF']);
  await expect(page.getByRole('button', { name: 'Abrir AMA IA', exact: true }).locator('svg .bot-eye')).toHaveCount(2);
  // Email AI: azulejo propio (sobre + destellos), no el icono de línea genérico.
  await expect(page.getByRole('button', { name: 'Abrir Email Category AI', exact: true }).locator('svg.service-logo-emailai .mail-spark')).toHaveCount(2);
  for (const name of ['Huly Workspace', 'n8n Automations', 'Portal de Operaciones', 'Stirling PDF', 'Buk']) {
    const logo = page.getByRole('button', { name: `Abrir ${name}`, exact: true }).locator('img');
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(await logo.evaluate((img: HTMLImageElement) => img.src)).toMatch(/^(app:\/\/bundle\/|data:image\/)/);
  }
  await page.screenshot({ path: testInfo.outputPath('sidebar-dark.png') });
  await page.getByRole('button', { name: 'Cambiar a tema claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: testInfo.outputPath('sidebar-light.png') });
});

test('pestañas muestran el título real y siguen cambios dinámicos de la página', async () => {
  await expect(page.getByRole('tab', { name: 'Página /huly', exact: true })).toBeVisible();
  await app.evaluate(async ({ webContents }) => webContents.getAllWebContents().find(w => w.getURL().endsWith('/huly'))!.executeJavaScript("document.title='Tareas · AMA'"));
  await expect(page.getByRole('tab', { name: 'Tareas · AMA', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir nueva pestaña de Huly' }).click();
  await expect(page.getByRole('tab', { name: 'Página /huly', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Tareas · AMA', exact: true })).toHaveAttribute('aria-selected', 'false');
  await app.evaluate(async ({ webContents }) => webContents.getAllWebContents().filter(w => w.getURL().endsWith('/huly')).sort((a, b) => a.id - b.id)[0].executeJavaScript("document.title='Calendario · AMA'"));
  await expect(page.getByRole('tab', { name: 'Calendario · AMA', exact: true })).toHaveAttribute('aria-selected', 'false');
  await page.getByRole('tab', { name: 'Calendario · AMA', exact: true }).click();
  await app.evaluate(async ({ webContents }) => webContents.getAllWebContents().filter(w => w.getURL().endsWith('/huly')).sort((a, b) => a.id - b.id)[0].executeJavaScript("document.title=''"));
  await expect(page.getByRole('tab', { name: 'Huly', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('header sin estado de carga ni indicador HTTP', async () => {
  slowDocument = true;
  await switchApplication('n8n Automations', 'n8n 1');
  // El header ya no muestra estados: la red interna vive en la barra de estado inferior.
  await expect(page.getByRole('banner').getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('contentinfo').getByRole('status', { name: /^Red interna/ })).toHaveCount(1);
  await expect(page.getByLabel('Conexión HTTP sin cifrado')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Recargar servicio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cambiar a tema claro' })).toBeVisible();
});

test('layout y pestañas sin formulario de login propio', async () => {
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByTestId('huly-tab-1')).toHaveAttribute('aria-selected', 'true');
  await waitForPage();
  await switchApplication('n8n Automations', 'n8n 1');
  await expect(page.getByTestId('n8n-tab-1')).toHaveAttribute('aria-selected', 'true');
  await waitForPage();
  const views = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.contentView.children.map(v => ({ visible: v.getVisible(), bounds: v.getBounds() })));
  expect(views).toHaveLength(3); // LibreChat de inicio + Huly + n8n. BrowserWindow no enumera el shell entre estas vistas hijas.
  expect(views.filter(v => v.visible)).toHaveLength(1);
  expect(views[views.length - 1].bounds.x).toBe(64);
  expect(views[views.length - 1].bounds.y).toBe(52);
});

test('ajustes oculta vista remota y cambia tema sin perder sesión', async () => {
  await waitForPage();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Preferencias del portal' })).toBeVisible();
  const visibility = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.contentView.children.map(v => v.getVisible()));
  expect(visibility).toHaveLength(2);
  expect(visibility.every(v => !v)).toBe(true);
  await page.getByRole('button', { name: 'Cambiar a tema claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Volver al servicio' }).click();
  await waitForPage();
});

test('vistas remotas aisladas y borrado por servicio', async () => {
  await waitForPage();
  await switchApplication('n8n Automations', 'n8n 1');
  await waitForPage();
  const isolation = await app.evaluate(async ({ webContents }) => {
    const views = webContents.getAllWebContents().filter(w => w.getURL().startsWith('http://127.0.0.1'));
    const huly = views.find(w => w.getURL().endsWith('/huly'))!;
    const n8n = views.find(w => w.getURL().endsWith('/n8n'))!;
    await huly.session.cookies.set({ url: huly.getURL(), name: 'session-test', value: 'huly' });
    const n8nCookies = await n8n.session.cookies.get({ name: 'session-test' });
    await n8n.session.cookies.set({ url: n8n.getURL(), name: 'session-test', value: 'n8n' });
    return { distinct: huly.session !== n8n.session, n8nCookies, privileges: await huly.executeJavaScript('({require: typeof require, process: typeof process})') };
  });
  expect(isolation.distinct).toBe(true);
  expect(isolation.n8nCookies).toEqual([]);
  expect(isolation.privileges).toEqual({ require: 'undefined', process: 'undefined' });
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Borrar sesión de Huly Workspace' }).click();
  await expect(page.getByText('Sesión local eliminada: Huly Workspace')).toBeVisible();
  const cookies = await app.evaluate(async ({ session }) => session.fromPartition('persist:amatime-huly').cookies.get({ name: 'session-test' }));
  expect(cookies).toEqual([]);
  const otherCookies = await app.evaluate(async ({ session }) => session.fromPartition('persist:amatime-n8n').cookies.get({ name: 'session-test' }));
  expect(otherCookies.map(cookie => cookie.value)).toEqual(['n8n']);
});

test('política IPC rechaza URLs arbitrarias y vistas remotas sin privilegios', async () => {
  const rejection = await page.evaluate(async () => {
    try { await window.portal.activate('https://evil.test' as never); return false; } catch { return true; }
  });
  expect(rejection).toBe(true);
  await waitForPage();
  const privileges = await app.evaluate(async ({ webContents }) => {
    const remote = webContents.getAllWebContents().find(w => w.getURL().includes('/huly'))!;
    return remote.executeJavaScript('({portal: typeof window.portal, require: typeof require})');
  });
  expect(privileges).toEqual({ portal: 'undefined', require: 'undefined' });
});

test('cambiar pestañas preserva contexto y ajusta límites al redimensionar', async () => {
  await waitForPage();
  await app.evaluate(async ({ webContents }) => {
    const remote = webContents.getAllWebContents().find(w => w.getURL().includes('/huly'))!;
    await remote.executeJavaScript("document.querySelector('input').value = 'contexto preservado'");
  });
  await switchApplication('n8n Automations', 'n8n 1');
  await page.getByRole('button', { name: 'Abrir Huly Workspace' }).click();
  await waitForPage();
  const value = await app.evaluate(async ({ webContents }) => webContents.getAllWebContents().find(w => w.getURL().includes('/huly'))!.executeJavaScript("document.querySelector('input').value"));
  expect(value).toBe('contexto preservado');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.setContentSize(1000, 700));
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.contentView.children[0].getBounds())).toEqual({ x: 64, y: 52, width: 880, height: 620 });
});

test('sin red interna bloquea los servicios, rechaza comandos y se recupera al reintentar', async ({}, testInfo) => {
  await waitForPage();
  const port = (server.address() as AddressInfo).port;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await page.getByRole('button', { name: 'Recargar servicio' }).click();
  await expect(page.getByRole('contentinfo').getByRole('status', { name: 'Red interna: sin acceso' })).toBeVisible();
  const block = page.getByRole('alert').filter({ has: page.getByRole('heading', { name: 'Sin acceso a red interna' }) });
  await expect(block).toBeVisible();
  await expect(block.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('network-block.png') });
  // Las vistas nativas no pueden pintar sobre la pantalla de bloqueo.
  const visible = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.contentView.children.map(v => v.getVisible()));
  expect(visible.length).toBeGreaterThan(0);
  expect(visible.every(v => !v)).toBe(true);
  // El proceso principal rechaza cargar o crear servicios aunque la UI no lo ofrezca.
  const rejected = await page.evaluate(async () => {
    const results = [];
    for (const task of [() => window.portal.activate('n8n'), () => window.portal.openTab(), () => window.portal.panel('launcher'), () => window.portal.zoom(110)]) { try { await task(); results.push(false); } catch { results.push(true); } }
    return results;
  });
  expect(rejected).toEqual([true, true, true, true]);
  // Ajustes sigue disponible y volver al servicio mantiene el bloqueo.
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Preferencias del portal' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver al servicio' }).click();
  await expect(block).toBeVisible();
  // Al volver la red, Reintentar restablece el servicio.
  server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<html><head><title>Recuperado</title></head><body>ok</body></html>'); });
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  await block.getByRole('button', { name: 'Reintentar' }).click();
  await expect(block).toHaveCount(0);
  await waitForPage();
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.contentView.children.filter(v => v.getVisible()).length)).toBe(1);
  await page.getByRole('button', { name: 'Abrir n8n Automations', exact: true }).click();
  await expect(page.getByTestId('n8n-tab-1')).toHaveAttribute('aria-selected', 'true');
});

test('enlaces fuera del origen no abandonan la aplicación', async () => {
  await waitForPage();
  await app.evaluate(async ({ webContents }) => {
    const remote = webContents.getAllWebContents().find(w => w.getURL().includes('/huly'))!;
    await remote.executeJavaScript("location.href='https://example.com/'");
  });
  await expect.poll(() => page.evaluate(async () => {
    const snapshot = await window.portal.snapshot();
    return snapshot.states[snapshot.active].message || '';
  })).toContain('Navegación externa bloqueada');
  const url = await app.evaluate(({ webContents }) => webContents.getAllWebContents().find(w => w.getURL().includes('/huly'))!.getURL());
  expect(url).toContain('/huly');
});

test('recrear una vista no duplica políticas de descarga', async () => {
  await waitForPage();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Borrar sesión de Huly Workspace' }).click();
  await expect(page.getByText('Sesión local eliminada: Huly Workspace')).toBeVisible();
  await page.getByRole('button', { name: 'Volver al servicio' }).click();
  await waitForPage();
  const count = await app.evaluate(({ session }) => session.fromPartition('persist:amatime-huly').listenerCount('will-download'));
  expect(count).toBe(1);
});

test('DOM disponible no espera indefinidamente recursos secundarios', async () => {
  slowResource = true;
  await switchApplication('n8n Automations', 'n8n 1');
  await waitForPage();
});

test('carga directa sin tarjetas, formularios ni gates intermedios', async () => {
  slowDocument = true;
  await switchApplication('n8n Automations', 'n8n 1');
  await expect(page.getByTestId('n8n-tab-1')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Continuar en red interna' })).toHaveCount(0);
  await expect(page.getByText('Conectando con tu aplicación…')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  // La ventana se ajusta al área de trabajo del runner; se compara con su tamaño real.
  const { visible, size } = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!;
    return { visible: window.contentView.children.filter(view => view.getVisible()).map(view => view.getBounds()), size: window.getContentSize() };
  });
  expect(visible).toEqual([{ x: 64, y: 52, width: size[0] - 64 - 56, height: size[1] - 52 - 28 }]);
});

test('barra superior agrupa múltiples pestañas de la aplicación seleccionada', async ({}, testInfo) => {
  await expect(page.getByRole('tab')).toHaveCount(1);
  await page.getByRole('button', { name: 'Abrir nueva pestaña de Huly' }).click();
  await page.getByRole('button', { name: 'Abrir nueva pestaña de Huly' }).click();
  await expect(page.getByRole('tab')).toHaveCount(3);
  await page.getByTestId('huly-tab-2').click();
  await expect(page.getByTestId('huly-tab-2')).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: testInfo.outputPath('application-tabs.png') });
  await switchApplication('n8n Automations', 'n8n 1');
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(page.getByTestId('huly-tab-2')).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir nueva pestaña de n8n' }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.getByRole('button', { name: 'Abrir Huly Workspace' }).click();
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(page.getByTestId('huly-tab-2')).toHaveAttribute('aria-selected', 'true');
});

test('pestañas de Huly conservan contextos separados y comparten sesión de aplicación', async () => {
  await waitForPage();
  await app.evaluate(async ({ webContents }) => webContents.getAllWebContents().find(w => w.getURL().endsWith('/huly'))!.executeJavaScript("document.querySelector('input').value='primera pestaña'"));
  await page.getByRole('button', { name: 'Abrir nueva pestaña de Huly' }).click();
  await expect(page.getByTestId('huly-tab-2')).toHaveAttribute('aria-selected', 'true');
  await waitForPage();
  const shared = await app.evaluate(({ webContents }) => {
    const views = webContents.getAllWebContents().filter(w => w.getURL().endsWith('/huly')).sort((a, b) => a.id - b.id);
    return views.length === 2 && views[0].session === views[1].session;
  });
  expect(shared).toBe(true);
  await app.evaluate(async ({ webContents }) => {
    const views = webContents.getAllWebContents().filter(w => w.getURL().endsWith('/huly')).sort((a, b) => a.id - b.id);
    await views[1].executeJavaScript("document.querySelector('input').value='segunda pestaña'");
  });
  await page.getByTestId('huly-tab-1').click();
  await expect(page.getByTestId('huly-tab-1')).toHaveAttribute('aria-selected', 'true');
  const values = await app.evaluate(async ({ webContents }) => Promise.all(webContents.getAllWebContents().filter(w => w.getURL().endsWith('/huly')).sort((a, b) => a.id - b.id).map(w => w.executeJavaScript("document.querySelector('input').value"))));
  expect(values).toEqual(['primera pestaña', 'segunda pestaña']);
  await page.getByTestId('close-huly-tab-2').click();
  await expect(page.getByRole('tab')).toHaveCount(1);
  const count = await app.evaluate(({ webContents }) => webContents.getAllWebContents().filter(w => w.getURL().endsWith('/huly')).length);
  expect(count).toBe(1);
});

test('enlaces internos con target blank abren otra pestaña de la aplicación', async () => {
  await waitForPage();
  await app.evaluate(async ({ webContents }) => webContents.getAllWebContents().find(w => w.getURL().endsWith('/huly'))!.executeJavaScript("window.open('/huly/details','_blank')"));
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByTestId('huly-tab-2')).toHaveAttribute('aria-selected', 'true');
  await waitForPage();
  const url = await app.evaluate(({ webContents }) => webContents.getAllWebContents().find(w => w.getURL().endsWith('/huly/details'))?.getURL());
  expect(url).toContain('/huly/details');
});

test('cerrar la última pestaña crea reemplazo y libera la vista anterior', async () => {
  await waitForPage();
  await page.getByTestId('close-huly-tab-1').click();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(page.getByTestId('huly-tab-2')).toHaveAttribute('aria-selected', 'true');
  await waitForPage();
  const count = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.contentView.children.length);
  expect(count).toBe(2); // Huly reemplazo + LibreChat de inicio
});

test('borrar sesión cierra todas las vistas de esa aplicación sin afectar otras', async () => {
  await page.getByRole('button', { name: 'Abrir nueva pestaña de Huly' }).click();
  await expect(page.getByTestId('huly-tab-2')).toHaveAttribute('aria-selected', 'true');
  await waitForPage();
  await switchApplication('n8n Automations', 'n8n 1');
  await expect(page.getByTestId('n8n-tab-1')).toHaveAttribute('aria-selected', 'true');
  await waitForPage();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Borrar sesión de Huly Workspace' }).click();
  await expect(page.getByText('Sesión local eliminada: Huly Workspace')).toBeVisible();
  // Las vistas se cierran tras limpiar el almacenamiento: en máquinas lentas (CI) llega después del aviso.
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.contentView.children.length)).toBe(2); // n8n + LibreChat de inicio
  await page.getByRole('button', { name: 'Abrir Huly Workspace' }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByTestId('huly-tab-2')).toHaveAttribute('aria-selected', 'true');
  await waitForPage();
});

// --- Vista dividida -------------------------------------------------------------------------
const nativeViews = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.contentView.children.map(v => ({ url: (v as any).webContents?.getURL() as string, visible: v.getVisible(), bounds: v.getBounds() })));
const visibleViews = async () => (await nativeViews()).filter(v => v.visible);
const visibleApps = async () => (await visibleViews()).map(v => v.url.split('/').pop()).sort();
const splitState = () => page.evaluate(async () => { const s = await window.portal.snapshot(); return { split: s.split, preferences: s.preferences, panel: s.panel, active: s.active }; });
async function openSplit() {
  await page.getByRole('button', { name: 'Abrir panel lateral', exact: true }).click();
  await expect.poll(async () => (await splitState()).split?.serviceId).toBe('librechat');
  await expect.poll(async () => (await visibleViews()).length).toBe(2);
  // La vista nativa llega al hueco del DOM tras un viaje IPC: esperar a que estén alineados.
  await expect.poll(async () => { const { panel, main } = await layoutNow(); return !!panel && !!main; }).toBe(true);
}
async function layoutNow() {
  const slot = (await page.getByTestId('split-panel-slot').boundingBox())!;
  const views = await visibleViews();
  return { slot, panel: views.find(v => Math.abs(v.bounds.x - slot.x) <= 1)!, main: views.find(v => Math.abs(v.bounds.x - slot.x) > 1)! };
}
// El DOM puede tener fracciones de píxel (escala de pantalla); la vista nativa se redondea a enteros.
const expectSameRect = (view: { x: number; y: number; width: number; height: number }, slot: { x: number; y: number; width: number; height: number }) => { for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(view[key] - slot[key]), key).toBeLessThanOrEqual(1); };

test('panel lateral abre LibreChat junto a la app activa, con la misma sesión y bounds iguales al DOM', async () => {
  await waitForPage();
  await openSplit();
  await expect(page.getByRole('button', { name: 'Cerrar panel lateral', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const { slot, panel, main } = await layoutNow();
  expect(panel.url).toMatch(/\/librechat$/);
  expect(main.url).toMatch(/\/huly$/);
  expectSameRect(panel.bounds, slot);
  expect(main.bounds.x + main.bounds.width + 6).toBe(panel.bounds.x);
  expect(await app.evaluate(({ webContents }) => { const chats = webContents.getAllWebContents().filter(w => w.getURL().endsWith('/librechat')); return chats.length === 2 && chats[0].session === chats[1].session; })).toBe(true);
  await expect(page.getByRole('combobox', { name: 'App del panel' })).toHaveValue('librechat');
  await expect(page.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical');
});

test('panel lateral cambia de app con el selector y recuerda la última usada', async () => {
  await openSplit();
  await page.getByRole('combobox', { name: 'App del panel' }).selectOption('n8n');
  await expect.poll(visibleApps).toEqual(['huly', 'n8n']);
  await expect.poll(async () => (await splitState()).preferences.splitService).toBe('n8n');
  expect((await splitState()).split?.serviceId).toBe('n8n');
  const { slot, panel } = await layoutNow();
  expectSameRect(panel.bounds, slot);
  // El panel guarda el último servicio: reabrirlo usa n8n.
  await page.getByRole('button', { name: 'Cerrar panel lateral', exact: true }).click();
  await expect.poll(async () => (await splitState()).split).toBeNull();
  await page.getByRole('button', { name: 'Abrir panel lateral', exact: true }).click();
  await expect.poll(async () => (await splitState()).split?.serviceId).toBe('n8n');
});

test('flechas sobre el separador redimensionan ambas vistas y persisten el ratio', async () => {
  await openSplit();
  const before = await layoutNow();
  const ratioBefore = (await splitState()).split!.ratio;
  await page.getByRole('separator').focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await layoutNow()).panel?.bounds.width ?? 0).toBeGreaterThan(before.panel.bounds.width);
  const after = await layoutNow();
  expect(after.main.bounds.width).toBeLessThan(before.main.bounds.width);
  expect(after.main.bounds.width + 6 + after.panel.bounds.width).toBe(before.main.bounds.width + 6 + before.panel.bounds.width);
  const state = await splitState();
  expect(state.split!.ratio).toBeGreaterThan(ratioBefore);
  expect(state.preferences.splitRatio).toBeCloseTo(state.split!.ratio, 10);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await layoutNow()).panel?.bounds.width ?? Infinity).toBeLessThan(before.panel.bounds.width);
  await page.getByRole('separator').dblclick();
  await expect.poll(async () => (await splitState()).split!.ratio).toBeCloseTo(0.5, 2);
});

test('arrastrar el divisor oculta las vistas, muestra capturas y al soltar aplica y guarda el ratio', async () => {
  await openSplit();
  const before = await layoutNow();
  const box = (await page.getByRole('separator').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 60, y, { steps: 6 });
  await page.mouse.move(x - 140, y, { steps: 6 });
  await expect(page.getByTestId('split-ghost-panel')).toBeVisible();
  await expect.poll(async () => (await visibleViews()).length).toBe(0);
  await page.mouse.up();
  await expect(page.getByTestId('split-ghost-panel')).toHaveCount(0);
  await expect.poll(async () => (await visibleViews()).length).toBe(2);
  const after = await layoutNow();
  expect(Math.abs(after.panel.bounds.width - (before.panel.bounds.width + 140))).toBeLessThanOrEqual(2);
  expectSameRect(after.panel.bounds, after.slot);
  const state = await splitState();
  expect(state.split!.ratio).toBeGreaterThan(0.38);
  expect(state.preferences.splitRatio).toBeCloseTo(state.split!.ratio, 10);
});

test('el divisor respeta 320 px por lado y un clic sin mover no oculta las vistas', async () => {
  await openSplit();
  const box = (await page.getByRole('separator').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  expect(await visibleViews()).toHaveLength(2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 2000, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await layoutNow()).main?.bounds.width).toBe(320);
});

test('abrir el panel como pestaña lo cierra y activa esa app en el área principal', async () => {
  await openSplit();
  await page.getByRole('combobox', { name: 'App del panel' }).selectOption('n8n');
  await expect.poll(async () => (await splitState()).split?.serviceId).toBe('n8n');
  await page.getByRole('button', { name: 'Abrir como pestaña' }).click();
  await expect.poll(async () => (await splitState()).split).toBeNull();
  await expect(page.getByTestId('n8n-tab-1')).toHaveAttribute('aria-selected', 'true');
  expect((await splitState()).active).toBe('n8n');
  await expect.poll(visibleApps).toEqual(['n8n']);
  await expect(page.getByRole('separator')).toHaveCount(0);
});

test('cerrar el panel destruye su vista y devuelve todo el ancho a la app principal', async () => {
  const full = (await visibleViews())[0].bounds;
  await openSplit();
  const count = (await nativeViews()).length;
  await page.getByRole('button', { name: 'Cerrar panel', exact: true }).click();
  await expect.poll(async () => (await splitState()).split).toBeNull();
  await expect.poll(async () => (await nativeViews()).length).toBe(count - 1);
  expect((await visibleViews())[0].bounds).toEqual(full);
});

test('el panel se oculta bajo ajustes y launcher y vuelve al regresar', async () => {
  await openSplit();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('separator')).toHaveCount(0);
  await expect.poll(async () => (await visibleViews()).length).toBe(0);
  await page.getByRole('button', { name: 'Volver al servicio' }).click();
  await expect.poll(async () => (await visibleViews()).length).toBe(2);
  await page.getByRole('button', { name: 'Ver todas las aplicaciones', exact: true }).click();
  await expect.poll(async () => (await visibleViews()).length).toBe(0);
  await page.getByRole('textbox', { name: 'Buscar aplicación' }).click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await visibleViews()).length).toBe(2);
});

test('el launcher abre cualquier app a la derecha', async () => {
  await page.getByRole('button', { name: 'Ver todas las aplicaciones', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir n8n Automations a la derecha', exact: true }).click();
  await expect.poll(async () => (await splitState()).split?.serviceId).toBe('n8n');
  expect((await splitState()).panel).toBe('service');
  await expect(page.getByRole('region', { name: 'Todas las aplicaciones' })).toHaveCount(0);
  await expect.poll(visibleApps).toEqual(['huly', 'n8n']);
});

test('los comandos del panel validan sus argumentos en el proceso principal', async () => {
  const outcome = await page.evaluate(async () => {
    const portal = window.portal as any;
    const rejects = async (task: () => Promise<unknown>) => { try { await task(); return false; } catch { return true; } };
    const result: Record<string, boolean> = {};
    result.closedResize = await rejects(() => portal.splitResize(0.5));
    result.closedCapture = await rejects(() => portal.splitCapture());
    result.closedSet = await rejects(() => portal.splitSet('n8n'));
    result.closedToTab = await rejects(() => portal.splitToTab());
    result.badOpen = await rejects(() => portal.splitOpen('x'));
    result.nullOpen = await rejects(() => portal.splitOpen(null));
    await portal.splitOpen('n8n');
    result.badSet = await rejects(() => portal.splitSet('evil'));
    for (const bad of [NaN, Infinity, 5, 1, 0, -0.2, 'x', null, undefined, {}]) result['ratio:' + String(bad)] = await rejects(() => portal.splitResize(bad));
    result.badPersist = await rejects(() => portal.splitResize(0.5, 'yes'));
    result.badDrag = await rejects(() => portal.splitDrag('yes'));
    result.okRatio = !(await rejects(() => portal.splitResize(0.45)));
    return result;
  });
  expect(Object.entries(outcome).filter(([key, value]) => key !== 'okRatio' && !value)).toEqual([]);
  expect(outcome.okRatio).toBe(true);
  // Sin persist el ratio solo se aplica: no se guarda.
  expect((await splitState()).preferences.splitRatio).toBe(0.38);
});

// ── Páginas propias ────────────────────────────────────────────────────────────
const customUrl = (host = '127.0.0.1') => `http://${host}:${(server.address() as AddressInfo).port}/custom`;
const customApps = () => page.evaluate(async () => (await window.portal.snapshot()).preferences.customApps);
async function openCustomForm(name: string, url: string, pin = true) {
  await page.getByRole('button', { name: 'Ver todas las aplicaciones', exact: true }).click();
  const launcher = page.getByRole('region', { name: 'Todas las aplicaciones' });
  await launcher.getByRole('button', { name: 'Agregar página' }).click();
  const form = launcher.getByRole('form', { name: 'Agregar página' });
  await form.getByLabel('Nombre').fill(name);
  await form.getByLabel('Dirección (URL)').fill(url);
  const pinBox = form.getByRole('checkbox', { name: 'Fijar en la barra lateral' });
  if (pin !== await pinBox.isChecked()) await pinBox.click();
  return { launcher, form };
}
async function addCustomPage(name: string, url: string, pin = true) {
  const { launcher, form } = await openCustomForm(name, url, pin);
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(launcher.getByRole('button', { name: `Abrir ${name.trim()}`, exact: true })).toBeVisible();
  const apps = await customApps();
  return { launcher, saved: apps[apps.length - 1] };
}

test('páginas propias: se agregan fijadas, aparecen en Mis páginas y abren con su propia partición', async () => {
  await waitForPage();
  const url = customUrl();
  const { launcher, saved } = await addCustomPage('  Mi wiki ', url);
  await expect(launcher.getByRole('heading', { name: 'Mis páginas' })).toBeVisible();
  await expect(launcher.getByRole('form')).toHaveCount(0);
  expect(saved).toMatchObject({ name: 'Mi wiki', url });
  expect(saved.id).toMatch(/^custom-/);
  // La favicon del servidor se guarda como data URL y se pinta en la sidebar.
  expect(saved.icon).toMatch(/^data:image\/png;base64,/);
  expect(await page.evaluate(async () => (await window.portal.snapshot()).preferences.pinned)).toContain(saved.id);
  await page.keyboard.press('Escape');
  const nav = page.getByRole('navigation', { name: 'Servicios' });
  await expect(nav.getByRole('group', { name: 'Mis páginas' }).getByRole('button', { name: 'Abrir Mi wiki', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Abrir Mi wiki', exact: true }).locator('img.service-logo-custom')).toBeVisible();
  await nav.getByRole('button', { name: 'Abrir Mi wiki', exact: true }).click();
  await expect(page.getByTestId(`${saved.id}-tab-1`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId(`${saved.id}-tab-1`)).toContainText('Página /custom');
  await waitForPage();
  const sessions = await app.evaluate(({ webContents }) => {
    const all = webContents.getAllWebContents();
    const custom = all.find(w => w.getURL().endsWith('/custom'))!;
    const huly = all.find(w => w.getURL().endsWith('/huly'))!;
    return { storage: custom.session.storagePath ?? '', shared: custom.session === huly.session };
  });
  expect(sessions.shared).toBe(false);
  expect(sessions.storage).toContain(`amatime-${saved.id}`);
});

test('páginas propias: el formulario explica los errores y no guarda nada', async () => {
  const { form } = await openCustomForm('Mala', 'javascript:alert(1)');
  const save = () => form.getByRole('button', { name: 'Guardar' }).click();
  await save();
  await expect(form.getByRole('alert')).toContainText('http o https');
  for (const [url, message] of [['http://example.com/', 'HTTP solo se permite'], ['https://u:p@example.com/', 'usuario'], ['example.com', 'https://']] as const) {
    await form.getByLabel('Dirección (URL)').fill(url);
    await save();
    await expect(form.getByRole('alert')).toContainText(message);
  }
  await form.getByLabel('Dirección (URL)').fill('https://ok.example.com/');
  await form.getByLabel('Nombre').fill('   ');
  await save();
  await expect(form.getByRole('alert')).toContainText('nombre');
  expect(await customApps()).toEqual([]);
  await form.getByRole('button', { name: 'Cancelar' }).click();
  await expect(form).toHaveCount(0);
});

test('páginas propias: se editan desde su tarjeta y el cambio se guarda', async () => {
  const { launcher, saved } = await addCustomPage('Mi wiki', customUrl(), false);
  await expect(page.getByRole('navigation', { name: 'Servicios' }).getByRole('button', { name: 'Abrir Mi wiki' })).toHaveCount(0);
  await launcher.getByRole('button', { name: 'Editar Mi wiki', exact: true }).click();
  const form = launcher.getByRole('form', { name: 'Editar página' });
  await expect(form.getByLabel('Nombre')).toHaveValue('Mi wiki');
  await expect(form.getByLabel('Dirección (URL)')).toHaveValue(customUrl());
  await expect(form.getByRole('checkbox', { name: 'Fijar en la barra lateral' })).toHaveCount(0);
  await form.getByLabel('Nombre').fill('Wiki RRHH');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(launcher.getByRole('button', { name: 'Abrir Wiki RRHH', exact: true })).toBeVisible();
  expect(await customApps()).toEqual([{ ...saved, name: 'Wiki RRHH' }]);
});

test('páginas propias: cambiar de origen cierra sus pestañas y reabre en el nuevo; eliminar la quita de todo', async () => {
  const { saved } = await addCustomPage('Mi wiki', customUrl());
  await page.keyboard.press('Escape');
  await page.getByRole('navigation', { name: 'Servicios' }).getByRole('button', { name: 'Abrir Mi wiki', exact: true }).click();
  await expect(page.getByTestId(`${saved.id}-tab-1`)).toHaveAttribute('aria-selected', 'true');
  await waitForPage();
  const before = (await nativeViews()).length;
  await page.evaluate(([id, url]) => window.portal.customEdit(id, { name: 'Mi wiki', url }), [saved.id, customUrl('localhost')]);
  await expect.poll(async () => (await nativeViews()).some(v => v.url.startsWith('http://localhost:'))).toBe(true);
  expect((await nativeViews()).length).toBe(before);
  await expect(page.getByTestId(`${saved.id}-tab-1`)).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(id => window.portal.customRemove(id), saved.id);
  await expect(page.getByRole('navigation', { name: 'Servicios' }).getByRole('button', { name: 'Abrir Mi wiki' })).toHaveCount(0);
  await expect(page.getByTestId(`${saved.id}-tab-1`)).toHaveCount(0);
  await expect.poll(async () => (await nativeViews()).length).toBe(before - 1);
  const state = await page.evaluate(async () => { const s = await window.portal.snapshot(); return { apps: s.preferences.customApps, pinned: s.preferences.pinned, remember: Object.keys(s.preferences.remember), services: s.services.length, active: s.active }; });
  expect(state).toMatchObject({ apps: [], services: 14, active: 'librechat' });
  expect(state.pinned.some(id => id.startsWith('custom-'))).toBe(false);
  expect(state.remember.some(id => id.startsWith('custom-'))).toBe(false);
});

test('páginas propias: los comandos validan sus argumentos en el proceso principal', async () => {
  const outcome = await page.evaluate(async () => {
    const portal = window.portal as any;
    const rejects = async (task: () => Promise<unknown>) => { try { await task(); return false; } catch { return true; } };
    const result: Record<string, boolean> = {};
    const good = { name: 'x', url: 'https://a.example.com/', pin: true };
    const bads: [string, unknown][] = [['null', null], ['string', 'x'], ['array', []], ['sin nombre', { ...good, name: '' }], ['nombre largo', { ...good, name: 'x'.repeat(41) }], ['nombre no texto', { ...good, name: 3 }], ['javascript', { ...good, url: 'javascript:alert(1)' }], ['file', { ...good, url: 'file:///C:/x' }], ['credenciales', { ...good, url: 'https://u:p@a.example.com/' }], ['http público', { ...good, url: 'http://example.com/' }], ['pin no booleano', { ...good, pin: 'yes' }]];
    for (const [label, value] of bads) result['add:' + label] = await rejects(() => portal.customAdd(value));
    for (const id of ['huly', 'custom-noexiste0', '__proto__', 3, null]) { result['edit:' + String(id)] = await rejects(() => portal.customEdit(id, { name: 'x', url: 'https://a.example.com/' })); result['remove:' + String(id)] = await rejects(() => portal.customRemove(id)); }
    result.overlay = await rejects(() => portal.overlay('yes'));
    return result;
  });
  expect(Object.entries(outcome).filter(([, rejected]) => !rejected)).toEqual([]);
  expect(await customApps()).toEqual([]);
  expect(await page.evaluate(async () => (await window.portal.snapshot()).services.length)).toBe(14);
});

test('páginas propias: el límite de 30 se aplica en el proceso principal', async () => {
  const outcome = await page.evaluate(async (url) => {
    let created = 0, failed = 0;
    for (let i = 0; i < 31; i++) { try { await window.portal.customAdd({ name: `p${i}`, url, pin: false }); created++; } catch { failed++; } }
    return { created, failed };
  }, customUrl());
  expect(outcome).toEqual({ created: 30, failed: 1 });
});

// ── Menú contextual de la sidebar ──────────────────────────────────────────────
const sideButton = (name: string) => page.getByRole('navigation', { name: 'Servicios' }).getByRole('button', { name: `Abrir ${name}`, exact: true });
const menuFor = (name: string) => page.getByRole('menu', { name: `Acciones de ${name}` });
async function rightClick(name: string) {
  await sideButton(name).click({ button: 'right' });
  await expect(menuFor(name)).toBeVisible();
  return menuFor(name);
}

test('menú contextual: ofrece las acciones de una app global y oculta las vistas nativas mientras está abierto', async () => {
  await waitForPage();
  expect(await visibleViews()).toHaveLength(1);
  const menu = await rightClick('n8n Automations');
  await expect(menu.getByRole('menuitem')).toHaveText(['Abrir', 'Abrir en pestaña nueva', 'Abrir a la derecha', 'Quitar de la barra']);
  // Anclado al icono: a su derecha y alineado verticalmente con él.
  const [icon, box] = [(await sideButton('n8n Automations').boundingBox())!, (await menu.boundingBox())!];
  expect(box.x).toBeGreaterThanOrEqual(icon.x + icon.width);
  expect(Math.abs(box.y - icon.y)).toBeLessThan(40);
  await expect.poll(async () => (await visibleViews()).length).toBe(0);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect.poll(async () => (await visibleViews()).length).toBe(1);
});

test('menú contextual: clic fuera lo cierra y devuelve las vistas', async () => {
  const menu = await rightClick('Huly Workspace');
  await expect.poll(async () => (await visibleViews()).length).toBe(0);
  await page.mouse.click(700, 420);
  await expect(menu).toHaveCount(0);
  await expect.poll(async () => (await visibleViews()).length).toBe(1);
  expect(await page.evaluate(async () => (await window.portal.snapshot()).active)).toBe('huly');
});

test('menú contextual: "Abrir" activa la app y "Abrir en pestaña nueva" añade una pestaña (solo si ya tenía)', async () => {
  await (await rightClick('Portal de Operaciones')).getByRole('menuitem', { name: 'Abrir', exact: true }).click();
  await expect(page.getByTestId('portal-tab-1')).toHaveAttribute('aria-selected', 'true');
  await (await rightClick('Portal de Operaciones')).getByRole('menuitem', { name: 'Abrir en pestaña nueva' }).click();
  await expect(page.getByTestId('portal-tab-2')).toHaveAttribute('aria-selected', 'true');
  // Una app aún sin abrir recibe una sola pestaña, no dos.
  await (await rightClick('n8n Automations')).getByRole('menuitem', { name: 'Abrir en pestaña nueva' }).click();
  await expect(page.getByTestId('n8n-tab-1')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('n8n-tab-2')).toHaveCount(0);
  await expect.poll(visibleApps).toEqual(['n8n']);
});

test('menú contextual: "Abrir a la derecha" abre el panel lateral con esa app', async () => {
  await (await rightClick('n8n Automations')).getByRole('menuitem', { name: 'Abrir a la derecha' }).click();
  await expect.poll(async () => (await splitState()).split?.serviceId).toBe('n8n');
  await expect.poll(visibleApps).toEqual(['huly', 'n8n']);
});

test('menú contextual: "Quitar de la barra" solo aparece en apps fijadas y las desfija', async () => {
  await (await rightClick('n8n Automations')).getByRole('menuitem', { name: 'Quitar de la barra' }).click();
  await expect(sideButton('n8n Automations')).toHaveCount(0);
  expect((await splitState()).preferences.pinned).not.toContain('n8n');
  // Huly sigue visible aunque se desfije mientras está abierta, pero entonces ya no ofrece "Quitar".
  await (await rightClick('Huly Workspace')).getByRole('menuitem', { name: 'Quitar de la barra' }).click();
  const menu = await rightClick('Huly Workspace');
  await expect(menu.getByRole('menuitem', { name: 'Quitar de la barra' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem')).toHaveText(['Abrir', 'Abrir en pestaña nueva', 'Abrir a la derecha']);
});

test('menú contextual: se abre con Shift+F10, se recorre con flechas y Esc devuelve el foco al icono', async () => {
  await sideButton('n8n Automations').focus();
  await page.keyboard.press('Shift+F10');
  const menu = menuFor('n8n Automations');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Abrir', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Abrir en pestaña nueva' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Quitar de la barra' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Abrir', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(sideButton('n8n Automations')).toBeFocused();
  await page.keyboard.press('ContextMenu');
  await expect(menu).toBeVisible();
});

test('menú contextual: una página propia puede editarse y eliminarse (con confirmación)', async () => {
  const { saved } = await addCustomPage('Mi wiki', customUrl());
  await page.keyboard.press('Escape');
  const menu = await rightClick('Mi wiki');
  await expect(menu.getByRole('menuitem')).toHaveText(['Abrir', 'Abrir en pestaña nueva', 'Abrir a la derecha', 'Quitar de la barra', 'Editar…', 'Eliminar']);
  await menu.getByRole('menuitem', { name: 'Editar…' }).click();
  const launcher = page.getByRole('region', { name: 'Todas las aplicaciones' });
  const form = launcher.getByRole('form', { name: 'Editar página' });
  await expect(form.getByLabel('Nombre')).toHaveValue('Mi wiki');
  await form.getByLabel('Nombre').fill('Wiki 2');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(sideButton('Wiki 2')).toBeVisible();
  await page.keyboard.press('Escape');
  // Eliminar pide confirmación dentro del propio menú; cancelar no borra nada.
  let confirm = await rightClick('Wiki 2');
  await confirm.getByRole('menuitem', { name: 'Eliminar' }).click();
  await expect(confirm.getByText('¿Eliminar Wiki 2?')).toBeVisible();
  await confirm.getByRole('menuitem', { name: 'Cancelar' }).click();
  await expect(confirm.getByRole('menuitem', { name: 'Abrir', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menuFor('Wiki 2')).toHaveCount(0);
  expect((await customApps()).map(item => item.id)).toEqual([saved.id]);
  confirm = await rightClick('Wiki 2');
  await confirm.getByRole('menuitem', { name: 'Eliminar' }).click();
  await confirm.getByRole('menuitem', { name: 'Eliminar', exact: true }).click();
  await expect(sideButton('Wiki 2')).toHaveCount(0);
  expect(await customApps()).toEqual([]);
  await expect.poll(async () => (await visibleViews()).length).toBe(1);
});

test('menú contextual: también funciona sobre las tarjetas del launcher', async () => {
  await page.getByRole('button', { name: 'Ver todas las aplicaciones', exact: true }).click();
  const launcher = page.getByRole('region', { name: 'Todas las aplicaciones' });
  await launcher.getByRole('button', { name: 'Abrir Microsoft Teams', exact: true }).click({ button: 'right' });
  const menu = menuFor('Microsoft Teams');
  await expect(menu.getByRole('menuitem')).toHaveText(['Abrir', 'Abrir en pestaña nueva', 'Abrir a la derecha']);
  await menu.getByRole('menuitem', { name: 'Abrir a la derecha' }).click();
  await expect.poll(async () => (await splitState()).split?.serviceId).toBe('teams');
});

test('menú contextual: overlay libera las vistas aunque el menú siga abierto y valida su argumento', async () => {
  await rightClick('n8n Automations');
  await page.evaluate(() => window.portal.overlay(false));
  await expect.poll(async () => (await visibleViews()).length).toBe(1);
  const rejected = await page.evaluate(async () => { try { await (window.portal as any).overlay('yes'); return false; } catch { return true; } });
  expect(rejected).toBe(true);
});

test('Teams se presenta como Chrome, sin el token de Electron', async () => {
  await page.evaluate(() => window.portal.activate('teams'));
  await expect(page.getByTestId('teams-tab-1')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().find(w => w.getURL().endsWith('/teams'))?.getUserAgent() ?? '')).toMatch(/Chrome\//);
  const agent = await app.evaluate(({ webContents }) => webContents.getAllWebContents().find(w => w.getURL().endsWith('/teams'))!.getUserAgent());
  expect(agent).not.toMatch(/Electron|amatime-tools-desktop/);
});

test('Microsoft 365: el launcher agrupa las apps nuevas por categoría y Copilot va fijado bajo LibreChat', async () => {
  const pinned = await page.evaluate(async () => (await window.portal.snapshot()).preferences.pinned);
  expect(pinned.slice(0, 2)).toEqual(['librechat', 'copilot']);
  expect(pinned).not.toContain('outlook');
  await page.getByRole('button', { name: 'Ver todas las aplicaciones', exact: true }).click();
  const launcher = page.getByRole('region', { name: 'Todas las aplicaciones' });
  const names = (heading: string) => launcher.locator('.launcher-category').filter({ has: page.getByRole('heading', { name: heading, exact: true }) }).locator('.launcher-name').allTextContents();
  expect(await names('Control')).toEqual(['AMA IA', 'Copilot M365', 'Buk']);
  expect(await names('Operación')).toEqual(['Huly Workspace', 'SharePoint']);
  expect(await names('Comunicación')).toEqual(['Microsoft Teams', 'Outlook']);
  expect(await names('Automatización y herramientas')).toEqual(['n8n Automations', 'Email Category AI', 'Stirling PDF', 'Power Automate', 'Microsoft Forms']);
});

test('LibreChat, Copilot y Buk son fijas: primero en la barra y no se pueden quitar', async () => {
  const nav = page.getByRole('navigation', { name: 'Servicios' });
  const tips = await nav.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('data-tooltip')));
  expect(tips.slice(0, 3)).toEqual(['AMA IA', 'Copilot M365', 'Buk']);
  // El proceso principal rechaza desfijarlas aunque el renderer lo pida.
  const rejected = await page.evaluate(async () => Promise.all(['librechat', 'copilot', 'buk'].map(id => window.portal.pin(id, false).then(() => false, () => true))));
  expect(rejected).toEqual([true, true, true]);
  expect((await page.evaluate(async () => (await window.portal.snapshot()).preferences.pinned)).slice(0, 3)).toEqual(['librechat', 'copilot', 'buk']);
  // Launcher: candado en vez de chincheta; el resto sigue configurable.
  await page.getByRole('button', { name: 'Ver todas las aplicaciones', exact: true }).click();
  const launcher = page.getByRole('region', { name: 'Todas las aplicaciones' });
  for (const name of ['AMA IA', 'Copilot M365', 'Buk']) {
    await expect(launcher.getByRole('button', { name: `Quitar ${name} de la barra lateral` })).toHaveCount(0);
    await expect(launcher.getByLabel(`${name} siempre está fijada`)).toBeVisible();
  }
  await expect(launcher.getByRole('button', { name: 'Quitar Huly Workspace de la barra lateral' })).toBeVisible();
  await page.keyboard.press('Escape');
  // Menú contextual: sin "Quitar de la barra" en las fijas.
  const menu = await rightClick('Buk');
  await expect(menu.getByRole('menuitem', { name: 'Quitar de la barra' })).toHaveCount(0);
});

test('Microsoft 365: las apps del grupo comparten sesión y borrarla cierra las vistas de todo el grupo', async () => {
  const sessions = () => app.evaluate(({ webContents }) => {
    const find = (id: string) => webContents.getAllWebContents().find(w => w.getURL().endsWith('/' + id));
    const [outlook, forms, huly] = [find('outlook'), find('forms'), find('huly')];
    return { open: { outlook: !!outlook, forms: !!forms, huly: !!huly }, shared: !!outlook && !!forms && outlook.session === forms.session, isolated: !!outlook && !!huly && outlook.session !== huly.session };
  });
  await page.evaluate(() => window.portal.activate('outlook'));
  await expect(page.getByTestId('outlook-tab-1')).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(() => window.portal.activate('forms'));
  await expect(page.getByTestId('forms-tab-1')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(async () => (await sessions()).shared).toBe(true);
  expect((await sessions()).isolated).toBe(true);
  await page.evaluate(() => window.portal.panel('settings'));
  await expect(page.getByText('Compartida con las apps de Microsoft 365')).toHaveCount(6);
  await page.evaluate(() => window.portal.clearSession('forms'));
  await expect.poll(async () => (await sessions()).open).toEqual({ outlook: false, forms: false, huly: true });
});

test('Microsoft 365: recordar sesión es común al grupo', async () => {
  await page.evaluate(() => window.portal.remember('outlook', false));
  const remember = await page.evaluate(async () => (await window.portal.snapshot()).preferences.remember);
  for (const id of ['teams', 'copilot', 'outlook', 'sharepoint', 'powerautomate', 'forms']) expect(remember[id], id).toBe(false);
  expect(remember.huly).toBe(true);
});

test('Microsoft 365: una ventana nueva de una app del grupo abre pestaña de la app y se presenta como Chrome', async () => {
  await page.evaluate(() => window.portal.activate('outlook'));
  await expect(page.getByTestId('outlook-tab-1')).toHaveAttribute('aria-selected', 'true');
  await waitForPage();
  const agent = await app.evaluate(({ webContents }) => webContents.getAllWebContents().find(w => w.getURL().endsWith('/outlook'))!.getUserAgent());
  expect(agent).not.toMatch(/Electron|amatime-tools-desktop/);
  await app.evaluate(({ webContents }) => webContents.getAllWebContents().find(w => w.getURL().endsWith('/outlook'))!.executeJavaScript("window.open(location.origin + '/outlook/adjunto')", true));
  await expect(page.getByTestId('outlook-tab-2')).toBeVisible();
});

test('apps de escritorio: con muchas apps el selector queda dentro de la ventana, con buscador legible y filtros por origen', async () => {
  const entries = [];
  for (let index = 0; index < 160; index++) {
    const file = path.join(directory, `App ${String(index).padStart(3, '0')}.exe`);
    await writeFile(file, 'MZ');
    entries.push({ name: `App ${String(index).padStart(3, '0')}`, kind: 'path', path: file });
  }
  entries.push({ name: 'Tienda Falsa', kind: 'aumid', aumid: 'Fake.Store_8wekyb3d8bbwe!App' });
  await writeFile(path.join(directory, 'installed.json'), JSON.stringify(entries));
  await page.getByRole('complementary', { name: 'Aplicaciones de escritorio' }).getByRole('button', { name: 'Vincular aplicación de escritorio' }).click();
  const dialog = page.getByRole('dialog', { name: 'Vincular aplicación de escritorio' });
  await expect(dialog.getByRole('button', { name: 'App 000' })).toBeVisible();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const box = (await dialog.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect((await dialog.getByRole('textbox', { name: 'Buscar aplicación instalada' }).boundingBox())!.height).toBeGreaterThanOrEqual(40);
  // Filtros: programas del menú Inicio vs. Microsoft Store.
  await dialog.getByRole('tab', { name: /Microsoft Store/ }).click();
  await expect(dialog.getByRole('button', { name: 'Tienda Falsa' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'App 000' })).toHaveCount(0);
  await dialog.getByRole('tab', { name: /Todas/ }).click();
  await expect(dialog.getByRole('button', { name: 'App 000' })).toBeVisible();
});

// Tooltips nativos: ventana hija transparente que flota sobre las vistas del contenido.
const tooltipState = () => app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#tooltip'));
  if (!win || win.isDestroyed() || !win.isVisible()) return null;
  const main = BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!;
  return { bounds: win.getBounds(), content: main.getContentBounds(), text: (await win.webContents.executeJavaScript("document.querySelector('.tip-label')?.textContent ?? ''")) as string, focusable: win.isFocusable(), focused: win.isFocused(), parented: win.getParentWindow() === main, mainFocused: main.isFocused() };
});

test('tooltip nativo de la barra lateral aparece sobre la vista nativa, se desliza entre iconos y se oculta', async () => {
  await page.mouse.move(600, 400); // el clic de beforeEach dejó el puntero sobre el icono: sin salir no hay mouseover nuevo
  await page.getByRole('button', { name: 'Abrir Huly Workspace', exact: true }).hover();
  await expect.poll(async () => (await tooltipState())?.text).toBe('Huly Workspace');
  const first = (await tooltipState())!;
  // Empieza justo a la derecha de la sidebar: encima de la vista nativa, no del DOM.
  expect(first.bounds.x).toBeGreaterThanOrEqual(first.content.x + 64);
  expect(first.parented).toBe(true);
  expect(first.focusable).toBe(false);
  expect(first.focused).toBe(false);
  await page.getByRole('button', { name: 'Abrir AMA IA', exact: true }).hover();
  await expect.poll(async () => (await tooltipState())?.text).toBe('AMA IA');
  await page.mouse.move(600, 400);
  await expect.poll(() => tooltipState()).toBeNull();
});

test('tooltip del header aparece debajo y el del dock a la izquierda', async () => {
  const tab = page.getByTestId('huly-tab-1');
  await expect(tab).toHaveText('Página /huly'); // con el título definitivo: el tooltip no se reescribe mientras está abierto
  await tab.hover();
  await expect.poll(async () => (await tooltipState())?.text === (await tab.innerText()).trim()).toBe(true); // título completo de la pestaña (el título de la página puede llegar después)
  const below = (await tooltipState())!;
  const box = (await tab.boundingBox())!;
  expect(below.bounds.y).toBeGreaterThanOrEqual(below.content.y + box.y + box.height + 7);
  await page.getByRole('button', { name: 'Recargar servicio', exact: true }).hover();
  await expect.poll(async () => (await tooltipState())?.text).toBe('Recargar servicio');
  await page.getByRole('button', { name: 'Cambiar a tema claro', exact: true }).hover();
  await expect.poll(async () => (await tooltipState())?.text).toBe('Cambiar a tema claro');
  const theme = (await tooltipState())!;
  expect(theme.bounds.x + theme.bounds.width).toBeLessThanOrEqual(theme.content.x + theme.content.width);
  await page.getByRole('complementary', { name: 'Aplicaciones de escritorio' }).getByRole('button', { name: 'Vincular aplicación de escritorio' }).hover();
  await expect.poll(async () => (await tooltipState())?.text).toBe('Vincular aplicación de escritorio');
  const dock = (await tooltipState())!;
  expect(dock.bounds.x + dock.bounds.width).toBeLessThanOrEqual(dock.content.x + dock.content.width - 56);
  await page.keyboard.press('Escape');
  await expect.poll(() => tooltipState()).toBeNull();
});

test('el tooltip se oculta al hacer clic', async () => {
  await page.getByRole('button', { name: 'Ver todas las aplicaciones', exact: true }).hover();
  await expect.poll(async () => (await tooltipState())?.text).toBe('Aplicaciones');
  await page.getByRole('button', { name: 'Ver todas las aplicaciones', exact: true }).click();
  await expect.poll(() => tooltipState()).toBeNull();
});

test('IPC del tooltip valida argumentos y la ventana del tooltip no puede llamar comandos', async () => {
  await page.getByRole('button', { name: 'Ajustes', exact: true }).hover();
  await expect.poll(async () => (await tooltipState())?.text).toBe('Ajustes');
  const rejected = await page.evaluate(async () => {
    const bad = [[], ['', { x: 0, y: 0, width: 1, height: 1 }, 'right'], ['x'.repeat(121), { x: 0, y: 0, width: 1, height: 1 }, 'right'], ['a', { x: NaN, y: 0, width: 1, height: 1 }, 'right'], ['a', { x: 0, y: 0, width: 1, height: 1 }, 'top'], ['a', null, 'right']] as unknown[][];
    const out: boolean[] = [];
    for (const args of bad) out.push(await (window.portal as any).tooltipShow(...args).then(() => false, () => true));
    return out;
  });
  expect(rejected).toEqual([true, true, true, true, true, true]);
  const fromTooltip = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#tooltip'))!.webContents.executeJavaScript("window.portal.snapshot().then(() => 'permitido', error => String(error.message))"));
  expect(fromTooltip).toContain('Remitente no autorizado');
  const hide = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#tooltip'))!.webContents.executeJavaScript("window.portal.tooltipHide().then(() => 'permitido', error => String(error.message))"));
  expect(hide).toContain('Remitente no autorizado');
});

test('las barras de scroll del shell son finas, sin flechas y con pulgar sutil', async () => {
  const rules = await page.evaluate(() => [...document.styleSheets].flatMap(sheet => [...sheet.cssRules]).map(rule => rule.cssText).filter(text => text.includes('::-webkit-scrollbar')));
  const global = (selector: string) => rules.find(text => text.startsWith(selector + ' ') || text.startsWith(selector + '{'));
  expect(global('::-webkit-scrollbar')).toMatch(/width: 8px/);
  expect(global('::-webkit-scrollbar-button')).toMatch(/display: none/);
  expect(global('::-webkit-scrollbar-track')).toMatch(/background-color: (transparent|rgba\(0, 0, 0, 0\))/);
  expect(global('::-webkit-scrollbar-thumb')).toMatch(/border-radius/);
});

test('[admins] Apps Amatime: la tarjeta muestra al administrador y "Pedir acceso" abre su chat de Teams', async () => {
  await page.getByRole('button', { name: 'Ver todas las aplicaciones', exact: true }).click();
  const launcher = page.getByRole('region', { name: 'Todas las aplicaciones' });
  const section = launcher.locator('.launcher-category', { has: page.getByRole('heading', { name: 'Apps Amatime' }) });
  const card = section.locator('.launcher-card', { has: page.getByRole('button', { name: 'Abrir Costeador', exact: true }) });
  await expect(card.getByText('Admin: Julio Prueba')).toBeVisible();
  await expect(card.getByText('Homologada')).toHaveCount(0);
  // El Portal no tiene admin en esta prueba: no muestra nada.
  await expect(section.locator('.launcher-card', { has: page.getByRole('button', { name: 'Abrir Portal de Operaciones', exact: true }) }).getByRole('button', { name: /Pedir acceso/ })).toHaveCount(0);
  await card.getByRole('button', { name: 'Pedir acceso a Costeador' }).click();
  await expect(launcher).toHaveCount(0);
  await expect(page.getByTestId('teams-tab-1')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().map(w => w.getURL()).find(u => u.includes('/l/chat/0/0')) ?? '')).toContain('users=julio.prueba%40amatime.com');
  // IPC: solo apps con administrador.
  const rejected = await page.evaluate(async () => { const out = []; for (const id of ['huly', 'evil', 42]) { try { await window.portal.requestAccess(id as never); out.push(false); } catch { out.push(true); } } return out; });
  expect(rejected).toEqual([true, true, true]);
});

test('[office] el dock derecho fija Word, PowerPoint, Excel y Outlook clásico (solo los instalados) sobre las apps del usuario', async () => {
  const dock = page.getByRole('complementary', { name: 'Aplicaciones de escritorio' });
  const office = dock.locator('.dock-office');
  await expect(office.getByRole('button')).toHaveCount(3);
  expect(await office.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))).toEqual(['Abrir Word', 'Abrir Excel', 'Abrir Outlook (clásico)']);
  // Fijas: el clic derecho no ofrece quitarlas.
  await office.getByRole('button', { name: 'Abrir Word' }).click({ button: 'right' });
  await expect(dock.getByRole('menuitem')).toHaveCount(0);
  // El renderer no conoce rutas: solo ids del catálogo fijo.
  const snapshot = await page.evaluate(async () => (await window.portal.snapshot()).officeApps);
  expect(snapshot.map(app => app.id)).toEqual(['office-word', 'office-excel', 'office-outlook']);
  expect(JSON.stringify(snapshot)).not.toContain('WINWORD');
  const rejects = await page.evaluate(async () => Promise.all([['office-powerpoint'], ['C:\\Windows\\notepad.exe'], [3]].map(args => (window.portal.openOfficeApp as (...a: unknown[]) => Promise<void>)(...args).then(() => false, () => true))));
  expect(rejects).toEqual([true, true, true]); // los argumentos extra los descarta el preload (y main: office-apps.test)
});

test('sin Office instalado el dock no muestra accesos de Office', async () => {
  await expect(page.locator('.dock-office button')).toHaveCount(0);
});


test('las apps fijadas configurables se reordenan arrastrando o con Alt+flechas dentro de su grupo; las fijas no se mueven', async () => {
  const nav = page.getByRole('navigation', { name: 'Servicios' });
  const order = () => nav.getByRole('group', { name: 'Automatización y herramientas' }).getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('data-tooltip')));
  expect(await order()).toEqual(['n8n Automations', 'Email Category AI', 'Stirling PDF']);
  await nav.getByRole('button', { name: 'Abrir Stirling PDF' }).dragTo(nav.getByRole('button', { name: 'Abrir n8n Automations' }), { targetPosition: { x: 20, y: 4 } });
  await expect.poll(order).toEqual(['Stirling PDF', 'n8n Automations', 'Email Category AI']);
  expect((await page.evaluate(async () => (await window.portal.snapshot()).preferences.pinned))).toEqual(['librechat', 'copilot', 'buk', 'portal', 'huly', 'stirling', 'n8n', 'emailai']);
  // Teclado: Alt+↓ baja un puesto.
  await nav.getByRole('button', { name: 'Abrir Stirling PDF' }).focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(order).toEqual(['n8n Automations', 'Stirling PDF', 'Email Category AI']);
  // Las fijas no se pueden arrastrar.
  expect(await nav.getByRole('button', { name: 'Abrir AMA IA' }).getAttribute('draggable')).not.toBe('true');
  expect(await nav.getByRole('button', { name: 'Abrir n8n Automations' }).getAttribute('draggable')).toBe('true');
  // Sobrevive al reinicio de preferencias (main valida y guarda).
  const rejects = await page.evaluate(async () => (window.portal.reorderPinned as (ids: unknown) => Promise<void>)(['huly']).then(() => false, () => true));
  expect(rejects).toBe(true);
});

test('descargas generadas por la página (blob: y data:) se permiten; las de otro origen no', async () => {
  await waitForPage();
  const id = await app.evaluate(({ webContents }) => webContents.getAllWebContents().find(w => w.getURL().endsWith('/librechat'))!.id);
  // Escucha después de la política de la app: registra si la bloqueó y guarda en temp para no abrir el diálogo nativo.
  await app.evaluate(({ webContents }, [wid, dir]) => {
    const record: { url: string; blocked: boolean }[] = (globalThis as any).downloads = [];
    webContents.fromId(wid as number)!.session.on('will-download', (event, item) => {
      record.push({ url: item.getURL().slice(0, 5), blocked: event.defaultPrevented });
      if (!event.defaultPrevented) item.setSavePath(`${dir}\\${Date.now()}-${item.getFilename()}`);
    });
  }, [id, tmpdir()] as const);
  const click = (href: string) => app.evaluate(({ webContents }, [wid, h]) => webContents.fromId(wid as number)!.executeJavaScript(`(() => { const a = document.createElement('a'); a.href = ${JSON.stringify(h)} === 'blob' ? URL.createObjectURL(new Blob(['{}'], { type: 'application/json' })) : ${JSON.stringify(h)}; a.download = 'export.json'; document.body.append(a); a.click(); })()`, true), [id, href] as const);
  await click('blob');
  await expect.poll(() => app.evaluate(() => (globalThis as any).downloads.length)).toBe(1);
  await click('data:application/json;base64,e30=');
  await expect.poll(() => app.evaluate(() => (globalThis as any).downloads.length)).toBe(2);
  // Otro origen: la página navega/descarga desde fuera; la política la bloquea.
  await app.evaluate(({ webContents }, wid) => webContents.fromId(wid)!.downloadURL('https://evil.example/x.json'), id);
  await expect.poll(() => app.evaluate(() => (globalThis as any).downloads)).toEqual([{ url: 'blob:', blocked: false }, { url: 'data:', blocked: false }, { url: 'https', blocked: true }]);
});

test('con "recordar sesión" las cookies de sesión (login sin "recordarme", como Buk) sobreviven al reiniciar la app', async () => {
  await page.getByRole('button', { name: 'Abrir Buk', exact: true }).click();
  await expect(page.getByTestId('buk-tab-1')).toHaveAttribute('aria-selected', 'true');
  await waitForPage();
  // La página fija una cookie de sesión (sin caducidad), como un login de Rails.
  await app.evaluate(({ webContents }) => webContents.getAllWebContents().find(w => w.getURL().endsWith('/buk'))!.executeJavaScript("document.cookie = 'sid=logged-in; path=/'"));
  const env = await app.evaluate(() => ({ ...process.env }));
  await app.close();
  app = await electron.launch({ args: ['.'], env: env as Record<string, string> });
  page = await app.firstWindow();
  const cookies = await app.evaluate(async ({ session }) => (await session.fromPartition('persist:amatime-buk').cookies.get({ name: 'sid' })).map(c => ({ value: c.value, session: c.session })));
  expect(cookies).toEqual([{ value: 'logged-in', session: false }]);
});
