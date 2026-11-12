import type { Service } from '../shared/contracts';

/** Red interna de la empresa: 172.16.8.0/24 (solo IPv4 literal, nunca un nombre que la contenga). */
export function isInternalHost(hostname: string): boolean {
  const match = /^172\.16\.8\.(\d{1,3})$/.exec(hostname);
  return !!match && Number(match[1]) <= 255;
}

const internalUrl = (value: string, protocol: 'http:' | 'https:') => {
  try {
    const url = new URL(value);
    return url.protocol === protocol && !url.username && !url.password && isInternalHost(url.hostname) ? url : undefined;
  } catch { return undefined; }
};

// Los sitios internos usan la CA propia o certificados emitidos a la IP: se confía en ellos.
// Vencidos, revocados u otros errores siguen rechazándose, igual que cualquier destino fuera de la red interna.
const TRUSTED_INTERNAL_ERRORS: ReadonlySet<string> = new Set(['net::ERR_CERT_AUTHORITY_INVALID', 'net::ERR_CERT_COMMON_NAME_INVALID']);
export function allowInternalCertificate(destination: string, error: string): boolean {
  return TRUSTED_INTERNAL_ERRORS.has(error) && !!internalUrl(destination, 'https:');
}

// WORKAROUND n8n (https://172.16.8.73:5443 tras nginx). Quitar cuando infraestructura:
// 1) distribuya "AMA Internal CA" como raíz de confianza (certificate-error no cubre wss:// y el push se corta: 1006);
// 2) configure nginx con `proxy_set_header Host $http_host` (hoy n8n recibe Host sin puerto y cierra con "Invalid origin!").

/** La vista ignora errores de certificado (vía depurador, cubre WebSockets): solo servicios https de la red interna. */
export function ignoresCertificateErrors(serviceUrl: string): boolean {
  return !!internalUrl(serviceUrl, 'https:');
}

/** Patrón de webRequest para el WebSocket push de n8n del servicio. */
export function pushSocketFilter(serviceUrl: string): string {
  const url = new URL(serviceUrl);
  return `wss://${url.host}/rest/push*`;
}

/** Origin tal como n8n lo espera detrás del nginx: sin puerto. */
export function originWithoutPort(origin: string): string {
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}`;
}

/** Orígenes http internos del catálogo: Chromium los trata como seguros (portapapeles y demás APIs de contexto seguro). */
export function insecureInternalOrigins(services: readonly Pick<Service, 'url'>[]): string[] {
  return [...new Set(services.map(service => internalUrl(service.url, 'http:')?.origin).filter((origin): origin is string => !!origin))];
}
