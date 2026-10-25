/** Comandos que siguen disponibles sin acceso a la red interna: nada que cargue, cree o cambie servicios. */
const ALWAYS = new Set(['snapshot', 'finish-splash', 'reload', 'open-forticlient', 'open-desktop-app', 'theme', 'check-updates', 'download-update', 'install-update', 'snooze-update', 'split-close']);
const PANELS = new Set(['service', 'settings', 'help']);

export const BLOCKED_MESSAGE = 'Sin acceso a red interna';

export function commandAllowedWhileBlocked(command: unknown, args: unknown[]): boolean {
  if (typeof command !== 'string') return false;
  if (command === 'panel') return typeof args[0] === 'string' && PANELS.has(args[0]);
  return ALWAYS.has(command);
}
