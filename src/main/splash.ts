import type { NetworkStatus, ServiceState } from '../shared/contracts';

/** El mínimo deja terminar la animación del logo; el máximo evita que la pantalla de arranque retenga la app. */
export const SPLASH = { minMs: 2200, maxMs: 15_000, exitGraceMs: 2000 };

export function splashReady({ elapsedMs, network, startup }: { elapsedMs: number; network: NetworkStatus; startup: ServiceState['status'] }, limits = SPLASH): boolean {
  if (elapsedMs >= limits.maxMs) return true;
  if (elapsedMs < limits.minMs) return false;
  return network === 'disconnected' || startup === 'ready' || startup === 'error';
}
