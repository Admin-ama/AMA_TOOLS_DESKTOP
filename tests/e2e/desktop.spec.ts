import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<html lang="es"><head><title>Página ${req.url}</title></head><body><h1>Login nativo ${req.url}</h1><input aria-label="Email del servicio">${slowResource ? '<img src="/never-load" alt="Recurso secundario">' : ''}<script>localStorage.setItem('visited','yes')</script></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server port');
  const config = Object.fromEntries(['huly', 'n8n', 'librechat', 'portal'].map(id => [id, `http://127.0.0.1:${address.port}/${id}`]));
  await writeFile(path.join(directory, 'services.json'), JSON.stringify(config));
  app = await electron.launch({ args: ['.'], env: { ...process.env, AMA_E2E: '1', AMA_TEST_UPDATES: testInfo.title.includes('[updates]') ? '1' : '0', AMA_TEST_CONFIG: path.join(directory, 'services.json'), AMA_TEST_USER_DATA: path.join(directory, 'data') } });
  page = await app.firstWindow();
  await expect(page.getByTestId('librechat-tab-1')).toHaveAttribute('aria-selected', 'true');
  await switchApplication('Huly Workspace', 'huly 1');
});

test('[updates] aviso nativo abajo a la derecha permite posponer sin descargar', async ({}, testInfo) => {
  await waitForPage();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus());
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
    const child = BrowserWindow.getAllWindows().find(w => w.getParentWindow())!;
    const parent = child.getParentWindow()!.getContentBounds();
    const bounds = child.getBounds();
    return { right: parent.x + parent.width - bounds.x - bounds.width, bottom: parent.y + parent.height - bounds.y - bounds.height };
  })).toEqual({ right: 16, bottom: 16 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.minimize());
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getParentWindow())!.isVisible())).toBe(false);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.getParentWindow())!.restore());
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getParentWindow())!.isVisible())).toBe(true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getParentWindow())!.close());
  await expect.poll(() => page.evaluate(async () => (await window.portal.snapshot()).updates.noticeVisible)).toBe(false);
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
    shell: BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
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

test('marca superior usa el logo digital AMA sin fondo de icono genérico', async () => {
  const logo = page.getByRole('img', { name: 'AMA Time Digital', exact: true });
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await logo.evaluate((img: HTMLImageElement) => getComputedStyle(img).objectFit)).toBe('contain');
});

test('navegación compacta alinea shell y vista nativa', async () => {
  await expect.poll(() => page.getByRole('complementary').evaluate(el => el.getBoundingClientRect().width)).toBe(64);
  await expect.poll(() => page.getByRole('banner').evaluate(el => el.getBoundingClientRect().height)).toBe(52);
  const content = await page.getByRole('tabpanel').boundingBox();
  const view = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.getVisible())!.getBounds());
  expect(view).toEqual(content);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 600));
  await expect(page.getByRole('button', { name: 'Abrir nueva pestaña de Huly' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recargar servicio' })).toBeVisible();
});

test('ojos del bot siguen el cursor aunque esté sobre la vista remota', async () => {
  const eyes = page.getByRole('button', { name: 'Abrir LibreChat AI', exact: true }).locator('.bot-eyes');
  // El cursor real no llega al shell sobre la vista remota; main reenvía la posición global.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('portal:cursor', { x: 1200, y: 120 }));
  await expect.poll(() => eyes.evaluate(el => (el as SVGGElement).style.transform)).toMatch(/^translate\(\d+(\.\d+)?px, /);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('portal:cursor', { x: 0, y: 120 }));
  await expect.poll(() => eyes.evaluate(el => (el as SVGGElement).style.transform)).toMatch(/^translate\(-\d+(\.\d+)?px, /);
});

test('sidebar carga los logos locales de las aplicaciones', async ({}, testInfo) => {
  await expect(page.getByRole('navigation', { name: 'Servicios' }).getByRole('button')).toHaveText(['LibreChat AI', 'Portal de Operaciones', 'Huly Workspace', 'n8n Automations']);
  await expect(page.getByRole('button', { name: 'Abrir LibreChat AI', exact: true }).locator('svg .bot-eye')).toHaveCount(2);
  for (const name of ['Huly Workspace', 'n8n Automations', 'Portal de Operaciones']) {
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
  await expect(page.getByRole('banner').getByRole('status')).toHaveCount(0);
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
  const views = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.map(v => ({ visible: v.getVisible(), bounds: v.getBounds() })));
  expect(views).toHaveLength(3); // LibreChat de inicio + Huly + n8n. BrowserWindow no enumera el shell entre estas vistas hijas.
  expect(views.filter(v => v.visible)).toHaveLength(1);
  expect(views[views.length - 1].bounds.x).toBe(64);
  expect(views[views.length - 1].bounds.y).toBe(52);
});

test('ajustes oculta vista remota y cambia tema sin perder sesión', async () => {
  await waitForPage();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Preferencias del portal' })).toBeVisible();
  const visibility = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.map(v => v.getVisible()));
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
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 700));
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children[0].getBounds())).toEqual({ x: 64, y: 52, width: 936, height: 648 });
});

test('fallo de red permite reintento y no inutiliza ajustes', async () => {
  await waitForPage();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await page.getByRole('button', { name: 'Recargar servicio' }).click();
  await expect.poll(() => page.evaluate(async () => {
    const snapshot = await window.portal.snapshot();
    return snapshot.states[snapshot.active].message || '';
  })).toContain('No se pudo cargar');
  await expect(page.getByRole('button', { name: 'Recargar servicio' })).toBeVisible();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Preferencias del portal' })).toBeVisible();
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
  const visible = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.filter(view => view.getVisible()).map(view => view.getBounds()));
  expect(visible).toEqual([{ x: 64, y: 52, width: 1216, height: 768 }]);
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
  const count = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length);
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
  const count = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length);
  expect(count).toBe(2); // n8n + LibreChat de inicio
  await page.getByRole('button', { name: 'Abrir Huly Workspace' }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByTestId('huly-tab-2')).toHaveAttribute('aria-selected', 'true');
  await waitForPage();
});
