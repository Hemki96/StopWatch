import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
