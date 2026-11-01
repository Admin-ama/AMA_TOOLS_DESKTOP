import { describe, expect, it } from 'vitest';
import { fileIconReader } from '../../src/main/file-icon';

const image = (url: string, empty = false) => ({ isEmpty: () => empty, toDataURL: () => url });
const GENERIC = 'data:image/png;base64,GENERICO';

describe('lector de iconos de archivo', () => {
  const reader = (icons: Record<string, ReturnType<typeof image> | Error>, calls: string[] = []) => fileIconReader(async file => {
    calls.push(file);
    const found = icons[file] ?? icons['*'];
    if (found instanceof Error) throw found;
    return found!;
  });

  it('devuelve el icono propio del archivo', async () => {
    expect(await reader({ 'x.exe': image(GENERIC), 'C:\\Word.exe': image('data:image/png;base64,WORD') })('C:\\Word.exe')).toBe('data:image/png;base64,WORD');
  });
  it('descarta el icono genérico de ejecutable de Windows', async () => {
    expect(await reader({ 'x.exe': image(GENERIC), '*': image(GENERIC) })('C:\\Excel.exe')).toBeUndefined();
  });
  it('descarta la imagen vacía', async () => {
    expect(await reader({ 'x.exe': image(GENERIC), '*': image('', true) })('C:\\Excel.exe')).toBeUndefined();
  });
  it('lee el genérico una sola vez', async () => {
    const calls: string[] = [];
    const read = reader({ 'x.exe': image(GENERIC), '*': image('data:image/png;base64,A') }, calls);
    await read('a.exe'); await read('b.exe');
    expect(calls.filter(file => file === 'x.exe')).toHaveLength(1);
  });
  it('si no puede leer el genérico, conserva los iconos (sin comparar)', async () => {
    expect(await reader({ 'x.exe': new Error('fallo'), '*': image(GENERIC) })('C:\\App.exe')).toBe(GENERIC);
  });
});
