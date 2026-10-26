import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1,
  timeout: 45_000, expect: { timeout: 10_000 },
  // En CI (runners compartidos y lentos) un e2e intermitente no tumba el release; Playwright lo informa como "flaky".
  retries: process.env.CI ? 2 : 0,
  use: { trace: 'retain-on-failure' }, reporter: 'list',
});
