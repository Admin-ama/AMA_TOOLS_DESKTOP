import { describe, expect, it, vi } from 'vitest';
import { FortiClientLauncher, forticlientCandidates, resolveFortiClient } from '../../src/main/forticlient';

const X64 = 'C:\\Program Files\\Fortinet\\FortiClient\\FortiClient.exe';
const X86 = 'C:\\Program Files (x86)\\Fortinet\\FortiClient\\FortiClient.exe';

describe('forticlientCandidates', () => {
  it('lists the fixed install locations', () => {
    expect(forticlientCandidates({})).toEqual([X64, X86]);
  });

  it('honours the Program Files environment without duplicates', () => {
    expect(forticlientCandidates({ ProgramFiles: 'D:\\PF', 'ProgramFiles(x86)': 'D:\\PF86' })).toEqual([
      'D:\\PF\\Fortinet\\FortiClient\\FortiClient.exe', 'D:\\PF86\\Fortinet\\FortiClient\\FortiClient.exe', X64, X86,
    ]);
    expect(forticlientCandidates({ ProgramFiles: 'C:\\Program Files' })).toEqual([X64, X86]);
  });
});

describe('resolveFortiClient', () => {
  it('returns undefined when no candidate exists', () => {
    expect(resolveFortiClient([X64, X86], () => false)).toBeUndefined();
  });

  it('returns the only existing candidate', () => {
    expect(resolveFortiClient([X64, X86], file => file === X86)).toBe(X86);
  });

  it('returns the first match in priority order', () => {
    const exists = vi.fn(() => true);
    expect(resolveFortiClient([X64, X86], exists)).toBe(X64);
    expect(exists).toHaveBeenCalledTimes(1);
  });
});

describe('FortiClientLauncher', () => {
  const make = (installed: string | undefined, result = '') => {
    const open = vi.fn().mockResolvedValue(result);
    const log = vi.fn();
    return { open, log, launcher: new FortiClientLauncher({ candidates: [X64, X86], exists: file => file === installed, open, log }) };
  };

  it('reports availability from the filesystem', () => {
    expect(make(X64).launcher.available).toBe(true);
    expect(make(undefined).launcher.available).toBe(false);
  });

  it('opens the resolved executable', async () => {
    const { launcher, open } = make(X86);
    await launcher.open();
    expect(open).toHaveBeenCalledWith(X86);
  });

  it('refuses any argument from the renderer', async () => {
    const { launcher, open } = make(X64);
    await expect(launcher.open('C:\\Windows\\System32\\cmd.exe')).rejects.toThrow('Acción inválida');
    await expect(launcher.open(undefined)).rejects.toThrow('Acción inválida');
    expect(open).not.toHaveBeenCalled();
  });

  it('rejects when FortiClient is not installed', async () => {
    const { launcher, open } = make(undefined);
    await expect(launcher.open()).rejects.toThrow('FortiClient no está instalado');
    expect(open).not.toHaveBeenCalled();
  });

  it('logs and does not throw when the launch fails', async () => {
    const failing = make(X64, 'access denied');
    await expect(failing.launcher.open()).resolves.toBeUndefined();
    expect(failing.log).toHaveBeenCalled();
    const throwing = make(X64);
    throwing.open.mockRejectedValue(new Error('spawn'));
    await expect(throwing.launcher.open()).resolves.toBeUndefined();
    expect(throwing.log).toHaveBeenCalled();
  });
});
