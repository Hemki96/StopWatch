# Beckenrand

Zeitmessung für Schwimmtrainer am Beckenrand. Mobile-first PWA, offline, ohne Konto.

**Läuft unter <https://hemki96.github.io/StopWatch/>.** Am Handy öffnen und über „Zum Home-Bildschirm“ bzw. „App installieren“ hinzufügen — danach startet sie ohne Browserleiste und funktioniert offline.

## Was die App tut

Ein **Lauf** besteht aus bis zu zehn **Bahnen** je **Reihe** und bis zu fünf Reihen. Alle Bahnen einer Reihe starten gemeinsam; mit einem **Startversatz** startet Reihe 2 z. B. 10 s nach Reihe 1, Reihe 3 nach 20 s. So messen drei Personen sofort und drei weitere nach 10 s. Danach tippt der Trainer jede Bahn bei jedem **Anschlag** an. Bei konfigurierter Strecke ist der letzte Anschlag das Ziel und erzeugt einen **Split** pro **Länge**.

Mehrere Läufe können **gleichzeitig aktiv** sein. Oben in der Leiste wird zwischen ihnen gewechselt; die anderen laufen im Hintergrund weiter.

Ein **Satz mit Plan** ist eine **Serie**: mehrere Wiederholungen im festen Takt, z. B. 5×100 m alle 2:00. Beim Start stehen alle Runden fest. Die Serien-Ansicht zeigt eine Zeile pro Schwimmer; ein Tap schließt die älteste offene Runde. Läuft die nächste Runde schon, während jemand noch unterwegs ist, bleibt die alte Runde sichtbar und wird als überfällig markiert.

Ein **Training** ist die Vorbereitung einer Einheit: Vorab legst du die **Aktiven** je Bahn und mehrere **Trainingssätze** in fester Reihenfolge an. Im Training startest du Satz für Satz; noch nicht gestartete Sätze lassen sich währenddessen ändern, ergänzen, löschen oder verschieben. Erst beim Start entstehen aus einem Trainingssatz ein Satz und seine Läufe — gemessene Zeiten bleiben unangetastet.

Der **Wettkampfmodus** ist ein eigener Tab: Ein **Wettkampf** bündelt **Disziplinen** (z. B. 100 m Freistil) mit mehreren **Läufen** (Heats). Eine **Meldeliste** lässt sich als CSV importieren; daraus entstehen Disziplinen, Läufe, Bahnen und Schwimmer. Im Wettkampf ist ein Tap nach dem Start sofort die **Zielzeit** — keine Längen-Splits, dafür ein Stift für eine von Hand nachgetragene oder korrigierte Zeit. Nach dem Lauf zeigt jede Bahn ihren Platz und den Rückstand; die Ergebnisliste lässt sich als CSV teilen.

- Zeiten auf Hundertstel, abgeschnitten statt gerundet
- Messung aus Zeitstempeln (`performance.now()`), unabhängig von Rendering
- Splits, Bestzeiten je Schwimmer/Strecke/Schwimmart/Beckenlänge, Pace pro 100 m oder 100 yd
- Meter und Yards: 25-Yard-Becken, Umrechnung an einer Stelle, getrennte Bestzeiten
- Startversatz zwischen Reihen, mehrere aktive Läufe, Serien mit festem Takt
- Trainingsplan mit Aktiven, mehreren Sätzen in fester Reihenfolge und Anpassung während des Trainings
- Wettkampfmodus mit Disziplinen, Heats, Platzierung und Zielzeit pro Tap
- Meldelisten-Import als CSV (Vorlage in der App), Ergebnisse als CSV
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
npm run verify       # Typprüfung, Unit-Tests und Produktions-Build
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
    wettkampf.ts   Wettkampf, Disziplin, Heat, Ergebnis und Platzierung
    meldeliste.ts  Toleranter CSV-Import für Startlisten
    format.ts      Zeitformatierung, Countdown und Abschneiden auf Hundertstel
    analyse.ts     Bestzeiten, Deltas, Pace
  storage/       IndexedDB (idb), Schema, Repositories und Backup-Prüfung
  app/           React-Kontext, Tab-Abstimmung, Hooks (useNow, useWakeLock)
  ui/            Screens und Komponenten (Dialoge, Onboarding, Lauf-Detail)
  export/        CSV und Datei-Ausgabe
```

Der Zeitkern ist frei von Seiteneffekten: `startAll(lauf, now, wallNow)` bekommt die Zeit übergeben und gibt einen neuen `Lauf` zurück. Nur deshalb sind Splits, Finish-Erkennung, Startversatz und Undo deterministisch testbar. Eine Serie plant alle Runden beim Start voraus; es gibt keinen Timer, der später eine Runde nachholt. Siehe `docs/adr/0005-serie-mit-festem-takt.md`.

## Grenzen, die bewusst so sind

- **Kein Hintergrundbetrieb mit Eingaben.** Eine PWA kann auf iOS keine Taps annehmen, während sie im Hintergrund ist. Die verstrichene Zeit bleibt trotzdem korrekt, weil sie aus Zeitstempeln rekonstruiert wird. Siehe `docs/adr/0001-pwa-statt-native.md`.
- **Ein Gerät, kein Sync.** Keine Anmeldung, keine Cloud. Sicherung nur über JSON-Backup.
- **Ein aktiver Tab.** Genau ein Tab hält die Messung; ein zweiter zeigt einen Hinweis und ist bis „Hier weiterarbeiten“ nur lesend. Der aktive Lauf geht bei der Übergabe nicht verloren, weil jeder Anschlag sofort gespeichert wird. Ohne `BroadcastChannel` verhält sich die App wie früher bedienbar.
- **Neustart mitten im Lauf.** `performance.now()` ist nach einem Reload wertlos; laufende und geplante Bahnen werden beim Laden auf „bereit“ zurückgesetzt, bereits erfasste Zeiten bleiben im Verlauf. Die App weist darauf hin. Eine Serie lässt sich mit „Weiter“ fortsetzen; vollständige Runden bleiben erhalten.
- **Überlappende Runden sind erlaubt.** Bei festem Takt kann die nächste Runde starten, während ein Schwimmer noch in der vorigen ist. Die App versteckt das nicht, sondern markiert die offene Runde als überfällig.
- **Korrekturen sind sichtbar.** Anschläge lassen sich im Lauf-Detail nachträglich korrigieren. Korrigierte Zeiten tragen `manuell` (auch im CSV), damit eine Bestzeit nicht unbemerkt von Hand entsteht.
- **Gestartete Trainingssätze sind fest.** Ein Trainingssatz lässt sich nur ändern, solange er nicht gestartet wurde. Danach zählen die gemessenen Läufe; Änderungen an Aktiven und Reihenfolge gelten nur für die kommenden Sätze. Siehe `docs/adr/0007-training-als-plan.md`.
- **Wettkampf ohne Splits.** Im Wettkampfmodus ist ein Tap das Ziel. Wer Zwischenzeiten braucht, misst im Timer-Tab. Die Meldeliste ist eine CSV; eine Anbindung an eine bestimmte Wettkampfsoftware gibt es bewusst nicht. Siehe `docs/adr/0006-wettkampfmodus.md`.

## Meldeliste importieren

Im Tab „Wettkampf“ unter „Meldeliste importieren“ (oder „Meldeliste hinzufügen“) lässt sich eine CSV einfügen oder als Datei wählen. Die App zeigt vor dem Import eine Vorschau mit Disziplinen, Läufen und Starts. Eine Vorlage lässt sich direkt herunterladen.

```
disziplin;strecke;schwimmart;lauf;bahn;name;jahrgang
100 m Freistil;100 m;freistil;1;3;Anna Muster;2010
100 m Freistil;100 m;freistil;1;4;Ben Beispiel;2011
100 m Freistil;100 m;freistil;2;3;Clara Muster;2010
50 m Brust;50 m;brust;1;1;Dana Beispiel;2012
```

In einem Yard-Wettkampf stehen `100 yd Freistil;100 yd` in den ersten beiden Spalten. Ohne Einheit
gilt die Einheit des Wettkampfs; ein Meter-Eintrag in einem Yard-Wettkampf wird mit Zeilennummer
abgelehnt.

Erkannt werden auch englische Spaltennamen (`lane`, `heat`, `distance`, `stroke`, `name`), getrennte Spalten `vorname`/`nachname`, Komma oder Semikolon und eine einfache Liste `bahn;name`. Einheiten werden als `m`, `yd`, `yard(s)` oder `y` erkannt. Fehlt die Bahn, vergibt die App die nächste freie. Fehlt die Disziplin, gelten die Vorgaben im Import-Dialog. Die Strecke muss ein Vielfaches der Beckenlänge sein.

## Dokumentation

- [`docs/README.md`](docs/README.md) — Einstieg in die vollständige Dokumentation
- [`docs/handbuch/`](docs/handbuch/README.md) — Bedienung für Trainer:innen: Timer, Serien, Training, Wettkampf, Verlauf, Backup und FAQ
- [`docs/entwicklung/`](docs/entwicklung/README.md) — Architektur, Datenmodell, Domänenreferenz, Oberfläche, Tests und Deployment
- [`ROADMAP.md`](ROADMAP.md) — Funktionsumfang je Major-Version und bewusste Nicht-Ziele
- [`GLOSSARY.md`](GLOSSARY.md) — die Begriffe der Domäne (Lauf, Bahn, Reihe, Länge, Split, Anschlag, Satz, Serie, Training, Aktive, Startversatz, Takt, PB, Wettkampf, Disziplin, Meldeliste)
- [`docs/adr/`](docs/adr/) — getroffene Entscheidungen und ihre Alternativen
