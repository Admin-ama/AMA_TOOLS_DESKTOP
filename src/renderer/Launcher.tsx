import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { IconPin, IconPinFilled, IconSearch, IconX, IconLayoutSidebarRight, IconPlus, IconPencil } from '@tabler/icons-react';
import { CATEGORIES, MINE_CATEGORY, type Service, type AppId } from '../shared/contracts';
import { checkCustomName, checkCustomUrl, MAX_CUSTOM_APPS } from '../shared/custom-apps';
import { ServiceLogo } from './service-visuals';

gsap.registerPlugin(useGSAP);

// Cortas a propósito: es una herramienta de trabajo, no una presentación.
const MOTION = '(prefers-reduced-motion: no-preference)';

interface Props {
  services: Service[];
  pinned: AppId[];
  onOpen(id: AppId): void;
  onSplit(id: AppId): void;
  onPin(id: AppId, pinned: boolean): void;
  onClose(): void;
  /** Devuelven la promesa cruda: el formulario muestra el motivo del rechazo del proceso principal. */
  onAdd(input: { name: string; url: string; pin: boolean }): Promise<string>;
  onEdit(id: AppId, input: { name: string; url: string }): Promise<void>;
}
type FormMode = { kind: 'add' } | { kind: 'edit'; id: AppId };
interface FormValues { name: string; url: string; pin: boolean }
interface FormErrors { name?: string; url?: string; form?: string }

// Electron antepone "Error invoking remote method…" al mensaje real, que ya viene en español.
const reason = (error: unknown) => (error instanceof Error ? error.message.split('Error: ').pop() : '') || 'No se pudo guardar la página. Vuelve a intentar.';

function PageForm({ mode, initial, onSubmit, onCancel }: { mode: FormMode; initial: FormValues; onSubmit(values: FormValues): Promise<unknown>; onCancel(): void }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const edit = mode.kind === 'edit';
  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = checkCustomName(values.name), url = checkCustomUrl(values.url);
    const next: FormErrors = { name: 'error' in name ? name.error : undefined, url: 'error' in url ? url.error : undefined };
    setErrors(next);
    if (!('name' in name) || !('url' in url)) return;
    setBusy(true);
    try { await onSubmit({ name: name.name, url: url.url, pin: values.pin }); }
    catch (error) { setErrors({ form: reason(error) }); setBusy(false); }
  }
  return <form className="page-form" aria-label={edit ? 'Editar página' : 'Agregar página'} noValidate onSubmit={event => void submit(event)}>
    <label>Nombre<input type="text" autoFocus value={values.name} aria-invalid={!!errors.name} onChange={event => setValues({ ...values, name: event.target.value })} /></label>
    {errors.name && <p className="form-error" role="alert">{errors.name}</p>}
    <label>Dirección (URL)<input type="url" inputMode="url" placeholder="https://…" value={values.url} aria-invalid={!!errors.url} onChange={event => setValues({ ...values, url: event.target.value })} /></label>
    {errors.url && <p className="form-error" role="alert">{errors.url}</p>}
    {!edit && <label className="form-check"><input type="checkbox" checked={values.pin} onChange={event => setValues({ ...values, pin: event.target.checked })} />Fijar en la barra lateral</label>}
    {errors.form && <p className="form-error" role="alert">{errors.form}</p>}
    <div className="page-form-actions"><button type="submit" className="secondary-button primary" disabled={busy}>Guardar</button><button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancelar</button></div>
  </form>;
}

export function Launcher({ services, pinned, onOpen, onSplit, onPin, onClose, onAdd, onEdit }: Props) {
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormMode | null>(null);
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
  const pin = contextSafe((event: MouseEvent<HTMLButtonElement>, id: AppId, value: boolean) => {
    if (window.matchMedia(MOTION).matches) gsap.fromTo(event.currentTarget, { scale: 0.7 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', clearProps: 'transform' });
    onPin(id, value);
  });
  useEffect(() => {
    // Con el formulario abierto, Esc solo lo cierra.
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (form) setForm(null); else close(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, form]);
  const needle = query.trim().toLowerCase();
  const matches = (service: Service) => !needle || `${service.name} ${service.shortName}`.toLowerCase().includes(needle);
  const editing = form?.kind === 'edit' ? services.find(item => item.id === form.id) : undefined;
  const card = (service: Service) => {
    const isPinned = pinned.includes(service.id);
    return <div className={`launcher-card ${service.custom ? 'custom' : ''}`} key={service.id}>
      <button className="launcher-open" aria-label={`Abrir ${service.name}`} onClick={() => onOpen(service.id)}>
        <span className="launcher-logo"><ServiceLogo id={service.id} icon={service.icon} /></span><span className="launcher-name">{service.name}</span>
      </button>
      {service.custom && <button className="pin-button edit-button" aria-label={`Editar ${service.name}`} title="Editar página" onClick={() => setForm({ kind: 'edit', id: service.id })}><IconPencil size={16} /></button>}
      <button className="pin-button split-button" aria-label={`Abrir ${service.name} a la derecha`} title="Abrir a la derecha" onClick={() => onSplit(service.id)}><IconLayoutSidebarRight size={16} /></button>
      <button className={`pin-button ${isPinned ? 'pinned' : ''}`} aria-pressed={isPinned} aria-label={isPinned ? `Quitar ${service.name} de la barra lateral` : `Fijar ${service.name} en la barra lateral`} title={isPinned ? 'Quitar de la barra lateral' : 'Fijar en la barra lateral'} onClick={event => pin(event, service.id, !isPinned)}>
        {isPinned ? <IconPinFilled size={16} /> : <IconPin size={16} />}
      </button>
    </div>;
  };
  const mine = services.filter(service => service.category === MINE_CATEGORY.id);
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
            {items.map(card)}
          </div>
        </div>;
      })}
      <div className="launcher-category">
        <h2>{MINE_CATEGORY.label}</h2>
        {mine.filter(matches).length > 0 && <div className="launcher-grid">{mine.filter(matches).map(card)}</div>}
        {form ? <PageForm key={form.kind === 'edit' ? form.id : 'add'} mode={form} initial={editing ? { name: editing.name, url: editing.url, pin: false } : { name: '', url: '', pin: true }}
          onSubmit={async values => { if (form.kind === 'edit') await onEdit(form.id, { name: values.name, url: values.url }); else await onAdd(values); setForm(null); }} onCancel={() => setForm(null)} />
          : <button className="launcher-add" disabled={mine.length >= MAX_CUSTOM_APPS} title={mine.length >= MAX_CUSTOM_APPS ? `Máximo ${MAX_CUSTOM_APPS} páginas` : undefined} onClick={() => setForm({ kind: 'add' })}><IconPlus size={16} />Agregar página</button>}
      </div>
      {needle && !services.some(matches) && <p className="launcher-empty">Ninguna aplicación coincide con «{query}».</p>}
    </div>
  </section>;
}
