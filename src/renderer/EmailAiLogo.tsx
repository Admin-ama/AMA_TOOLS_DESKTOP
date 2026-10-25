import { useId } from 'react';

/** Logo de Email Category AI: azulejo con los verdes de la marca, sobre blanco y destellos de IA. */
export function EmailAiLogo({ className }: { className?: string }) {
  const id = useId();
  const tile = `${id}-tile`, shine = `${id}-shine`;
  const spark = (cx: number, cy: number, r: number) => `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`;
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22c58b" />
          <stop offset=".55" stopColor="#0ea5a0" />
          <stop offset="1" stopColor="#00504d" />
        </linearGradient>
        <linearGradient id={shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${tile})`} />
      <rect width="32" height="32" rx="8" fill={`url(#${shine})`} />
      <rect x="6" y="11" width="17" height="12.5" rx="2.6" fill="#fff" />
      <path d="M7.2 12.6 14.5 18l7.3-5.4" fill="none" stroke="#0b7f6d" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path className="mail-spark" d={spark(23.5, 8.5, 4.6)} fill="#fef3c7" stroke="#0b6f62" strokeWidth="1.1" paintOrder="stroke" strokeLinejoin="round" />
      <path className="mail-spark" d={spark(27, 14.5, 1.9)} fill="#fff" opacity=".9" />
    </svg>
  );
}
