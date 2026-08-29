import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/desktop-e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  outputDir: 'test-results/desktop-artifacts',
  reporter: [['line'], ['html', { outputFolder: 'playwright-report/desktop', open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
