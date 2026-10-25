import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import gsap from 'gsap';
import { IconApps, IconCheck, IconRefresh, IconSearch, IconX } from '@tabler/icons-react';
import type { DesktopCandidate } from '../shared/contracts';

const MOTION = '(prefers-reduced-motion: no-preference)';
const ICON_BATCH = 8;
const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Props {
  onClose(): void;
  onLink(candidateId: string): void;
  /** "Examinar…": el diálogo de archivos de siempre. */
  onBrowse(): void;
}

/**
 * Selector de apps instaladas (como el menú Inicio). Vive en el DOM: mientras está abierto el proceso principal
 * oculta las vistas nativas (comando overlay). Solo conoce ids opacos; nunca rutas.
 */
export function DesktopPicker({ onClose, onLink, onBrowse }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const requested = useRef(new Set<string>());
  const [items, setItems] = useState<DesktopCandidate[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);

  function load(refresh: boolean) {
    setItems(null); setFailed(false); requested.current = new Set();
    window.portal.desktopCandidates(refresh)
      .then(list => { if (!mounted.current) return; setItems(list); setIcons(Object.fromEntries(list.filter(item => item.icon).map(item => [item.id, item.icon!]))); })
      .catch(() => { if (mounted.current) { setItems([]); setFailed(true); } });
  }
  useEffect(() => { mounted.current = true; load(false); return () => { mounted.current = false; }; }, []);
  useEffect(() => { search.current?.focus(); }, []);
  useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add(MOTION, () => { gsap.from(root.current, { opacity: 0, y: 8, scale: 0.98, duration: 0.16, ease: 'power2.out', clearProps: 'opacity,transform' }); });
    return () => mm.revert();
  }, []);

  const filtered = useMemo(() => {
    const needle = plain(query.trim());
    return (items ?? []).filter(item => !needle || plain(item.name).includes(needle));
  }, [items, query]);

  // Iconos perezosos: lotes pequeños empezando por lo que se ve (resultados de la búsqueda).
  useEffect(() => {
    const batch = filtered.filter(item => item.kind === 'path' && !icons[item.id] && !requested.current.has(item.id)).slice(0, ICON_BATCH);
    if (!batch.length) return;
    batch.forEach(item => requested.current.add(item.id));
    window.portal.desktopIcons(batch.map(item => item.id))
      .then(found => { if (mounted.current) setIcons(previous => ({ ...previous, ...found })); })
      .catch(() => undefined)
      .finally(() => { if (mounted.current) setTick(value => value + 1); });
  }, [filtered, icons, tick]);

  function key(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? [])];
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  const choose = (item: DesktopCandidate) => { if (!item.linked) onLink(item.id); };

  return <div className="picker-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={root} className="picker" role="dialog" aria-modal="true" aria-label="Vincular aplicación de escritorio" onKeyDown={key}>
      <div className="picker-head">
        <h2>Vincular aplicación de escritorio</h2>
        <button className="secondary-button picker-refresh" disabled={items === null} onClick={() => load(true)}><IconRefresh size={16} />Actualizar</button>
        <button className="icon-button" aria-label="Cerrar" title="Cerrar" onClick={onClose}><IconX size={18} /></button>
      </div>
      <label className="launcher-search"><IconSearch size={17} aria-hidden="true" /><input ref={search} type="text" aria-label="Buscar aplicación instalada" placeholder="Buscar aplicación…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { const first = filtered.find(item => !item.linked); if (first) choose(first); } }} /></label>
      <div className="picker-body">
        {items === null ? <p className="picker-empty" role="status">Buscando aplicaciones instaladas…</p>
          : filtered.length === 0 ? <p className="picker-empty" role="status">{failed ? 'No se pudieron leer las aplicaciones instaladas.' : query.trim() ? `Sin resultados para «${query.trim()}».` : 'No se encontraron aplicaciones instaladas.'}</p>
          : <ul className="picker-grid" aria-label="Aplicaciones instaladas">
            {filtered.map(item => <li key={item.id}>
              <button className="picker-card" disabled={item.linked} aria-label={item.linked ? `${item.name} (ya vinculada)` : item.name} title={item.name} onClick={() => choose(item)}>
                {icons[item.id] ? <img src={icons[item.id]} alt="" draggable={false} /> : <IconApps className="picker-glyph" size={28} stroke={1.5} />}
                <span>{item.name}</span>
                {item.linked && <IconCheck className="picker-check" size={17} aria-hidden="true" />}
              </button>
            </li>)}
          </ul>}
      </div>
      <div className="picker-foot">
        <span>{items ? `${filtered.length} de ${items.length}` : ''}</span>
        <button className="picker-browse" onClick={onBrowse}>¿No la encuentras? Examinar…</button>
      </div>
    </div>
  </div>;
}
