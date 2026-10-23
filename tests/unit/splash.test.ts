import { describe, expect, it } from 'vitest';
import { SPLASH, splashReady } from '../../src/main/splash';

// LibreChat tarda ~10 s en su primer dom-ready en la red interna: el máximo debe cubrirlo.
const LIBRECHAT_FIRST_LOAD_MS = 10_000;

describe('pantalla de arranque', () => {
  it('no termina antes del mínimo aunque todo esté listo', () => {
    expect(splashReady({ elapsedMs: SPLASH.minMs - 1, network: 'connected', startup: 'ready' })).toBe(false);
  });
  it('termina tras el mínimo cuando el servicio de inicio cargó o falló', () => {
    expect(splashReady({ elapsedMs: SPLASH.minMs, network: 'connected', startup: 'ready' })).toBe(true);
    expect(splashReady({ elapsedMs: SPLASH.minMs, network: 'connected', startup: 'error' })).toBe(true);
  });
  it('sin red termina para mostrar el bloqueo', () => {
    expect(splashReady({ elapsedMs: SPLASH.minMs, network: 'disconnected', startup: 'idle' })).toBe(true);
  });
  it('espera mientras verifica red o carga', () => {
    expect(splashReady({ elapsedMs: SPLASH.minMs, network: 'checking', startup: 'idle' })).toBe(false);
    expect(splashReady({ elapsedMs: SPLASH.minMs, network: 'connected', startup: 'loading' })).toBe(false);
  });
  it('cubre la primera carga lenta del servicio de inicio', () => {
    expect(SPLASH.maxMs).toBeGreaterThan(LIBRECHAT_FIRST_LOAD_MS);
  });
  it('nunca retiene la app más allá del máximo', () => {
    expect(splashReady({ elapsedMs: SPLASH.maxMs, network: 'checking', startup: 'loading' })).toBe(true);
  });
});
