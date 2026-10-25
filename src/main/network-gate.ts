/** Comandos que siguen disponibles sin acceso a la red interna: nada que cargue, cree o cambie servicios. */
const ALWAYS = new Set(['snapshot', 'finish-splash', 'reload', 'open-forticlient', 'open-desktop-app', 'open-office-app', 'desktop-candidates', 'desktop-icons', 'desktop-link', 'theme', 'check-updates', 'download-update', 'install-update', 'snooze-update', 'split-close', 'tooltip-show', 'tooltip-hide']);
const PANELS = new Set(['service', 'settings', 'help']);

export const BLOCKED_MESSAGE = 'Sin acceso a red interna';

export function commandAllowedWhileBlocked(command: unknown, args: unknown[]): boolean {
  if (typeof command !== 'string') return false;
  if (command === 'panel') return typeof args[0] === 'string' && PANELS.has(args[0]);
  // Cerrar un menú es inocuo; abrirlo no tiene sentido sin servicios y nunca debe quedar uno atascado.
  if (command === 'overlay') return args[0] === false;
  return ALWAYS.has(command);
}
