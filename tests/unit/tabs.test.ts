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
  it('un popup en segundo plano no roba la selección actual', () => {
    const tabs = new ApplicationTabs();
    tabs.switchApplication('huly');
    const n8n = tabs.switchApplication('n8n');
    tabs.open('huly', false);
    expect(tabs.active).toBe('n8n');
    expect(tabs.activeTabId).toBe(n8n.id);
  });
});
