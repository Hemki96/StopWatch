import { defineConfig } from '@playwright/test'

const DEV_URL = 'http://localhost:5199'
const PROD_URL = 'http://localhost:5200'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
  projects: [
    {
      name: 'dev',
      testIgnore: /offline\.spec\.ts/,
      use: { baseURL: DEV_URL },
    },
    {
      name: 'produktion',
      testMatch: /offline\.spec\.ts/,
      use: { baseURL: PROD_URL },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --port 5199 --strictPort',
      url: DEV_URL,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      // Der Service Worker existiert nur im gebauten Stand.
      command: 'npm run build && npm run preview -- --port 5200 --strictPort',
      url: PROD_URL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
