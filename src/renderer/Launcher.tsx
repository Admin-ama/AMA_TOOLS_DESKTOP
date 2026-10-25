import { useEffect, useRef, useState, type MouseEvent } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { IconPin, IconPinFilled, IconSearch, IconX, IconLayoutSidebarRight } from '@tabler/icons-react';
import { CATEGORIES, type Service, type ServiceId } from '../shared/contracts';
import { ServiceLogo } from './service-visuals';

gsap.registerPlugin(useGSAP);

// Cortas a propósito: es una herramienta de trabajo, no una presentación.
const MOTION = '(prefers-reduced-motion: no-preference)';

interface Props {
  services: Service[];
  pinned: ServiceId[];
  onOpen(id: ServiceId): void;
  onSplit(id: ServiceId): void;
  onPin(id: ServiceId, pinned: boolean): void;
  onClose(): void;
}

export function Launcher({ services, pinned, onOpen, onSplit, onPin, onClose }: Props) {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLElement>(null);
  const closing = useRef(false);
  useEffect(() => { search.current?.focus(); }, []);
  useGSAP(() => {
    gsap.matchMedia().add(MOTION, () => {
      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('.launcher-panel', { opacity: 0, y: -14, scale: 0.97, duration: 0.24 })
        .from('.launcher-category h2, .launcher-card', { opacity: 0, y: 10, duration: 0.22, stagger: 0.025, clearProps: 'opacity,transform' }, '-=0.12');
    });
  }, { scope: root });
  const { contextSafe } = useGSAP({ scope: root });
  const close = contextSafe(() => {
    if (closing.current) return;
    closing.current = true;
    if (!window.matchMedia(MOTION).matches) return onClose();
    gsap.to('.launcher-panel', { opacity: 0, y: -8, scale: 0.98, duration: 0.14, ease: 'power2.in', onComplete: onClose });
  });
  const pin = contextSafe((event: MouseEvent<HTMLButtonElement>, id: ServiceId, value: boolean) => {
    if (window.matchMedia(MOTION).matches) gsap.fromTo(event.currentTarget, { scale: 0.7 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', clearProps: 'transform' });
    onPin(id, value);
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  const needle = query.trim().toLowerCase();
  const matches = (service: Service) => !needle || `${service.name} ${service.shortName}`.toLowerCase().includes(needle);
  // Solo el fondo cierra: los clics dentro del panel tienen otro target.
  return <section ref={root} className="launcher" aria-label="Todas las aplicaciones" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="launcher-panel">
      <div className="launcher-top">
        <label className="launcher-search"><IconSearch size={17} aria-hidden="true" /><input ref={search} type="text" aria-label="Buscar aplicación" placeholder="Buscar aplicación…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <button className="icon-button" aria-label="Cerrar aplicaciones" title="Cerrar (Esc)" onClick={close}><IconX size={18} /></button>
      </div>
      {CATEGORIES.map(category => {
        const items = services.filter(service => service.category === category.id && matches(service));
        if (items.length === 0) return null;
        return <div className="launcher-category" key={category.id}>
          <h2>{category.label}</h2>
          <div className="launcher-grid">
            {items.map(service => {
              const isPinned = pinned.includes(service.id);
              return <div className="launcher-card" key={service.id}>
                <button className="launcher-open" aria-label={`Abrir ${service.name}`} onClick={() => onOpen(service.id)}>
                  <span className="launcher-logo"><ServiceLogo id={service.id} /></span><span className="launcher-name">{service.name}</span>
                </button>
                <button className="pin-button split-button" aria-label={`Abrir ${service.name} a la derecha`} title="Abrir a la derecha" onClick={() => onSplit(service.id)}><IconLayoutSidebarRight size={16} /></button>
                <button className={`pin-button ${isPinned ? 'pinned' : ''}`} aria-pressed={isPinned} aria-label={isPinned ? `Quitar ${service.name} de la barra lateral` : `Fijar ${service.name} en la barra lateral`} title={isPinned ? 'Quitar de la barra lateral' : 'Fijar en la barra lateral'} onClick={event => pin(event, service.id, !isPinned)}>
                  {isPinned ? <IconPinFilled size={16} /> : <IconPin size={16} />}
                </button>
              </div>;
            })}
          </div>
        </div>;
      })}
      {needle && !services.some(matches) && <p className="launcher-empty">Ninguna aplicación coincide con «{query}».</p>}
    </div>
  </section>;
}
