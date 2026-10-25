import { describe, expect, it } from 'vitest';
import { commandAllowedWhileBlocked } from '../../src/main/network-gate';

describe('comandos sin acceso a la red interna', () => {
  it('permite diagnóstico, reintento, FortiClient, ajustes, tema y actualizaciones', () => {
    for (const command of ['snapshot', 'reload', 'open-forticlient', 'open-desktop-app', 'theme', 'check-updates', 'download-update', 'install-update', 'snooze-update']) {
      expect(commandAllowedWhileBlocked(command, [])).toBe(true);
    }
  });
  it('permite volver o abrir ajustes y ayuda, pero no el launcher', () => {
    for (const panel of ['service', 'settings', 'help']) expect(commandAllowedWhileBlocked('panel', [panel])).toBe(true);
    expect(commandAllowedWhileBlocked('panel', ['launcher'])).toBe(false);
    expect(commandAllowedWhileBlocked('panel', [])).toBe(false);
  });
  it('rechaza todo lo que cargaría o modificaría servicios', () => {
    for (const command of ['activate', 'new-tab', 'select-tab', 'close-tab', 'zoom', 'remember', 'pin', 'clear-session', 'add-desktop-app', 'remove-desktop-app', 'desconocido', undefined, 3, {}]) {
      expect(commandAllowedWhileBlocked(command, ['huly'])).toBe(false);
    }
  });
});

describe('vista dividida sin acceso a la red interna', () => {
  it('solo permite cerrar el panel', () => {
    expect(commandAllowedWhileBlocked('split-close', [])).toBe(true);
    for (const command of ['split-open', 'split-set', 'split-resize', 'split-to-tab', 'split-capture', 'split-drag']) {
      expect(commandAllowedWhileBlocked(command, ['n8n'])).toBe(false);
    }
  });
});
