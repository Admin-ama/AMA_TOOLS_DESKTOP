import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('configura el logo AMA para ejecutable e instalador Windows', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(pkg.build.win.icon).toBe('images/amatime.ico');
  expect(pkg.build.nsis.installerIcon).toBe('images/amatime.ico');
  expect(pkg.build.nsis.uninstallerIcon).toBe('images/amatime.ico');
  expect(pkg.build.extraResources).toContainEqual({ from: 'images/amatime.ico', to: 'amatime.ico' });
});

it('incluye un icono Windows multirresolución de hasta 256px', () => {
  const icon = readFileSync('images/amatime.ico');
  expect(icon.readUInt16LE(0)).toBe(0);
  expect(icon.readUInt16LE(2)).toBe(1);
  const sizes = Array.from({ length: icon.readUInt16LE(4) }, (_, i) => icon[6 + i * 16] || 256);
  expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256]);
});

it('asigna icono local a ventanas y mantiene identidad de taskbar', () => {
  const main = readFileSync('src/main/index.ts', 'utf8');
  expect(main).toContain('app.setAppUserModelId(taskbarDetails.appId!)');
  expect(main).toContain('window.setAppDetails(taskbarDetails)');
  for (const file of ['src/main/index.ts', 'src/main/update-notice.ts']) {
    expect(readFileSync(file, 'utf8')).toContain("icon: path.join(__dirname, '../assets/amatime.ico')");
  }
  expect(readFileSync('scripts/build.mjs', 'utf8')).toContain("copyFile('images/amatime.ico', 'dist/assets/amatime.ico')");
});
