import { join, relative, isAbsolute } from 'node:path';

/** Carpeta dentro de Descargas donde la app ordena todo lo que baja. */
export const ROOT_FOLDER = 'AMA Tools';

export type DownloadKind = 'Documentos' | 'Hojas de cálculo' | 'Presentaciones' | 'Imágenes' | 'Comprimidos' | 'Datos' | 'Otros';

const MAX_SEGMENT = 120;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const BY_EXTENSION: Record<DownloadKind, string[]> = {
  'Documentos': ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md'],
  'Hojas de cálculo': ['xls', 'xlsx', 'xlsm', 'ods', 'csv', 'tsv'],
  'Presentaciones': ['ppt', 'pptx', 'odp'],
  'Imágenes': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic'],
  'Comprimidos': ['zip', '7z', 'rar', 'tar', 'gz', 'tgz'],
  'Datos': ['json', 'xml', 'yaml', 'yml', 'sql'],
  'Otros': [],
};
const KIND_OF_EXTENSION = new Map<string, DownloadKind>(
  (Object.entries(BY_EXTENSION) as [DownloadKind, string[]][]).flatMap(([kind, extensions]) => extensions.map(extension => [extension, kind] as const)),
);

const BY_MIME: [RegExp, DownloadKind][] = [
  [/^image\//, 'Imágenes'],
  [/pdf|msword|wordprocessingml|opendocument\.text|^text\/(plain|markdown)/, 'Documentos'],
  [/ms-excel|spreadsheetml|opendocument\.spreadsheet|^text\/(csv|tab-separated-values)/, 'Hojas de cálculo'],
  [/ms-powerpoint|presentationml|opendocument\.presentation/, 'Presentaciones'],
  [/zip|x-7z|x-rar|x-tar|gzip/, 'Comprimidos'],
  [/json|xml|yaml|sql/, 'Datos'],
];

/** Tipo de carpeta: manda la extensión; el MIME solo cuando no hay extensión conocida. */
export function classify(filename: string, mime: string): DownloadKind {
  const dot = filename.lastIndexOf('.');
  const extension = dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
  const byExtension = KIND_OF_EXTENSION.get(extension);
  if (byExtension) return byExtension;
  if (extension) return 'Otros';
  const type = mime.toLowerCase();
  return BY_MIME.find(([pattern]) => pattern.test(type))?.[1] ?? 'Otros';
}

/** Un solo tramo de ruta apto para Windows: sin separadores ni caracteres inválidos, sin nombres reservados, de largo acotado. */
export function sanitizeSegment(name: string): string {
  let safe = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^\.+/, '').replace(/[. ]+$/, '');
  if (!safe) return 'Descarga';
  if (RESERVED.test(safe.split('.')[0])) safe = `_${safe}`;
  if (safe.length > MAX_SEGMENT) {
    const extension = safe.match(/\.[A-Za-z0-9]{1,10}$/)?.[0] ?? '';
    safe = (safe.slice(0, MAX_SEGMENT - extension.length).replace(/[. ]+$/, '') || 'Descarga') + extension;
  }
  return safe;
}

/** Nombre cuando la página no entrega uno (blob:/data:). */
export function fallbackFilename(now: Date): string {
  const two = (value: number) => String(value).padStart(2, '0');
  return `descarga-${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
}

/** `downloadsDir` se lee en cada descarga: el usuario puede mover su carpeta de Descargas con la app abierta. */
interface OrganizerOptions { downloadsDir: () => string; exists: (path: string) => boolean; now?: () => Date }

/**
 * Decide dónde cae cada descarga: Descargas / AMA Tools / app / tipo / archivo.
 * Reserva la ruta elegida hasta release() para que dos descargas simultáneas del mismo nombre no se pisen.
 */
export function createDownloadOrganizer({ downloadsDir, exists, now = () => new Date() }: OrganizerOptions) {
  const reserved = new Set<string>();
  const key = (path: string) => path.toLowerCase(); // El disco de Windows no distingue mayúsculas.
  const taken = (path: string) => reserved.has(key(path)) || exists(path);
  return {
    resolve(appName: string, filename: string, mime: string): string {
      const root = join(downloadsDir(), ROOT_FOLDER);
      const name = filename.trim() ? sanitizeSegment(filename) : fallbackFilename(now());
      const folder = join(root, sanitizeSegment(appName), classify(name, mime));
      const dot = name.lastIndexOf('.');
      const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
      let path = join(folder, name);
      for (let copy = 1; taken(path); copy++) path = join(folder, `${stem} (${copy})${extension}`);
      const inside = relative(root, path);
      if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('Ruta de descarga fuera de la carpeta permitida');
      reserved.add(key(path));
      return path;
    },
    release(path: string): void { reserved.delete(key(path)); },
  };
}
