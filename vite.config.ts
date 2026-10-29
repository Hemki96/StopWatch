import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
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
        orientation: 'portrait',
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
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
