import { useEffect, useRef, useState, type MouseEvent } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { IconCheck, IconDownload } from '@tabler/icons-react';
import type { DownloadView } from '../shared/contracts';
import { badgeOf, newDownloads } from '../shared/download-format';

gsap.registerPlugin(useGSAP);

const MOTION = '(prefers-reduced-motion: no-preference)';
/** Cuánto sigue a la vista el aviso: tras terminar, lo justo para leerlo; si la descarga sigue, un tope. */
const LINGER_MS = 3200;
const DOWNLOADING_MAX_MS = 15_000;

interface Props {
  downloads: DownloadView[];
  /** La lista está abierta: ya se ve todo, no se anima. */
  open: boolean;
  /** Hay descargas que no se han visto en la lista. */
  unseen: boolean;
  onToggle(event: MouseEvent<HTMLButtonElement>): void;
}

/**
 * Botón de descargas de la barra. Al llegar una descarga nueva la flecha "cae", sale una onda con burbujas y una
 * pastilla con el nombre del archivo; al terminar confirma que quedó guardado. Todo vive dentro de la barra (DOM):
 * las vistas nativas pintan por encima de la página y taparían cualquier cosa que saliera de ahí.
 */
export function DownloadButton({ downloads, open, unseen, onToggle }: Props) {
  const root = useRef<HTMLSpanElement>(null);
  const known = useRef<Set<string> | null>(null);
  const [announce, setAnnounce] = useState<{ id: string; extra: number } | null>(null);
  const item = announce ? downloads.find(download => download.id === announce.id) : undefined;
  const phase = item?.state;

  // La primera lista no se anima (descargas anteriores a este render); después, cada id nuevo.
  useEffect(() => {
    if (known.current === null) { known.current = new Set(downloads.map(download => download.id)); return; }
    const added = newDownloads(known.current, downloads);
    for (const download of added) known.current.add(download.id);
    if (added.length === 0 || open) return;
    setAnnounce(previous => ({ id: added[0].id, extra: previous ? previous.extra + added.length : added.length - 1 }));
  }, [downloads]);
  useEffect(() => { if (open) setAnnounce(null); }, [open]);
  useEffect(() => { if (announce && !item) setAnnounce(null); }, [announce, item]); // la lista se limpió

  function dismiss() {
    const pill = root.current?.querySelector('.dl-pill');
    if (!pill) { setAnnounce(null); return; }
    const move = window.matchMedia(MOTION).matches;
    gsap.to(pill, { opacity: 0, ...(move ? { x: 10 } : {}), duration: 0.22, ease: 'power1.in', onComplete: () => setAnnounce(null) });
  }
  useEffect(() => {
    if (!announce) return;
    const timer = setTimeout(dismiss, phase === 'downloading' ? DOWNLOADING_MAX_MS : LINGER_MS);
    return () => clearTimeout(timer);
  }, [announce?.id, announce?.extra, phase]);

  // Entrada (nueva descarga) y "aterrizaje" (terminó): la flecha cae, la onda se abre y las burbujas suben.
  useGSAP(() => {
    if (!announce || !phase) return;
    const query = gsap.utils.selector(root);
    gsap.matchMedia().add(MOTION, () => {
      gsap.fromTo(query('.dl-arrow'), { y: -12, opacity: 0.15 }, { y: 0, opacity: 1, duration: 0.55, ease: 'bounce.out' });
      gsap.fromTo(query('.dl-ring'), { scale: 0.5, opacity: 0.8 }, { scale: 2.5, opacity: 0, duration: 0.85, ease: 'power2.out' });
      gsap.timeline()
        .fromTo(query('.dl-bubble'), { y: 8, opacity: 0, scale: 0.3 }, { y: -13, opacity: 1, scale: 1, duration: 0.5, stagger: 0.09, ease: 'power1.out' })
        .to(query('.dl-bubble'), { opacity: 0, duration: 0.3, stagger: 0.05 }, '-=0.25');
      if (phase !== 'downloading') gsap.fromTo(query('.icon-button'), { scale: 1 }, { scale: 1.14, duration: 0.14, yoyo: true, repeat: 1, ease: 'power1.inOut' });
    });
  }, { scope: root, dependencies: [announce?.id, phase] });
  // La pastilla entra una vez por descarga (no al cambiar de estado ni al sumarse otra: solo se actualiza el texto).
  useGSAP(() => {
    if (!announce) return;
    const pill = root.current?.querySelector('.dl-pill');
    if (!pill) return;
    gsap.matchMedia().add(MOTION, () => { gsap.fromTo(pill, { opacity: 0, x: 22, scale: 0.7 }, { opacity: 1, x: 0, scale: 1, duration: 0.42, ease: 'back.out(1.9)' }); });
  }, { scope: root, dependencies: [announce === null] });

  const badge = item ? badgeOf(item.ext) : undefined;
  const message = !item ? '' : item.state === 'failed' ? 'No se pudo descargar' : item.state === 'downloading' ? 'Descargando…' : `Guardado · ${item.app}`;
  return <span ref={root} className="download-anchor">
    <button className={`icon-button has-badge ${open ? 'toggled' : ''} ${unseen && !open ? 'has-unseen' : ''}`} aria-label="Descargas" aria-haspopup="dialog" aria-expanded={open} data-tooltip="Descargas" data-tooltip-side="bottom" onClick={onToggle}>
      <span className="dl-ring" aria-hidden="true" />
      <span className="dl-arrow" aria-hidden="true"><IconDownload size={19} /></span>
      <span className="dl-bubbles" aria-hidden="true"><i className="dl-bubble" /><i className="dl-bubble" /><i className="dl-bubble" /></span>
      {unseen && !open && <span className="badge-dot" role="status" aria-label="Descargas nuevas" />}
    </button>
    {item && badge && <span className={`dl-pill ${item.state}`} role="status" aria-live="polite">
      <span className={`file-badge tone-${badge.tone}`} aria-hidden="true">{badge.label}</span>
      <span className="dl-pill-text"><strong>{item.name}</strong><small>{item.state === 'completed' && <IconCheck size={11} aria-hidden="true" />}{message}</small></span>
      {announce && announce.extra > 0 && <span className="dl-pill-extra" aria-label={`y ${announce.extra} más`}>+{announce.extra}</span>}
    </span>}
  </span>;
}
