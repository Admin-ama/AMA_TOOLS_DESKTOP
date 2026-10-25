import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { IconApps, IconBuildingStore, IconCheck, IconDeviceDesktop, IconFolderSearch, IconLayoutGrid, IconRefresh, IconSearch, IconX } from '@tabler/icons-react';
import type { DesktopCandidate } from '../shared/contracts';

gsap.registerPlugin(useGSAP);

const MOTION = '(prefers-reduced-motion: no-preference)';
const ICON_BATCH = 8;
// La cascada solo anima lo que cabe en pantalla; el resto aparece sin esperar.
const STAGGER_LIMIT = 36;
const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Source = 'all' | 'path' | 'aumid';
const SOURCES: { id: Source; label: string; icon: typeof IconApps }[] = [
  { id: 'all', label: 'Todas', icon: IconLayoutGrid },
  { id: 'path', label: 'Programas', icon: IconDeviceDesktop },
  { id: 'aumid', label: 'Microsoft Store', icon: IconBuildingStore },
];

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
  const [source, setSource] = useState<Source>('all');
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

  const { contextSafe } = useGSAP(() => {
    gsap.matchMedia().add(MOTION, () => {
      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('.picker-backdrop', { opacity: 0, duration: 0.2 })
        .from('.picker', { opacity: 0, y: 18, scale: 0.96, filter: 'blur(6px)', duration: 0.32, clearProps: 'filter' }, '<')
        .from('.picker-hero > *, .picker-search, .picker-tabs', { opacity: 0, y: 8, duration: 0.25, stagger: 0.05 }, '-=0.18');
    });
  }, { scope: root });

  const filtered = useMemo(() => {
    const needle = plain(query.trim());
    return (items ?? []).filter(item => (source === 'all' || item.kind === source) && (!needle || plain(item.name).includes(needle)));
  }, [items, query, source]);
  const counts = useMemo(() => ({ all: items?.length ?? 0, path: items?.filter(item => item.kind === 'path').length ?? 0, aumid: items?.filter(item => item.kind === 'aumid').length ?? 0 }), [items]);

  // Cascada de tarjetas cuando llega la lista o cambia el filtro (no en cada tecla).
  useGSAP(() => {
    if (!items?.length) return;
    gsap.matchMedia().add(MOTION, () => {
      const cards = gsap.utils.toArray<HTMLElement>('.picker-card').slice(0, STAGGER_LIMIT);
      gsap.from(cards, { opacity: 0, y: 14, scale: 0.94, duration: 0.32, ease: 'power3.out', stagger: 0.014, clearProps: 'opacity,transform' });
    });
  }, { scope: root, dependencies: [items, source], revertOnUpdate: true });

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
    const focusable = [...(root.current?.querySelectorAll<HTMLElement>('.picker button:not(:disabled), .picker input') ?? [])];
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  // Pequeña confirmación visual antes de cerrar: la tarjeta "salta" hacia la barra.
  const choose = contextSafe((item: DesktopCandidate, target?: HTMLElement) => {
    if (item.linked) return;
    if (!target || !window.matchMedia(MOTION).matches) return onLink(item.id);
    gsap.timeline({ onComplete: () => onLink(item.id) })
      .to(target, { scale: 1.06, duration: 0.12, ease: 'power2.out' })
      .to(target, { scale: 0.9, opacity: 0, x: 40, duration: 0.18, ease: 'power2.in' });
  });

  return <div ref={root} className="picker-root" onKeyDown={key}>
    <div className="picker-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="picker" role="dialog" aria-modal="true" aria-label="Vincular aplicación de escritorio">
        <header className="picker-hero">
          <span className="picker-badge" aria-hidden="true"><IconDeviceDesktop size={26} stroke={1.6} /></span>
          <div className="picker-titles">
            <h2>Vincular aplicación de escritorio</h2>
            <p>Elige una app de tu equipo para tenerla a un clic en la barra derecha.</p>
          </div>
          <button className="picker-ghost" disabled={items === null} onClick={() => load(true)}><IconRefresh size={17} />Actualizar</button>
          <button className="picker-close" aria-label="Cerrar" title="Cerrar (Esc)" onClick={onClose}><IconX size={20} /></button>
        </header>
        <label className="picker-search"><IconSearch size={20} aria-hidden="true" /><input ref={search} type="text" aria-label="Buscar aplicación instalada" placeholder="Buscar en tus aplicaciones…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { const first = filtered.find(item => !item.linked); if (first) choose(first); } }} /></label>
        <div className="picker-tabs" role="tablist" aria-label="Origen de las aplicaciones">
          {SOURCES.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={source === id} className={source === id ? 'active' : ''} onClick={() => setSource(id)}>
            <Icon size={16} aria-hidden="true" />{label}{items && <span className="picker-count">{counts[id]}</span>}
          </button>)}
        </div>
        <div className="picker-body">
          {items === null ? <div className="picker-grid" role="status" aria-label="Buscando aplicaciones instaladas…">{Array.from({ length: 12 }, (_, index) => <span key={index} className="picker-skeleton" />)}</div>
            : filtered.length === 0 ? <p className="picker-empty" role="status">{failed ? 'No se pudieron leer las aplicaciones instaladas.' : query.trim() ? `Sin resultados para «${query.trim()}».` : 'No se encontraron aplicaciones en esta sección.'}</p>
            : <ul className="picker-grid" aria-label="Aplicaciones instaladas">
              {filtered.map(item => <li key={item.id}>
                <button className="picker-card" disabled={item.linked} aria-label={item.linked ? `${item.name} (ya vinculada)` : item.name} title={item.name} onClick={event => choose(item, event.currentTarget)}>
                  <span className="picker-icon">{icons[item.id] ? <img src={icons[item.id]} alt="" draggable={false} /> : item.kind === 'aumid' ? <IconBuildingStore size={30} stroke={1.5} /> : <IconApps size={30} stroke={1.5} />}</span>
                  <span className="picker-name">{item.name}</span>
                  {item.linked && <span className="picker-check" aria-hidden="true"><IconCheck size={14} stroke={2.6} /></span>}
                </button>
              </li>)}
            </ul>}
        </div>
        <footer className="picker-foot">
          <span>{items ? `${filtered.length} de ${items.length} aplicaciones` : 'Buscando aplicaciones instaladas…'}</span>
          <button className="picker-browse" onClick={onBrowse}><IconFolderSearch size={17} />¿No la encuentras? Examinar…</button>
        </footer>
      </div>
    </div>
  </div>;
}
