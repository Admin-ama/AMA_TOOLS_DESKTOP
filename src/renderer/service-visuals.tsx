import { IconCalendarEvent, IconGitBranch, IconMessageCircle2, IconServerCog, IconMailAi, IconFileTypePdf, IconBrandTeams, IconWorld } from '@tabler/icons-react';
import type { AppId } from '../shared/contracts';
import hulyLogo from '../../images/Huly-logo.svg';
import n8nLogo from '../../images/n8n-logo.svg';
import amaBotLogo from '../../images/ama-bot-cuadrado.svg';
import amaAppLogo from '../../images/icon_144x144.png';
import stirlingLogo from '../../images/stirling.png';
import { AmaBot } from './AmaBot';
import { MicrosoftLogo, isMicrosoftLogo } from './microsoft-logos';

const icons = { huly: IconCalendarEvent, n8n: IconGitBranch, librechat: IconMessageCircle2, portal: IconServerCog, emailai: IconMailAi, stirling: IconFileTypePdf, teams: IconBrandTeams } as const;
const sidebarLogos: Record<string, string> = { huly: hulyLogo, n8n: n8nLogo, librechat: amaBotLogo, portal: amaAppLogo, stirling: stirlingLogo };
const known = (id: AppId): id is keyof typeof icons => Object.hasOwn(icons, id);

/** Icono pequeño (pestañas, ajustes): el de la app, la favicon de una página propia o un mundo genérico. */
export function AppIcon({ id, icon, size = 16, stroke = 1.8 }: { id: AppId; icon?: string; size?: number; stroke?: number }) {
  if (known(id)) { const Icon = icons[id]; return <Icon size={size} stroke={stroke} />; }
  if (isMicrosoftLogo(id)) return <MicrosoftLogo id={id} size={size} />;
  return icon ? <img className="app-favicon" src={icon} alt="" width={size} height={size} draggable={false} /> : <IconWorld size={size} stroke={stroke} />;
}

/** Logo de una aplicación; el mismo dibujo en la sidebar y en el launcher. */
export function ServiceLogo({ id, icon }: { id: AppId; icon?: string }) {
  if (id === 'librechat') return <AmaBot className="service-logo service-logo-librechat" />;
  if (id === 'emailai') return <IconMailAi className="service-logo service-logo-emailai" size={26} stroke={1.65} />;
  if (id === 'teams') return <IconBrandTeams className="service-logo service-logo-teams" size={28} stroke={1.5} />;
  if (isMicrosoftLogo(id)) return <MicrosoftLogo id={id} size={28} className={`service-logo service-logo-${id}`} />;
  if (Object.hasOwn(sidebarLogos, id)) return <img className={`service-logo service-logo-${id}`} src={sidebarLogos[id]} alt="" draggable={false} />;
  // Página propia: su favicon, o un mundo genérico si no se pudo obtener.
  return icon ? <img className="service-logo service-logo-custom" src={icon} alt="" draggable={false} /> : <IconWorld className="service-logo service-logo-custom-fallback" size={26} stroke={1.5} />;
}
