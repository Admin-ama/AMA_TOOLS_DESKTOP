interface IconImage { isEmpty(): boolean; toDataURL(): string }

/** Ruta que Windows resuelve por extensión: su icono es el genérico de ejecutable (el cuadro azul). */
const GENERIC_PROBE = 'x.exe';

/**
 * Lector de iconos de archivo. Devuelve undefined si la imagen está vacía o es el icono genérico de ejecutable
 * (algunas instalaciones de Office lo devuelven en vez del propio): el dock muestra entonces la inicial.
 */
export function fileIconReader(read: (file: string) => Promise<IconImage>): (file: string) => Promise<string | undefined> {
  let generic: Promise<string | undefined> | undefined;
  const genericIcon = () => generic ??= read(GENERIC_PROBE).then(image => image.isEmpty() ? undefined : image.toDataURL(), () => undefined);
  return async file => {
    const image = await read(file);
    if (image.isEmpty()) return undefined;
    const icon = image.toDataURL();
    return icon === await genericIcon() ? undefined : icon;
  };
}
