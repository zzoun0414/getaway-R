// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', serviceWorkers: 'block' },
  webServer: { command: 'node tests/serve.js 4173', port: 4173, reuseExistingServer: true },
  projects: [
    { name: 'desktop', testIgnore: /mobile\.spec/, use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone', testMatch: /mobile\.spec/, use: { ...devices['Pixel 7'] } },
  ],
});
