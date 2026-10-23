const EXECUTABLE = 'Fortinet\\FortiClient\\FortiClient.exe';
const DEFAULT_ROOTS = ['C:\\Program Files', 'C:\\Program Files (x86)'];

/** FortiClient VPN independiente se instala en la misma carpeta que FortiClient completo. */
export function forticlientCandidates(env: Record<string, string | undefined> = process.env): string[] {
  const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], ...DEFAULT_ROOTS].filter((root): root is string => !!root);
  return [...new Set(roots.map(root => `${root.replace(/[\\/]+$/, '')}\\${EXECUTABLE}`))];
}

export function resolveFortiClient(candidates: string[], exists: (file: string) => boolean): string | undefined {
  return candidates.find(file => exists(file));
}

interface LauncherSource {
  candidates: string[];
  exists(file: string): boolean;
  /** Devuelve '' si abrió, o el mensaje de error (contrato de shell.openPath). */
  open(file: string): Promise<string>;
  log(message: string, detail?: unknown): void;
}

/** El renderer solo puede pedir "abrir FortiClient": la ruta la decide siempre el proceso principal. */
export class FortiClientLauncher {
  constructor(private source: LauncherSource) {}

  get available(): boolean {
    return resolveFortiClient(this.source.candidates, this.source.exists) !== undefined;
  }

  async open(...extra: unknown[]): Promise<void> {
    if (extra.length > 0) throw new Error('Acción inválida');
    const file = resolveFortiClient(this.source.candidates, this.source.exists);
    if (!file) throw new Error('FortiClient no está instalado');
    try {
      const error = await this.source.open(file);
      if (error) this.source.log('No se pudo abrir FortiClient:', error);
    } catch (error) {
      this.source.log('No se pudo abrir FortiClient:', error);
    }
  }
}
