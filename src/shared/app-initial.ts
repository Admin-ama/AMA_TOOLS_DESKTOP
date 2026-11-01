/** Inicial que sustituye al icono de una app anclada cuando no se pudo leer (o la imagen falla). */
export function appInitial(name: string): string {
  return name.match(/[\p{L}\p{N}]/u)?.[0].toLocaleUpperCase('es') ?? '?';
}
