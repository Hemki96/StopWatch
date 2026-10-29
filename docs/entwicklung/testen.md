# Testen

Die Teststrategie folgt der Architektur: Fachlogik wird schnell und ohne Browser getestet, die
Oberfläche mit React-Tests, die echten Abläufe mit Playwright auf einem Handy-Viewport.

## Befehle

```bash
npm test                          # alle Unit- und Komponententests
npm test -- lauf                  # nur Dateien/Testnamen mit "lauf"
npm run test:watch                # Vitest im Watch-Modus
npm run test:e2e                  # Playwright, Projekte dev + produktion
npm run lint                      # ESLint (Hook-Regeln)
npm run verify                    # lint + typecheck + Unit-Tests + Build
npx playwright test e2e/serie.spec.ts
npx playwright test --project=dev
npx playwright test --project=produktion
```

`npm run verify` ist die Schwelle für Pull Requests. CI führt zusätzlich Playwright aus.

## Testpyramide

```
        Playwright (e2e/)
       echte Browser, Touch, PWA
      ───────────────────────────
      React-Komponenten (jsdom)
      Dialoge, Provider, Hooks
     ─────────────────────────────
     Unit-Tests (domain/, export/, storage/)
     reine Werte, schnelle Rückmeldung
```

### Unit-Tests

`vitest` läuft standardmäßig in einer **Node**-Umgebung (`vite.config.ts`). Die Domain-Tests
brauchen kein DOM. Das ist Absicht: Der Zeitkern soll ohne Browser beweisbar sein.

| Bereich | Dateien | Schwerpunkte |
| --- | --- | --- |
| Lauf | `domain/lauf.test.ts`, `domain/grenzfaelle.test.ts` | Start, Versatz, Anschlag, Finish, Undo, Sperren, Korrekturen |
| Serie | `domain/serie.test.ts` | Rundenzeile, Überholung, Fortschritt, Planprüfung |
| Training | `domain/training.test.ts` | Aktive, Satzfortschritt, Reihenfolge, Validierung |
| Wettkampf | `domain/wettkampf.test.ts` | Ein-Tap-Ziel, Platzierung, manuelle Zeit |
| Meldeliste | `domain/meldeliste.test.ts` | Formate, Spalten, Fehler, Grenzen |
| Format | `domain/format.test.ts` | Abschneiden, Parsen, Takt, Countdown |
| Analyse | `domain/analyse.test.ts` | Bestzeiten, Delta, Pace |
| CSV | `export/csv.test.ts`, `export/wettkampfCsv.test.ts` | Spalten, Escaping, Formelschutz |
| Backup | `storage/backup.test.ts` | Schema, Versionen, Fehlerpfade |
| Repository | `storage/repository.test.ts`, `.integration.test.ts` | Normalisierung, Transaktionen, Import |

Die Tests beschreiben Verhalten in deutschen Sätzen, z. B.:

```ts
it('schließt beim Tippen die älteste offene Runde', () => {
  // ...
})
```

### Komponenten- und Integrationstests

Diese Dateien setzen die Umgebung per Datei-Direktive:

```ts
// @vitest-environment jsdom
import 'fake-indexeddb/auto'
```

| Datei | Prüft |
| --- | --- |
| `app/AppProvider.test.tsx` | Laden, Speichern, aktive Läufe, Training, Wettkampf, Fehlerfälle |
| `app/AppProvider.test.ts` | Normalisierung gespeicherter Einstellungen |
| `app/schreibpfad.test.tsx` | Tab-Tor, Warteschlange, Wiederholung und Speicherfehler-Banner |
| `app/tabKoordinator.test.ts` | Claim, Heartbeat, Takeover, Ausfall, kleinere Tab-ID |
| `app/hooks.test.tsx` | `useNow`, `useWakeLock`, reduzierte Bewegung |
| `app/pwa.test.tsx` | Update-Erkennung, Installationsprompt, iOS-Anleitung |
| `app/csp.test.ts` | CSP-Direktiven, Hash des Theme-Skripts, Position des Meta-Tags |
| `app/ErrorBoundary.test.tsx` | Renderfehler und Neuladen |
| `ui/Dialog.test.tsx` | Fokusfalle, Escape-Stapel, Scroll-Sperre, Fokus-Rückgabe |
| `ui/Bausteine.test.tsx` | `Sheet`, `Bestaetigung`, `Feld`, `Chip` |
| `storage/repository.integration.test.ts` | echte IndexedDB via `fake-indexeddb` |

`src/test/render.tsx` enthält kleine Helfer (`render`, `renderHook`, `warteAuf`), damit Tests nicht
jedes Mal `act` und Container-Aufbau wiederholen.

## Playwright

### Konfiguration

`playwright.config.ts`:

- Viewport **390 × 844**, `isMobile: true`, `hasTouch: true`.
- `fullyParallel: false`, `workers: 1` — die Tests laufen seriell; die Webserver werden geteilt.
- Reporter `list`.
- Zwei Projekte:
  - `dev` — alle Tests außer `offline.spec.ts`, gegen `http://localhost:5199`.
  - `produktion` — nur `offline.spec.ts`, gegen `http://localhost:5200`.
- WebServer:
  - Dev: `npm run dev -- --port 5199 --strictPort`; ein vorhandener Server wird **nicht**
    wiederverwendet.
  - Produktion: `npm run build && npm run preview -- --port 5200 --strictPort`; in der CI
    entfällt der Build über `PLAYWRIGHT_SKIP_BUILD=1`, weil `npm run verify` ihn schon erzeugt hat.
- Die Ports lassen sich über `PLAYWRIGHT_DEV_PORT` und `PLAYWRIGHT_PROD_PORT` überschreiben, wenn
  lokal ein anderer Vite-Server auf 5199 läuft.

Der Produktions-Build ist nötig, weil der Service Worker nur dort existiert. Der Dev-Server
registriert keinen Service Worker. `reuseExistingServer: false` ist Absicht: Sonst könnten die
Tests gegen eine fremde App auf demselben Port laufen und grün werden, ohne diese App zu prüfen.

### Specs

| Datei | Ablauf |
| --- | --- |
| `smoke.spec.ts` | Lauf starten, Bahn stoppen, Reload, Verlauf; Lauf verwerfen |
| `verhalten.spec.ts` | Long-Press-Undo, Screenreader-Klick, offene Strecke, Schwimmer + Reload, Satz löschen, Escape-Stapel |
| `serie.spec.ts` | Startversatz, mehrere Läufe, Serienrunden, Undo, Verlauf |
| `training.spec.ts` | Training anlegen, Aktive, Satz starten, Sätze ergänzen und ändern |
| `wettkampf.spec.ts` | Wettkampf anlegen, Namen, Zeiten, Reload; CSV-Import; manuelle Zeit und CSV-Export |
| `verlauf.spec.ts` | Korrektur, CSV, Satz umbenennen, Lauf löschen |
| `einstellungen.spec.ts` | Onboarding, Theme, Standardwerte, Streckensperre |
| `backup.spec.ts` | Backup exportieren, alles löschen, importieren; ungültiges Backup |
| `tabs.spec.ts` | zweiter Tab lesend, Übernahme, Freigabe, Verlauf im lesenden Tab |
| `responsive.spec.ts` | seitliche Navigation und zentriertes Sheet auf dem Tablet; flache Leiste im Querformat |
| `offline.spec.ts` | Service-Worker-Cache, Offline-Reload, Lauf bleibt sichtbar |

### Helfer

`e2e/helfer.ts`:

- `oeffneApp(page)` — setzt `beckenrand.v2.onboarding=fertig` und wartet auf
  `[data-tab-status="aktiv"]`.
- `warteAufSchwimmerzuordnung(page)` — wartet, bis die Zuordnung wirklich in IndexedDB liegt.
- `warteAufZielzeiten(page, n)` — wartet auf `n` Finish-Anschläge in IndexedDB.
- `oeffneZweitenTab(page)` — öffnet einen zweiten Tab mit übersprungenem Onboarding.

Die Warte-Helfer sind wichtig, weil die Oberfläche optimistisch aktualisiert: Ein sichtbarer Wert
ist noch nicht zwingend persistiert. Ein Reload direkt nach dem Tipp könnte sonst zu früh kommen.

### Selektoren

Bevorzugt werden Rollen und Labels:

```ts
page.getByRole('button', { name: 'Start', exact: true })
page.getByRole('button', { name: /^Bahn 1, Anna, läuft$/ })
page.getByLabel('Name des Wettkampfs')
```

Die Bahn-Labels werden aus Bahnnummer, Name, Status und ggf. Platz gebildet. Sie sind damit
gleichzeitig Barrierefreiheits-Vertrag und Testselektor. Wer ein Label ändert, ändert Test und
Dokumentation mit.

CSS-Klassen oder `data-testid` werden nur dort verwendet, wo es keine semantische Alternative gibt
(`data-tab-status`, `data-anschlaege`, `data-status`, `data-platz`).

### Long Press

```ts
await page.mouse.move(x, y)
await page.mouse.down()
await expect(ziel.locator('[data-haltend="true"]')).toBeVisible()
await page.waitForTimeout(550)
await page.mouse.up()
```

Der Test wartet zuerst auf das sichtbare Overlay und dann länger als die 450-ms-Schwelle. Das ist
stabiler als eine feste Wartezeit vor dem Loslassen.

## Teststrategie

### Was zuerst getestet wird

1. **Domain-Regel** — neuer Fall in `domain/*.test.ts`. Kein DOM, keine Zeitabhängigkeit.
2. **Persistenz** — falls das Feld gespeichert wird, Repository-/Backup-Test ergänzen.
3. **Komponente** — falls Fokus, Tastatur oder ein Dialog betroffen ist.
4. **E2E** — falls ein Nutzer:innen-Ablauf sichtbar ist.

### Gute Tests

- beschreiben beobachtbares Verhalten, nicht interne Funktionsaufrufe,
- nutzen feste Zeitpunkte statt `Date.now()` in der Domain,
- prüfen Grenzen (0, negativ, Maximum, offene Strecke),
- prüfen, dass nichts passiert, wenn nichts passieren soll (No-Op),
- halten Tests unabhängig voneinander; jeder E2E-Test startet mit leerem Speicher,
- verwenden `expect(...).toHaveAttribute('data-status', ...)` statt Farben.

### Was nicht getestet wird

- exakte Pixel oder Farbwerte,
- Implementierungsdetails wie interne Ref-Namen,
- echte iOS-Safari-Eigenheiten (die CI hat Chromium),
- Last- oder Performanceprofile,
- visuelle Regressionen (kein Screenshot-Vergleich),
- automatische Barrierefreiheits-Audits (kein axe).

Diese Lücken sind bekannt. Für Änderungen an Fokus, Tastatur und Touch ist ein manueller Test auf
einem echten Gerät weiterhin nötig.

## Fehlersuche bei Tests

### „Wird geladen …“ in Playwright

- Prüfen, ob `oeffneApp` verwendet wurde.
- Prüfen, ob `data-tab-status="aktiv"` erscheint. Ohne aktiven Tab sind Aktionen No-Ops.
- Bei einem zweiten Tab: Auf `gesperrt` warten und ggf. übernehmen.

### Ein Klick wirkt nicht

- Ein Tipp auf eine geplante Bahn wird absichtlich ignoriert.
- Ein Tipp auf eine beendete Bahn ändert nichts.
- Ein Doppeltipp auf einer Serienzeile schließt nur eine Runde: Ein zweiter Tap innerhalb
  von 300 ms auf derselben Zeile wird verworfen. Danach schließt ein Tap wieder die nächste Runde.
- Der Test könnte auf einen alten Stand schauen; auf IndexedDB warten.

### Port belegt

`5199` (Dev) und `5200` (Produktion) müssen frei sein; ein vorhandener Server wird nicht
wiederverwendet. Entweder den belegenden Prozess beenden oder andere Ports setzen:

```bash
PLAYWRIGHT_DEV_PORT=5299 PLAYWRIGHT_PROD_PORT=5300 npm run test:e2e
```

### Offline-Test schlägt fehl

- Er läuft nur im Projekt `produktion`.
- Der Build muss aktuell sein.
- Der Service Worker braucht einen Moment; der Test wartet auf `registration.active`.
- Ein vorheriger Test mit geleertem Cache kann den Cache entfernen.

### Unit-Test mit IndexedDB

- `import 'fake-indexeddb/auto'` am Dateianfang.
- Zwischen Tests `clearAll()` und Datenbank sauber zurücksetzen.
- Keine echten Timer verwenden; `await act(...)` für Effekte.

## CI

`.github/workflows/ci.yml`:

1. Node 22 einrichten,
2. `npm ci`,
3. `npm run verify`,
4. Chromium installieren,
5. `npm run test:e2e`.

Der Deploy-Workflow führt dieselben Schritte aus und lädt erst danach `dist` als Pages-Artefakt
hoch.

## Coverage

`npm run test:coverage` führt die Unit-Tests mit Abdeckung aus. Die Schwellen stehen in
`vite.config.ts` (Statements 80 %, Branches 74 %, Functions 85 %, Lines 87 %) und werden von
`npm run verify` geprüft. Die Oberfläche und `App.tsx` sind ausgenommen, weil ihre sichtbaren
Abläufe in Playwright geprüft werden.

Die Coverage ist ein Hinweis, kein Ziel. Wichtiger ist, dass die kritischen Pfade — Start, Finish,
Serie, Undo, Backup, Tab-Übergabe, unterbrochene Bahn — getestet sind.

## Neue Tests schreiben

### Domain

```ts
import { describe, expect, it } from 'vitest'
import { createLauf, startAll, tapLane } from './lauf'

describe('mein Fall', () => {
  it('beschreibt das erwartete Verhalten', () => {
    const lauf = createLauf(
      { beckenlaengeM: 50, streckeM: 100, schwimmart: 'freistil' },
      [{ nummer: 1 }],
    )
    const gestartet = startAll(lauf, 0, 1_000)
    const getippt = tapLane(gestartet, gestartet.bahnen[0]!.id, 30_000, 31_000)
    expect(getippt.bahnen[0]!.anschlaege).toHaveLength(1)
  })
})
```

### E2E

```ts
import { expect, test } from '@playwright/test'
import { oeffneApp } from './helfer'

test('beschreibt den Ablauf', async ({ page }) => {
  await oeffneApp(page)
  await page.getByRole('button', { name: 'Start', exact: true }).tap()
  // ...
})
```

## Weiterlesen

- [Architektur](architektur.md)
- [Domänenreferenz](domain-referenz.md)
- [Bauen und Veröffentlichen](bauen-und-veroeffentlichen.md)
