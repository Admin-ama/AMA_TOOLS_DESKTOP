export type BadgeTone = 'red' | 'green' | 'blue' | 'orange' | 'purple' | 'gray' | 'slate';

const TONES: Record<BadgeTone, string[]> = {
  red: ['pdf'],
  green: ['xls', 'xlsx', 'xlsm', 'ods', 'csv', 'tsv'],
  blue: ['doc', 'docx', 'odt', 'rtf', 'txt', 'md'],
  orange: ['ppt', 'pptx', 'odp'],
  purple: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic'],
  gray: ['zip', '7z', 'rar', 'tar', 'gz', 'tgz'],
  slate: ['json', 'xml', 'yaml', 'yml', 'sql'],
};
const TONE_OF = new Map<string, BadgeTone>((Object.entries(TONES) as [BadgeTone, string[]][]).flatMap(([tone, extensions]) => extensions.map(extension => [extension, tone] as const)));

/** Cuadro de color con la extensión (PDF rojo, XLSX verde…). Extensión desconocida: etiqueta corta y gris. */
export function badgeOf(ext: string): { label: string; tone: BadgeTone } {
  const label = (ext || 'arch').toUpperCase().slice(0, 4);
  return { label, tone: TONE_OF.get(ext.toLowerCase()) ?? 'gray' };
}

/** 84000 → "82 KB". 0 = aún se desconoce. */
export function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  const text = value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '').replace('.', ',');
  return `${text} ${units[unit]}`;
}

/** "07:10 p. m." */
export function formatTime(at: number): string {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: true }).format(at);
}
