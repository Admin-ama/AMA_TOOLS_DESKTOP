import { useEffect, useRef, useState } from 'react';
import { IconPin, IconPinFilled, IconSearch, IconX } from '@tabler/icons-react';
import { CATEGORIES, type Service, type ServiceId } from '../shared/contracts';
import { ServiceLogo } from './service-visuals';

interface Props {
  services: Service[];
  pinned: ServiceId[];
  onOpen(id: ServiceId): void;
  onPin(id: ServiceId, pinned: boolean): void;
  onClose(): void;
}

export function Launcher({ services, pinned, onOpen, onPin, onClose }: Props) {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { search.current?.focus(); }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  const needle = query.trim().toLowerCase();
  const matches = (service: Service) => !needle || `${service.name} ${service.shortName}`.toLowerCase().includes(needle);
  return <section className="launcher" aria-label="Todas las aplicaciones">
    <div className="launcher-panel">
      <div className="launcher-top">
        <label className="launcher-search"><IconSearch size={17} aria-hidden="true" /><input ref={search} type="text" aria-label="Buscar aplicación" placeholder="Buscar aplicación…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <button className="icon-button" aria-label="Cerrar aplicaciones" title="Cerrar (Esc)" onClick={onClose}><IconX size={18} /></button>
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
                <button className={`pin-button ${isPinned ? 'pinned' : ''}`} aria-pressed={isPinned} aria-label={isPinned ? `Quitar ${service.name} de la barra lateral` : `Fijar ${service.name} en la barra lateral`} title={isPinned ? 'Quitar de la barra lateral' : 'Fijar en la barra lateral'} onClick={() => onPin(service.id, !isPinned)}>
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
