# Entwicklerdokumentation

Diese Dokumentation beschreibt den Aufbau, die Datenhaltung und die Arbeitsweise im Repository. Sie
setzt TypeScript, React und Browser-Grundlagen voraus.

## Schnellstart

Voraussetzung: **Node.js 22.22.2 oder neuer** (siehe `package.json`).

```bash
npm ci                 # reproduzierbare Installation
npm run dev            # http://localhost:5173
npm test               # Unit-Tests (Vitest)
npm run test:e2e       # Playwright gegen Dev- und Produktions-Build
npm run verify         # Typprüfung + Unit-Tests + Produktions-Build
npm run build          # tsc --noEmit + vite build
npm run preview        # gebauten Stand lokal ansehen
npm run icons          # PWA-Icons neu erzeugen
```

`npm run dev` registriert **keinen** Service Worker. Offline-Verhalten und die installierte PWA
lassen sich nur mit `npm run build && npm run preview` prüfen.

Für die Handy-Ansicht am Rechner zeigt `http://localhost:5173/preview.html` die App in einem
390 × 844-Rahmen.

## Repository-Karte

```
.
├── src/
│   ├── domain/        Reine Fachlogik, kein React, keine Browser-APIs
│   ├── storage/       IndexedDB, Normalisierung, Backup-Prüfung
│   ├── export/        CSV und Datei-Ausgabe
│   ├── app/           React-Kontext, Tab-Koordination, Hooks, PWA
│   ├── ui/            Screens, Dialoge, Kacheln, Sheets
│   ├── App.tsx        Navigation und globale Banner
│   └── main.tsx       Einstiegspunkt, ErrorBoundary, Speicherschutz
├── e2e/               Playwright-Tests
├── public/icons/      generierte PWA-Icons
├── docs/
│   ├── handbuch/      Anwenderdokumentation
│   ├── entwicklung/   diese Dokumentation
│   ├── adr/           Architekturentscheidungen
│   └── agents/        Hinweise für Agenten
├── scripts/           Icon-Generator
├── index.html         Boot, Theme, Splash-Layer
├── vite.config.ts     React, Tailwind, PWA, Vitest
└── playwright.config.ts
```

## Lesereihenfolge

1. [Architektur](architektur.md) — Schichten, Zeitkern, Datenfluss
2. [Datenmodell](datenmodell.md) — Typen, Invarianten, IndexedDB, Backup
3. [Domänenreferenz](domain-referenz.md) — konkrete Funktionen und ihr Verhalten
4. [Oberfläche](oberflaeche.md) — Screens, Dialoge, Interaktionsmuster
5. [Testen](testen.md) — Testpyramide und Playwright-Eigenheiten
6. [Bauen und Veröffentlichen](bauen-und-veroeffentlichen.md) — Vite, PWA, CI, Pages
7. [Beitragen](beitragen.md) — Konventionen und Checkliste
8. [Audit 2026-10-29](audit-2026-10-29.md) — Ausgangslage, Änderungen, Messungen und offene Schuld

## Leitprinzipien

### 1. Der Zeitkern ist rein

`src/domain/` importiert weder React noch DOM noch Persistenz. Messzeit wird als Parameter
übergeben (`startAll(lauf, now, wallNow)`), nie intern gelesen. Nur Metadaten wie `erstelltAm`
nutzen `Date.now()`; IDs kommen aus `newId()`. Nur so sind Startversatz, Serien, Finish,
Korrekturen und Undo deterministisch testbar.

### 2. Zustand wird abgeleitet, nicht gezählt

Es gibt keinen Timer, der eine Bahn „weiterzählt“. Angezeigte Zeiten sind Differenzen aus
Zeitstempeln. Eine Runde ist „geplant“, wenn `now < startMs`. Ein gedrosselter Tab kann dadurch
keine Zeit verschieben.

### 3. Ein Gerät, ein Tab, eine Messung

Die App speichert lokal und synchronisiert nicht. Genau ein Tab darf schreiben. Das
`BroadcastChannel`-Protokoll in `src/app/tabKoordinator.ts` verhindert doppelte Anschläge aus zwei
Tabs.

### 4. Tolerante Eingabe, strenge Sicherung

Der Meldelisten-Import akzeptiert viele Formate und erklärt Fehler mit Zeilennummer. Das Backup
wird dagegen vollständig validiert, bevor geschrieben wird. Ein ungültiges Backup darf den Bestand
nie verändern.

### 5. Deutsche Domänensprache

Bezeichner, Tests und Dokumentation verwenden die Begriffe aus [`GLOSSARY.md`](../../GLOSSARY.md):
Lauf, Bahn, Anschlag, Split, Satz, Serie, Training, Aktive, Wettkampf, Disziplin, Meldeliste. Keine
Synonyme wie „Session“, „Heat“ (außer als erklärte Übersetzung) oder „Event“ im Code.

### 6. Keine stillen Fehler

Speicherfehler werden zu einem dauerhaften Banner. Der Service Worker lädt die App nicht mitten im
Lauf neu. Eine Render-Ausnahme landet in der `ErrorBoundary` statt in einer weißen Seite.

## Wo Ändere ich was?

| Vorhaben | Ort |
| --- | --- |
| Start-, Anschlag- oder Finish-Logik | `src/domain/lauf.ts` + `lauf.test.ts` |
| Serienplan oder Rundenzeile | `src/domain/serie.ts` + `serie.test.ts` |
| Trainingsplan oder Fortschritt | `src/domain/training.ts` + `training.test.ts` |
| Wettkampf, Platzierung, Heat | `src/domain/wettkampf.ts` + `wettkampf.test.ts` |
| CSV-Import | `src/domain/meldeliste.ts` + `meldeliste.test.ts` |
| Zeitformat, Parsen, Abschneiden | `src/domain/format.ts` + `format.test.ts` |
| Bestzeiten, Pace | `src/domain/analyse.ts` + `analyse.test.ts` |
| Datenbank, Backup | `src/storage/` |
| Globaler Zustand, aktive Läufe | `src/app/AppProvider.tsx` |
| PWA, Installation, Update | `src/app/pwa.ts`, `vite.config.ts` |
| Screen oder Dialog | `src/ui/` |
| Akzeptanzfall | `e2e/` |
| Öffentliches Verhalten | `docs/handbuch/` |
| Architekturentscheidung | `docs/adr/` |

## Definition of Done

Eine Änderung ist fertig, wenn:

- [ ] `npm run verify` durchläuft.
- [ ] Neue Fachlogik Unit-Tests hat und die Tests das Verhalten beschreiben, nicht die
      Implementierung.
- [ ] Ein neuer Bedienablauf einen Playwright-Test hat, wenn er im UI sichtbar ist.
- [ ] `npm run test:e2e` lokal durchläuft (mindestens `dev`; `produktion` für PWA-Themen).
- [ ] Die betroffene Handbuchseite aktualisiert ist.
- [ ] Neue Begriffe im Glossar stehen oder aus dem Glossar stammen.
- [ ] Eine bewusste Alternative in einer ADR festgehalten ist, wenn sie überrascht.
- [ ] Keine neuen `any`, `@ts-ignore` oder ungenutzten Exporte hinzugekommen sind.
- [ ] Kein automatisches Neuladen während einer laufenden Messung eingebaut wurde.

## Nützliche Befehle

```bash
npm run typecheck                 # nur tsc
npm test -- lauf                  # nur passende Unit-Tests
npm run test:watch                # Vitest im Watch-Modus
npx playwright test e2e/serie.spec.ts
npx playwright test --project=produktion
npm run build && npm run preview -- --port 5200
```

## Verwandte Dateien

- [`README.md`](../../README.md) — Projektüberblick
- [`GLOSSARY.md`](../../GLOSSARY.md) — Begriffe
- [`docs/adr/`](../adr/) — Entscheidungen
- [`AGENTS.md`](../../AGENTS.md) — Hinweise für Agenten
