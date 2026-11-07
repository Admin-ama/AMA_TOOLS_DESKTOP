import { useEffect, useRef, type KeyboardEvent } from 'react';
import { IconEye, IconFolder, IconX } from '@tabler/icons-react';
import type { DownloadView } from '../shared/contracts';
import { badgeOf, formatSize, formatTime } from '../shared/download-format';

/** Esquina bajo el botón de la barra a la que se ancla (px CSS del shell). */
export interface DownloadsAnchor { top: number; right: number }
export const downloadsAnchorOf = (element: Element): DownloadsAnchor => {
  const rect = element.getBoundingClientRect();
  return { top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) };
};

interface Props {
  downloads: DownloadView[];
  anchor: DownloadsAnchor;
  onOpen(id: string): void;
  onReveal(id: string): void;
  onFolder(): void;
  onClear(): void;
  /** `restoreFocus`: se cerró con el teclado, el foco vuelve al botón de la barra. */
  onClose(restoreFocus: boolean): void;
}

const detail = (item: DownloadView) => item.state === 'failed' ? `${item.app} · No se pudo descargar` : item.state === 'downloading' ? `${item.app} · Descargando…` : `${item.app} · ${formatTime(item.at)} · ${formatSize(item.size)}`;

/**
 * Lista de descargas de la sesión. Vive en el DOM: mientras está abierta el proceso principal oculta las vistas
 * nativas (comando overlay), igual que con el menú de las apps.
 */
export function DownloadsPopover({ downloads, anchor, onOpen, onReveal, onFolder, onClear, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const finished = downloads.some(item => item.state !== 'downloading');
  useEffect(() => { root.current?.querySelector<HTMLElement>('button')?.focus(); }, []);
  // Esc cierra aunque el foco se haya perdido (p. ej. al deshabilitarse "Limpiar lista" tras usarlo).
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(true); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);

  function clear() {
    onClear();
    root.current?.focus(); // El botón se deshabilita: el foco se queda en el diálogo, no se pierde.
  }
  function key(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return;
    // El foco no sale del diálogo mientras está abierto.
    const focusable = [...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    if (focusable.length === 0) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return <>
    <div className="menu-backdrop" onMouseDown={() => onClose(false)} />
    <div ref={root} className="downloads-popover" role="dialog" aria-label="Descargas" tabIndex={-1} style={{ top: anchor.top, right: anchor.right }} onKeyDown={key}>
      <div className="downloads-head">
        <h2>Descargas</h2>
        <button className="downloads-folder" onClick={onFolder}>Abrir carpeta</button>
        <button className="icon-button" aria-label="Cerrar descargas" onClick={() => onClose(true)}><IconX size={16} /></button>
      </div>
      <p className="downloads-hint">Se guardan en Descargas\AMA Tools\&lt;aplicación&gt;</p>
      {downloads.length === 0
        ? <p className="downloads-empty">Aún no hay descargas.</p>
        : <ul className="downloads-list" aria-label="Descargas recientes">
          {downloads.map(item => {
            const badge = badgeOf(item.ext);
            const ready = item.state === 'completed';
            return <li key={item.id} className={`download-row ${item.state}`}>
              <span className={`file-badge tone-${badge.tone}`} aria-hidden="true">{badge.label}</span>
              <span className="download-text"><strong title={item.name}>{item.name}</strong><small>{detail(item)}</small></span>
              <button className="icon-button" aria-label={`Abrir ${item.name}`} data-tooltip="Abrir" data-tooltip-side="bottom" disabled={!ready} onClick={() => onOpen(item.id)}><IconEye size={18} /></button>
              <button className="icon-button" aria-label={`Mostrar ${item.name} en la carpeta`} data-tooltip="Mostrar en la carpeta" data-tooltip-side="bottom" disabled={!ready} onClick={() => onReveal(item.id)}><IconFolder size={18} /></button>
            </li>;
          })}
        </ul>}
      <div className="downloads-foot"><button className="downloads-clear" disabled={!finished} onClick={clear}>Limpiar lista</button></div>
    </div>
  </>;
}
