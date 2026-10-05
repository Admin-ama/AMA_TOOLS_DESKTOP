import { readFile } from 'node:fs/promises';
const tag = process.argv[2] || process.env.GITHUB_REF_NAME;
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '') || tag !== `v${pkg.version}`) {
  console.error(`La etiqueta debe coincidir con package.json: v${pkg.version}`);
  process.exitCode = 1;
} else console.log(`Release validada: ${tag}`);
