import { expect, it } from 'vitest';
import { allowInternalCertificate } from '../../src/main/certificate-policy';

it('permite solo la autoridad no confiable de LibreChat en su origen HTTPS exacto', () => {
  expect(allowInternalCertificate('librechat', 'https://172.16.8.73/login', 'net::ERR_CERT_AUTHORITY_INVALID')).toBe(true);
  for (const id of ['huly', 'n8n', 'portal', undefined]) {
    expect(allowInternalCertificate(id as never, 'https://172.16.8.73/', 'net::ERR_CERT_AUTHORITY_INVALID')).toBe(false);
  }
  for (const url of ['https://evil.test/', 'http://172.16.8.73/', 'https://172.16.8.73:3080/', 'https://172.16.8.73.evil.test/', 'https://user:pass@172.16.8.73/', 'not a url']) {
    expect(allowInternalCertificate('librechat', url, 'net::ERR_CERT_AUTHORITY_INVALID')).toBe(false);
  }
  for (const error of ['net::ERR_CERT_DATE_INVALID', 'net::ERR_CERT_COMMON_NAME_INVALID', 'net::ERR_CERT_REVOKED']) {
    expect(allowInternalCertificate('librechat', 'https://172.16.8.73/', error)).toBe(false);
  }
});
