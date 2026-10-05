import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

it('release exige etiqueta que coincida con versión estable', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const run = (tag: string) => spawnSync(process.execPath, ['scripts/verify-release.mjs', tag]);
  expect(run(`v${pkg.version}`).status).toBe(0);
  for (const tag of ['v99.0.0', 'main', `v${pkg.version}-beta`]) expect(run(tag).status).toBe(1);
});
it('configura release pública, sin token en el instalador y con metadatos del updater', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(pkg.build.publish).toEqual([{ provider: 'github', owner: 'Admin-ama', repo: 'AMA_TOOLS_DESKTOP', releaseType: 'draft' }]);
  expect(JSON.stringify(pkg.build)).not.toMatch(/token/i);
  const require = createRequire(import.meta.url);
  const workflow = require('js-yaml').load(readFileSync('.github/workflows/release.yml', 'utf8'));
  expect(workflow.on.push.tags).toEqual(['v*']);
  expect(workflow.jobs.release.permissions.contents).toBe('write');
  expect(workflow.jobs.release.steps.at(-1).env.GH_TOKEN).toBe('${{ secrets.GITHUB_TOKEN }}');
});
