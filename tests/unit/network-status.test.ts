import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkMonitor, probeTarget, statusFromProbe } from '../../src/main/network-status';
import type { Service } from '../../src/shared/contracts';

const huly: Service = { id: 'huly', name: 'Huly Workspace', shortName: 'Huly', url: 'http://172.16.8.73:8087/' };

describe('probeTarget', () => {
  it('derives host and port from the Huly service URL', () => {
    expect(probeTarget([{ ...huly, id: 'n8n', url: 'http://10.0.0.1:1/' }, huly])).toEqual({ host: '172.16.8.73', port: 8087 });
  });

  it('falls back to the scheme default port', () => {
    expect(probeTarget([{ ...huly, url: 'https://intranet.test/' }])).toEqual({ host: 'intranet.test', port: 443 });
    expect(probeTarget([{ ...huly, url: 'http://intranet.test/' }])).toEqual({ host: 'intranet.test', port: 80 });
  });

  it('throws when Huly is not configured', () => {
    expect(() => probeTarget([])).toThrow();
  });
});

describe('statusFromProbe', () => {
  it('maps probe results to a status', () => {
    expect(statusFromProbe(true)).toBe('connected');
    expect(statusFromProbe(false)).toBe('disconnected');
  });
});

describe('NetworkMonitor', () => {
  afterEach(() => vi.useRealTimers());

  it('starts as checking and probes immediately', async () => {
    const probe = vi.fn().mockResolvedValue(true);
    const monitor = new NetworkMonitor({ probe, onChange: vi.fn() });
    expect(monitor.status).toBe('checking');
    await monitor.check();
    expect(probe).toHaveBeenCalledTimes(1);
    expect(monitor.status).toBe('connected');
    monitor.dispose();
  });

  it('notifies only when the status changes', async () => {
    const results = [true, true, false, false, true];
    const onChange = vi.fn();
    const monitor = new NetworkMonitor({ probe: async () => results.shift()!, onChange });
    for (let i = 0; i < 5; i++) await monitor.check();
    expect(onChange.mock.calls.map(call => call[0])).toEqual(['connected', 'disconnected', 'connected']);
    monitor.dispose();
  });

  it('treats a rejected probe as disconnected', async () => {
    const monitor = new NetworkMonitor({ probe: async () => { throw new Error('boom'); }, onChange: vi.fn() });
    await monitor.check();
    expect(monitor.status).toBe('disconnected');
    monitor.dispose();
  });

  it('does not overlap probes', async () => {
    let release!: (ok: boolean) => void;
    const probe = vi.fn(() => new Promise<boolean>(resolve => { release = resolve; }));
    const monitor = new NetworkMonitor({ probe, onChange: vi.fn() });
    const first = monitor.check();
    void monitor.check();
    expect(probe).toHaveBeenCalledTimes(1);
    release(true);
    await first;
    monitor.dispose();
  });

  it('probes on start and then every interval until disposed', async () => {
    vi.useFakeTimers();
    const probe = vi.fn().mockResolvedValue(true);
    const monitor = new NetworkMonitor({ probe, onChange: vi.fn() }, 15_000);
    monitor.start();
    expect(probe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(probe).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(probe).toHaveBeenCalledTimes(3);
    monitor.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it('ignores a result that arrives after dispose', async () => {
    let release!: (ok: boolean) => void;
    const onChange = vi.fn();
    const monitor = new NetworkMonitor({ probe: () => new Promise<boolean>(resolve => { release = resolve; }), onChange });
    const pending = monitor.check();
    monitor.dispose();
    release(true);
    await pending;
    expect(onChange).not.toHaveBeenCalled();
  });
});
