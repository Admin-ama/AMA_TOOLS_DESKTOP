import type { ServiceId } from '../shared/contracts';

// Excepción explícita solicitada para el certificado interno de LibreChat.
// No permite errores de fecha, nombre, revocación ni otros destinos/aplicaciones.
export function allowInternalCertificate(serviceId: ServiceId | undefined, destination: string, error: string): boolean {
  if (serviceId !== 'librechat' || error !== 'net::ERR_CERT_AUTHORITY_INVALID') return false;
  try {
    const url = new URL(destination);
    return url.origin === 'https://172.16.8.73' && !url.username && !url.password;
  } catch { return false; }
}
