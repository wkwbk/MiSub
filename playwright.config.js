import { defineConfig } from '@playwright/test';

const e2ePort = Number(process.env.E2E_PORT || 4173);
const baseURL = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    headless: true,
    locale: 'zh-CN',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node --experimental-strip-types --import ./tests/e2e/register-ts-loader.mjs tests/e2e/e2e-server.mjs',
    url: `${baseURL}/api/public/config`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      E2E_PORT: String(e2ePort),
    },
  },
});
