import { useState } from 'react';
import { IconPlugConnectedX, IconRefresh, IconShieldLock, IconLoader2 } from '@tabler/icons-react';
import type { NetworkState } from '../shared/contracts';

interface Props { network: NetworkState; onRetry(): Promise<void>; onForticlient(): Promise<void> }

/** Pantalla completa del área de contenido: sin red interna (LAN o VPN) las aplicaciones no se cargan. */
export function NetworkBlock({ network, onRetry, onForticlient }: Props) {
  const [retrying, setRetrying] = useState(false);
  const checking = network.status === 'checking';
  async function retry() {
    setRetrying(true);
    try { await onRetry(); } finally { setRetrying(false); }
  }
  if (checking) return <section className="network-block" role="status" aria-live="polite"><IconLoader2 className="network-block-icon spin" size={44} stroke={1.4} /><h1>Verificando red…</h1><p>Comprobando el acceso a la red interna de AMATIME.</p></section>;
  return <section className="network-block" role="alert">
    <IconPlugConnectedX className="network-block-icon" size={44} stroke={1.4} />
    <h1>Sin acceso a red interna</h1>
    <p>Las herramientas de AMATIME solo funcionan dentro de la red interna. Conéctate a la oficina o a la VPN y vuelve a intentar. Se reintenta automáticamente cada pocos segundos.</p>
    <div className="network-block-actions">
      {network.forticlient && <button className="secondary-button" onClick={() => void onForticlient()}><IconShieldLock size={18} />Abrir FortiClient</button>}
      <button className="secondary-button primary" disabled={retrying} onClick={() => void retry()}><IconRefresh size={18} />{retrying ? 'Verificando…' : 'Reintentar'}</button>
    </div>
  </section>;
}
