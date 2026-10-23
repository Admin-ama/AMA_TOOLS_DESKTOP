import { IconCalendarEvent, IconGitBranch, IconMessageCircle2, IconServerCog, IconMailAi, IconFileTypePdf } from '@tabler/icons-react';
import type { ServiceId } from '../shared/contracts';
import hulyLogo from '../../images/Huly-logo.svg';
import n8nLogo from '../../images/n8n-logo.svg';
import amaBotLogo from '../../images/ama-bot-cuadrado.svg';
import amaAppLogo from '../../images/icon_144x144.png';
import stirlingLogo from '../../images/stirling.png';
import { AmaBot } from './AmaBot';

export const icons = { huly: IconCalendarEvent, n8n: IconGitBranch, librechat: IconMessageCircle2, portal: IconServerCog, emailai: IconMailAi, stirling: IconFileTypePdf };
const sidebarLogos: Record<Exclude<ServiceId, 'emailai'>, string> = { huly: hulyLogo, n8n: n8nLogo, librechat: amaBotLogo, portal: amaAppLogo, stirling: stirlingLogo };

/** Logo de una aplicación; el mismo dibujo en la sidebar y en el launcher. */
export function ServiceLogo({ id }: { id: ServiceId }) {
  if (id === 'librechat') return <AmaBot className="service-logo service-logo-librechat" />;
  if (id === 'emailai') return <IconMailAi className="service-logo service-logo-emailai" size={26} stroke={1.65} />;
  return <img className={`service-logo service-logo-${id}`} src={sidebarLogos[id]} alt="" draggable={false} />;
}
