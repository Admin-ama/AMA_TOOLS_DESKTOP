import { expect, it } from 'vitest';
import { windowsAppDetails } from '../../src/main/windows-identity';

it('separa desarrollo de la app instalada y configura icono explícito para Explorer', () => {
  const details = windowsAppDetails(false, 'C:\\node modules\\electron.exe', 'C:\\AMA Tools', 'C:\\resources', 'C:\\AMA Tools\\dist\\assets\\amatime.ico');
  expect(details.appId).toBe('com.amatime.tools.desktop.dev');
  expect(details.appIconPath).toBe('C:\\AMA Tools\\dist\\assets\\amatime.ico');
  expect(details.relaunchCommand).toBe('"C:\\node modules\\electron.exe" "C:\\AMA Tools"');
  expect(details.relaunchDisplayName).toBe('AMATIME Tools (desarrollo)');
});

it('usa un icono físico fuera del asar y conserva el appId de instalación', () => {
  const details = windowsAppDetails(true, 'C:\\AMA Tools\\AMATIME Tools.exe', 'C:\\resources\\app.asar', 'C:\\resources', 'C:\\resources\\app.asar\\dist\\assets\\amatime.ico');
  expect(details.appId).toBe('com.amatime.tools.desktop');
  expect(details.appIconPath.replaceAll('\\', '/')).toBe('C:/resources/amatime.ico');
  expect(details.relaunchCommand).toBe('"C:\\AMA Tools\\AMATIME Tools.exe"');
  expect(details.relaunchDisplayName).toBe('AMATIME Tools');
});
