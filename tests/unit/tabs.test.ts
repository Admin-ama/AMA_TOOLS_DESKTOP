import { describe, expect, it } from 'vitest';
import { ApplicationTabs } from '../../src/main/application-tabs';

describe('pestañas por aplicación', () => {
  it('inicia en LibreChat', () => {
    expect(new ApplicationTabs().active).toBe('librechat');
  });

  it('actualiza el título por pestaña sin cambiar su identidad o selección', () => {
    const tabs = new ApplicationTabs();
    const first = tabs.switchApplication('huly');
    const second = tabs.open('huly');
    tabs.updateTitle(first.id, '  Tareas · AMA  ');
    tabs.updateTitle(second.id, 'Calendario');
    expect(tabs.all.map(tab => tab.title)).toEqual(['Tareas · AMA', 'Calendario']);
    expect(tabs.activeTabId).toBe(second.id);
    tabs.updateTitle(first.id, '   ');
    expect(tabs.all[0].title).toBe('');
    expect(() => tabs.updateTitle('closed-tab', 'Ignored')).not.toThrow();
  });
  it('crea pestañas distintas para una misma aplicación', () => {
    const tabs = new ApplicationTabs();
    const first = tabs.switchApplication('huly');
    const second = tabs.open('huly');
    expect(first.id).not.toBe(second.id);
    expect(tabs.all.map(tab => tab.number)).toEqual([1, 2]);
    expect(tabs.activeTabId).toBe(second.id);
  });
  it('recuerda la pestaña seleccionada al cambiar de aplicación', () => {
    const tabs = new ApplicationTabs();
    const first = tabs.switchApplication('huly');
    tabs.open('huly');
    tabs.select(first.id);
    tabs.switchApplication('n8n');
    expect(tabs.switchApplication('huly').id).toBe(first.id);
    expect(tabs.all.filter(tab => tab.serviceId === 'huly')).toHaveLength(2);
  });
  it('cerrar la activa selecciona la vecina sin cambiar de aplicación', () => {
    const tabs = new ApplicationTabs();
    const first = tabs.switchApplication('huly');
    const second = tabs.open('huly');
    tabs.close(second.id);
    expect(tabs.activeTabId).toBe(first.id);
    expect(tabs.active).toBe('huly');
  });
  it('cerrar la última deja una nueva pestaña de la misma aplicación', () => {
    const tabs = new ApplicationTabs();
    const first = tabs.switchApplication('huly');
    tabs.close(first.id);
    expect(tabs.all).toHaveLength(1);
    expect(tabs.activeTabId).not.toBe(first.id);
    expect(tabs.current.serviceId).toBe('huly');
  });
  it('cerrar la última de una app no fijada cierra la app y vuelve a la indicada', () => {
    const tabs = new ApplicationTabs();
    const huly = tabs.switchApplication('huly');
    const n8n = tabs.switchApplication('n8n');
    tabs.close(n8n.id, 'huly');
    expect(tabs.all.map(tab => tab.serviceId)).not.toContain('n8n');
    expect(tabs.active).toBe('huly');
    expect(tabs.activeTabId).toBe(huly.id);
  });
  it('ignora una app de regreso igual a la que se cierra', () => {
    const tabs = new ApplicationTabs();
    const first = tabs.switchApplication('huly');
    tabs.close(first.id, 'huly');
    expect(tabs.current.serviceId).toBe('huly');
    expect(tabs.activeTabId).not.toBe(first.id);
  });
  it('no acepta pestañas inexistentes ni selecciona otra aplicación desde su barra', () => {
    const tabs = new ApplicationTabs();
    const huly = tabs.switchApplication('huly');
    tabs.switchApplication('n8n');
    expect(() => tabs.select('invented')).toThrow();
    expect(() => tabs.select(huly.id)).toThrow();
    expect(() => tabs.close('invented')).toThrow();
  });
  it('mantiene estado de carga independiente y resetea solo una aplicación', () => {
    const tabs = new ApplicationTabs();
    const huly = tabs.switchApplication('huly');
    const n8n = tabs.switchApplication('n8n');
    tabs.update(huly.id, { status: 'error' });
    tabs.update(n8n.id, { status: 'ready' });
    expect(tabs.current.state.status).toBe('ready');
    tabs.reset('huly');
    expect(tabs.all.find(tab => tab.id === huly.id)?.state.status).toBe('idle');
    expect(tabs.current.state.status).toBe('ready');
  });
  it('serviceStates cubre exactamente el catálogo recibido, también apps propias', () => {
    const tabs = new ApplicationTabs();
    const wiki = tabs.switchApplication('custom-0a1b2c3d-aaaa');
    tabs.update(wiki.id, { status: 'ready' });
    expect(tabs.serviceStates(['librechat', 'custom-0a1b2c3d-aaaa', 'teams'])).toEqual({ librechat: { status: 'idle' }, 'custom-0a1b2c3d-aaaa': { status: 'ready' }, teams: { status: 'idle' } });
  });
  it('removeApp elimina pestañas, selección y numeración de una app; las demás no se tocan', () => {
    const tabs = new ApplicationTabs();
    const huly = tabs.switchApplication('huly');
    tabs.switchApplication('custom-0a1b2c3d-aaaa');
    tabs.open('custom-0a1b2c3d-aaaa');
    tabs.removeApp('custom-0a1b2c3d-aaaa');
    expect(tabs.all.map(tab => tab.id)).toEqual([huly.id]);
    expect(tabs.switchApplication('custom-0a1b2c3d-aaaa').number).toBe(1);
  });
  it('un popup en segundo plano no roba la selección actual', () => {
    const tabs = new ApplicationTabs();
    tabs.switchApplication('huly');
    const n8n = tabs.switchApplication('n8n');
    tabs.open('huly', false);
    expect(tabs.active).toBe('n8n');
    expect(tabs.activeTabId).toBe(n8n.id);
  });
});
