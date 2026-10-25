import { useRef, type CSSProperties } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import amaLogo from '../../images/AMA-TIME-digital.png';
import type { Snapshot } from '../shared/contracts';

gsap.registerPlugin(useGSAP);

const MOTION = '(prefers-reduced-motion: no-preference)';
const TITLE = 'AMATIME TOOLS';

function statusText(state?: Snapshot) {
  if (!state || state.network.status === 'checking') return 'Verificando red interna…';
  if (state.network.status === 'disconnected') return 'Sin acceso a red interna';
  const service = state.services.find(item => item.id === state.active);
  return `Conectando con ${service?.name ?? 'tus herramientas'}…`;
}

export function Splash({ state }: { state?: Snapshot }) {
  const root = useRef<HTMLDivElement>(null);
  const leaving = state?.splash === 'leaving';

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(MOTION, () => {
      gsap.timeline({ defaults: { ease: 'power3.out' } })
        // Logo sobrio: aparece con un fundido y un leve acercamiento.
        .from('.splash-logo-base', { opacity: 0, scale: 0.94, y: 8, duration: 0.8 })
        .from('.splash-title span', { opacity: 0, y: 12, filter: 'blur(6px)', duration: 0.45, stagger: 0.035 }, '-=0.4')
        .from('.splash-tagline, .splash-progress, .splash-status', { opacity: 0, y: 8, duration: 0.4, stagger: 0.08 }, '-=0.3');
      // Brillo sutil que recorre el logo mientras carga.
      gsap.fromTo('.splash-shine', { xPercent: -120 }, { xPercent: 120, duration: 1.8, ease: 'power1.inOut', repeat: -1, repeatDelay: 1.2, delay: 1.2 });
    });
    return () => mm.revert();
  }, { scope: root });

  useGSAP(() => {
    if (!leaving) return;
    const done = () => { void window.portal.finishSplash().catch(() => undefined); };
    if (!window.matchMedia(MOTION).matches) return done();
    gsap.timeline({ onComplete: done })
      .to('.splash-stage', { scale: 1.12, opacity: 0, filter: 'blur(10px)', duration: 0.5, ease: 'power2.in' })
      .to(root.current, { opacity: 0, duration: 0.35, ease: 'power1.out' }, '-=0.15');
  }, { scope: root, dependencies: [leaving] });

  return <div ref={root} className="splash" role="status" aria-label="Iniciando AMATIME Tools" aria-live="polite">
    <div className="splash-stage">
      <div className="splash-mark">
        <img className="splash-logo-base" src={amaLogo} alt="AMA Time" />
        <span className="splash-shine" aria-hidden="true" style={{ '--logo': `url("${amaLogo}")` } as CSSProperties}><span /></span>
      </div>
      <h1 className="splash-title" aria-hidden="true">{[...TITLE].map((char, index) => <span key={index}>{char === ' ' ? ' ' : char}</span>)}</h1>
      <p className="splash-tagline">Tus herramientas, conectadas</p>
      <div className="splash-progress" aria-hidden="true"><span /></div>
      <p className="splash-status">{statusText(state)}</p>
    </div>
  </div>;
}
