import { useEffect, useState } from 'react';
import { IconDownload, IconCircleCheck } from '@tabler/icons-react';
import type { Snapshot } from '../shared/contracts';

export function UpdateNotice() {
  const [state, setState] = useState<Snapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const unsubscribe = window.portal.onChange(setState);
    void window.portal.snapshot().then(setState).catch(() => setError('No se pudo cargar el aviso.'));
    return unsubscribe;
  }, []);
  useEffect(() => { if (state) document.documentElement.dataset.theme = state.preferences.theme; }, [state?.preferences.theme]);
  async function action(task: () => Promise<void>) {
    setBusy(true); setError('');
    try { await task(); } catch { setError('No se pudo completar la acción. Inténtalo desde Ajustes.'); }
    finally { setBusy(false); }
  }
  if (!state) return null;
  const update = state.updates;
  const downloading = update.status === 'downloading';
  const downloaded = update.status === 'downloaded';
  return <section className="update-notice" aria-label="Actualización de AMATIME Tools">
    <div className="update-notice-heading">
      {downloaded ? <IconCircleCheck size={22} /> : <IconDownload size={22} />}
      <div><span className="eyebrow">AMATIME TOOLS · v{update.version}</span>
        <h1>{downloaded ? 'Actualización lista' : downloading ? 'Descargando actualización' : update.status === 'error' ? 'No se pudo descargar' : 'Nueva versión disponible'}</h1></div>
    </div>
    <p aria-live="polite">{error || (downloaded ? 'Guarda tus cambios. Tú decides cuándo reiniciar.' : downloading ? `Descargando ${update.progress ?? 0}%. Puedes seguir trabajando.` : update.status === 'error' ? 'Revisa tu conexión y vuelve a intentar desde Ajustes.' : 'Actualiza cuando te acomode, sin interrumpir tu trabajo.')}</p>
    {downloading && <progress max={100} value={update.progress ?? 0} aria-label="Progreso de descarga" />}
    <div className="update-notice-actions">
      {update.status === 'available' && <button className="primary-button" disabled={busy} onClick={() => void action(() => window.portal.downloadUpdate())}>Descargar y actualizar</button>}
      {downloaded && <button className="primary-button" disabled={busy} onClick={() => void action(() => window.portal.installUpdate())}>Instalar y reiniciar</button>}
      <button className="secondary-button" onClick={() => void action(() => window.portal.snoozeUpdate())}>Más tarde</button>
    </div>
  </section>;
}
