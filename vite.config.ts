import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { mitCsp } from './src/app/csp.ts'

/**
 * Setzt die CSP nur in den Build. Der Dev-Server braucht Inline-Skripte von
 * Vite und React Refresh; ein Meta-CSP würde die App dort blockieren. GitHub
 * Pages erlaubt keine eigenen Header, deshalb reist die Policy als Meta-Tag im
 * gebauten `index.html` mit (siehe `src/app/csp.ts`).
 */
function cspPlugin(): Plugin {
  return {
    name: 'beckenrand-csp',
    apply: 'build',
    transformIndexHtml: {
      // Nach Vitens eigener HTML-Transformation: Der Hash wird über den
      // endgültigen Inline-Skript-Text gebildet.
      order: 'post',
      handler(html) {
        return mitCsp(html)
      },
    },
  }
}

export default defineConfig({
  base: './',
  server: {
    // Build- und Testartefakte lösen keinen Reload mitten in einer Messung aus.
    watch: {
      ignored: ['**/dist/**', '**/coverage/**', '**/test-results/**', '**/playwright-report/**'],
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    cspPlugin(),
    VitePWA({
      // update: erst nach Zustimmung, damit kein Neuladen mitten im Lauf passiert
      registerType: 'prompt',
      // Registrierung übernimmt src/app/pwa.ts — nicht zusätzlich per Script.
      injectRegister: null,
      // Icons kommen über globPatterns, sonst stehen sie doppelt in der Precache-Liste.
      includeManifestIcons: false,
      manifest: {
        id: '.',
        name: 'Beckenrand',
        short_name: 'Beckenrand',
        description: 'Zeitmessung für Schwimmtrainer am Beckenrand.',
        lang: 'de',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        // Handy und Tablet, Hoch- und Querformat: Die Oberfläche wechselt bei
        // genug Platz auf eine seitliche Navigation.
        orientation: 'any',
        categories: ['sports', 'utilities'],
        // Muss dem tatsächlichen Hintergrund entsprechen, sonst blitzt beim Start
        // ein andersfarbiger Splashscreen auf.
        background_color: '#070c15',
        theme_color: '#070c15',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        // Der erste Besuch soll den Service Worker sofort übernehmen, damit
        // ein Neuladen ohne Server bereits aus dem Cache funktioniert. Ein
        // Update wird weiterhin erst nach Zustimmung aktiviert.
        clientsClaim: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      // Die Screens werden in Playwright gegen den echten Build geprüft; die
      // Unit-Schwelle gilt dem Zeitkern, der Persistenz und den Bausteinen.
      exclude: [
        'src/main.tsx',
        'src/App.tsx',
        'src/ui/**',
        'src/test/**',
        'src/**/*.d.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 74,
        functions: 85,
        lines: 87,
      },
    },
  },
})
