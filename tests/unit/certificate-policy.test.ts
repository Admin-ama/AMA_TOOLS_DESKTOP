import { describe, expect, it } from 'vitest';
import { allowInternalCertificate, insecureInternalOrigins, isInternalHost } from '../../src/main/certificate-policy';
import { SERVICES } from '../../src/main/policy';

describe('red interna 172.16.8.0/24', () => {
  it('reconoce solo direcciones IPv4 de esa red', () => {
    for (const host of ['172.16.8.0', '172.16.8.73', '172.16.8.255']) expect(isInternalHost(host), host).toBe(true);
    for (const host of ['172.16.8.256', '172.16.9.73', '172.16.8', '172.16.8.73.evil.test', 'evil172.16.8.73', '1172.16.8.73', 'localhost', '']) expect(isInternalHost(host), host).toBe(false);
  });
});

describe('certificados de los sitios internos', () => {
  const errors = ['net::ERR_CERT_AUTHORITY_INVALID', 'net::ERR_CERT_COMMON_NAME_INVALID'];
  it('confía en certificados propios (CA interna o nombre por IP) de cualquier sitio https de la red interna', () => {
    for (const url of ['https://172.16.8.73/login', 'https://172.16.8.73:3080/', 'https://172.16.8.10/api']) {
      for (const error of errors) expect(allowInternalCertificate(url, error), url + error).toBe(true);
    }
  });
  it('fuera de la red interna, con credenciales o sin https no confía nunca', () => {
    for (const url of ['https://evil.test/', 'http://172.16.8.73/', 'https://172.16.9.73/', 'https://172.16.8.73.evil.test/', 'https://user:pass@172.16.8.73/', 'not a url']) {
      expect(allowInternalCertificate(url, 'net::ERR_CERT_AUTHORITY_INVALID'), url).toBe(false);
    }
  });
  it('certificados vencidos, revocados o con otros errores siguen rechazándose', () => {
    for (const error of ['net::ERR_CERT_DATE_INVALID', 'net::ERR_CERT_REVOKED', 'net::ERR_CERT_INVALID', 'net::ERR_CERT_WEAK_KEY', '']) {
      expect(allowInternalCertificate('https://172.16.8.73/', error), error).toBe(false);
    }
  });
});

describe('sitios internos sin certificado (http)', () => {
  it('se tratan como seguros para que funcione el portapapeles: solo los http internos del catálogo', () => {
    expect(insecureInternalOrigins(SERVICES)).toEqual(['http://172.16.8.73:8087', 'http://172.16.8.73:8080']);
  });
  it('ignora https, otras redes, credenciales y direcciones inválidas', () => {
    const service = (url: string) => ({ url });
    expect(insecureInternalOrigins([service('https://172.16.8.73/'), service('http://172.16.9.1/'), service('http://u:p@172.16.8.5/'), service('http://example.com/'), service('nope'), service('http://172.16.8.5:81/x'), service('http://172.16.8.5:81/y')])).toEqual(['http://172.16.8.5:81']);
  });
});
