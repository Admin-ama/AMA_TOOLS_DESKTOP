import { useId } from 'react';

/** Logos propios (inline, sin imágenes remotas por la CSP) de las apps de Microsoft 365: sencillos, de color propio y legibles en claro y oscuro. */
export const MICROSOFT_LOGO_IDS = ['copilot', 'outlook', 'sharepoint', 'powerautomate', 'forms'] as const;
export type MicrosoftLogoId = typeof MICROSOFT_LOGO_IDS[number];
export const isMicrosoftLogo = (id: string): id is MicrosoftLogoId => (MICROSOFT_LOGO_IDS as readonly string[]).includes(id);

const FONT = 'Segoe UI, Arial, sans-serif';

export function MicrosoftLogo({ id, size = 28, className }: { id: MicrosoftLogoId; size?: number; className?: string }) {
  const uid = useId();
  const common = { className, width: size, height: size, viewBox: '0 0 32 32', 'aria-hidden': true, focusable: false } as const;
  if (id === 'copilot') {
    const a = `${uid}a`, b = `${uid}b`;
    return <svg {...common}>
      <defs>
        <linearGradient id={a} x1="8" y1="6" x2="24" y2="22" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#2f9bff" /><stop offset="1" stopColor="#9b5cf6" /></linearGradient>
        <linearGradient id={b} x1="24" y1="26" x2="8" y2="10" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#ff8a3d" /><stop offset="1" stopColor="#ec4899" /></linearGradient>
      </defs>
      <path d="M22 9c-2.2-2.600-5.600-3.200-8.600-1.600C9.800 9.300 8.200 13 8.800 16.400c.5 3 2.600 5.200 5.700 5.900" fill="none" stroke={`url(#${a})`} strokeWidth="5" strokeLinecap="round" />
      <path d="M10 23c2.200 2.600 5.600 3.200 8.600 1.600 3.600-1.900 5.200-5.600 4.600-9-.5-3-2.600-5.200-5.700-5.900" fill="none" stroke={`url(#${b})`} strokeWidth="5" strokeLinecap="round" />
    </svg>;
  }
  if (id === 'outlook') return <svg {...common}>
    <rect x="2" y="4" width="28" height="24" rx="4.500" fill="#0f6cbd" />
    <rect x="14" y="9" width="14" height="14" rx="2" fill="#fff" />
    <path d="M15 11.500l6 4.500 6-4.500" fill="none" stroke="#0f6cbd" strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="4" y="11" width="13" height="10" rx="2.500" fill="#0a4f8f" />
    <circle cx="10.500" cy="16" r="3" fill="none" stroke="#fff" strokeWidth="2" />
  </svg>;
  if (id === 'sharepoint') return <svg {...common}>
    <rect x="2" y="4" width="28" height="24" rx="4.500" fill="#038387" />
    <circle cx="21.500" cy="11.500" r="6" fill="#37c6d0" opacity=".85" />
    <circle cx="23.500" cy="20.500" r="5" fill="#1a9ba1" opacity=".9" />
    <text x="9.500" y="21.500" fill="#fff" fontFamily={FONT} fontSize="15" fontWeight="700" textAnchor="middle">S</text>
  </svg>;
  if (id === 'powerautomate') return <svg {...common}>
    <path d="M7 8l8 8-8 8" fill="none" stroke="#2b7fe8" strokeWidth="4.200" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 8l8 8-8 8" fill="none" stroke="#69a8f5" strokeWidth="4.200" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
  return <svg {...common}>
    <rect x="2" y="4" width="28" height="24" rx="4.500" fill="#14876c" />
    <rect x="17" y="9" width="9" height="2.600" rx="1.300" fill="#7be0c3" />
    <rect x="17" y="14.500" width="9" height="2.600" rx="1.300" fill="#7be0c3" />
    <rect x="17" y="20" width="9" height="2.600" rx="1.300" fill="#7be0c3" />
    <text x="10" y="22" fill="#fff" fontFamily={FONT} fontSize="16" fontWeight="700" textAnchor="middle">F</text>
  </svg>;
}
