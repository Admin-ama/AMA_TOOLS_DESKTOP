import { build as bundle } from 'esbuild';
import { build as viteBuild } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
await bundle({ entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.cjs', platform: 'node', format: 'cjs', bundle: true, external: ['electron'], sourcemap: true });
await bundle({ entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.cjs', platform: 'node', format: 'cjs', bundle: true, external: ['electron'] });
await viteBuild({ configFile: false, root: 'src/renderer', base: './', build: { outDir: '../../dist/renderer', emptyOutDir: true } });
const packages = ['react', 'react-dom', '@tabler/icons-react', '@fontsource-variable/plus-jakarta-sans', 'electron-updater'];
const notices = await Promise.all(packages.map(async name => `${name}\n${await readFile(`node_modules/${name}/LICENSE`, 'utf8')}`));
await writeFile('dist/THIRD_PARTY_NOTICES.txt', notices.join('\n\n----------------\n\n'));
