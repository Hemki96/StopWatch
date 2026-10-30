# Beckenrand

Zeitmessung für Schwimmtrainer am Beckenrand. Mobile-first PWA, offline, ohne Konto.

**Läuft unter <https://hemki96.github.io/StopWatch/>.** Am Handy öffnen und über „Zum Home-Bildschirm“ bzw. „App installieren“ hinzufügen — danach startet sie ohne Browserleiste und funktioniert offline.

## Was die App tut

Ein **Lauf** besteht aus bis zu zehn **Bahnen** je **Reihe** und bis zu fünf Reihen. Alle Bahnen einer Reihe starten gemeinsam; mit einem **Startversatz** startet Reihe 2 z. B. 10 s nach Reihe 1, Reihe 3 nach 20 s. So messen drei Personen sofort und drei weitere nach 10 s. Danach tippt der Trainer jede Bahn bei jedem **Anschlag** an. Wie viele **Zwischenzeiten** vor dem Ziel liegen, ist einstellbar; ohne eigene Zahl ergibt es sich aus der Strecke (ein Split pro **Länge**).

Mehrere Läufe können **gleichzeitig aktiv** sein. Oben in der Leiste wird zwischen ihnen gewechselt; die anderen laufen im Hintergrund weiter.

Ein **Satz mit Plan** ist eine **Serie**: mehrere Wiederholungen im festen Takt, z. B. 5×100 m alle 2:00. Beim Start stehen alle Runden fest. Die Serien-Ansicht zeigt eine Zeile pro Schwimmer; ein Tap schließt die älteste offene Runde. Läuft die nächste Runde schon, während jemand noch unterwegs ist, bleibt die alte Runde sichtbar und wird als überfällig markiert.

Ein **Training** ist die Vorbereitung einer Einheit: Vorab legst du die **Aktiven** je Bahn und mehrere **Trainingssätze** in fester Reihenfolge an. Im Training startest du Satz für Satz; vor jedem Start zeigt eine Übersicht Aktive und Reihenfolge. Optional startet der nächste Satz nach dem letzten Ziel automatisch, ohne Rückkehr in den Training-Tab. Noch nicht gestartete Sätze lassen sich währenddessen ändern, ergänzen, löschen oder verschieben. Erst beim Start entstehen aus einem Trainingssatz ein Satz und seine Läufe — gemessene Zeiten bleiben unangetastet.

- Zeiten auf Hundertstel, abgeschnitten statt gerundet
- Messung aus Zeitstempeln (`performance.now()`), unabhängig von Rendering
- **Startübersicht** vor jedem Start: Becken, Strecke, Bahnen, Schwimmer, Startzeiten, Takt und die
  Reihenfolge der Trainingssätze prüfen, dann erst startet die Uhr
- Splits, frei einstellbare Zahl der Zwischenzeiten, Bestzeiten je Schwimmer/Strecke/Beckenlänge,
  Pace pro 100 m oder 100 yd
- Meter als einzige Eingabe; alte Yard-Läufe bleiben lesbar und getrennt
- Startversatz zwischen Reihen, mehrere aktive Läufe, Serien mit festem Takt
- Trainingsplan mit Aktiven, mehreren Sätzen in fester Reihenfolge, optionalem automatischem Satzwechsel und Anpassung während des Trainings
- Verlauf gruppiert nach **Satz**, CSV-Export (inkl. Runde, Takt, Versatz), JSON-Backup
- **Analyse** im Verlauf: Matrix Person × Runde, Längenzeiten je Person, Abweichung zur Vorrunde
  und Vergleich mit dem letzten gleichen Satz — ohne zusätzliche Speicherung
- Handy und Tablet: untere Leiste bzw. seitliche Navigation, Raster, Sheets und Listen passen sich an
- Installierbar, offline, lokal gespeichert (IndexedDB)

## Starten

Voraussetzung: Node.js 22.22.2 oder neuer.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Unit-Tests (Zeitkern, Storage, Hooks, Dialoge, Backup)
npm run test:coverage # Unit-Tests mit Abdeckungsbericht und Schwellen
npm run test:e2e     # Playwright gegen Dev-Server und Produktions-Build
npm run lint         # ESLint (Hook-Regeln)
npm run verify       # Lint, Typprüfung, Unit-Tests und Produktions-Build
npm run build        # Typprüfung + Produktions-Build mit Service Worker
```

Pull Requests durchlaufen dieselbe Prüfung in `.github/workflows/ci.yml`.

Für die Geräteansicht am Rechner: `http://localhost:5173/preview.html` zeigt die App gleichzeitig in einem Handy-Rahmen (390 × 844) und einem Tablet-Rahmen (820 × 1180). Beide laden dieselbe App; die Oberfläche wechselt ab 768 × 560 auf die seitliche Navigation.

## Architektur

```
src/
  domain/        Reine Domänenlogik, kein React, keine Browser-APIs
    lauf.ts        Start, Anschlag, Finish, Undo, Streckenprüfung, Startversatz
    serie.ts       Runden einer Serie, Zeile pro Schwimmer, Planprüfung
    training.ts    Trainingsplan, Aktive, Satzfortschritt und Reihenfolge
    format.ts      Zeitformatierung, Countdown und Abschneiden auf Hundertstel
    analyse.ts     Bestzeiten, Deltas, Pace
  storage/       IndexedDB (idb), Schema, Repositories und Backup-Prüfung
  app/           React-Kontext, Fachmodule (Lauf, Training), Tab-Abstimmung, Hooks
  ui/            Screens und Komponenten (Dialoge, Onboarding, Lauf-Detail)
  export/        CSV und Datei-Ausgabe
```

Der Zeitkern ist frei von Seiteneffekten: `startAll(lauf, now, wallNow)` bekommt die Zeit übergeben und gibt einen neuen `Lauf` zurück. Nur deshalb sind Splits, Finish-Erkennung, Startversatz und Undo deterministisch testbar. Eine Serie plant alle Runden beim Start voraus; es gibt keinen Timer, der später eine Runde nachholt. Siehe `docs/adr/0005-serie-mit-festem-takt.md`.

## Grenzen, die bewusst so sind

- **Kein Hintergrundbetrieb mit Eingaben.** Eine PWA kann auf iOS keine Taps annehmen, während sie im Hintergrund ist. Die verstrichene Zeit bleibt trotzdem korrekt, weil sie aus Zeitstempeln rekonstruiert wird. Siehe `docs/adr/0001-pwa-statt-native.md`.
- **Ein Gerät, kein Sync.** Keine Anmeldung, keine Cloud. Sicherung nur über JSON-Backup.
- **Ein aktiver Tab.** Genau ein Tab hält die Messung; ein zweiter zeigt einen Hinweis und ist bis „Hier weiterarbeiten“ nur lesend. Bei der Übergabe wird die laufende Messung auf die monotone Uhr des neuen Tabs umgerechnet; jeder Anschlag ist sofort gespeichert. Ohne `BroadcastChannel` verhält sich die App wie früher bedienbar.
- **Neustart mitten im Lauf.** `performance.now()` ist nach einem Reload wertlos; laufende und geplante Bahnen werden beim Laden auf „bereit“ zurückgesetzt, bereits erfasste Zeiten bleiben im Verlauf. Eine Bahn mit Anschlägen erscheint als **unterbrochen** und wird nicht versehentlich neu gestartet. Die App weist darauf hin. Eine Serie oder ein einzelner Lauf lässt sich mit „Weiter“ fortsetzen, solange keine Anschläge ohne Startzeit übrig sind; vollständige Runden bleiben erhalten.
- **Überlappende Runden sind erlaubt.** Bei festem Takt kann die nächste Runde starten, während ein Schwimmer noch in der vorigen ist. Die App versteckt das nicht, sondern markiert die offene Runde als überfällig.
- **Korrekturen sind sichtbar.** Anschläge lassen sich im Lauf-Detail nachträglich korrigieren. Korrigierte Zeiten tragen `manuell` (auch im CSV), damit eine Bestzeit nicht unbemerkt von Hand entsteht.
- **Gestartete Trainingssätze sind fest.** Ein Trainingssatz lässt sich nur ändern, solange er nicht gestartet wurde. Danach zählen die gemessenen Läufe; Änderungen an Aktiven und Reihenfolge gelten nur für die kommenden Sätze. Siehe `docs/adr/0007-training-als-plan.md`.
- **Geteilte GitHub-Pages-Origin.** Alle Projektseiten desselben Accounts laufen unter `https://hemki96.github.io`; IndexedDB und `localStorage` sind originweit, nicht pfadgebunden. Die App kapselt ihre Daten deshalb im Namensraum `beckenrand.v2` und übernimmt bestehende Daten nicht destruktiv. Das verhindert Kollisionen, ist aber **keine** Sicherheitsgrenze gegen fremdes JavaScript auf derselben Origin — dafür wäre eine eigene Domain nötig. Siehe `docs/adr/0011-geteilte-origin-und-speicher-namensraum.md`.

## Dokumentation

- [`docs/README.md`](docs/README.md) — Einstieg in die vollständige Dokumentation
- [`docs/handbuch/`](docs/handbuch/README.md) — Bedienung für Trainer:innen: Timer, Serien, Training, Verlauf, Backup und FAQ
- [`docs/entwicklung/`](docs/entwicklung/README.md) — Architektur, Datenmodell, Domänenreferenz, Oberfläche, Tests und Deployment
- [`design/redesign-referenz/`](design/redesign-referenz/README.md) — Design-Referenz: Screens, Raster, Tokens, Zustände und Barrierefreiheit
- [`ROADMAP.md`](ROADMAP.md) — Funktionsumfang je Major-Version und bewusste Nicht-Ziele
- [`GLOSSARY.md`](GLOSSARY.md) — die Begriffe der Domäne (Lauf, Bahn, Reihe, Länge, Split, Anschlag, Satz, Serie, Training, Aktive, Startversatz, Takt, PB)
- [`docs/adr/`](docs/adr/) — getroffene Entscheidungen und ihre Alternativen
