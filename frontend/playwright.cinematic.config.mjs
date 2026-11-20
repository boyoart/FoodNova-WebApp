import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['cinematic.spec.js', 'homepage-tracking.spec.js'],
  workers: 1,
  timeout: 120000,
  expect: { timeout: 60000 },
  outputDir: './test-results/cinematic',
  reporter: 'list',
  use: { channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), navigationTimeout: 60000, baseURL: 'http://127.0.0.1:5186', trace: 'off' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 5186 --strictPort', url: 'http://127.0.0.1:5186', timeout: 120000, reuseExistingServer: false },
})
