import { defineConfig } from '@playwright/test'

// Feste Standardports, aber über die Umgebung überschreibbar: Ein anderer
// lokaler Vite-Server auf 5199 darf nicht stillschweigend als Testziel
// durchgehen. `reuseExistingServer` ist deshalb bewusst aus.
const DEV_PORT = Number(process.env.PLAYWRIGHT_DEV_PORT ?? 5199)
const PROD_PORT = Number(process.env.PLAYWRIGHT_PROD_PORT ?? 5200)
const DEV_URL = `http://localhost:${DEV_PORT}`
const PROD_URL = `http://localhost:${PROD_PORT}`

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
      command: `npm run dev -- --port ${DEV_PORT} --strictPort`,
      url: DEV_URL,
      // Nie einen fremden Server wiederverwenden: Sonst können die Tests gegen
      // eine andere App auf demselben Port laufen und grün werden, ohne diese
      // App zu prüfen.
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // Der Service Worker existiert nur im gebauten Stand. In der CI hat
      // `npm run verify` den Build bereits erzeugt; dann genügt der Preview.
      command:
        process.env.PLAYWRIGHT_SKIP_BUILD === '1'
          ? `npm run preview -- --port ${PROD_PORT} --strictPort`
          : `npm run build && npm run preview -- --port ${PROD_PORT} --strictPort`,
      url: PROD_URL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
