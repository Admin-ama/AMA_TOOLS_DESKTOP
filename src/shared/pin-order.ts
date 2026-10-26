import type { AppId } from './contracts';

/** Nuevo orden de fijadas al soltar `dragged` antes o después de `target`; sin cambios devuelve la misma lista. */
export function movePinned(pinned: readonly AppId[], dragged: AppId, target: AppId, place: 'before' | 'after'): readonly AppId[] {
  if (dragged === target || !pinned.includes(dragged) || !pinned.includes(target)) return pinned;
  const rest = pinned.filter(id => id !== dragged);
  const at = rest.indexOf(target) + (place === 'after' ? 1 : 0);
  return [...rest.slice(0, at), dragged, ...rest.slice(at)];
}

/** Sube (-1) o baja (+1) una app un puesto dentro de su grupo de la sidebar (`group`, en orden visible). */
export function stepPinned(pinned: readonly AppId[], group: readonly AppId[], id: AppId, step: -1 | 1): readonly AppId[] {
  const neighbour = group[group.indexOf(id) + step];
  if (!group.includes(id) || !neighbour) return pinned;
  return movePinned(pinned, id, neighbour, step < 0 ? 'before' : 'after');
}
