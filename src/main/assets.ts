import path from 'node:path';
export function assetPath(address: string, root: string): string | null {
  try {
    const url = new URL(address);
    if (url.protocol !== 'app:' || url.host !== 'bundle') return null;
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.includes(':')) return null;
    const result = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.relative(root, result);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return result;
  } catch { return null; }
}
