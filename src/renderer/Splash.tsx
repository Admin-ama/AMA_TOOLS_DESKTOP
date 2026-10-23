import { useRef, type CSSProperties } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import amaLogo from '../../images/AMA-TIME-digital.png';
import type { Snapshot } from '../shared/contracts';

gsap.registerPlugin(useGSAP);

const MOTION = '(prefers-reduced-motion: no-preference)';
const TITLE = 'AMATIME TOOLS';
// Chispas que convergen al corazón antes de encender el circuito; posiciones fijas para que el arranque sea siempre igual.
const SPARKS = Array.from({ length: 18 }, (_, index) => {
  const angle = (index / 18) * Math.PI * 2;
  const distance = 220 + (index % 3) * 70;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, delay: (index % 6) * 0.04 };
});

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
        .from('.splash-spark', { x: (index: number) => SPARKS[index].x, y: (index: number) => SPARKS[index].y, opacity: 0, scale: 0.4, duration: 0.7, ease: 'power2.in', delay: (index: number) => SPARKS[index].delay })
        .to('.splash-spark', { opacity: 0, scale: 0, duration: 0.2 }, '-=0.05')
        // El circuito se "enciende" de abajo hacia arriba, con parpadeo de neón.
        .fromTo('.splash-logo-base', { clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)', duration: 0.9, ease: 'power2.inOut' }, '-=0.3')
        .fromTo('.splash-logo-glow', { opacity: 0 }, { keyframes: { opacity: [0, 1, 0.25, 1, 0.5, 1] }, duration: 0.55, ease: 'none' }, '-=0.35')
        .fromTo('.splash-ring', { scale: 0.6, opacity: 0.7 }, { scale: 2.4, opacity: 0, duration: 1.1, ease: 'expo.out' }, '-=0.25')
        .from('.splash-title span', { opacity: 0, y: 12, filter: 'blur(6px)', duration: 0.45, stagger: 0.035 }, '-=0.9')
        .from('.splash-tagline, .splash-progress, .splash-status', { opacity: 0, y: 8, duration: 0.4, stagger: 0.08 }, '-=0.3');
      // Pulso de energía que recorre las pistas del logo mientras carga.
      gsap.fromTo('.splash-shine', { xPercent: -120 }, { xPercent: 120, duration: 1.6, ease: 'power1.inOut', repeat: -1, repeatDelay: 0.4, delay: 1.6 });
      gsap.to('.splash-logo-glow', { opacity: 0.55, duration: 1.2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 2.2 });
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
        <span className="splash-ring" aria-hidden="true" />
        {SPARKS.map((_, index) => <span key={index} className="splash-spark" aria-hidden="true" />)}
        <img className="splash-logo-glow" src={amaLogo} alt="" aria-hidden="true" />
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
