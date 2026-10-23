import { describe, expect, it } from 'vitest';
import { normalizePreferences } from '../../src/main/preferences';
import { assetPath } from '../../src/main/assets';
import path from 'node:path';

describe('preferencias sin secretos', () => {
  it('usa tema oscuro y particiones persistentes por defecto', () => {
    expect(normalizePreferences(null)).toEqual({ theme: 'dark', remember: { huly: true, n8n: true, librechat: true, portal: true, emailai: true, stirling: true }, pinned: ['librechat', 'portal', 'huly', 'n8n', 'emailai', 'stirling'] });
  });
  it('acepta solo valores booleanos y temas conocidos', () => {
    expect(normalizePreferences({ theme: 'light', remember: { huly: false, n8n: 'false' }, password: 'secret' })).toEqual({ theme: 'light', remember: { huly: false, n8n: true, librechat: true, portal: true, emailai: true, stirling: true }, pinned: ['librechat', 'portal', 'huly', 'n8n', 'emailai', 'stirling'] });
    expect(normalizePreferences({ theme: 'injected' }).theme).toBe('dark');
  });
  it('filtra apps fijadas inválidas y duplicadas, conservando el orden', () => {
    expect(normalizePreferences({ pinned: ['stirling', 'huly', 'stirling', 'evil', 3, 'constructor'] }).pinned).toEqual(['stirling', 'huly']);
  });
  it('permite no fijar ninguna app y cae al valor por defecto si el campo no es una lista', () => {
    expect(normalizePreferences({ pinned: [] }).pinned).toEqual([]);
    expect(normalizePreferences({ pinned: 'huly' }).pinned).toEqual(['librechat', 'portal', 'huly', 'n8n', 'emailai', 'stirling']);
  });
});

describe('recursos del shell', () => {
  const root = path.resolve('dist/renderer');
  it('resuelve solamente recursos locales del host bundle', () => {
    expect(assetPath('app://bundle/index.html', root)).toBe(path.join(root, 'index.html'));
    expect(assetPath('app://bundle/assets/main.css', root)).toBe(path.join(root, 'assets/main.css'));
  });
  it('rechaza host ajeno, protocolo ajeno y traversal codificado', () => {
    for (const url of ['app://evil/index.html', 'https://bundle/index.html', 'app://bundle/%2e%2e%2fsecret', 'app://bundle/%2e%2e%5csecret', 'app://bundle/%00', 'app://bundle/C:%5csecret']) {
      expect(assetPath(url, root)).toBeNull();
    }
  });
});
