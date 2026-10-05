// Prueba de carga, sin escribir credenciales ni iniciar sesión en los servicios.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const directory = await mkdtemp(path.join(tmpdir(), 'amatime-live-'));
const output = path.resolve('.qa/live');
await mkdir(output, { recursive: true });
let app;
try {
  app = await electron.launch({ args: ['.'], env: { ...process.env, AMA_E2E: '1', AMA_TEST_USER_DATA: directory } });
  app.process().stderr.on('data', data => { const line = data.toString(); if (line.includes('SMOKE:')) console.log(line.trim()); });
  await app.evaluate(({ app }) => {
    app.on('web-contents-created', (_event, contents) => contents.on('did-fail-load', (_event, code, description, _url, mainFrame) => { if (mainFrame) console.error(`SMOKE: ${code} ${description}`); }));
  });
  const page = await app.firstWindow();
  await expect(page.getByTestId('huly-tab-1')).toBeVisible();
  const snapshot = await page.evaluate(() => window.portal.snapshot());
  const report = [];
  for (const service of snapshot.services) {
    await page.getByRole('button', { name: `Abrir ${service.name}` }).click();
    // Solo comprueba navegación del contenedor, no el estado interno ni el login.
    await expect.poll(() => app.evaluate(({ webContents }, origin) => webContents.getAllWebContents().some(w => w.getURL().startsWith(origin) && w.getTitle().length > 0), new URL(service.url).origin), { timeout: 40_000 }).toBe(true);
    const state = await page.evaluate(id => window.portal.snapshot().then(s => s.states[id]), service.id);
    const loaded = await app.evaluate(async ({ webContents }, origin) => {
      const remote = webContents.getAllWebContents().find(w => w.getURL().startsWith(origin));
      if (!remote) return null;
      return { url: remote.getURL(), title: remote.getTitle() };
    }, new URL(service.url).origin);
    const image = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));
    await writeFile(path.join(output, `${service.id}.png`), Buffer.from(image, 'base64'));
    report.push({ service: service.id, state, loaded });
    console.log(`${service.name}: ${state.status}`);
  }
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Preferencias del portal' })).toBeVisible();
  const image = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));
  await writeFile(path.join(output, 'settings.png'), Buffer.from(image, 'base64'));
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  if (report.some(item => item.state.status === 'error' || !item.loaded)) process.exitCode = 1;
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
