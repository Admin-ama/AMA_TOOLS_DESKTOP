import net from 'node:net';
import type { NetworkStatus, Service } from '../shared/contracts';

export const NETWORK_PROBE = { intervalMs: 15_000, timeoutMs: 3_000 } as const;

/** La red interna se mide contra Huly: si responde, la LAN o la VPN dan acceso a los servicios internos. */
export function probeTarget(services: Service[]): { host: string; port: number } {
  const huly = services.find(service => service.id === 'huly');
  if (!huly) throw new Error('Huly no está configurado');
  const url = new URL(huly.url);
  return { host: url.hostname, port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80) };
}

export function statusFromProbe(reachable: boolean): Exclude<NetworkStatus, 'checking'> {
  return reachable ? 'connected' : 'disconnected';
}

export function tcpProbe(host: string, port: number, timeoutMs: number = NETWORK_PROBE.timeoutMs): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect({ host, port });
    const finish = (reachable: boolean) => { socket.destroy(); resolve(reachable); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

interface NetworkSource { probe(): Promise<boolean>; onChange(status: NetworkStatus): void }

/** Sondea periódicamente y notifica solo cuando cambia el estado; nunca solapa sondeos. */
export class NetworkMonitor {
  status: NetworkStatus = 'checking';
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private disposed = false;

  constructor(private source: NetworkSource, private interval: number = NETWORK_PROBE.intervalMs) {}

  start() {
    void this.check();
    this.timer = setInterval(() => void this.check(), this.interval);
  }

  check(): Promise<void> {
    return this.running ??= this.run().finally(() => { this.running = undefined; });
  }

  private async run() {
    let reachable = false;
    try { reachable = await this.source.probe(); } catch { /* sin acceso */ }
    if (this.disposed) return;
    const next = statusFromProbe(reachable);
    if (next === this.status) return;
    this.status = next;
    this.source.onChange(next);
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.timer);
  }
}
