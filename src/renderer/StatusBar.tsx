import { useEffect, useState } from 'react';
import type { NetworkStatus } from '../shared/contracts';

const networkLabels: Record<NetworkStatus, { text: string; tooltip: string }> = {
  checking: { text: 'comprobando', tooltip: 'Comprobando red interna…' },
  connected: { text: 'disponible', tooltip: 'Red interna disponible (LAN o VPN)' },
  disconnected: { text: 'sin acceso', tooltip: 'Sin acceso a la red interna. Conéctate a la VPN con FortiClient.' },
};
const clock = () => new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Hora local que cambia cada minuto; se alinea al inicio del minuto para no atrasarse. */
function useClock() {
  const [time, setTime] = useState(clock);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { setTime(clock()); timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50); };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(timer);
  }, []);
  return time;
}

export function StatusBar({ network, version }: { network: NetworkStatus; version: string }) {
  const time = useClock();
  return <footer className="status-bar">
    <div className={`network-status ${network}`} role="status" aria-label={`Red interna: ${networkLabels[network].text}`} title={networkLabels[network].tooltip}>
      <span className="network-dot" aria-hidden="true" /><span className="network-label">Red interna · {networkLabels[network].text}</span>
    </div>
    <span className="status-spacer" />
    <span className="status-version">v{version}</span>
    <time className="status-clock" role="timer" aria-live="off">{time}</time>
  </footer>;
}
