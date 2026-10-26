import { describe, expect, it } from 'vitest';
import { movePinned, stepPinned } from '../../src/shared/pin-order';

const pinned = ['librechat', 'copilot', 'buk', 'portal', 'costeador', 'huly', 'n8n'];

describe('mover apps fijadas en la sidebar', () => {
  it('suelta la app antes o después de otra', () => {
    expect(movePinned(pinned, 'costeador', 'portal', 'before')).toEqual(['librechat', 'copilot', 'buk', 'costeador', 'portal', 'huly', 'n8n']);
    expect(movePinned(pinned, 'portal', 'costeador', 'after')).toEqual(['librechat', 'copilot', 'buk', 'costeador', 'portal', 'huly', 'n8n']);
    expect(movePinned(pinned, 'huly', 'n8n', 'after')).toEqual(['librechat', 'copilot', 'buk', 'portal', 'costeador', 'n8n', 'huly']);
  });
  it('soltar sobre sí misma, sobre una no fijada o mover una no fijada no cambia nada', () => {
    expect(movePinned(pinned, 'portal', 'portal', 'after')).toBe(pinned);
    expect(movePinned(pinned, 'portal', 'stirling', 'before')).toBe(pinned);
    expect(movePinned(pinned, 'stirling', 'portal', 'before')).toBe(pinned);
  });
  it('con teclado sube o baja un puesto dentro de su grupo', () => {
    const group = ['portal', 'costeador'];
    expect(stepPinned(pinned, group, 'costeador', -1)).toEqual(['librechat', 'copilot', 'buk', 'costeador', 'portal', 'huly', 'n8n']);
    expect(stepPinned(pinned, group, 'portal', 1)).toEqual(['librechat', 'copilot', 'buk', 'costeador', 'portal', 'huly', 'n8n']);
    // En el borde del grupo no sale de él.
    expect(stepPinned(pinned, group, 'portal', -1)).toBe(pinned);
    expect(stepPinned(pinned, group, 'costeador', 1)).toBe(pinned);
  });
});
