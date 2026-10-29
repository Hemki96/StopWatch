# Beckenrand

Zeitmessung für Schwimmtrainer am Beckenrand. Mobile-first PWA, offline, ohne Konto.

**Läuft unter <https://hemki96.github.io/StopWatch/>.** Am Handy öffnen und über „Zum Home-Bildschirm“ bzw. „App installieren“ hinzufügen — danach startet sie ohne Browserleiste und funktioniert offline.

## Was die App tut

Ein **Lauf** besteht aus bis zu zehn **Bahnen**. „Start alle“ gibt allen Bahnen denselben Startzeitstempel, danach tippt der Trainer jede Bahn bei jedem **Anschlag** an. Bei konfigurierter Strecke ist der letzte Anschlag das Ziel und erzeugt einen **Split** pro **Länge**.

- Zeiten auf Hundertstel, abgeschnitten statt gerundet
- Messung aus Zeitstempeln (`performance.now()`), unabhängig von Rendering
- Splits, Bestzeiten je Schwimmer/Strecke/Schwimmart/Beckenlänge, Pace pro 100 m
- Verlauf gruppiert nach **Satz**, CSV-Export, JSON-Backup
- Installierbar, offline, lokal gespeichert (IndexedDB)

## Starten

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Unit-Tests des Zeitkerns
npm run build        # Typprüfung + Produktions-Build mit Service Worker
```

Für die Handy-Ansicht am Rechner: `http://localhost:5173/preview.html` zeigt die App in einem 390 × 844-Rahmen.

## Architektur

```
src/
  domain/        Reine Domänenlogik, kein React, keine Browser-APIs
    lauf.ts        Start, Anschlag, Finish, Undo, Streckenprüfung
    format.ts      Zeitformatierung und Abschneiden auf Hundertstel
    analyse.ts     Bestzeiten, Deltas, Pace
  storage/       IndexedDB (idb), Schema und Repositories
  app/           React-Kontext, Persistenz, Hooks (useNow, useWakeLock)
  ui/            Screens und Komponenten
  export/        CSV und Datei-Ausgabe
```

Der Zeitkern ist frei von Seiteneffekten: `startAll(lauf, now, wallNow)` bekommt die Zeit übergeben und gibt einen neuen `Lauf` zurück. Nur deshalb sind Splits, Finish-Erkennung und Undo deterministisch testbar.

## Grenzen, die bewusst so sind

- **Kein Hintergrundbetrieb mit Eingaben.** Eine PWA kann auf iOS keine Taps annehmen, während sie im Hintergrund ist. Die verstrichene Zeit bleibt trotzdem korrekt, weil sie aus Zeitstempeln rekonstruiert wird. Siehe `docs/adr/0001-pwa-statt-native.md`.
- **Ein Gerät, kein Sync.** Keine Anmeldung, keine Cloud. Sicherung nur über JSON-Backup.
- **Neustart mitten im Lauf.** `performance.now()` ist nach einem Reload wertlos; laufende Bahnen werden beim Laden auf „bereit“ zurückgesetzt, bereits erfasste Zeiten bleiben im Verlauf. Die App weist darauf hin.

## Dokumentation

- `GLOSSARY.md` — die Begriffe der Domäne (Lauf, Bahn, Länge, Split, Anschlag, Satz, PB)
- `docs/adr/` — getroffene Entscheidungen und ihre Alternativen
