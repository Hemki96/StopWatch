# Bauen und Veröffentlichen

Die App ist ein statischer Vite-Build. Es gibt keinen Anwendungsserver und keine Datenbank im Netz.
Veröffentlicht wird über GitHub Pages.

## Voraussetzungen

- **Node.js 22.22.2 oder neuer** (`engines` in `package.json`).
- npm mit Lockfile (`package-lock.json`).
- Für die Veröffentlichung: Push-Rechte am Repository und GitHub Pages mit „GitHub Actions“ als
  Quelle.

## Befehle

| Befehl | Wirkung |
| --- | --- |
| `npm ci` | reproduzierbare Installation aus dem Lockfile |
| `npm run dev` | Vite-Dev-Server auf `http://localhost:5173` |
| `npm run build` | `tsc --noEmit` und `vite build` nach `dist/` |
| `npm run preview` | gebauten Stand lokal ausliefern |
| `npm run lint` | ESLint mit Hook-Regeln (`rules-of-hooks`, `exhaustive-deps`) |
| `npm run typecheck` | nur TypeScript |
| `npm test` | Vitest |
| `npm run test:e2e` | Playwright gegen Dev und Produktion |
| `npm run verify` | lint + typecheck + Unit-Tests + Build |
| `npm run icons` | PWA-Icons neu erzeugen |

`npm run build` bricht bei Typfehlern ab. ESLint prüft zusätzlich die React-Hook-Regeln;
`exhaustive-deps` ist ein Fehler, damit eine fehlende Abhängigkeit nicht als Warnung untergeht.
Für den TypeScript-Code sind weitere Stilregeln bewusst nicht aktiv; `@eslint/js` gilt nur für
die JS-Werkzeugdateien.

TypeScript 7 liefert den `tsc`-Befehl, stellt aber noch keine stabile API für Werkzeuge bereit.
Deshalb liegt `typescript` als Alias auf `@typescript/typescript6` (API für typescript-eslint) und
`@typescript/native` auf TypeScript 7 (der `tsc`, den `npm run typecheck` und `npm run build`
verwenden). Beide werden gemeinsam installiert; `npm ci` bleibt reproduzierbar.

## Der Build

```
src/ + index.html + public/
        │
        ├── Vite (React, Tailwind)
        ├── vite-plugin-pwa (Manifest, Service Worker, Precache)
        └── tsc --noEmit (nur Prüfung)
        │
        ▼
      dist/
        ├── index.html
        ├── assets/*.js, *.css
        ├── icons/*.png
        ├── manifest.webmanifest
        └── sw.js, workbox-*.js
```

### Vite-Konfiguration

`vite.config.ts`:

```ts
base: './'
```

Relative Pfade sind nötig, weil die App unter einem Unterpfad (`/StopWatch/`) auf GitHub Pages
liegt. Absolute Pfade würden auf die Domain-Wurzel zeigen und 404 liefern.

Weitere Besonderheiten:

- `@vitejs/plugin-react` für JSX und Fast Refresh.
- `@tailwindcss/vite` für Tailwind 4.
- `VitePWA` für Manifest und Service Worker.
- `test.environment: 'node'` für Vitest.

### PWA

```ts
VitePWA({
  registerType: 'prompt',
  injectRegister: null,
  includeManifestIcons: false,
  manifest: {
    id: '.',
    name: 'Beckenrand',
    short_name: 'Beckenrand',
    start_url: '.',
    scope: '.',
    display: 'standalone',
    orientation: 'any',
    background_color: '#070c15',
    theme_color: '#070c15',
    icons: [...],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
    navigateFallback: 'index.html',
    clientsClaim: true,
  },
})
```

| Einstellung | Grund |
| --- | --- |
| `registerType: 'prompt'` | kein automatisches Neuladen während einer Messung |
| `injectRegister: null` | Registrierung erfolgt kontrolliert in `src/app/pwa.ts` |
| `includeManifestIcons: false` | Icons sind bereits über `globPatterns` im Precache |
| `start_url`/`scope`/`id`: `.` | relative Pfade für den Pages-Unterpfad |
| `display: standalone` | Vollbild ohne Browserleiste |
| `orientation: any` | Handy und Tablet, Hoch- und Querformat; das Layout wechselt ab 768 × 560 auf die seitliche Navigation |
| `background_color`/`theme_color` | dunkle Splash-Farbe passend zum Start |
| `clientsClaim: true` | erster Besuch wird sofort kontrolliert, Offline-Reload funktioniert |
| `navigateFallback` | SPA-Routen fallen auf `index.html` zurück |

Der Service Worker wird **nicht** im Dev-Server registriert. Offline-Tests und die installierte PWA
brauchen `npm run build && npm run preview`.

### Icons

`scripts/generate-icons.mjs` erzeugt PNGs ohne externe Bibliothek:

| Datei | Größe | Zweck |
| --- | --- | --- |
| `public/icons/icon-192.png` | 192 | Manifest |
| `public/icons/icon-512.png` | 512 | Manifest |
| `public/icons/icon-maskable-512.png` | 512 | Android-Maske, mit Rand |
| `public/icons/apple-touch-icon.png` | 180 | iOS-Home-Bildschirm |
| `public/icons/favicon-32.png` | 32 | Browser-Tab |

Nach einer Änderung am Icon-Code:

```bash
npm run icons
npm run build
```

Die Dateien liegen in `public/icons/` und werden unverändert nach `dist/icons/` kopiert.

### Boot und Theme

`index.html` enthält ein Inline-Skript, das das Theme **vor dem ersten Paint** setzt. Im hellen
Design deckt ein Layer in der Splash-Farbe den ersten Frame ab und blendet weich über. Das ist kein
Schmuck, sondern verhindert einen sichtbaren Farbblitz beim PWA-Start. Siehe
[ADR-0004](../adr/0004-splash-farbe-und-designwechsel.md).

Wer die Splash-Farbe ändert, muss sie an drei Stellen konsistent halten:

1. `manifest.background_color` und `theme_color` in `vite.config.ts`,
2. `background` und `#startfarbe` in `index.html`,
3. die Theme-Metas in `index.html` und `AppProvider`.

## Lokal veröffentlichen

```bash
npm ci
npm run verify
npm run build
npm run preview
```

`vite preview` liefert `dist/` aus. Der Standardport ist 4173; die Playwright-Konfiguration nutzt
5200. Ein Reload ohne Server funktioniert erst, wenn der Service Worker aktiv ist.

### Produktions-Build testen

1. `npm run build && npm run preview -- --port 5200`
2. `http://localhost:5200/` öffnen.
3. DevTools → Application → Service Workers prüfen: `sw.js` ist aktiv.
4. Netzwerk auf „Offline“ stellen und neu laden.
5. Die App muss aus dem Cache starten; lokale Daten bleiben sichtbar.

Der Playwright-Test `e2e/offline.spec.ts` automatisiert genau das.

## CI

`.github/workflows/ci.yml` läuft bei jedem Pull Request und manuell:

```yaml
- uses: actions/checkout@v7
- uses: actions/setup-node@v7
  with:
    node-version: 22
    cache: npm
- run: npm ci
- run: npm run verify
- run: npx playwright install --with-deps chromium
- run: npm run test:e2e
```

Eigenschaften:

- **ein** Job, damit Build und E2E denselben Stand prüfen,
- Timeout 20 Minuten,
- Concurrency-Gruppe pro Branch, laufende Läufe werden abgebrochen,
- nur Lesezugriff auf Repository-Inhalte.

## Deployment

`.github/workflows/deploy.yml` läuft bei Push auf `main` und manuell:

```
build-Job
  checkout → setup-node → npm ci
  → npm run verify
  → playwright install
  → npm run test:e2e
  → upload-pages-artifact (dist)

deploy-Job
  needs: build
  environment: github-pages
  → deploy-pages
```

Berechtigungen:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

Concurrency-Gruppe `pages`: Ein neuer Push bricht eine laufende Veröffentlichung ab.

### Live-Adresse

<https://hemki96.github.io/StopWatch/>

Der Pfad `/StopWatch/` ist der Grund für `base: './'` und die relativen Manifest-Pfade.

### Einmalige Einrichtung

1. Repository → **Settings → Pages**.
2. **Source:** „GitHub Actions“.
3. Sicherstellen, dass der `github-pages`-Environment existiert und der Workflow darauf zugreifen
   darf.
4. Push auf `main` oder manuellen Lauf starten.

### Ablauf einer Veröffentlichung

1. Änderung wird auf `main` gemergt.
2. Der Workflow prüft Typen, Unit-Tests und Build.
3. Playwright läuft gegen Dev und den frischen Produktions-Build.
4. `dist/` wird als Pages-Artefakt hochgeladen.
5. `deploy-pages` veröffentlicht.
6. Beim nächsten Öffnen der App erkennt der Service Worker die neue Version und zeigt **„Neue
   Version verfügbar“**.
7. Ein laufender Lauf verhindert das Neuladen, bis er beendet ist.

## Updates und Cache

- Workbox precacht die Dateien mit Content-Hashes. Alte Dateien werden beim Aktivieren entfernt.
- `clientsClaim` sorgt dafür, dass der erste Besuch sofort kontrolliert wird. Ein Update wird
  trotzdem **nicht** sofort aktiviert.
- `useServiceWorkerUpdate` sucht beim Zurückkehren in den Vordergrund nach einer neuen Version.
- Der Hinweis bleibt sichtbar, bis er bestätigt oder die App neu geladen wird.
- Ein hartes Neuladen im Browser kann am Service Worker vorbeigehen; für einen sauberen Test
  DevTools → Application → Service Workers → „Update“ oder „Unregister“.

## Fehlersuche beim Deployment

### 404 auf der Pages-Seite

- `base: './'` prüfen.
- Manifest-Pfade müssen relativ sein.
- Prüfen, ob `index.html` im Artefakt liegt (Pages lädt `dist`, nicht das Repository).
- Bei direktem Aufruf einer Unterroute: `navigateFallback` und Service Worker prüfen.

### Der Workflow scheitert vor dem Deploy

- `npm run verify` lokal ausführen.
- Playwright braucht Chromium: `npx playwright install --with-deps chromium`.
- Node-Version muss zu `engines` passen.
- Bei Timeout: Build-Zeit und E2E-Laufzeit prüfen (Standard 20 Minuten).

### Änderungen erscheinen nicht auf der Live-Seite

- Prüfen, ob der Deploy-Job erfolgreich war.
- Im Browser: Service Worker aktualisieren oder App schließen und neu öffnen.
- Der Update-Hinweis erscheint erst, wenn der neue Worker bereitsteht.
- Kein „Cache leeren“ ohne Backup: Das kann lokale Daten löschen.

### Offline funktioniert lokal, aber nicht live

- Die Live-Seite muss einmal mit Netz geladen worden sein.
- Der Service Worker braucht HTTPS (GitHub Pages liefert HTTPS).
- Ein In-App-Browser kann Service Worker blockieren.
- Prüfen, ob `sw.js` unter der richtigen Basis-URL geladen wird.

### Icons fehlen nach dem Build

- `npm run icons` ausführen und committen.
- Prüfen, ob die Dateien in `public/icons/` liegen.
- `includeManifestIcons: false` bedeutet: Die Icons müssen über `globPatterns` erfasst sein. Das
  Muster enthält `png`, also ist das der Fall.

## Versionierung

- Die App-Version steht in `package.json` (`0.1.0`) und wird unter **Mehr** angezeigt.
- Es gibt keinen automatischen Release- oder Changelog-Schritt.
- Änderungen werden über Commits und Pull Requests nachvollzogen.
- Ein Versionssprung ist dann sinnvoll, wenn sich Datenformat, Backup-Version oder ein
  Bedienablauf grundlegend ändert.

## Sicherheit und Secrets

- Der Build braucht keine Secrets.
- Es gibt keine API-Schlüssel, keine Tokens und keine Serverkonfiguration.
- Der Deploy nutzt ausschließlich die von GitHub bereitgestellten Berechtigungen (`GITHUB_TOKEN`,
  OIDC für Pages).
- Keine `.env`-Dateien einchecken.

## Checkliste vor einer Veröffentlichung

- [ ] `npm ci` sauber
- [ ] `npm run verify` grün
- [ ] `npm run test:e2e` grün (dev und produktion)
- [ ] Handbuch bei Bedarf aktualisiert
- [ ] Glossar bei neuen Begriffen ergänzt
- [ ] ADR bei bewussten Architekturentscheidungen ergänzt
- [ ] Backup-Version erhöht, falls sich das Schema ändert
- [ ] Icons aktuell
- [ ] Keine Debug-Ausgaben oder temporären Dateien im Commit
- [ ] Nach dem Deploy: Live-Seite öffnen, Update-Hinweis prüfen, einen Lauf testen

## Weiterlesen

- [Testen](testen.md)
- [Architektur](architektur.md#pwa-und-lebenszyklus)
- [Beitragen](beitragen.md)
